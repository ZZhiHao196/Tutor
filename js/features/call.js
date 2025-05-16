// phone-call.js - Voice Conversation Functionality
import { AudioRecorder } from '../audio-tools/audio-recorder.js';
import { GeminiAgent } from '../core/agent.js';
import { getConfig, getWebsocketUrl, MODEL_SAMPLE_RATE } from '../core/config.js';
import { addRecord, generateLanguageFeedback } from '../features/record.js'; 
import { settingsService } from '../settings/settings.js';
import { base64ToBlob, displaySystemMessage, showSaveModal as showModal, hideSaveModal as hideModal, createSessionRecord } from '../utils/utils.js';

// ------------------------
// 1. CONSTANTS AND STATE
// ------------------------
// UI elements cache
const elements = {
    micButton: document.getElementById('mic-btn'),
    returnButton: document.getElementById('call-return-btn'),
    aiFace: document.getElementById('ai-face'),
    aiAudioElement: document.getElementById('ai-audio-player'),
    waveformCanvas: document.getElementById('waveform-canvas'),
    // Modal elements
    saveModalBackdrop: document.getElementById('save-modal-backdrop'),
    saveModal: document.getElementById('save-modal'),
    modalSaveBtn: document.getElementById('modal-save-btn'),
    modalDontSaveBtn: document.getElementById('modal-dont-save-btn'),
};

// Voice activity detection constants
// const SILENCE_THRESHOLD = 2; // 0.5 seconds of silence to consider speech ended // REMOVED
// const SPEECH_MIN_DURATION = 500; // At least 0.5 seconds of speech to be considered valid input // REMOVED
// const LONG_SILENCE_DURATION = 30000; // 25 seconds of silence triggers AI check-in // REMOVED

// Session duration constants
const MIN_DURATION_TO_RECOMMEND_SAVE = 60000; // 60 seconds - Recommend saving if duration exceeds this
const MIN_DURATION_TO_ALLOW_SAVE = 30000;     // 30 seconds - Allow saving but don't recommend if duration exceeds this

// Application state
const state = {
    audioContext: null,
    audioRecorder: null,
    geminiAgent: null,
    settings: null,
    isListening: false,
    isCallActive: false,
    initialPromptSent: false,
    // longSilenceTimeout: null, // REMOVED
    aiAudioSourceConnected: false,
    _keepAliveNodes: null, // Use an object to store nodes
    _sendingAudioToAgent: true, // Added for the new stopListening implementation
    
    // Time tracking - Replaces conversation turn counting
    startTime: null,         // Session start time
    sessionDuration: 0,      // Session duration (milliseconds)
    lastDurationUpdate: null, // Last time the duration was updated
    
    // System elements
    statusMessageElement: null, // System message element
    
    // Speech related states - Still needed for speech detection, but no longer used for counting
    // isSpeaking: false, // REMOVED
    // speechStarted: false, // REMOVED
    // utteranceTimeout: null, // REMOVED
    aiResponding: false,
    // speechStartTime: null, // REMOVED
};

// ------------------------
// 2. UTILITY FUNCTIONS
// ------------------------
// System message display
function appendSystemMessage(message, type = 'info') {
    // Use the utility function for system messages
    state.statusMessageElement = displaySystemMessage(message, type, state.statusMessageElement, 'call-status');
}

// Update session duration
function updateSessionDuration() {
    if (!state.startTime) return 0;
    
    const now = Date.now();
    state.sessionDuration = now - state.startTime.getTime();
    state.lastDurationUpdate = now;
    
    console.log(`[Session Duration] Current session has lasted: ${Math.floor(state.sessionDuration / 1000)} seconds`);
    return state.sessionDuration;
}

// ------------------------
// DEBUGGING UTILITIES
// ------------------------
// Output state information at key points
function debugLogState(location) {
    console.log(`
---- DEBUG STATE [${location}] ----
sessionDuration: ${Math.floor(state.sessionDuration / 1000)} seconds
isListening: ${state.isListening}
aiResponding: ${state.aiResponding}
-------------------
`);
}

// Reset the utterance timeout and consider speech ended after silence // REMOVED ENTIRE FUNCTION
// function resetUtteranceTimeout() { ... }

