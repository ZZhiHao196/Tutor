import { settingsService } from '../settings/settings.js';    
import { addRecord, generateLanguageFeedback } from '../features/record.js';
import { GeminiAgent } from '../core/agent.js'; // Import GeminiAgent
import { getConfig, getWebsocketUrl } from '../core/config.js'; // Import config utils
import { base64ToBlob, markdownToHtml, showSaveModal, hideSaveModal, createSessionRecord } from '../utils/utils.js'; // Import utility functions

// DOM elements
const elements = {
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    chatMessages: document.getElementById('chat-messages'),
    statusIndicator: document.getElementById('status-indicator'),
    returnButton: document.getElementById('chat-return-btn'),
    clearHistoryButton: document.getElementById('clear-history-btn'),
    saveModalBackdrop: document.getElementById('save-modal-backdrop'),
    modalTurnCount: document.getElementById('modal-turn-count'),
    modalSaveBtn: document.getElementById('modal-save-btn'),
    modalDontSaveBtn: document.getElementById('modal-dont-save-btn'),
    aiAudioElement: document.getElementById('ai-audio-player')
};

// Centralized state
const state = {
    isConnected: false,
    settings: null,
    chatHistory: [],
    isPending: false,
    userTurnCount: 0,
    startTime: null,
    apiType: 'gemini', // Will be set based on settings during initialization
    isAudioEnabled: true, // Whether to play AI responses as audio
    audioPlaying: false, // Tracks if audio is currently playing
    geminiVoiceAgent: null, // Added for Gemini voice API
    messagePlaybacks: {}, // Track playback counts for messages by ID
    audioPlayingTimestamp: null, // Added for audio playback state tracking
    workerAudioFailed: false, // Tracks if Worker TTS has failed and we should use browser TTS
    sharedAudioContext: null, // ADDED: For shared Web Audio API context
};

// first hide status indicator
if (elements.statusIndicator) {
    elements.statusIndicator.style.display = 'none';
}

// simulate AI response
function simulateAIResponse(text) {
    setTimeout(() => {
        const responses = [
            "I understand what you're saying. Could you tell me more?",
            "That's interesting! How do you feel about that?",
            "Let me think about that... Can you elaborate a bit more?",
            "I see. What made you think about this topic?",
            "That's a good point. Would you like to discuss this further?"
        ];
        const response = responses[Math.floor(Math.random() * responses.length)];
        appendMessage(response, 'ai');
        enableInput();
    }, 1000);
}

// Add a helper function to check audio format support at the top of the file
// This will help us determine if we need to request a different format from the worker
function checkAudioFormatSupport() {
    const audioElement = document.createElement('audio');
    const formatSupport = {
        mp3: audioElement.canPlayType('audio/mpeg'),
        ogg: audioElement.canPlayType('audio/ogg; codecs="opus"'),
        wav: audioElement.canPlayType('audio/wav'),
        aac: audioElement.canPlayType('audio/aac')
    };
    
    console.log('Browser audio format support:', formatSupport);
    return formatSupport;
}

