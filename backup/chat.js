import { settingsService } from '../settings/settings.js';    
import { addRecord, generateLanguageFeedback } from './record.js';
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

// Get audio from the API - Updated to support both Gemini TTS and browser TTS
async function getAudioForText(text) {
    // If audio is disabled, don't proceed
    if (!state.isAudioEnabled || !elements.aiAudioElement) {
        console.warn("Audio playback is disabled or audio element not found");
        return null;
    }
    
    try {
        // Make sure text is properly prepared for speech synthesis
        // This ensures consistent handling for both Gemini TTS and browser TTS
        const preparedText = prepareTextForSpeech(text);
        // Log the text that will be sent for TTS
        console.log(`[getAudioForText] Text for TTS: "${preparedText.substring(0, 70)}${preparedText.length > 70 ? "..." : ""}"`);
        
        // ALWAYS use browser TTS to ensure synchronization with final message text
        // and potentially use preferred browser voice synthesis.
        console.log("[getAudioForText] Forcing use of browser's Web Speech API for TTS.");
        return generateSpeechWithBrowser(preparedText);
    } catch (error) {
        console.error("[getAudioForText] Error requesting TTS:", error);
        return null;
    }
}

// Generate speech using browser's speech synthesis
function generateSpeechWithBrowser(text) {
    return new Promise((resolve, reject) => {
            if (!window.speechSynthesis) {
            console.warn("Browser speech synthesis not supported");
            reject(new Error("Browser speech synthesis not supported"));
            return;
        }
        
        try {
            // Log speech synthesis attempt
            console.log("Generating speech with browser for text:", text.substring(0, 50) + (text.length > 50 ? "..." : ""));
            
            // Cancel any previous speech
            speechSynthesis.cancel();
            
            // Some browsers need time to load voices, add a safety mechanism
            const getVoicesAndSpeak = () => {
                // Get available voices
            let voices = speechSynthesis.getVoices();
                
                // If no voices are available yet, try again after a short delay
            if (voices.length === 0) {
                    console.log("No voices available yet, waiting...");
                    setTimeout(getVoicesAndSpeak, 100);
                    return;
                }
                
                console.log(`Available voices: ${voices.length}`);
                
                // Prepare for chunking long text
                const maxChunkLength = 200; // Maximum characters per chunk
                const textChunks = [];
                
                // Split text into smaller chunks for better performance
                if (text.length > maxChunkLength) {
                    let startIndex = 0;
                    while (startIndex < text.length) {
                        // Try to split at natural boundaries like periods or commas
                        let endIndex = Math.min(startIndex + maxChunkLength, text.length);
                        
                        if (endIndex < text.length) {
                            // Look for a natural break point
                            const naturalBreaks = ['. ', '! ', '? ', '。', ',', ';', '\n\n', '\n'];
                            let bestBreakPoint = endIndex;
                            
                            // Search backwards from max position for a natural break
                            for (const separator of naturalBreaks) {
                                const breakPosition = text.lastIndexOf(separator, endIndex);
                                if (breakPosition > startIndex && breakPosition < endIndex) {
                                    bestBreakPoint = breakPosition + 1; // Include the punctuation
                                    break;
                                }
                            }
                            
                            endIndex = bestBreakPoint;
                        }
                        
                        textChunks.push(text.substring(startIndex, endIndex));
                        startIndex = endIndex;
                    }
                    
                    console.log(`Split text into ${textChunks.length} chunks for TTS`);
                    } else {
                    textChunks.push(text);
                }
                
                // Try to find an English female voice
                let selectedVoice = voices.find(voice => 
                    voice.lang.includes('en') && 
                    (voice.name.includes('Female') || voice.name.includes('female') || 
                     voice.name.includes('Samantha') || voice.name.includes('Google UK English Female')));
                
                // Fallback to any English voice if no female voice found
                if (!selectedVoice) {
                    selectedVoice = voices.find(voice => voice.lang.includes('en'));
                }
                
                // Final fallback to any voice
                if (!selectedVoice && voices.length > 0) {
                    selectedVoice = voices[0];
                }
                
                                    // Set up voice parameters
                    const baseUtterance = new SpeechSynthesisUtterance("");
                    if (selectedVoice) {
                        baseUtterance.voice = selectedVoice;
                        console.log(`Using browser voice: ${selectedVoice.name} (${selectedVoice.lang})`);
                    } else {
                        console.warn("No suitable voice found, using browser default");
                    }
                    
                    // Apply speech settings
                    baseUtterance.rate = state.settings.voiceSpeed || 1.2;
                    baseUtterance.pitch = 1.0;
                    baseUtterance.volume = 1.0;
                    
                    // Add debug info about the utterance being created
                    console.log(`Created utterance with settings: rate=${baseUtterance.rate}, pitch=${baseUtterance.pitch}, volume=${baseUtterance.volume}`);
                
                // Track speaking progress
                let currentChunk = 0;
                
                                    // Function to speak the next chunk
                    const speakNextChunk = () => {
                        if (currentChunk >= textChunks.length) {
                            console.log("Browser speech synthesis completed all chunks");
                            state.audioPlaying = false; // Reset flag when all chunks are done
                            resolve(true);
                            return;
                        }
                        
                        const chunk = textChunks[currentChunk];
                        const utterance = new SpeechSynthesisUtterance(chunk);
                        
                        // Copy properties from base utterance
                        utterance.voice = baseUtterance.voice;
                        utterance.rate = baseUtterance.rate;
                        utterance.pitch = baseUtterance.pitch;
                        utterance.volume = baseUtterance.volume;
                        
                        // Set language for domestic API (may help with voice selection)
                        if (state.apiType === 'domestic' && !utterance.lang) {
                            utterance.lang = 'en-US'; // Default to English if not set
                        }
                
                        utterance.onstart = () => {
                            console.log(`Started speaking chunk ${currentChunk + 1}/${textChunks.length}`);
                            state.audioPlaying = true; // Set flag when starting
                        };
                
                        utterance.onend = () => {
                            console.log(`Finished speaking chunk ${currentChunk + 1}/${textChunks.length}`);
                            // Don't reset audioPlaying here, wait for the last chunk
                            currentChunk++;
                            speakNextChunk();
                        };
                        
                        utterance.onerror = (event) => {
                            console.error(`Error speaking chunk ${currentChunk + 1}:`, event);
                            // Log detailed error info
                            console.error(`Speech synthesis error details: type=${event.error}, message=${event.message || 'No message'}`);
                            state.audioPlaying = false; // Reset flag on error
                            
                            // Try to recover by moving to next chunk (or finish if last chunk failed)
                            currentChunk++;
                            speakNextChunk(); 
                        };
                        
                        utterance.onpause = () => {
                            console.log(`Speech synthesis paused for chunk ${currentChunk + 1}`);
                        };
                        
                        utterance.onresume = () => {
                            console.log(`Speech synthesis resumed for chunk ${currentChunk + 1}`);
                        };
                        
                        console.log(`Speaking chunk ${currentChunk + 1}/${textChunks.length} (length: ${chunk.length})`);
                        
                        try {
                            speechSynthesis.speak(utterance);
                            
                            // Check that the utterance was added to the queue
                            if (speechSynthesis.pending || speechSynthesis.speaking) {
                                console.log("Speech synthesis is active");
                            } else {
                                console.warn("Speech synthesis may not have started correctly");
                                // Force a retry
                                setTimeout(() => {
                                    if (!speechSynthesis.speaking && !speechSynthesis.pending) {
                                        console.log("Retrying speech synthesis...");
                                        speechSynthesis.speak(utterance);
                                    }
                                }, 200);
                            }
                        } catch (err) {
                            console.error("Error calling speechSynthesis.speak:", err);
                            state.audioPlaying = false; // Reset flag on speak error
                            // Try to recover
                            currentChunk++;
                            speakNextChunk();
                        }
                    };
                
                // Start speaking the first chunk
                speakNextChunk();
            };
            
            // Check if voiceschanged event is needed (Chrome requires this)
            if (speechSynthesis.getVoices().length === 0) {
                console.log("No voices available yet, waiting for voiceschanged event");
                speechSynthesis.addEventListener('voiceschanged', getVoicesAndSpeak, { once: true });
                
                // Set a timeout as fallback in case voiceschanged never fires
                setTimeout(() => {
                    console.log("Timeout reached waiting for voices, trying anyway");
                    if (!window.speechSynthesis.speaking) {
                        getVoicesAndSpeak();
                    }
                }, 2000);
            } else {
                getVoicesAndSpeak();
            }
        } catch (error) {
            console.error("Error using browser speech synthesis:", error);
            reject(error);
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
        // Ensure text is always prepared for speech - this is a safeguard
        // in case the text wasn't already prepared by the caller
        const speechText = (typeof text === 'string' && text === text.trim()) 
            ? prepareTextForSpeech(text) 
            : text;
            
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
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, 'code block')
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
        // Remove tables
        .replace(/\|.*\|/g, 'table content')
        // Remove horizontal rules
        .replace(/^-{3,}$/gm, '')
        // Remove blockquotes
        .replace(/^>\s+(.*$)/gm, '$1');
        
    // Remove any HTML tags that might have been introduced
    plainText = plainText.replace(/<[^>]*>/g, '');
    
    // Normalize whitespace
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
                if (!state.audioPlaying) {
                    // Reset any previous errors from speech synthesis
                    if (window.speechSynthesis && state.apiType === 'domestic') {
                        // Only cancel browser speech if using domestic model
                        speechSynthesis.cancel();
                    }
                
                    // Log replay attempt with API type info
                    console.log(`[ReplayButton] Replay attempt for message ${messageId} using ${state.apiType} API`);
                    
                    // Increment playback count
                    state.messagePlaybacks[messageId]++;
                    
                    // Update replay count display
                    const countSpan = replayButton.querySelector('.replay-count');
                    countSpan.textContent = state.messagePlaybacks[messageId];
                    countSpan.classList.add('visible');
                    
                    // Play the audio again using the stored speak text, not the displayed HTML text
                    const speakText = messageDiv.dataset.speakText;
                    console.log("[ReplayButton] Replaying message with stored speech text:", speakText.substring(0, 50) + (speakText.length > 50 ? "..." : ""));
                    
                    playTextAsAudio(speakText, messageId).then(success => {
                        console.log(`[ReplayButton] Replay audio request result: ${success ? 'success' : 'failed'}`);
                        if (!success && state.apiType === 'domestic') {
                            // Show a warning if replay fails with domestic API
                            console.warn("[ReplayButton] Failed to replay with browser speech synthesis");
                        } else if (!success && state.apiType === 'gemini') {
                            // Show a warning if replay fails with Gemini API
                            console.warn("[ReplayButton] Failed to replay with Gemini TTS API");
                        }
                    });
                    
                    // Show indicator when count reaches threshold
                    if (state.messagePlaybacks[messageId] >= 3) {
                        // Show the button when count reaches threshold
                        showButton.style.display = 'flex';
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
        elements.statusIndicator.textContent = 'AI is thinking...';
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
    window.location.href = 'index.html';
}
// --- End Cleanup Function ---

// clear chat history
function clearChatHistory() {
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages && confirm('Are you sure you want to clear all messages?')) {
        chatMessages.innerHTML = '';
        state.chatHistory = [];
        appendMessage("Chat history cleared. Let's start a new conversation!", "system");
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
    appendMessage("Welcome! Type your message below to practice English.", "system");

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
                appendMessage(`Connected to ${state.apiType} API using model: ${modelType}`, "system", "info");
            }
        } else {
            // Initialization failed, try fallback to other API type
            console.warn("Chat initialization failed. Attempting to fallback to other API type.");
            appendMessage("Connection failed with current model. Trying fallback...", "system", "warning");
            
            // Try switching API type
            settingsService.updateSetting('useDomesticAPI', !settings.useDomesticAPI);
            const retrySuccess = await initChat();
            
            if (retrySuccess && state.isConnected) {
                const modelType = state.apiType === 'domestic' 
                    ? state.settings.domesticModelType 
                    : state.settings.modelType;
                appendMessage(`Connected using fallback to ${state.apiType} API with model: ${modelType}`, "system", "info");
                appendMessage("Your selected model might not be available with your current settings.", "system", "warning");
            } else {
                appendMessage(`Cannot connect to any API. Please check your API keys and settings.`, "system", "error");
            }
        }
    } catch (error) {
        console.error("Error during chat initialization:", error);
        appendMessage(`Error initializing chat: ${error.message}`, "system", "error");
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
        appendMessage("Analyzing your English skills and conversation...", "system", "info");
        
        // Disable UI while generating feedback
        disableInput();
        
        // First, generate the feedback and topic summary using the imported function
        const result = await generateLanguageFeedback(state.chatHistory, callAPI, state.isConnected);
        
        if (!result) {
            appendMessage("Could not analyze your conversation. Saving basic record only.", "system", "warning");
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
            appendMessage("Session saved with topic summary and language feedback.", "system", "info");
            
            // Display topic summary to the user
            if (topicSummary) {
                appendMessage("Topic Summary:", "system", "info");
                appendMessage(topicSummary, "ai", "normal", true);  // Set noAudio to true
            }
            
            // Display feedback to the user
            if (feedback) {
                appendMessage("Language Feedback:", "system", "info");
                appendMessage(feedback, "ai", "normal", true);  // Set noAudio to true
            }
        } else {
            console.error("Failed to save chat session via record.js");
            appendMessage("Failed to save session.", "system", "error");
        }
        
        // Re-enable input
        enableInput();
    } catch (error) {
        console.error("Error saving chat session:", error);
        appendMessage(`Error saving session: ${error.message}`, "system", "error");
        enableInput();
    }
}
// --- End save session function ---

// Initialize chat system
async function initChat() {
    try {
        // Load settings directly from service
        state.settings = settingsService.getSettings();
        
        // Determine API type based on settings
        state.apiType = state.settings.useDomesticAPI ? 'domestic' : 'gemini';
        
        console.debug('Chat initialization - settings loaded:', JSON.stringify({
            apiType: state.apiType,
            useDomesticAPI: state.settings.useDomesticAPI,
            modelType: state.apiType === 'domestic' ? state.settings.domesticModelType : state.settings.modelType,
            hasApiKey: state.apiType === 'domestic' ? !!state.settings.domesticApiKey : !!state.settings.apiKey,
            voiceSpeed: state.settings.voiceSpeed, // Voice speed
            voiceType: state.settings.voiceType, // Voice type
            temperature: state.settings.temperature, // Temperature
            maxTokens: state.settings.maxTokens, // Maximum token count
            topP: state.settings.topP, // Top P
            topK: state.settings.topK, // Top K
            systemInstructions: state.settings.systemInstructions ? state.settings.systemInstructions.substring(0, 30) + '...' : '' // System prompt
        }, null, 2));
        
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
            console.warn('API key not set in settings');
            appendMessage(`API key not configured for ${state.apiType === 'domestic' ? 'Domestic' : 'Gemini'} API. Please go to Settings...`, "system");
            state.isConnected = false;
            enableInput();
            return false;
        }
        
        // For domestic API, we'll use the Web Speech API, so we preload voices
        if (state.apiType === 'domestic' && state.isAudioEnabled) {
            try {
                console.log("Preloading Web Speech API voices for domestic API TTS");
                if (window.speechSynthesis) {
                    // Force voice list to load
                    speechSynthesis.getVoices();
                    
                    // If browser supports onvoiceschanged, log when voices are loaded
                    if ('onvoiceschanged' in speechSynthesis) {
                        speechSynthesis.onvoiceschanged = () => {
                            const voices = speechSynthesis.getVoices();
                            console.log(`Loaded ${voices.length} voices for Web Speech API`);
                            
                            // Find and log available English voices
                            const englishVoices = voices.filter(v => v.lang.includes('en'));
                            if (englishVoices.length > 0) {
                                console.log("Available English voices:", 
                                    englishVoices.map(v => `${v.name} (${v.lang})`).join(', '));
                            } else {
                                console.warn("No English voices found, will use default voice");
                            }
                            
                            // Log what voice type we're trying to match
                            console.log(`Will try to match voice type: ${state.settings.voiceType || 'Female (default)'}`);
                        };
                    }
                } else {
                    console.warn("Web Speech API not supported in this browser");
                }
            } catch (error) {
                console.error("Error preloading Web Speech API:", error);
                // Continue anyway, we'll handle this during playback
            }
            
            // Add settings listener for domestic API voice settings
            settingsService.addListener((change) => {
                if (state.apiType !== 'domestic') return;
                
                // Update if voice speed or type changes
                if (change.key === 'voiceSpeed' || change.key === 'voiceType') {
                    console.log(`Speech setting changed (${change.key} = ${change.value}) for domestic API`);
                    // The next speech request will use the new settings automatically
                }
            });
        }
        
        // Initialize Gemini voice agent for TTS - only if we're using Gemini API
        if (state.apiType === 'gemini' && state.isAudioEnabled) {
            try {
                console.log("Initializing Gemini agent for integrated text/audio...");
                
                const wsUrl = getWebsocketUrl();
                // Use the main model type from settings for the agent
                const selectedModel = state.settings.modelType || 'gemini-2.0-flash-live-001'; 
                
                // --- Check if selected model supports WebSocket (bidiGenerateContent) ---
                const isLiveApiModel = selectedModel.includes('-live-') || selectedModel.includes('-exp');
                
                if (!isLiveApiModel) {
                    console.warn(`Model ${selectedModel} does not support WebSocket Live API. Disabling Gemini agent.`);
                    appendMessage(`Note: Real-time voice output and interaction not available for model (${selectedModel}). Using standard API.`, "system", "warning");
                    // Revert apiType to ensure standard API calls are used
                    state.apiType = 'gemini'; // Keep as gemini, but agent will be null
                    state.geminiVoiceAgent = null; 
                } else if (!wsUrl) {
                    console.warn("WebSocket URL not configured, Gemini agent disabled");
                    state.geminiVoiceAgent = null; 
                } else {
                    // Model supports Live API and URL is configured, proceed with initialization
                    // Configure for AUDIO modality, text will come via events or transcription
                    const agentConfig = getConfig({ 
                        isTtsAgent: true, // Keep this for now, might need refinement
                        forceResponseModalities: ["AUDIO"] // Force AUDIO output
                    });
                    
                    console.log("Gemini Live Agent final configuration:", JSON.stringify({
                        model: agentConfig.model,
                        voiceType: agentConfig.generation_config?.speech_config?.voice_config?.prebuilt_voice_config?.voice_name,
                        voiceSpeed: state.settings.voiceSpeed || 1.2,
                        responseModalities: agentConfig.generation_config?.response_modalities
                    }, null, 2));
                    
                    state.geminiVoiceAgent = new GeminiAgent({
                        url: wsUrl,
                        config: agentConfig,
                        autoConnect: false, 
                        name: 'GeminiAgent (Live Chat)' // Rename for clarity
                    });
                    
                    // Set voice playback speed
                    if (state.geminiVoiceAgent.setPlaybackRate) {
                        const voiceSpeed = state.settings.voiceSpeed || 1.2;
                        state.geminiVoiceAgent.setPlaybackRate(voiceSpeed);
                    }
                    elements.aiAudioElement.playbackRate = state.settings.voiceSpeed || 1.2;
                    
                    // --- Event Handlers for Live Agent ---
                    
                    // Handle incoming TEXT from the agent (model's response)
                    // --- MODIFICATION START: Remove text handler, as main response comes via REST ---
                    /*
                    state.geminiVoiceAgent.on('text', (text) => {
                        console.log(`[Agent Event] Received TEXT: "${text.substring(0, 60)}..."`);
                        // Append text received directly from the live agent
                        // Ensure no duplicate audio playback is triggered here
                        appendMessage(text, 'ai', 'normal', true); // Pass noAudio=true
                        // Add to chat history (handle potential fragmentation if needed later)
                        if (!state.chatHistory.length || state.chatHistory[state.chatHistory.length - 1].role !== 'ai') {
                            state.chatHistory.push({ role: 'ai', text: text });
                        } else {
                            // Append to the last AI message if fragmented
                            state.chatHistory[state.chatHistory.length - 1].text += text;
                        }
                        enableInput(); // Re-enable input as text arrives
                    });
                    */
                    // --- MODIFICATION END ---

                    // Handle incoming AUDIO from the agent
                    // --- MODIFICATION START: Remove audio handler, as audio comes from Browser TTS ---
                    /*
                    state.geminiVoiceAgent.on('audio', (audioBase64) => {
                        console.log("[Agent Event] Received AUDIO data");
                        const audioBlob = base64ToBlob(audioBase64, 'audio/ogg');
                        const audioUrl = URL.createObjectURL(audioBlob);
                        elements.aiAudioElement.src = audioUrl;
                        elements.aiAudioElement.playbackRate = state.settings.voiceSpeed || 1.2;
                        elements.aiAudioElement.play().catch(e => {
                            console.error("Error playing AI audio:", e);
                            // Reset audio playing state if playback fails
                            state.audioPlaying = false;
                            document.querySelectorAll('.message-content.is-playing').forEach(el => {
                                el.classList.remove('is-playing');
                            });
                        });
                    });
                    */
                    // --- MODIFICATION END ---
                    
                    // Set up event handlers for audio element (These are still needed for browser TTS)
                    elements.aiAudioElement.addEventListener('play', () => {
                        console.log("AI audio playback started");
                        state.audioPlaying = true;
                    });
                    
                    elements.aiAudioElement.addEventListener('ended', () => {
                        console.log("AI audio playback ended");
                        state.audioPlaying = false;
                        document.querySelectorAll('.message-content.is-playing').forEach(el => {
                            el.classList.remove('is-playing');
                        });
                    });
                    
                    elements.aiAudioElement.addEventListener('pause', () => {
                        console.log("AI audio playback paused");
                        state.audioPlaying = false;
                        document.querySelectorAll('.message-content.is-playing').forEach(el => {
                            el.classList.remove('is-playing');
                        });
                    });
                    
                    elements.aiAudioElement.addEventListener('error', (e) => {
                        console.error("Audio playback error:", e);
                        state.audioPlaying = false;
                        document.querySelectorAll('.message-content.is-playing').forEach(el => {
                            el.classList.remove('is-playing');
                        });
                    });
                    
                    // Add settings listener, update voice agent when voice settings change
                    settingsService.addListener((change) => {
                        if (!state.geminiVoiceAgent) return;
                        
                        // Handle voice speed changes
                        if (change.key === 'voiceSpeed' && state.geminiVoiceAgent.setPlaybackRate) {
                            console.log(`Voice speed setting changed to ${change.value}`);
                            state.geminiVoiceAgent.setPlaybackRate(change.value);
                            // Also update the audio element directly
                            elements.aiAudioElement.playbackRate = change.value;
                        }
                        
                        // Handle voice type changes or model changes - need to reconnect the voice agent
                        if (change.key === 'voiceType' || change.key === 'modelType') {
                            console.log(`${change.key} changed to ${change.value}, reconnecting voice agent...`);
                            // Need to disconnect and then reconnect
                            if (state.geminiVoiceAgent.isConnected) {
                                state.geminiVoiceAgent.disconnect().then(() => {
                                    // Reinitialize with new settings - will re-check model compatibility
                                    initChat();
    }).catch(err => {
                                    console.error("Error disconnecting voice agent:", err);
                                });
                            } else {
                                // If not connected, just re-init
                                initChat();
                            }
                        }
                    });
                    
                    // Connect to the Gemini voice agent *only if* it was initialized
                    // Connect manually now
                    const connected = await state.geminiVoiceAgent.connect();
                    if (connected) {
                        console.log("Gemini voice agent connected successfully");
                    } else {
                        console.warn("Gemini voice agent connection failed, TTS will not be available");
                        // Don't set agent to null here, let the agent's own logic handle retries
                        appendMessage(`Could not connect for real-time voice output.`, "system", "warning");
                    }
                }
            } catch (error) {
                console.error("Error initializing Gemini voice agent:", error);
                // We'll continue without TTS
                state.geminiVoiceAgent = null;
            }
        }
        
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
                appendMessage(`Could not connect to the AI tutor: ${testResult.error}. Using simulation mode.`, "system");
                state.isConnected = false;
            }
        } catch (error) {
            console.warn(`Failed to initialize ${state.apiType} API...`, error);
            appendMessage(`Error connecting to the AI tutor: ${error.message}. Using simulation mode.`, "system");
            state.isConnected = false;
        }
        
        // Enable input controls
        enableInput();
        
        return state.isConnected; // Return true only if connection succeeded
    } catch (error) {
        console.error('Chat system initialization failed:', error);
        appendMessage(`Chat system initialization failed: ${error.message}. Using simulation mode.`, "system");
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
        appendMessage("Sorry, there was an error sending your message. Please try again.", "system");
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