// ------------------------
// 3. AUDIO SYSTEM INITIALIZATION
// ------------------------
async function initializeAudioSystem() {
    try {
        console.log("Initializing audio system...");
        appendSystemMessage("正在初始化..."); // Add initial message
        
        // 1. Create AudioContext
        if (!state.audioContext) {
            state.audioContext = new AudioContext({ sampleRate: 22000 }); // Use 22k directly
            console.log(`AudioContext created with 24kHz sample rate. Initial state: ${state.audioContext.state}`);
            
            // --- Add State Change Listener ---
            state.audioContext.onstatechange = () => {
                console.warn(`[AudioSystem] AudioContext state changed to: ${state.audioContext.state}`);
            };
            console.log("[AudioSystem] Added AudioContext state change listener.");
            // --- End Listener ---
            
            // --- Keep Context Alive Hack ---
            if (!state._keepAliveNodes) {
                try {
                    const oscillator = state.audioContext.createOscillator();
                    const gainNode = state.audioContext.createGain();
                    gainNode.gain.setValueAtTime(0, state.audioContext.currentTime); // Ensure it's silent
                    oscillator.connect(gainNode);
                    gainNode.connect(state.audioContext.destination);
                    oscillator.start();
                    state._keepAliveNodes = { oscillator, gainNode }; // Store references
                    console.log("Dummy oscillator started to keep AudioContext alive.");
                } catch (e) {
                    console.error("Failed to create keep-alive oscillator:", e);
                    // Proceed without it, context might still close
                }
            }
            // --- End Hack ---
            
            // --- Connect AI Audio Element Source Node --- 
            if (elements.aiAudioElement && !state.aiAudioSourceConnected && state.audioContext.state === 'running') {
                try {
                    const aiAudioSourceNode = state.audioContext.createMediaElementSource(elements.aiAudioElement);
                    aiAudioSourceNode.connect(state.audioContext.destination);
                    state.aiAudioSourceConnected = true;
                    console.log("[AudioSystem] Connected AI audio element to audio destination during init.");
                } catch (audioConnectError) {
                    console.error("[AudioSystem] Failed to connect AI audio element during init (non-critical):", audioConnectError);
                    // Non-critical, AI audio might not work, but mic might still.
                }
            }
            // --- End AI Audio Connection ---

        } else {
            console.log(`Using existing AudioContext. State: ${state.audioContext.state}`);
        }

        // Resume context if suspended (required for user interaction)
        if (state.audioContext.state === 'suspended') {
            try {
                await state.audioContext.resume();
                console.log(`AudioContext resumed. State: ${state.audioContext.state}`);
            } catch (resumeError) {
                console.warn("Could not resume AudioContext automatically:", resumeError);
                // It might resume later on user interaction
            }
        }
        
        // 2. Check required UI elements
        if (!elements.aiAudioElement) {
            throw new Error("Audio element '#ai-audio-player' not found");
        }
        
        // 3. Defer visualizer creation until needed (in toggleMicrophone)
        
        // 4. Defer AI audio playback pipeline connection until needed (in toggleMicrophone)
        
        // 5. Create AudioRecorder with the shared AudioContext
        if (!state.audioRecorder) { // Avoid recreating if already initialized
            state.audioRecorder = new AudioRecorder({
                // vadEnabled: true, // REMOVED
                // silenceThreshold: 0.01, // REMOVED (default in AudioRecorder might apply if not set here)
                // silenceDuration: SILENCE_THRESHOLD, // REMOVED
                autoGainEnabled: true,
                audioContext: state.audioContext // Pass the shared context
            });
            console.log("AudioRecorder created with shared AudioContext");
        } else {
            console.log("AudioRecorder already exists.");
        }
        
        console.log("Audio system initialization partially complete (Recorder ready)");
        return true;
    } catch (error) {
        console.error("Audio system initialization failed:", error);
        appendSystemMessage(`音频设置错误: ${error.message}`);
        
        // Clean up any partially initialized components
        if (state.audioContext && state.audioContext.state !== 'closed') {
            await state.audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
            state.audioContext = null;
        }
        state.audioRecorder = null;
        
        return false;
    }
}