// Get audio from the API - Updated to support both Gemini TTS and browser TTS
async function getAudioForText(text) {
    // If audio is disabled, don't proceed
    if (!state.isAudioEnabled || !elements.aiAudioElement) {
        console.warn("[Chat.js - getAudioForText] Audio playback is disabled or audio element not found");
        return null;
    }
    
    try {
        const preparedText = prepareTextForSpeech(text);
        console.log(`[Chat.js - getAudioForText] Requesting TTS for: "${preparedText.substring(0, 70)}${preparedText.length > 70 ? "..." : ""}"`);

        // Reset audio playing state if it's been stuck for more than 30 seconds
        const now = Date.now();
        if (state.audioPlayingTimestamp && (now - state.audioPlayingTimestamp > 30000)) {
            console.warn("[Chat.js - getAudioForText] Audio playing state was stuck, resetting.");
            state.audioPlaying = false;
            state.audioPlayingTimestamp = null;
        }
        
        // PRIORITY: Use Gemini Live Agent if available and connected
        if (state.apiType === 'gemini' && state.geminiVoiceAgent && state.geminiVoiceAgent.getConnectionStatus()) {
            console.log("[Chat.js - getAudioForText] Using Gemini Live Agent for TTS.");
            state.audioPlayingTimestamp = now; // Mark that we are initiating playback
            state.audioPlaying = true; // Set before sending text, reset on turn_complete or error by agent
            await state.geminiVoiceAgent.sendText(preparedText);
            // Audio will be played by the AudioStreamer connected to the shared AudioContext.
            // UI updates for .is-playing should be handled by 'text' and 'turn_complete' from this agent.
            return true; // Indicates TTS process initiated successfully
        }

        // Fallback conditions for custom worker or browser TTS
        if (state.apiType === 'domestic' || 
            state.workerAudioFailed === true) {
            console.log("[Chat.js - getAudioForText] Using browser speech synthesis (domestic API or worker failed).");
            return generateSpeechWithBrowser(preparedText);
        }
        
        // Record timestamp when we set audioPlaying to true for worker path
        state.audioPlayingTimestamp = now;

        // CUSTOM WORKER TTS LOGIC (remains as fallback if Gemini Live Agent is not used/available)
        console.log("[Chat.js - getAudioForText] Attempting TTS via custom worker.");
        let workerAudioUrl = '/audio'; 
        if (state.settings && state.settings.chatApiProxyUrl) {
            // Ensure no double slashes if proxyUrl ends with / and endpoint starts with /
            const baseUrl = state.settings.chatApiProxyUrl.replace(/\/?$/, '');
            const endpointPath = workerAudioUrl.startsWith('/') ? workerAudioUrl : '/' + workerAudioUrl;
            workerAudioUrl = baseUrl + endpointPath;
        } else {
            console.warn("[getAudioForText] chatApiProxyUrl not found in settings. Using relative path '/audio'. This might only work if the worker is on the same origin or via a relative path setup.");
        }
        
        // Get voice and speed from settings, with defaults
        // The voice names here should match the keys in your worker's voiceMap
        const voiceSetting = state.settings?.voiceType || 'Aoede'; // Default to 'Aoede' or your preferred default
        const speakingRateSetting = state.settings?.voiceSpeed || 1.0;

        // Check audio format support
        const formatSupport = checkAudioFormatSupport();
        // Choose audio format based on browser support
        let audioFormat = 'OGG_OPUS'; // Default format
        
        // If OGG isn't supported well, try MP3 instead
        if (!formatSupport.ogg || formatSupport.ogg === 'maybe') {
            if (formatSupport.mp3 && formatSupport.mp3 !== 'maybe') {
                audioFormat = 'MP3';
                console.log("[getAudioForText] OGG not well supported, using MP3 instead");
            }
        }

        const requestBody = {
            text: preparedText,
            voice: voiceSetting, // 'Aoede' is sent to the worker
            speakingRate: speakingRateSetting,
            audioFormat: audioFormat // Add the audio format parameter
        };

        console.log('[getAudioForText] Sending to worker:', workerAudioUrl, 'with body:', requestBody);

        const response = await fetch(workerAudioUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        // Log response headers for debugging
        console.log('[getAudioForText] Response headers:', 
            Array.from(response.headers.entries())
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[getAudioForText] Error from TTS worker: ${response.status} - ${errorText}`);
            // Fallback to browser TTS if worker fails
            console.warn("[getAudioForText] TTS worker request failed. Falling back to browser synthesis.");
            state.audioPlaying = false; // Reset state before fallback
            state.workerAudioFailed = true; // 标记worker语音失败
            return generateSpeechWithBrowser(preparedText);
        }

        const responseData = await response.json();
        
        if (responseData.audioContent) {
            console.log(`[getAudioForText] Received audio content (${responseData.audioContent.length} chars)`);
            
            try {
                // Determine the MIME type based on the audio format we requested
                const mimeType = audioFormat === 'MP3' ? 'audio/mpeg' : 'audio/ogg';
                const audioBlob = base64ToBlob(responseData.audioContent, mimeType);
                console.log(`[getAudioForText] Created audio blob: size=${audioBlob.size}, type=${audioBlob.type}`);
                
                if (audioBlob.size < 100) {
                    console.error("[getAudioForText] Audio blob is suspiciously small, probably invalid");
                    state.workerAudioFailed = true;
                    state.audioPlaying = false;
                    return generateSpeechWithBrowser(preparedText);
                }
                
                const audioUrl = URL.createObjectURL(audioBlob);
                console.log(`[getAudioForText] Created object URL: ${audioUrl}`);
                
                // Reset any previous audio
                elements.aiAudioElement.pause();
                elements.aiAudioElement.currentTime = 0;
                
                // Set up audio element
                elements.aiAudioElement.src = audioUrl;
                elements.aiAudioElement.playbackRate = speakingRateSetting; 
                
                // Create a watchdog timer to detect and handle audio playback issues
                let audioStarted = false;
                const audioWatchdog = setTimeout(() => {
                    if (!audioStarted) {
                        console.error("[getAudioForText] Audio failed to start playing within timeout");
                        state.workerAudioFailed = true;
                        state.audioPlaying = false;
                        // Clean up the audio element
                        elements.aiAudioElement.pause();
                        elements.aiAudioElement.src = '';
                        // Fall back to browser synthesis
                        generateSpeechWithBrowser(preparedText);
                    }
                }, 3000);
                
                // Add one-time event listener to detect successful playback
                elements.aiAudioElement.addEventListener('playing', () => {
                    console.log("[getAudioForText] Audio element started playing successfully");
                    audioStarted = true;
                    clearTimeout(audioWatchdog);
                }, { once: true });
                
                // Add error handler specifically for this playback
                const errorHandler = (e) => {
                    console.error("[getAudioForText] Audio element error:", e);
                    console.error("Audio error details:", 
                        elements.aiAudioElement.error ? 
                        `code=${elements.aiAudioElement.error.code}, message=${elements.aiAudioElement.error.message}` : 
                        "No error details"
                    );
                    clearTimeout(audioWatchdog);
                    state.workerAudioFailed = true;
                    state.audioPlaying = false;
                    elements.aiAudioElement.removeEventListener('error', errorHandler);
                    // Fall back to browser synthesis
                    generateSpeechWithBrowser(preparedText);
                };
                elements.aiAudioElement.addEventListener('error', errorHandler, { once: true });
                
                try {
                    console.log("[getAudioForText] Attempting to play audio...");
                    const playPromise = elements.aiAudioElement.play();
                    
                    // Handle the play promise
                    if (playPromise !== undefined) {
                        playPromise.then(() => {
                            console.log("[getAudioForText] Audio play() promise resolved successfully");
                        }).catch(err => {
                            console.error("[getAudioForText] Audio play() promise rejected:", err);
                            clearTimeout(audioWatchdog);
                            state.workerAudioFailed = true;
                            state.audioPlaying = false;
                            // Fall back to browser synthesis
                            generateSpeechWithBrowser(preparedText);
                        });
                    }
                    
                    return true; // Indicates success starting the process
                } catch (playError) {
                    console.error("[getAudioForText] Audio play() failed:", playError);
                    clearTimeout(audioWatchdog);
                    state.workerAudioFailed = true;
                    state.audioPlaying = false;
                    // Fall back to browser TTS
                    return generateSpeechWithBrowser(preparedText);
                }
            } catch (processingError) {
                console.error("[getAudioForText] Error processing audio data:", processingError);
                state.workerAudioFailed = true;
                state.audioPlaying = false;
                return generateSpeechWithBrowser(preparedText);
            }
        } else {
            console.error("[getAudioForText] No audioContent in worker response:", responseData);
            // Fallback to browser TTS if worker response is malformed
            console.warn("[getAudioForText] TTS worker response missing audioContent. Falling back to browser synthesis.");
            state.workerAudioFailed = true;
            state.audioPlaying = false;
            return generateSpeechWithBrowser(preparedText);
        }

    } catch (error) {
        console.error("[getAudioForText] Error requesting TTS from worker:", error);
        // Fallback to browser TTS on any unexpected error
        console.warn("[getAudioForText] General error during worker TTS. Falling back to browser synthesis.");
        state.workerAudioFailed = true;
        state.audioPlaying = false;
        const preparedTextForFallback = prepareTextForSpeech(text); // Ensure text is prepared
        return generateSpeechWithBrowser(preparedTextForFallback);
    }
}

// Generate speech using browser's speech synthesis
function generateSpeechWithBrowser(text) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            console.error("[generateSpeechWithBrowser] Browser speech synthesis not supported");
            reject(new Error("Browser speech synthesis not supported"));
            return;
        }
        
        try {
            // Ensure text is valid
            if (!text || typeof text !== 'string') {
                console.error("[generateSpeechWithBrowser] Invalid text received:", text);
                reject(new Error("Invalid text for speech synthesis"));
                return;
            }

            // Log speech synthesis attempt
            console.log("[generateSpeechWithBrowser] Starting speech synthesis for:", text.substring(0, 50) + (text.length > 50 ? "..." : ""));
            
            // Cancel any previous speech
            speechSynthesis.cancel();
            
            // Force a clean slate for speech synthesis
            setTimeout(() => {
                try {
                    // Get available voices
                    let voices = speechSynthesis.getVoices();
                    
                    // If no voices are available yet, wait and retry
                    if (voices.length === 0) {
                        console.log("[generateSpeechWithBrowser] No voices available yet, waiting for voiceschanged event");
                        
                        // Set up one-time event listener
                        speechSynthesis.onvoiceschanged = () => {
                            voices = speechSynthesis.getVoices();
                            console.log(`[generateSpeechWithBrowser] Voices loaded: ${voices.length} available`);
                            proceedWithSpeech(voices);
                        };
                        
                        // Fallback timeout in case voices never load
                        setTimeout(() => {
                            if (voices.length === 0) {
                                console.error("[generateSpeechWithBrowser] Timed out waiting for voices");
                                resolve(false); // Resolve with failure rather than rejecting
                            }
                        }, 3000);
                    } else {
                        console.log(`[generateSpeechWithBrowser] ${voices.length} voices already available`);
                        proceedWithSpeech(voices);
                    }
                    
                    // Function to handle the actual speech synthesis
                    function proceedWithSpeech(voices) {
                        // Try to find a female English voice
                        let selectedVoice = voices.find(voice => 
                            voice.lang.includes('en') && 
                            (voice.name.includes('Female') || voice.name.includes('female') || 
                             voice.name.includes('Samantha') || voice.name.includes('Google UK English Female')));
                        
                        // Fallback to any English voice
                        if (!selectedVoice) {
                            selectedVoice = voices.find(voice => voice.lang.includes('en'));
                        }
                        
                        // Final fallback to any voice
                        if (!selectedVoice && voices.length > 0) {
                            selectedVoice = voices[0];
                        }
                        
                        // Prepare the utterance
                        const utterance = new SpeechSynthesisUtterance(text);
                        
                        // Set the voice if we found one
                        if (selectedVoice) {
                            utterance.voice = selectedVoice;
                            console.log(`[generateSpeechWithBrowser] Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
                        } else {
                            console.warn("[generateSpeechWithBrowser] No suitable voice found, using default");
                        }
                        
                        // Set speech parameters
                        utterance.rate = state.settings?.voiceSpeed || 1.2;
                        utterance.pitch = 1.0;
                        utterance.volume = 1.0;
                        utterance.lang = 'en-US'; // Force English
                        
                        console.log(`[generateSpeechWithBrowser] Speech parameters: rate=${utterance.rate}, pitch=${utterance.pitch}, volume=${utterance.volume}, lang=${utterance.lang}`);
                        
                        // Event handlers
                        utterance.onstart = () => {
                            console.log("[generateSpeechWithBrowser] Speech started");
                            state.audioPlaying = true;
                        };
                        
                        utterance.onend = () => {
                            console.log("[generateSpeechWithBrowser] Speech ended");
                            state.audioPlaying = false;
                            resolve(true);
                        };
                        
                        utterance.onerror = (event) => {
                            console.error(`[generateSpeechWithBrowser] Speech error: ${event.error}`, event);
                            state.audioPlaying = false;
                            resolve(false); // Resolve with failure instead of rejecting
                        };
                        
                        // Speak
                        console.log("[generateSpeechWithBrowser] Speaking now...");
                        speechSynthesis.speak(utterance);
                    }
                } catch (innerError) {
                    console.error("[generateSpeechWithBrowser] Error initializing speech:", innerError);
                    resolve(false);
                }
            }, 100); // Small delay to ensure previous speech is cancelled
        } catch (outerError) {
            console.error("[generateSpeechWithBrowser] Outer try/catch error:", outerError);
            resolve(false);
        }
    });
}

