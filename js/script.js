import { GeminiAgent } from './core/agent.js';
import { getConfig, getWebsocketUrl, MODEL_SAMPLE_RATE } from './core/config.js';
import { ChatManager } from './chat/chat-manager.js';
import { setupEventListeners } from './core/events.js';


const url = getWebsocketUrl();

const chatManager = new ChatManager();

const geminiAgent = new GeminiAgent({
    url,
    configFunction: getConfig,
    modelSampleRate: () => MODEL_SAMPLE_RATE
});

// Attach chatManager to agent for refresh functionality
geminiAgent.chatManager = chatManager;

// Expose agent to global scope for settings manager real-time application
window.geminiAgent = geminiAgent;

// Handle chat-related events
geminiAgent.on('transcription', (transcript) => {
    chatManager.updateStreamingMessage(transcript);
});

geminiAgent.on('text_sent', (text) => {
    chatManager.finalizeStreamingMessage();
    chatManager.addUserMessage(text);
});

geminiAgent.on('interrupted', () => {
    chatManager.finalizeStreamingMessage();
    if (!chatManager.lastUserMessageType) {
        chatManager.addUserAudioMessage();
    }
});

geminiAgent.on('turn_complete', () => {
    chatManager.finalizeStreamingMessage();
});

geminiAgent.connect();

setupEventListeners(geminiAgent);