// ------------------------
// 4. AGENT INITIALIZATION
// ------------------------
async function initializeAgent() {
    try {
        // 1. Get settings and websocket URL
        const wsUrl = getWebsocketUrl();
        if (!wsUrl) {
            throw new Error("WebSocket URL not configured");
        }
        
        const agentConfig = getConfig({ forceGemini: true }); 
        agentConfig.model = 'models/gemini-2.0-flash-live-001';
        console.log("[Call Init] Using model: " + agentConfig.model);

        const voiceType = settingsService.getSetting('voiceType') || 'Aoede';
        console.log(`[!!! CONFIG !!!] Using voiceType: "${voiceType}" for Gemini Live Agent speech_config.`);

        if (!agentConfig.generation_config) agentConfig.generation_config = {};
        if (!agentConfig.generation_config.speech_config) {
            agentConfig.generation_config.speech_config = { voice_config: { prebuilt_voice_config: {} }, language_code: "en-US" };
        }
        if (!agentConfig.generation_config.speech_config.voice_config) {
            agentConfig.generation_config.speech_config.voice_config = { prebuilt_voice_config: {} };
        }
        if (!agentConfig.generation_config.speech_config.voice_config.prebuilt_voice_config) {
            agentConfig.generation_config.speech_config.voice_config.prebuilt_voice_config = {};
        }

        agentConfig.generation_config.speech_config.voice_config.prebuilt_voice_config.voice_name = voiceType;
        agentConfig.generation_config.speech_config.voice_config.prebuilt_voice_config.speaking_rate = settingsService.getSetting('speakingRate');
        // agentConfig.generation_config.speech_config.voice_config.prebuilt_voice_config.pitch = settingsService.getSetting('pitch'); // REMOVED pitch
        
        agentConfig.generation_config.response_modalities = ["AUDIO"];
        delete agentConfig.synthesize_speech_config;
        
        // console.log("[Call Init] Final agent config for call:", JSON.stringify(agentConfig, null, 2));

        const currentModel = agentConfig.model?.replace('models/', '') || 'gemini-2.0-flash-exp';
        const originalModel = settingsService.getSetting('modelType');
        
        // 如果原始选择的模型与当前使用的不同，说明系统进行了自动切换
        if (originalModel && originalModel !== currentModel && 
            !(originalModel.includes('-exp') || originalModel === 'gemini-2.0-flash-live-001')) {
            appendSystemMessage(`注意: 语音通话使用 ${currentModel} 模型 (${originalModel} 不支持语音通话)。`, "warning");
        }

        // Ensure audioContext is ready from initializeAudioSystem
        if (!state.audioContext || state.audioContext.state !== 'running') {
            console.error("[Call Init] Main AudioContext is not available or not running. Cannot initialize agent requiring it.");
            appendSystemMessage("关键音频组件失败，请刷新页面。", "error");
            throw new Error("Main AudioContext for agent is not ready.");
        }

        state.geminiAgent = new GeminiAgent({
            url: wsUrl,
            config: agentConfig,
            autoConnect: false,
            modelSampleRate: 22000, // 
            name: 'GeminiAgent (Call)'
        }, state.audioContext);
        
        // 3. Setup event handlers
        state.geminiAgent.on('connected', () => {
            console.log("Agent connection established");
            elements.micButton.disabled = false;

            // Connect AudioStreamer output to the main AudioContext destination
            if (state.audioContext && state.audioContext.state === 'running') {
                const agentAudioOutput = state.geminiAgent.getAudioOutputNode();
                if (agentAudioOutput) {
                    try {
                        agentAudioOutput.connect(state.audioContext.destination);
                        console.log("[Call Init] Connected GeminiAgent's AudioStreamer output to main AudioContext destination."); // Keep - important connection log
                    } catch (e) {
                        console.error("[Call Init] Error connecting agent audio output:", e);
                    }
                } else {
                    console.warn("[Call Init] GeminiAgent's audio output node not available to connect.");
                }
            } else {
                console.warn("[Call Init] Main AudioContext not ready, cannot connect agent audio output yet.");
                // Optionally, re-attempt connection if audioContext becomes ready later
            }
        });
        
        state.geminiAgent.on('disconnected', () => {
            console.warn("Agent connection lost");
            appendSystemMessage("连接丢失。请重试。");
            if (state.isListening) stopListening().catch(console.error);
            elements.micButton.disabled = true;
        });
        
        state.geminiAgent.on('error', (error) => {
            console.error("Agent error:", error);
            appendSystemMessage("连接错误。请检查设置或重试。");
            if (state.isListening) stopListening().catch(console.error);
            elements.micButton.disabled = true;
        });
        
        // Handle text messages
        state.geminiAgent.on('text', (text) => {
            console.log("Received text from agent:", text); // Keep - shows AI text response
            // POTENTIAL PLACE TO TRIGGER 'AI IS RESPONDING' UI
            elements.aiFace.classList.add('ai-responding');
            state.aiResponding = true;
        });
        
        // Handle turn completion
        state.geminiAgent.on('turn_complete', () => {
            console.log("Agent turn complete"); // Keep - important state
            elements.aiFace.classList.remove('ai-responding'); // UI Reset
            state.aiResponding = false;                       // State Reset
            // Ensure visualizer exists before calling
            // if (state.visualizer) state.visualizer.visualizeIdle(); 
        });
        
        // 4. Connect to the agent
        console.log("Connecting to agent...");
        elements.micButton.disabled = true; // Disable during connection attempt
        
        try {
            await state.geminiAgent.connect();
            console.log("Agent connected successfully");
        return true;
        } catch (error) {
            console.error("Agent connection failed:", error);
            elements.micButton.disabled = false; // Re-enable button so user can retry
            appendSystemMessage("语音连接失败。您仍可以尝试点击麦克风按钮。");
            return false;
        }
    } catch (error) {
        console.error("Agent initialization failed:", error);
        appendSystemMessage(`助手设置错误: ${error.message}`);
        
        if (state.geminiAgent) {
            state.geminiAgent.disconnect();
            state.geminiAgent = null;
        }
        
        return false;
    }
}