// Play audio response - Updated to handle both Gemini TTS and browser TTS
async function playTextAsAudio(text, messageId = null) {
    if (!state.isAudioEnabled || !elements.aiAudioElement) {
        console.warn("Audio playback is disabled or audio element not found");
        return false;
    }

    try {
        // The 'text' argument should ideally be the already-prepared speechText.
        const speechText = text; // Assume 'text' is already prepared by the caller.
            
        console.log("Getting audio for text:", speechText.slice(0, 50) + (speechText.length > 50 ? "..." : ""));
        
        // Find the message content element either by ID or as the most recent AI message
        let latestAiMessage;
        
        if (messageId) {
            // Find specific message by ID
            const messageElement = document.querySelector(`.message[data-message-id="${messageId}"] .message-content`);
            if (messageElement) {
                latestAiMessage = messageElement;
            }
        }
        
        // Fallback to most recent if no specific message found
        if (!latestAiMessage) {
            const aiMessages = document.querySelectorAll('.message.ai .message-content');
            if (aiMessages.length > 0) {
                latestAiMessage = aiMessages[aiMessages.length - 1];
            }
        }
        
        if (latestAiMessage) {
            // Signal that we're waiting for audio
            state.audioPlaying = true;
            document.querySelectorAll('.message-content').forEach(el => {
                el.classList.remove('is-playing');
            });
            latestAiMessage.classList.add('is-playing');
            
            // Request audio - this will use either Gemini or Browser TTS based on API type
            const result = await getAudioForText(speechText);
            
            // If the request failed, reset state
            if (!result) {
                state.audioPlaying = false;
                latestAiMessage.classList.remove('is-playing');
                return false;
            }
            
            // If this is a replay, update the replay count display
            if (messageId && state.messagePlaybacks[messageId] > 0) {
                const countDisplay = latestAiMessage.querySelector('.replay-count');
                if (countDisplay) {
                    countDisplay.textContent = state.messagePlaybacks[messageId];
                    countDisplay.classList.add('visible');
                }
                
                // Show indicator if count reaches threshold
                if (state.messagePlaybacks[messageId] >= 3) {
                    // Show the Show Text button when count reaches threshold
                    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                    if (messageElement) {
                        const showTextBtn = messageElement.querySelector('.show-text-button');
                        if (showTextBtn) {
                            showTextBtn.style.display = 'flex';
                        }
                    }
                }
            }
            
            // Audio playback is now handled by the event listeners set up in initChat
            // or by the Web Speech API callbacks
            return true;
        }
        
        return false;
    } catch (error) {
        console.error("Error playing text as audio:", error);
        state.audioPlaying = false;
        document.querySelectorAll('.message-content.is-playing').forEach(el => {
            el.classList.remove('is-playing');
        });
        return false;
    }
}

// Display message in UI - Modified to support hidden text with show button and replay functionality
/**
 * Prepares text for speech synthesis, removing markdown formatting and HTML tags
 * to ensure proper pronunciation
 * @param {string} text - The original text that may contain markdown
 * @returns {string} - Plain text suitable for speech synthesis
 */
function prepareTextForSpeech(text) {
    if (!text) return '';
    
    // Remove markdown formatting
    let plainText = text
        // Remove code blocks (```code```) - keep the content
        .replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1') // Handles language-specific blocks
        .replace(/```([\s\S]*?)```/g, '$1') // Handles generic blocks
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove bold
        .replace(/\*\*(.*?)\*\*/g, '$1')
        // Remove italic
        .replace(/\*(.*?)\*/g, '$1')
        // Remove headings
        .replace(/^#+\s+(.*$)/gm, '$1')
        // Remove list markers
        .replace(/^\s*[-*]\s+(.*$)/gm, '$1')
        // Remove numbered lists
        .replace(/^\s*\d+\.\s+(.*$)/gm, '$1')
        // Remove links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Process tables - replace pipe characters with spaces to preserve text
        .replace(/\|/g, ' ')
        // Remove horizontal rules
        .replace(/^-{3,}$/gm, '')
        // Remove blockquotes
        .replace(/^>\s+(.*$)/gm, '$1');
        
    // Remove any HTML tags that might have been introduced
    plainText = plainText.replace(/<[^>]*>/g, '');
    
    // Normalize whitespace (especially after table pipe replacement)
    plainText = plainText.replace(/\s+/g, ' ').trim();
    
    return plainText;
}

function appendMessage(text, sender, type = 'normal', noAudio = false) {
    if (!text || !elements.chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender} ${type}`;
    
    // Generate a unique ID for this message for tracking playbacks
    const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    messageDiv.dataset.messageId = messageId;
    
    // Initialize playback count for this message
    state.messagePlaybacks[messageId] = 0;
    
    // Store both the original text and the speech-prepared version
    messageDiv.dataset.originalText = text;
    
    // Prepare plain text version for speech synthesis to avoid pronunciation issues with markdown
    const speechText = prepareTextForSpeech(text);
    messageDiv.dataset.speakText = speechText;
    
    // Log the difference if there is one (for debugging)
    if (speechText !== text) {
        console.log(`Text preparation for message ${messageId}:`);
        console.log(`Display: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`);
        console.log(`Speech: ${speechText.substring(0, 50)}${speechText.length > 50 ? "..." : ""}`);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if ((sender === 'ai' || sender === 'system') && type !== 'recommend') {
        // For AI messages, add the ability to show/hide text
        if (sender === 'ai') {
            // Initially hide text
            contentDiv.classList.add('text-hidden');
            
            // Create text container
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = markdownToHtml(text);
            contentDiv.appendChild(textDiv);
            
            // Add the content div to message div first
            messageDiv.appendChild(contentDiv);

            // Create message controls container outside the bubble
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'message-controls';

            // Create replay button
            const replayButton = document.createElement('button');
            replayButton.className = 'replay-button';
            replayButton.title = 'Replay audio';
            replayButton.innerHTML = `
                <img src="../assets/replay-simple.svg" alt="Replay" />
                <span class="replay-count"></span>
            `;
            
            // Add replay button click handler
            replayButton.addEventListener('click', function() {
                // Check if audio is still playing but was started more than 10 seconds ago (stuck state)
                if (state.audioPlaying && state.audioPlayingTimestamp) {
                    const audioPlayingDuration = Date.now() - state.audioPlayingTimestamp;
                    console.log(`[ReplayButton] Audio has been 'playing' for ${audioPlayingDuration/1000} seconds`);
                    
                    if (audioPlayingDuration > 10000) { // 10 seconds
                        console.warn("[ReplayButton] Audio playing state appears stuck, forcing reset");
                        state.audioPlaying = false;
                        state.audioPlayingTimestamp = null;
                        
                        // Also reset any audio element that might be stuck
                        if (elements.aiAudioElement) {
                            elements.aiAudioElement.pause();
                            elements.aiAudioElement.currentTime = 0;
                        }
                        
                        // Reset any visual indicators
                        document.querySelectorAll('.message-content.is-playing').forEach(el => {
                            el.classList.remove('is-playing');
                        });
                    }
                }
                
                if (!state.audioPlaying) {
                    console.log(`[ReplayButton] Replay clicked for message ${messageId}, API type: ${state.apiType}`);
                    
                    // General reset: always ensure speech synthesis is cleared
                    if (window.speechSynthesis) {
                        console.log("[ReplayButton] Cancelling any active speech synthesis");
                        speechSynthesis.cancel();
                    }
                
                    // Increment playback count
                    state.messagePlaybacks[messageId]++;
                    
                    // Update replay count display
                    const countSpan = replayButton.querySelector('.replay-count');
                    if (countSpan) {
                        countSpan.textContent = state.messagePlaybacks[messageId];
                        countSpan.classList.add('visible');
                    } else {
                        console.warn("[ReplayButton] Could not find replay count span");
                    }
                    
                    // Get the text to speak - from dataset attribute
                    const speakText = messageDiv.dataset.speakText;
                    if (!speakText) {
                        console.error("[ReplayButton] No speech text found in message dataset");
                        return;
                    }
                    
                    console.log(`[ReplayButton] Replaying message with text: ${speakText.substring(0, 50)}${speakText.length > 50 ? "..." : ""}`);
                    
                    // Special handling for domestic API - force browser TTS directly
                    if (state.apiType === 'domestic') {
                        console.log("[ReplayButton] Using direct browser TTS for domestic model replay");
                        // Force the .is-playing class on the message
                        document.querySelectorAll('.message-content').forEach(el => {
                            el.classList.remove('is-playing');
                        });
                        contentDiv.classList.add('is-playing');
                        
                        // Skip getAudioForText and use generateSpeechWithBrowser directly
                        generateSpeechWithBrowser(speakText)
                            .then(success => {
                                console.log(`[ReplayButton] Direct browser TTS result: ${success ? 'success' : 'failed'}`);
                                if (!success) {
                                    contentDiv.classList.remove('is-playing');
                                }
                            })
                            .catch(err => {
                                console.error("[ReplayButton] Error with direct browser TTS:", err);
                                contentDiv.classList.remove('is-playing');
                            })
                            .finally(() => {
                                // Ensure visible state is consistent
                                if (state.messagePlaybacks[messageId] >= 3) {
                                    // Show the Show Text button when count reaches threshold
                                    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
                                    if (messageElement) {
                                        const showTextBtn = messageElement.querySelector('.show-text-button');
                                        if (showTextBtn) {
                                            showTextBtn.style.display = 'flex';
                                        }
                                    }
                                }
                            });
                    } else {
                        // Normal flow for Gemini (using worker-based TTS)
                        playTextAsAudio(speakText, messageId).then(success => {
                            console.log(`[ReplayButton] Worker-based TTS result: ${success ? 'success' : 'failed'}`);
                        });
                    }
                    
                    // Show indicator when count reaches threshold (regardless of API type)
                    if (state.messagePlaybacks[messageId] >= 3) {
                        // Show the button when count reaches threshold
                        const showButton = controlsDiv.querySelector('.show-text-button');
                        if (showButton) {
                            showButton.style.display = 'flex';
                        }
                    }
                } else {
                    console.log("[ReplayButton] Audio already playing, ignoring replay request");
                    // Show how long it's been playing to help diagnose issues
                    if (state.audioPlayingTimestamp) {
                        console.log(`[ReplayButton] Audio has been playing for ${(Date.now() - state.audioPlayingTimestamp)/1000} seconds`);
                    }
                }
            });
            
            // Create show text button
            const showButton = document.createElement('button');
            showButton.className = 'show-text-button';
            // Button is hidden by default via CSS
            showButton.innerHTML = `
                <img src="../assets/show-text-simple.svg" alt="Show Text" />
                Show text
            `;
            
            // Add click handler to show text (one-way toggle - once shown, stays visible)
            showButton.addEventListener('click', function() {
                // Only proceed if replay count is at least 3
                const textElement = contentDiv.querySelector('.message-text');
                textElement.classList.add('revealed');
                contentDiv.classList.remove('text-hidden');
                contentDiv.classList.add('text-revealed');
                showButton.style.display = 'none'; // Hide the button after revealing
            });
            
            // Add buttons to controls
            controlsDiv.appendChild(replayButton);
            controlsDiv.appendChild(showButton);
            messageDiv.appendChild(controlsDiv);
            
            // Play audio for AI messages (unless noAudio is true)
            if (!noAudio) {
                // Get the speech text - plain text without markdown for better pronunciation
                const speakText = messageDiv.dataset.speakText;
                
                // Log the difference between display and speech text to help with debugging
                if (speakText !== text) {
                    console.log("Using plain text for TTS that differs from displayed text");
                    console.log("Display:", text.substring(0, 60) + (text.length > 60 ? "..." : ""));
                    console.log("Speech:", speakText.substring(0, 60) + (speakText.length > 60 ? "..." : ""));
                }
                
                setTimeout(() => {
                    // Make sure we use the speech text for TTS
                    // Always pass the prepared speech text, not the original text
                    playTextAsAudio(speakText, messageId).then(success => {
                        if (success) {
                            contentDiv.classList.add('is-playing');
                            
                            // Increment initial playback count
                            state.messagePlaybacks[messageId]++;
                        }
                    });
                }, 100);
            } else {
                // When noAudio is true, immediately reveal the text
                contentDiv.classList.remove('text-hidden');
                contentDiv.classList.add('text-revealed');
                const textElement = contentDiv.querySelector('.message-text');
                if (textElement) textElement.classList.add('revealed');
                showButton.style.display = 'none';
            }
            
        } else {
            // For system messages, just show the text
        contentDiv.innerHTML = markdownToHtml(text);
            messageDiv.appendChild(contentDiv);
        }
    } else {
        // For user messages, just show the text
        contentDiv.textContent = text;
        messageDiv.appendChild(contentDiv);
    }
    
    elements.chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Disable input controls
function disableInput() {
    if (elements.messageInput) {
        elements.messageInput.disabled = true;
    }
    
    if (elements.sendButton) {
        elements.sendButton.disabled = true;
    }
    
    if (elements.statusIndicator) {
        elements.statusIndicator.textContent = '思考ing...';
        elements.statusIndicator.style.display = 'block';
    }
}

// Enable input controls
function enableInput() {
    if (elements.messageInput) {
        elements.messageInput.disabled = false;
        elements.messageInput.focus();
    }
    
    if (elements.sendButton) {
        elements.sendButton.disabled = false;
    }
    
    if (elements.statusIndicator) {
        elements.statusIndicator.style.display = 'none';
    }
}

// --- Add Modal Functions ---
function displaySaveModal() {
    // Use utility function
    return showSaveModal(elements, state, 
        // Save callback
        async () => {
            await saveChatSession(); 
            performCleanupAndExit();
        },
        // Don't save callback
        () => {
            console.log("Don't Save button clicked");
            appendMessage("Session not saved.", "system", "info");
            performCleanupAndExit(); 
        }
    );
}

function dismissSaveModal() {
    // Use utility function
    return hideSaveModal(elements);
}
// --- End Modal Functions ---

// navigate to home page - always show modal
function navigateToHome() {
    console.log("Return button clicked (chat.js)");

    // Check turn count
    if (state.userTurnCount <= 0) {
        // No interaction, just leave directly
        performCleanupAndExit(); 
    } else {
        // Any session with user interaction, show the modal
        console.log(`Showing save modal for ${state.userTurnCount} turns.`);
        displaySaveModal();
        // Exit logic is now handled by the modal button events
    }
}

// --- Add Cleanup and Exit Function --- 
function performCleanupAndExit() {
    console.log("Performing cleanup and exiting chat...");
    dismissSaveModal(); // Ensure modal is hidden
    
    // Save chat history to localStorage before exiting
    // This ensures context is preserved even if user doesn't explicitly save the session
    saveHistoryToLocalStorage();
    
    // Stop any ongoing audio playback
    if (elements.aiAudioElement) {
        try {
            elements.aiAudioElement.pause();
            elements.aiAudioElement.currentTime = 0;
            console.log("Audio playback stopped");
        } catch (e) {
            console.error("Error stopping audio playback:", e);
        }
    }
    
    // Cancel any browser speech synthesis
    if (window.speechSynthesis) {
        try {
            speechSynthesis.cancel();
            console.log("Browser speech synthesis canceled");
        } catch (e) {
            console.error("Error canceling speech synthesis:", e);
        }
    }
    
    // Disconnect Gemini voice agent if it exists
    if (state.geminiVoiceAgent) {
        try {
            state.geminiVoiceAgent.disconnect();
            console.log("Disconnected Gemini voice agent");
        } catch (e) {
            console.error("Error disconnecting voice agent:", e);
        }
        state.geminiVoiceAgent = null;
    }
    
    // Reset state flags before leaving
    state.isConnected = false;
    state.audioPlaying = false;
    
    console.log("Cleanup complete, navigating to index.html");
    window.location.href = '../index.html';
}
// --- End Cleanup Function ---

// clear chat history
function clearChatHistory() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages && confirm('确定要清除所有消息吗？')) {
        chatMessages.innerHTML = '';
        state.chatHistory = [];
        appendMessage("聊天记录已清除。让我们开始新的对话！", "system");
    }
}

// Setup event listeners (Make sure modal elements are selected here or in DOMContentLoaded)
function setupEventListeners() {
    // Re-select modal elements just in case
    elements.saveModalBackdrop = document.getElementById('save-modal-backdrop');
    elements.saveModal = document.getElementById('save-modal');
    elements.modalTurnCount = document.getElementById('modal-turn-count');
    elements.modalSaveBtn = document.getElementById('modal-save-btn');
    elements.modalDontSaveBtn = document.getElementById('modal-dont-save-btn');

    // Add modal button listeners here if not added in initChat
    if (elements.modalSaveBtn && !elements.modalSaveBtn.dataset.listenerAttached) {
        elements.modalSaveBtn.addEventListener('click', async () => {
            console.log("Save button clicked");
            await saveChatSession(); 
            performCleanupAndExit();
        });
        elements.modalSaveBtn.dataset.listenerAttached = true;
    }
    if (elements.modalDontSaveBtn && !elements.modalDontSaveBtn.dataset.listenerAttached) {
        elements.modalDontSaveBtn.addEventListener('click', () => {
            console.log("Don't Save button clicked");
            appendMessage("Session not saved.", "system", "info");
            performCleanupAndExit(); 
        });
         elements.modalDontSaveBtn.dataset.listenerAttached = true;
    }
    // Optional: Close modal on backdrop click
    if (elements.saveModalBackdrop && !elements.saveModalBackdrop.dataset.listenerAttached) {
         elements.saveModalBackdrop.addEventListener('click', (event) => {
             if (event.target === elements.saveModalBackdrop) {
                 dismissSaveModal();
                 // performCleanupAndExit(); // Optional: exit on backdrop click
             }
         });
         elements.saveModalBackdrop.dataset.listenerAttached = true;
    }

    //existing listeners for return, clear, send, input
    const returnBtn = document.querySelector('#chat-return-btn');
    if (returnBtn) {
        returnBtn.addEventListener('click', navigateToHome);
    } else {
        console.warn('Return button not found in the DOM');
}

    // event listener for clear history button, clear chat history
    const clearBtn = document.querySelector('#clear-history-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearChatHistory);
    } else {
        console.warn('Clear history button not found in the DOM');
    }
    
    // event listener for send button, send message when clicked
    const sendBtn = document.querySelector('#send-button');
    if (sendBtn) {
        sendBtn.addEventListener('click', function() {
            const messageInput = document.querySelector('#message-input');
            if (messageInput && messageInput.value.trim()) {
                sendMessage(messageInput.value.trim());
            }
        });
    } else {
        console.warn('Send button not found in the DOM');
    }
    
    // event listener for message input, send message when enter key is pressed
    const messageInput = document.querySelector('#message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter' && !event.shiftKey && messageInput.value.trim()) {
                event.preventDefault();
                sendMessage(messageInput.value.trim());
            }
        });
    } else {
        console.warn('Message input not found in the DOM');
    }
}

// Main initialization logic on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Chat page DOM loaded. Initializing chat...');
    
    // Setup button clicks, input handling, etc.
    setupEventListeners(); // This function now also sets up modal listeners
    
    // Display initial welcome message
    appendMessage("欢迎！在下方输入消息开始练习英语。", "system");

    try {
        // Check current selected model
        const settings = settingsService.getSettings();
        console.log(`Using API type: ${settings.useDomesticAPI ? 'Domestic' : 'Gemini'}`);

    // Attempt to initialize chat (load settings, test API connection)
        const initSuccess = await initChat();

        if (initSuccess) {
            console.log(`Chat initialization complete. Connected to ${state.apiType} API: ${state.isConnected}`);
    
    if (state.isConnected) {
        const modelType = state.apiType === 'domestic' 
            ? state.settings.domesticModelType 
            : state.settings.modelType;
                appendMessage(`已连接到${state.apiType === 'domestic' ? '国内' : 'Gemini'} API,使用模型: ${modelType}`, "system", "info");
            }
        } else {
            // Initialization failed, try fallback to other API type
            console.warn("Chat initialization failed. Attempting to fallback to other API type.");
            appendMessage("当前模型连接失败。尝试备用方案...", "system", "warning");
            
            // Try switching API type
            settingsService.updateSetting('useDomesticAPI', !settings.useDomesticAPI);
            const retrySuccess = await initChat();
            
            if (retrySuccess && state.isConnected) {
                const modelType = state.apiType === 'domestic' 
                    ? state.settings.domesticModelType 
                    : state.settings.modelType;
                appendMessage(`已通过备用${state.apiType === 'domestic' ? '国内' : 'Gemini'} API连接,使用模型: ${modelType}`, "system", "info");
                appendMessage("您选择的模型可能不适用于当前设置。", "system", "warning");
            } else {
                appendMessage(`无法连接到任何API。请检查您返回主页面,在右上角的设置种配置的API密钥并保存。`, "system", "error");
            }
        }
    } catch (error) {
        console.error("Error during chat initialization:", error);
        appendMessage(`聊天初始化错误: ${error.message}`, "system", "error");
    }
});
        
// --- Add save session function --- 
async function saveChatSession() {
    if (!state.startTime) {
        console.warn("Cannot save session, start time not recorded.");
        return;
    }
    if (state.chatHistory.length === 0) {
        console.warn("Cannot save empty chat session.");
        return;
    }

    try {
        // Generate feedback before saving
        appendMessage("正在分析您的英语技能和对话...", "system", "info");
        
        // Disable UI while generating feedback
        disableInput();
        
        // First, generate the feedback and topic summary using the imported function
        const result = await generateLanguageFeedback(state.chatHistory, callAPI, state.isConnected);
        
        if (!result) {
            appendMessage("无法分析您的对话。仅保存基本记录。", "system", "warning");
            enableInput();
            return;
        }
        
        const { topicSummary, feedback } = result;
        
        // Use the topic summary as the record summary
        const summary = topicSummary || state.chatHistory.slice(0, 3).map(m => `${m.role}: ${m.text.substring(0, 50)}...`).join(' \n');

        // Create record using utility function with feedback
        const record = createSessionRecord(
            state, 
            'text', 
            null, // No longer pass transcript
            summary,
            feedback // Add feedback to the record
        );

        // Save to record.js
        const saved = addRecord(record);
        
        // Also save to localStorage for context persistence
        saveHistoryToLocalStorage();
        
        if (saved) {
            console.log("Chat session saved successfully with feedback.");
            appendMessage("会话已保存，包含主题总结和语言反馈。", "system", "info");
            
            // Display topic summary to the user
            if (topicSummary) {
                appendMessage("总结:", "system", "info");
                appendMessage(topicSummary, "ai", "normal", true);  // Set noAudio to true
            }
            
            // Display feedback to the user
            if (feedback) {
                appendMessage("语言反馈:", "system", "info");
                appendMessage(feedback, "ai", "normal", true);  // Set noAudio to true
            }
        } else {
            console.error("Failed to save chat session via record.js");
            appendMessage("保存会话失败。", "system", "error");
        }
        
        // Re-enable input
        enableInput();
    } catch (error) {
        console.error("Error saving chat session:", error);
        appendMessage(`保存会话错误: ${error.message}`, "system", "error");
        enableInput();
    }
}
// --- End save session function ---

// Initialize chat system
async function initChat() {
    try {
        // Load settings directly from service
        state.settings = settingsService.getSettings();
        
        // Initialize Shared AudioContext if it doesn't exist or is closed
        if (!state.sharedAudioContext || state.sharedAudioContext.state === 'closed') {
            try {
                state.sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22000 });
                // console.log(`[Chat.js - initChat] Initialized shared AudioContext. Sample rate: ${state.sharedAudioContext.sampleRate}`); // Can be commented out
            } catch (e) {
                console.error("[Chat.js - initChat] Failed to create shared AudioContext:", e);
                // Fallback or error display might be needed here
                appendMessage("无法初始化音频播放组件。", "system", "error");
                state.isAudioEnabled = false; // Disable audio if context fails
            }
        }
        
        // Determine API type based on settings
        state.apiType = state.settings.useDomesticAPI ? 'domestic' : 'gemini';
        
        state.startTime = new Date();
        state.userTurnCount = 0;
        
        // Initialize empty chat history
        state.chatHistory = [];
        
        // Always start with a fresh chat (no history loading)
        // Check if required settings are configured
        const apiKey = state.apiType === 'domestic' ? 
                       state.settings.domesticApiKey : 
                       state.settings.apiKey;
        
        if (!apiKey) {
            console.warn(`API密钥未配置(${state.apiType === 'domestic' ? '国内' : 'Gemini'} API)。请前往设置...`);
            appendMessage(`API密钥未配置()${state.apiType === 'domestic' ? '国内' : 'Gemini'} API)。请返回主页面，点击右上角的设置图标进行配置并保存。`, "system");
            state.isConnected = false;
            enableInput();
            return false;
        }
        
        // For domestic API, we'll use the Web Speech API, so we preload voices
        if (state.apiType === 'domestic' && state.isAudioEnabled) {
            try {
                console.log("Preloading Web Speech API voices for domestic API TTS");
                // 直接使用浏览器语音合成
                preloadBrowserVoices();
            } catch (error) {
                console.error("Error preloading voices:", error);
                // 继续执行，稍后会再尝试
            }
        }

        // *** DISABLE GEMINI LIVE AGENT FOR TTS ***
        // Always use the HTTP proxy for TTS instead of WebSocket/Live connection
        // This ensures consistent voice rendering through your proxy server
        console.log("[Chat.js - initChat] Using HTTP proxy for TTS, bypassing WebSocket Live API");
        state.geminiVoiceAgent = null;
        
        // Force using browser TTS fallback (which will be directed to your proxy)
        if (state.apiType === 'gemini') {
            console.log("[Chat.js - initChat] Initializing TTS for Gemini via HTTP proxy");
            preloadBrowserVoices(); // Load browser voices as fallback anyway
        }
        
        // Set up event handlers for audio element (only needed for browser TTS)
        elements.aiAudioElement.addEventListener('play', () => {
            console.log("AI audio playback started");
            state.audioPlaying = true;
            state.audioPlayingTimestamp = Date.now();
        });
        
        elements.aiAudioElement.addEventListener('ended', () => {
            console.log("AI audio playback ended");
            state.audioPlaying = false;
            state.audioPlayingTimestamp = null;
            document.querySelectorAll('.message-content.is-playing').forEach(el => {
                el.classList.remove('is-playing');
            });
        });
        
        elements.aiAudioElement.addEventListener('pause', () => {
            console.log("AI audio playback paused");
            // Only set audioPlaying to false if we've actually reached the end
            // This prevents issues where a pause for buffering would stop replay
            if (elements.aiAudioElement.currentTime >= elements.aiAudioElement.duration - 0.5) {
                state.audioPlaying = false;
                state.audioPlayingTimestamp = null;
                document.querySelectorAll('.message-content.is-playing').forEach(el => {
                    el.classList.remove('is-playing');
                });
            } else {
                console.log(`Audio paused at ${elements.aiAudioElement.currentTime}s of ${elements.aiAudioElement.duration}s - likely buffering`);
            }
        });
        
        elements.aiAudioElement.addEventListener('error', (e) => {
            console.error("Audio playback error:", e);
            console.error("Audio error details:", 
                elements.aiAudioElement.error ? 
                `code=${elements.aiAudioElement.error.code}, message=${elements.aiAudioElement.error.message}` : 
                "No error details"
            );
            state.audioPlaying = false;
            state.audioPlayingTimestamp = null;
            document.querySelectorAll('.message-content.is-playing').forEach(el => {
                el.classList.remove('is-playing');
            });
            // 标记 worker 语音失败，使用浏览器语音合成
            state.workerAudioFailed = true;
        });
        
        // Test connection to API
        try {
            console.log(`Testing connection to ${state.apiType} API...`);
            const testResult = await testAPIConnection();
            console.log(`${state.apiType} API test result:`, testResult);
            
            if (testResult.success) {
                console.log(`Successfully connected to ${state.apiType} API`);
                state.isConnected = true;
            } else {
                console.warn(`Failed to connect to ${state.apiType} API...`, testResult.error);
                appendMessage(`无法连接到AI助手: ${testResult.error}。请检查您在主页面右上角设置中的API配置是否正确，使用模拟模式继续。`, "system");
                state.isConnected = false;
            }
        } catch (error) {
            console.warn(`Failed to initialize ${state.apiType} API...`, error);
            appendMessage(`连接AI助手时出错: ${error.message}。请检查您在主页面右上角设置中的API配置是否正确，使用模拟模式继续。`, "system");
            state.isConnected = false;
        }
        
        // Enable input controls
        enableInput();
        
        // Add after initializing state values
        if (!state.workerAudioFailed) {
            state.workerAudioFailed = false; // Tracks if Worker TTS has failed and we should use browser TTS
        }
        
        return state.isConnected; // Return true only if connection succeeded
    } catch (error) {
        console.error('Chat system initialization failed:', error);
        appendMessage(`聊天系统初始化失败: ${error.message}。请检查您在主页面右上角设置中的API配置是否正确，使用模拟模式继续。`, "system");
        enableInput();
        return false;
    }
}

// API Interaction Functions

// Direct function to call API (updated to support both APIs)
async function callAPI(message, isTest = false) {
    return state.apiType === 'domestic' ? 
        callDomesticAPI(message, isTest) : 
        callGeminiAPI(message, isTest);
}

// Test API connection
async function testAPIConnection() {
    try {
        console.log(`Testing ${state.apiType} API connection...`);
        // Use a simple test message that should work with any API
        const testMessage = "Hello";
        console.log(`Sending test message: "${testMessage}"`);
        
        const startTime = Date.now();
        const response = await callAPI(testMessage, true);
        const duration = Date.now() - startTime;
        
        console.log(`${state.apiType} API test successful. Duration: ${duration}ms`);
        console.log(`Test response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
        
        return { 
            success: true, 
            response,
            duration,
            apiType: state.apiType
        };
    } catch (error) {
        console.error(`${state.apiType} connection test failed:`, error);
        return { 
            success: false, 
            error: error.message || String(error),
            apiType: state.apiType
        };
    }
}