// ------------------------
// 5. USER AUDIO HANDLERS
// ------------------------
async function startListening() {
    console.log("startListening: Attempting to start user listening...");

    // Precondition checks
    if (state.isListening) {
        console.log("Already listening, no action needed");
        return;
    }

    if (!state.audioRecorder || !state.geminiAgent) {
        console.error("Missing required component. Recorder:", !!state.audioRecorder, "Agent:", !!state.geminiAgent);
        appendSystemMessage("系统未准备就绪。请重试或刷新页面。");
        return;
    }
    
    // --- Add AudioContext State Check ---
    if (!state.audioContext || state.audioContext.state !== 'running') {
        console.error(`Cannot start listening, AudioContext state is ${state.audioContext?.state}.`);
        appendSystemMessage("音频系统未准备就绪。请再次点击麦克风或刷新页面。");
        // Reset potential UI cues if start fails early
        elements.micButton.classList.remove('active', 'on');
        elements.aiFace.classList.remove('listening');
        if (state.isCallActive) elements.micButton.disabled = false;
        return;
    }
    // --- End Check ---

    // --- INTERRUPT AI SPEECH IF IT'S RESPONDING ---
    if (state.aiResponding && state.geminiAgent) {
        console.log("[startListening] AI is responding, attempting to interrupt...");
        state.geminiAgent.interruptSpeech();
        elements.aiFace.classList.remove('ai-responding'); // Reset AI face UI
        state.aiResponding = false;                       // Reset AI responding state
        // Optionally, add a small delay for the interruption to take full effect
        // await new Promise(resolve => setTimeout(resolve, 100)); 
    }
    // --- END AI SPEECH INTERRUPTION ---

    try {
        elements.micButton.disabled = true; // Prevent multiple clicks
        
        // UI updates - Mic button and AI face
        elements.micButton.classList.add('active');
        elements.micButton.classList.add('on'); // Add 'on' class for blue color
        elements.aiFace.classList.add('listening'); // Add listening animation to face
        appendSystemMessage("Listening...");
        
        // --- Add specific logging for recorder start ---
        console.log("startListening: Attempting to call state.audioRecorder.start()...");
        
        // Reset speech tracking state // REMOVED
        // state.isSpeaking = false;
        // state.speechStarted = false;
        
        // Check if the recorder is already running and just need to re-enable sending
        if (state.audioRecorder && state.audioRecorder.isRecording) {
            console.log("Recorder already running, re-enabling audio data flow");
            state._sendingAudioToAgent = true;
        } else {
            // Make sure we only add event listeners once // REMOVED SPEECH EVENT LISTENERS
            // if (!state.audioRecorder.hasAddedSpeechEventListeners) { ... }
            
            // Start the recorder with audio data callback
            await state.audioRecorder.start((audioData) => {
                // Only send recorded audio to the Gemini agent when flag is true
                if (state._sendingAudioToAgent !== false && 
                    state.geminiAgent && 
                    state.geminiAgent.getConnectionStatus && 
                    state.geminiAgent.getConnectionStatus()) {
                    
                    // Manual speech detection as backup method // REMOVED
                    // if (audioData && 'energy' in audioData) { ... }
                    
                    // Send the audio without incrementing turn count
                    state.geminiAgent.sendAudio(audioData).catch(err => { // Simplified sendAudio call
                        console.error("[Audio Send] Error sending audio:", err);
                    });
                }
            });
            state._sendingAudioToAgent = true; // Enable sending
        }
        
        console.log("startListening: state.audioRecorder.start() call completed.");
        // --- End specific logging ---
        
        // Optionally try to connect visualizer if it exists, but don't rely on it
        try {
            if (state.visualizer && state.audioRecorder) {
                const sourceNode = state.audioRecorder.sourceNode;
                if (sourceNode) {
                    sourceNode.connect(state.visualizer.analyser);
                    state.visualizer.start('user');
                }
            }
        } catch (visualizerError) {
            console.warn("Visualizer connection failed, continuing without visualization:", visualizerError);
            // Non-critical error, continue without visualizer
        }
        
        // Update state
        state.isListening = true;
        console.log("User listening started successfully");

        // startLongSilenceTimer(); // REMOVED
    } catch (error) {
        console.error("Error starting listening:", error);
        appendSystemMessage(`启动麦克风错误: ${error.message}`);
        // Visual indicator - Reset UI
        elements.micButton.classList.remove('active');
        elements.micButton.classList.remove('on');
        elements.aiFace.classList.remove('listening');
    } finally {
        // Ensure button is re-enabled only if call is still active, 
        // even if startListening failed.
        elements.micButton.disabled = !state.isCallActive; 
    }
}