// Call Domestic API
async function callDomesticAPI(message, isTest = false) {
    // Get settings directly from state instead of re-fetching
    const settings = state.settings; 
    
    // Check if proxy URL is configured
    const proxyUrl = settings.chatApiProxyUrl;
    let useProxy = false;
    let apiEndpoint;
    
    if (proxyUrl && proxyUrl.trim() !== '') {
        // Use the same proxy for domestic API calls
        useProxy = true;
        apiEndpoint = `${proxyUrl.trim()}/proxy/ecnu`; // Match the worker.js path structure
        console.info(`Chat.js: Using configured proxy for domestic API: ${apiEndpoint}`);
    } else {
        // Direct API call (which will likely fail due to CORS unless the server allows it)
        apiEndpoint = settings.domesticApiEndpoint?.trim();
        // Add the appropriate path for chat completions if not already present
        if (!apiEndpoint) {
            console.error('Chat.js: Domestic API endpoint not configured.');
            throw new Error('Domestic API endpoint is required in settings');
        }
        if (!apiEndpoint.endsWith('/chat/completions')) {
            apiEndpoint = apiEndpoint.replace(/\/?$/, '/chat/completions');
        }
        console.warn('Chat.js: No proxy configured for domestic API, direct call may fail due to CORS.');
    }
    
    const apiKey = settings.domesticApiKey;
    const modelType = settings.domesticModelType || 'ecnu-max';
    
    console.debug('callDomesticAPI - Configuration:', { 
        apiEndpoint, 
        useProxy,
        modelType, 
        apiKeyProvided: !!apiKey,
    });
    
    if (!apiKey) {
        console.error('Chat.js: Domestic API key not found in settings.');
        throw new Error('Domestic API key is required in settings');
    }
    
    console.info(`Chat.js: Using domestic endpoint: ${apiEndpoint} with model: ${modelType}`);
    
    // Prepare message history
    let messages = [];
    
    // Add system instruction as the first message if provided
    const systemInstructionsText = settings.systemInstructions?.trim();
    if (systemInstructionsText) {
        messages.push({
            role: 'system',
            content: systemInstructionsText
        });
    }
    
    // Add chat history
    if (!isTest && state.chatHistory.length > 0) {
        // Use up to the last 10 messages from history
        const recentHistory = state.chatHistory.slice(-10);
        const historyMessages = recentHistory.map(item => ({
            role: item.role === 'ai' ? 'assistant' : 'user',
            content: item.text
        }));
        
        // Append to messages array
        messages = [...messages, ...historyMessages];
    }
    
    // Add the current message
    messages.push({
        role: 'user',
        content: message
    });
    
    // Build request body according to domestic API format
    const requestBody = {
        model: modelType,
        messages: messages,
        temperature: settings.temperature || 1.8,
        max_tokens: settings.maxTokens || 256,
        top_p: settings.topP || 0.95,
        stream: false
    };
    
    console.log('Calling Domestic API with model:', modelType);
    console.debug('Domestic API request details:', { 
        endpoint: apiEndpoint, 
        body: JSON.stringify(requestBody, null, 2),
        messageCount: messages.length
    });
    
    // Prepare fetch options based on whether we're using a proxy
    const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    };
    
    // Only add the Authorization header for direct API calls
    // When using the proxy, the API key is sent in the request body
    if (!useProxy) {
        fetchOptions.headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
        // For proxy requests, include the API key in the body
        requestBody.apiKey = apiKey;
    }
    
    fetchOptions.body = JSON.stringify(requestBody);
    
    try {
        console.log(`Sending request to ${useProxy ? 'domestic API via proxy' : 'domestic API directly'}...`);
        const response = await fetch(apiEndpoint, fetchOptions);
        console.log('Received response, status:', response.status);
        
        if (!response.ok) {
            let errorData = { error: { message: `Request failed with status ${response.status}` } };
            try {
                const errorJson = await response.json();
                console.error('API Error Response JSON:', errorJson);
                errorData = errorJson || errorData;
            } catch (e) {
                console.error('Failed to parse error response JSON:', e);
                errorData.error = { message: response.statusText || errorData.error.message };
            }
            throw new Error(`Domestic API request failed (${response.status}): ${errorData.error?.message || 'Unknown API error'}`);
        }
        
        console.log('Parsing response JSON...');
        const data = await response.json();
        console.debug('Domestic API response:', JSON.stringify(data, null, 2));
        
        // Handle domestic API response format
        const responseText = data?.choices?.[0]?.message?.content;
        console.log('Extracted response text, valid string?', typeof responseText === 'string');
        
        if (typeof responseText !== 'string') {
            console.error('Unexpected Domestic API response format:', data);
            throw new Error('Domestic API response format invalid or empty.');
        }
        
        return responseText;
    } catch (error) {
        console.error('Error calling Domestic API:', error);
        throw error;
    }
}

// call Gemini API - Simplified to use settings directly
async function callGeminiAPI(message, isTest = false) {
    // Get settings directly from state instead of re-fetching
    const settings = state.settings;
    const proxyUrl = settings.chatApiProxyUrl;
    const modelType = settings.modelType || 'gemini-2.0-flash-exp';
    
    // Use proxy if configured, otherwise use direct API call
    let apiEndpoint;
    let useProxy = false;
    if (proxyUrl && proxyUrl.trim() !== '') {
        // Use the /proxy/gemini path that matches the worker.js implementation
        apiEndpoint = `${proxyUrl.trim()}/proxy/gemini`;
        useProxy = true;
        console.info(`Chat.js: Using configured proxy endpoint: ${apiEndpoint}`);
    } else {
        const apiKey = settings.apiKey;
        if (!apiKey) {
            console.error('Chat.js: API key not found in settings and no proxy configured.');
            throw new Error('API key is required in settings (or configure a Chat API Proxy URL)');
        }
        apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelType}:generateContent?key=${apiKey}`;
        console.info(`Chat.js: Using direct Google API endpoint: ${apiEndpoint.split('?')[0]}?key=...`);
    }

    let contents = [];
    if (!isTest && state.chatHistory.length > 0) {
        const recentHistory = state.chatHistory.slice(-10);
        contents = recentHistory.map(item => ({
            role: item.role === 'ai' ? 'model' : 'user',
            parts: [{ text: item.text }]
        }));
    }
    contents.push({
        role: 'user',
        parts: [{ text: message }]
    });
    
    const generationConfig = {
        temperature: settings.temperature || 1.8,
        maxOutputTokens: settings.maxTokens || 256,
        topP: settings.topP || 0.95,
        topK: settings.topK || 64
    };
    
    const systemInstructionsText = settings.systemInstructions?.trim();
    const systemInstructionObject = systemInstructionsText
        ? { parts: [{ text: systemInstructionsText }] }
        : undefined;

    const requestBody = {
        contents: contents,
        generationConfig: generationConfig,
        ...(systemInstructionObject && { systemInstruction: systemInstructionObject })
    };
    
    console.log(`Calling Gemini API (${useProxy ? 'via Proxy' : 'Direct'})`);
    
    const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    };
    
    // Note: No API key header or query param needed when sending to the proxy

    const response = await fetch(apiEndpoint, fetchOptions);
    
    if (!response.ok) {
        let errorData = { error: { message: `Request failed with status ${response.status}` } };
        try {
            const errorJson = await response.json();
            console.error('API Error Response JSON:', errorJson);
            errorData = errorJson || errorData;
        } catch (e) {
            console.error('Failed to parse error response JSON:', e);
            errorData.error.message = response.statusText || errorData.error.message;
        }
        throw new Error(`API request failed (${response.status}): ${errorData.error?.message || 'Unknown API error'}`);
    }
    
    const data = await response.json();
    
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof responseText !== 'string') {
        console.error('Unexpected API response format:', data);
        const finishReason = data?.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
             throw new Error(`AI generation stopped unexpectedly. Reason: ${finishReason}`);
        }
        if (finishReason === 'STOP' && !responseText) return ""; // Allow empty response on STOP
        throw new Error('AI response format invalid or empty.');
    }
    
    return responseText;
}

// Send message to API or fallback
async function sendMessage(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    
    try {
        // disable input to prevent duplicate sending
        disableInput();
        
        // display user message
        appendMessage(trimmedText, 'user');
        
        // add to chat history
        state.chatHistory.push({
            role: 'user',
            text: trimmedText
        });
        state.userTurnCount++;
        console.log(`User turn count: ${state.userTurnCount}`);
        
        // clear input field
        elements.messageInput.value = '';
        
        if (state.isConnected) {
            try {
                // call API (the unified interface will automatically choose the correct API)
                const response = await callAPI(trimmedText);
                
                // display AI response
                appendMessage(response, 'ai');
                
                // add to chat history
                state.chatHistory.push({
                    role: 'ai',
                    text: response
                });
                
            } catch (error) {
                console.error(`${state.apiType} API error, using fallback:`, error);
                // if API call failed, use simulation response
                simulateAIResponse(trimmedText);
            }
        } else {
            // if not connected, use simulation response
            simulateAIResponse(trimmedText);
        }
        
        // enable input
        enableInput();
        
    } catch (error) {
        console.error('Failed to send message:', error);
        appendMessage("抱歉，发送消息时出错。请重试。", "system");
        enableInput();
    }
}

// --- Simple memory mechanism ---

// Save chat history to local storage for persistence
function saveHistoryToLocalStorage() {
    try {
        // Simply store the full raw chat history
        localStorage.setItem('chatHistory', JSON.stringify(state.chatHistory));
        localStorage.setItem('lastChatTime', Date.now());
        console.log(`Saved ${state.chatHistory.length} messages to local storage`);
        return true;
    } catch (error) {
        console.error('Failed to save chat history to local storage:', error);
        return false;
    }
}

// Load chat history from local storage (now disabled to always start a fresh chat)
function loadHistoryFromLocalStorage() {
    // Always return false to ensure a fresh chat on each page load
    console.log('Starting fresh chat - previous history ignored');
    return false;
}

// --- End memory management functions ---