async function stopListening() {
    console.log("stopListening: Stopping user listening...");
    
    if (!state.isListening) {
        console.log("Not currently listening, no action needed");
        return;
    }
    
    try {
        elements.micButton.disabled = true; // Prevent multiple clicks during transition
        
        // UI updates - Mic button and AI face
        elements.micButton.classList.remove('active');
        elements.micButton.classList.remove('on'); // Remove 'on' class to return to red color
        elements.aiFace.classList.remove('listening'); // Remove listening animation from face
        
        // Clear utterance timeout if active // REMOVED
        // if (state.utteranceTimeout) { ... }
        
        // Update session duration when stopping mic
        updateSessionDuration();
        
        // state.isSpeaking = false; // REMOVED
        // state.speechStarted = false; // REMOVED
        // console.log("[Speech Monitoring] User speech state reset to: not speaking"); // REMOVED
        
        // Instead of stopping the recorder completely, we'll keep it running
        // but set a flag to ignore its output
        if (state.audioRecorder) {
            // Flag to track if we're actively sending audio to the agent
            state._sendingAudioToAgent = false;
            
            // Don't fully stop the recorder as it might close the AudioContext
            console.log("Audio recorder data flow stopped, but recorder kept alive");
            
            // Try to disconnect from visualizer, but don't worry if it fails
            try {
                if (state.visualizer && state.audioRecorder && state.audioRecorder.sourceNode) {
                    state.audioRecorder.sourceNode.disconnect(state.visualizer.analyser);
                    state.visualizer.start('idle');
                }
            } catch (visualizerError) {
                console.warn("Visualizer disconnection failed, not critical:", visualizerError);
            }
        }
        
        // Reset long silence timer // REMOVED
        // clearLongSilenceTimer();
        
        // Update state
        state.isListening = false;
        appendSystemMessage(""); // Clear message
        console.log("User listening stopped successfully");
    } catch (error) {
        console.error("Error stopping listening:", error);
        appendSystemMessage(`错误: ${error.message}`);
    } finally {
        elements.micButton.disabled = !state.isCallActive;
    }
}

// ------------------------
// 6. SILENCE HANDLING // REMOVED SECTION
// ------------------------
// function clearLongSilenceTimer() { ... } // REMOVED
// function startLongSilenceTimer() { ... } // REMOVED
// async function handleLongSilence() { ... } // REMOVED

// ------------------------
// 7. MODAL & USER INTERACTION HANDLERS (Adjusted section number)
// ------------------------

// --- Add Cleanup and Exit Function ---
async function performCleanupAndExit() {
    console.log("[Exit] Performing cleanup and exiting call...");
    hideSaveModal(); // Ensure modal is hidden
    // clearLongSilenceTimer(); // REMOVED

    // Stop listening if active
    if (state.isListening) {
        await stopListening();
    }

    // Disconnect agent
    if (state.geminiAgent && state.geminiAgent.getConnectionStatus()) {
        console.log("Disconnecting agent...");
        state.geminiAgent.disconnect();
    }
    state.geminiAgent = null; // Release agent reference

    // Stop recorder if running
    if (state.audioRecorder && state.audioRecorder.isRecording) {
        try {
            console.log("Stopping audio recorder...");
            await state.audioRecorder.stop();
        } catch (e) {
            console.error("Error stopping recorder during cleanup:", e);
        }
    }
    state.audioRecorder = null; // Release recorder reference

    // Close AudioContext
    if (state.audioContext && state.audioContext.state !== 'closed') {
        try {
            console.log("Closing AudioContext...");
            await state.audioContext.close();
        } catch (e) {
            console.error("Error closing AudioContext during cleanup:", e);
        }
    }
    state.audioContext = null; // Release context reference

    // Clean up keep-alive nodes if they exist
    if (state._keepAliveNodes) {
        try {
            state._keepAliveNodes.oscillator.stop();
            state._keepAliveNodes.oscillator.disconnect();
            state._keepAliveNodes.gainNode.disconnect();
            console.log("[Exit] Stopped and disconnected keep-alive nodes.");
        } catch(e) {
            console.error("[Exit] Error cleaning up keep-alive nodes:", e);
        }
        state._keepAliveNodes = null;
    }

    state.isCallActive = false; // Mark call as inactive
    console.log("Cleanup complete. Navigating to index.html");

    // Navigate back to the main page
            window.location.href = '../index.html';
}
// --- End Cleanup Function ---

// --- Add Modal Functions ---
function showSaveModal() {
    console.log("[Modal] Showing save modal...");
    
    // Update session duration
    updateSessionDuration();
    
    // Update modal information
    const modalMessage = document.getElementById('modal-message');
    if (modalMessage) {
        // Use session duration information
        const durationMinutes = Math.floor(state.sessionDuration / 60000);
        const durationSeconds = Math.floor((state.sessionDuration % 60000) / 1000);
        const durationText = `${durationMinutes}分${durationSeconds}秒`;
        
        // Directly update the entire message text, not dependent on modalTurnCount element
        if (state.sessionDuration >= MIN_DURATION_TO_RECOMMEND_SAVE) {
            // Over 60 seconds, recommend saving
            modalMessage.textContent = `您的通话时长为${durationText}。建议保存此会话。`;
            elements.modalSaveBtn.classList.add('recommended');
            elements.modalSaveBtn.textContent = '保存会话';
            elements.modalDontSaveBtn.textContent = "不保存";
        } else if (state.sessionDuration >= MIN_DURATION_TO_ALLOW_SAVE) {
            // Over 30 seconds but less than 60, allow saving but don't recommend
            modalMessage.textContent = `您的通话时长为${durationText}。是否要保存此会话？`;
            elements.modalSaveBtn.classList.remove('recommended');
            elements.modalSaveBtn.textContent = '保存会话';
            elements.modalDontSaveBtn.textContent = "不保存";
        } else {
            // Less than 30 seconds, don't show save dialog, exit directly
            console.log("[Modal] Session duration less than 30 seconds, not showing save dialog");
            performCleanupAndExit();
            return;
        }
    }
    
    // Use utility function with callbacks
    showModal(elements, state, 
        // Save callback
        async () => {
            console.log("[Save Session] Save button clicked");
            await saveCallSession();
            performCleanupAndExit(); // Exit after saving
        },
        // Don't save callback
        () => {
            console.log("[Save Session] Don't Save button clicked");
            appendSystemMessage("Session not saved.", "info");
            performCleanupAndExit(); // Exit without saving
        }
    );
}

function hideSaveModal() {
    console.log("[Modal] Hiding save modal.");
    hideModal(elements);
}
// --- End Modal Functions ---

// --- Add Save Session Function ---
async function saveCallSession() {
    console.log("[Save Session] Attempting to save call session...");
    if (!state.startTime) {
        console.warn("[Save Session] Cannot save session, start time not recorded.");
        appendSystemMessage("无法保存会话：开始时间缺失。", "error");
        return;
    }
    
    // Ensure session duration is updated
    updateSessionDuration();
    
    if (state.sessionDuration < MIN_DURATION_TO_ALLOW_SAVE) {
        console.warn(`[Save Session] Session duration less than ${MIN_DURATION_TO_ALLOW_SAVE/1000} seconds, not saving.`);
        appendSystemMessage("会话时间太短，无法保存。", "info");
        return;
    }

    const durationMinutes = Math.floor(state.sessionDuration / 60000);
    const durationSeconds = Math.floor((state.sessionDuration % 60000) / 1000);
    console.log(`[Save Session] Preparing to save session, total duration: ${durationMinutes}min${durationSeconds}sec`);
    
    // For voice calls, we'll use duration-based feedback instead of transcript-based
    appendSystemMessage("正在分析您的口语练习...", "info");
    
    // Create a simple array with call information to pass to feedback generator
    const callData = [
        { role: 'system', text: `This was a voice practice session of ${durationMinutes} minutes and ${durationSeconds} seconds.` },
        { role: 'user', text: `Voice call practice session with ${durationMinutes}:${durationSeconds} duration.` }
    ];
    
    try {
        // Generate feedback with noAudio=true to prevent audio playback during saving
        const feedback = await generateLanguageFeedback(callData, null, false, true);
        
        // Use the utility function to create the record with feedback
        const record = createSessionRecord(
            state, 
            'voice', 
            [], // Empty transcript for voice calls
            `Voice chat (${durationMinutes}min${durationSeconds}sec)`,
            feedback.feedback // Add feedback to the record
        );

        const saved = addRecord(record);
        if (saved) {
            console.log("[Save Session] Call session saved successfully with feedback.");
            appendSystemMessage("会话已保存，包含练习反馈。", "info");
        } else {
            console.error("[Save Session] Failed to save call session via record.js");
            appendSystemMessage("保存会话失败。", "error");
        }
    } catch (error) {
        console.error("[Save Session] Error saving call session:", error);
        appendSystemMessage(`保存会话错误: ${error.message}`, "error");
    }
}
// --- End Save Session Function ---

async function handleReturn() {
    console.log("[Return Click] Return button clicked. isCallActive:", state.isCallActive);
    // clearLongSilenceTimer(); // REMOVED

    // Update session duration
    updateSessionDuration();

    // Stop listening if active
    if (state.isListening) {
        await stopListening(); 
    }

    if (state.isCallActive && state.sessionDuration >= MIN_DURATION_TO_ALLOW_SAVE) {
        // If session duration is over 30 seconds, show save dialog
        console.log(`Showing save modal for session duration: ${Math.floor(state.sessionDuration/1000)} seconds`);
        showSaveModal(); 
        // Exit logic is now handled by the modal button listeners
    } else {
        // If session duration is less than 30 seconds, exit directly
        console.log("Exiting directly (session too short or call inactive)");
        performCleanupAndExit();
    }
}

// ------------------------
// 8. MAIN INITIALIZATION
// ------------------------
async function initializeCallSystem() {
    try {
        console.log("Initializing call system...");
        appendSystemMessage("正在初始化..."); // Add initial message
        
        // 1. Initialize audio system (creates AudioContext and AudioRecorder)
        const audioInitialized = await initializeAudioSystem();
        if (!audioInitialized) {
            throw new Error("Audio system initialization failed");
        }
        
        // 2. Initialize agent
        const agentInitialized = await initializeAgent();
        if (!agentInitialized) {
            console.warn("Agent initialization failed but continuing with limited functionality");
            // We continue even if agent fails - user can retry connection by clicking mic
        }

        // --- Add Modal Event Listeners ---
        if (elements.modalSaveBtn) {
            elements.modalSaveBtn.addEventListener('click', async () => {
                console.log("Save button clicked");
                await saveCallSession();
                performCleanupAndExit(); // Exit after saving
            });
            console.log("[Init] Added listener for modalSaveBtn");
        } else {
            console.warn("[Init] modalSaveBtn not found");
        }
        if (elements.modalDontSaveBtn) {
            elements.modalDontSaveBtn.addEventListener('click', () => {
                console.log("Don't Save button clicked");
                appendSystemMessage("Session not saved.", "info");
                performCleanupAndExit(); // Exit without saving
            });
            console.log("[Init] Added listener for modalDontSaveBtn");
        } else {
             console.warn("[Init] modalDontSaveBtn not found");
        }
        // Optional: Close modal on backdrop click
        if (elements.saveModalBackdrop) {
             elements.saveModalBackdrop.addEventListener('click', (event) => {
                 if (event.target === elements.saveModalBackdrop) {
                     hideSaveModal();
                     // Decide if backdrop click should also exit or just close modal
                     // performCleanupAndExit(); // Uncomment to exit on backdrop click
                 }
             });
             console.log("[Init] Added listener for saveModalBackdrop");
        } else {
            console.warn("[Init] saveModalBackdrop not found");
        }
        // --- End Modal Listeners ---
        
        state.isCallActive = true;
        state.startTime = new Date(); // <-- Record start time
        state.lastDurationUpdate = Date.now();
        console.log("[Init] Call system initialized successfully. isCallActive:", state.isCallActive);
        appendSystemMessage("系统已就绪。点击麦克风开始。"); // Update message on success

        // Add settings listener to update playback rate if voiceSpeed changes
        settingsService.addListener(async (change) => {
            if (change.key === 'voiceSpeed') {
                console.log(`[Settings Listener - Call] Voice speed changed to: ${change.value}`);
                if (state.geminiAgent) { 
                    state.geminiAgent.setPlaybackRate(change.value);
                } else { 
                    // elements.aiAudioElement.playbackRate = change.value; // aiAudioElement no longer primary for AI audio
                }
            } else if (change.key === 'voiceType' || change.key === 'modelType') {
                // Only re-initialize if the call is active, to prevent issues if settings are changed while not on the call page
                if (state.isCallActive) {
                    console.log(`[Settings Listener - Call] ${change.key} changed to: ${change.value}. Re-initializing agent for call.`); // Keep - important event
                    appendSystemMessage("语音设置已更改，正在重新连接服务...", "info");
                    
                    // Disconnect existing agent and clear it
                    if (state.geminiAgent) {
                        if (state.geminiAgent.getConnectionStatus()) {
                            await state.geminiAgent.disconnect();
                        }
                        state.geminiAgent = null; // Nullify to allow re-creation
                    }
                    
                    // Attempt to re-initialize the agent part of the call system
                    // This assumes initializeAgent can be called again safely
                    try {
                        const agentReinitialized = await initializeAgent();
                        if (agentReinitialized) {
                            // Re-apply voice speed to the new agent instance
                            if (state.geminiAgent) {
                                const voiceSpeed = settingsService.getSetting('voiceSpeed', 1.1);
                                state.geminiAgent.setPlaybackRate(voiceSpeed);
                                // console.log(`[Settings Listener - Call] Applied voice speed ${voiceSpeed} to new agent.`); // Can be commented out
                            }
                            appendSystemMessage("服务已更新并重新连接。", "success");
                            // If mic was on, user might need to toggle it again, or we could try to restart listening.
                            // For simplicity, let user re-toggle mic if needed after settings change.
                            if(state.isListening) {
                                await stopListening(); // Stop listening, user can restart
                                elements.micButton.classList.remove('active', 'on');
                                elements.aiFace.classList.remove('listening');
                                appendSystemMessage("请重新点击麦克风继续。", "info");
                            }
                        } else {
                            appendSystemMessage("重新连接服务失败。请检查设置或刷新。", "error");
                            elements.micButton.disabled = true; // Disable mic if re-init fails
                        }
                    } catch (error) {
                        console.error("[Settings Listener - Call] Error re-initializing agent:", error);
                        appendSystemMessage("重新连接服务时出错。", "error");
                        elements.micButton.disabled = true;
                    }
                } else {
                    console.log(`[Settings Listener - Call] ${change.key} changed, but call is not active. No re-initialization.`);
                }
            }
        });

        // Initialize playback rate on the agent
        if (state.geminiAgent) {
            const initialVoiceSpeed = settingsService.getSetting('voiceSpeed', 1.1);
            state.geminiAgent.setPlaybackRate(initialVoiceSpeed);
            // console.log(`[Init] Set initial GeminiAgent playbackRate to: ${initialVoiceSpeed}`); // Can be commented out
        }
        
        return true;
        
    } catch (error) {
        console.error("[Init] Call system initialization failed:", error);
        appendSystemMessage(`错误: ${error.message}。请检查控制台/设置。`);
        
        // Cleanup
        state.isCallActive = false;
        elements.micButton.disabled = true; // Ensure mic is disabled on failure
        console.log("[Init] Initialization failed. isCallActive:", state.isCallActive);
        
        return false;
    }
}

// Function to toggle microphone state
async function toggleMicrophone() {
    console.log("[Mic Click] Toggle microphone clicked. isCallActive:", state.isCallActive);
    
    // Prevent clicks during transition
    elements.micButton.disabled = true;
    
    try {
        if (state.isListening) {
            // Update session duration when stopping listening
            updateSessionDuration();
            
            // If listening, stop
            await stopListening();
        } else {
            // If not listening, start
            await startListening();
        }
    } catch (error) {
        console.error("Error toggling microphone:", error);
        appendSystemMessage(`Error: ${error.message}`);
    } finally {
        // Only re-enable button if call is still active
        elements.micButton.disabled = !state.isCallActive;
        console.log("[Mic Click] Toggle complete. Mic button disabled:", elements.micButton.disabled);
    }
}

// ------------------------
// 9. STARTUP CODE
// ------------------------
document.addEventListener('DOMContentLoaded', async () => {
    console.log("[DOM] Call page DOM loaded. Initializing call system...");
    
    // 1. Verify required UI elements exist
    const requiredElements = ['mic-btn', 'call-return-btn', 'ai-face', 'ai-audio-player'];
    let missingElement = false;
    requiredElements.forEach(id => {
        if (!document.getElementById(id)) {
            console.error(`Required UI element with ID '${id}' not found. Aborting initialization.`);
            missingElement = true;
        }
    });
    if (missingElement) return;

    // Add return button back to elements cache if it exists
    elements.returnButton = document.getElementById('call-return-btn');

    // Re-add modal elements to cache in case they weren't ready before
    elements.saveModalBackdrop = document.getElementById('save-modal-backdrop');
    elements.saveModal = document.getElementById('save-modal');
    elements.modalSaveBtn = document.getElementById('modal-save-btn');
    elements.modalDontSaveBtn = document.getElementById('modal-dont-save-btn');
    
    // 2. Initialize system
    const initSuccess = await initializeCallSystem(); // This now adds modal listeners
    if (!initSuccess) {
        console.error("Call system failed to initialize. Voice call disabled.");
        return;
    }
    
    // 3. Set up event listeners
    if (elements.micButton) {
        elements.micButton.addEventListener('click', toggleMicrophone);
        console.log("[DOM] Added listener for micButton");
    } else {
        console.warn("[DOM] micButton not found, listener not added.");
    }
    
    // Return button listener
    if (elements.returnButton) {
        elements.returnButton.addEventListener('click', handleReturn); 
        console.log("[DOM] Added listener for returnButton");
    } else {
        console.warn("[DOM] returnButton not found, listener not added.");
    }
    
    // Periodically update session duration
    setInterval(() => {
        if (state.isCallActive) {
            updateSessionDuration();
        }
    }, 30000); // Update every 30 seconds
    
    console.log("[DOM] Event listeners added. Call system should be ready (if init succeeded).");
});

// For potential use by other modules
export { initializeCallSystem, startListening, stopListening };