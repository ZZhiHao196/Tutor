// agent.js
import { getConfig, getWebsocketUrl } from './config.js';
import { GeminiWebsocketClient } from './client.js';
import { settingsService } from '../settings/settings.js';
import { AudioStreamer } from '../audio-tools/audio-streamer.js';
import { arrayBufferToBase64 } from '../utils/utils.js';

/**
 * Event handler callback type
 * @callback EventHandler
 * @param {*} detail - Event details
 */

/**
 * Gemini Agent configuration
 * @typedef {Object} GeminiAgentConfig
 * @property {string} [name='GeminiAgent'] - Name for logging
 * @property {string} [url=null] - WebSocket URL
 * @property {Object} [config=null] - Agent configuration
 * @property {boolean} [autoConnect=true] - Connect automatically
 * @property {number} [modelSampleRate=16000] - Sample rate for the model
 */

/**
 * GeminiAgent - Handles communication with the Gemini API via WebSocket
 * and manages audio playback FOR REAL-TIME CALLS.
 */
export class GeminiAgent extends EventTarget {
    /**
     * Creates a new GeminiAgent instance
     * @param {GeminiAgentConfig} options - Configuration options
     */
    constructor(options = {}) {
        super();
        const {
            name = 'GeminiAgent (Call)',
            url = null,
            config = null,
            autoConnect = true,
            modelSampleRate = 16000
        } = options;
        
        this.name = name;

        const settings = settingsService.getSettings();
        if (!settings.apiKey) {
            console.error(`${name} Initialization Error: API key not found via SettingsService.`);
        } else {
            console.debug(`${name} Found API key via SettingsService.`);
        }

        this.url = url || getWebsocketUrl();
        this.config = config || getConfig();
        this.modelSampleRate = modelSampleRate;
        this.connectionRetryCount = 0;
        this.maxConnectionRetries = 3;
        this.connectionInProgress = false;
        this.lastConnectionAttempt = 0;
        this.audioReceived = false;
        
        const configInfo = { ...this.config };
        if (configInfo.apiKey) configInfo.apiKey = '***';
        console.debug(`${name} Initializing with base config:`, configInfo);
        console.debug(`${name} WebSocket URL: ${this.url}`);

        this.client = new GeminiWebsocketClient(name, this.url, this.config);
        this.isConnected = false;

        this.audioStreamer = new AudioStreamer(this.modelSampleRate, settings.voiceSpeed || 1.0);

        this.setupEventListeners();
        console.log(`${name} Created. Ready to connect.`);

        if (autoConnect && settings.apiKey) {
            setTimeout(() => this.connect(), 0);
        } else if (!settings.apiKey) {
            console.warn(`${name} Cannot auto-connect due to missing API key.`);
        }
    }

    setupEventListeners() {
        this.client.on('text', (text) => {
            this.emit('text', text);
        });

        this.client.on('transcription', (text) => {
            this.emit('transcription', text);
        });

        this.client.on('turn_complete', () => {
            console.debug(`${this.name} Received turn_complete signal.`);
            this.emit('turn_complete');
        });
        
        this.client.on('interrupted', () => {
            console.debug(`${this.name} Received interrupted signal.`);
            this.stopPlayback();
            this.emit('interrupted');
        });

        this.client.on('disconnected', () => {
            this.isConnected = false;
            this.stopPlayback();
            console.warn(`${this.name} WebSocket disconnected.`);
            
            // For TTS agent, try to auto-reconnect within a reasonable time window
            if (this.name.includes('TTS') && Date.now() - this.lastConnectionAttempt > 5000) {
                console.info(`${this.name} Auto-reconnect attempt for TTS...`);
                setTimeout(() => this.connect(), 1000);
            }
            
            this.emit('disconnected');
        });

        this.client.on('reconnecting', (data) => {
            console.info(`${this.name} WebSocket attempting to reconnect (Attempt: ${data.attempt})...`);
            this.emit('reconnecting', data);
        });

        this.client.on('reconnected', () => {
            this.isConnected = true;
            this.connectionRetryCount = 0;
            console.info(`${this.name} WebSocket reconnected successfully.`);
            this.emit('reconnected');
        });

        this.client.on('reconnect_failed', () => {
            this.isConnected = false;
            console.error(`${this.name} WebSocket reconnection failed permanently.`);
            this.emit('reconnect_failed');
        });

        this.client.on('error', (error) => {
            console.error(`${this.name} Received error from WebSocket client:`, error);
            this.emit('error', { type: 'websocket_error', message: error.message || 'Unknown WebSocket error', details: error });
            
            // For TTS-specific errors, try to recover more aggressively
            if (this.name.includes('TTS') && !this.audioReceived) {
                console.warn(`${this.name} TTS error occurred before receiving audio, forcing reconnect`);
                setTimeout(() => {
                    this.isConnected = false;
                    this.connect();
                }, 2000);
            }
        });

        this.client.on('audio', (audioData) => {
            console.debug(`${this.name} Received audio data, length: ${typeof audioData === 'string' ? audioData.length : 'non-string'}`);
            
            // Mark that we've received audio
            this.audioReceived = true;
            
            if (this.audioStreamer) {
                try {
                    // For string data (base64), convert to Uint8Array if needed
                    if (typeof audioData === 'string') {
                        const audioBytes = _base64ToUint8Array(audioData);
                        if (audioBytes) {
                            this.audioStreamer.streamAudio(audioBytes);
                        } else {
                            throw new Error("Failed to decode base64 audio data");
                        }
                    } else {
                        // Direct binary data
                        this.audioStreamer.streamAudio(audioData);
                    }
                } catch (error) {
                    console.error(`${this.name} Error processing audio data:`, error);
                    this.emit('error', { type: 'audio_processing_error', message: 'Failed to process audio data' });
                }
            } else {
                console.warn(`${this.name} Received audio chunk but AudioStreamer is not available.`);
            }
            
            // Successfully receiving audio means we're definitely connected
            if (!this.isConnected) {
                this.isConnected = true;
                console.info(`${this.name} Connection confirmed via audio receipt.`);
            }
            
            // Emit the audio event for direct handling by app if needed
            this.emit('audio', audioData);
        });
    }

    async connect() {
        // Prevent duplicate connection attempts
        if (this.connectionInProgress) {
            console.debug(`${this.name} Connection attempt already in progress.`);
            return this.client.connectionPromise?.then(() => true).catch(() => false) || false;
        }

        if (this.isConnected && this.client.isConnected()) {
            console.debug(`${this.name} Already connected.`);
            return true;
        }
        
        // Record attempt timestamp and mark connection in progress
        this.lastConnectionAttempt = Date.now();
        this.connectionInProgress = true;
        this.audioReceived = false; // Reset audio received flag
        
        // Check retry count
        if (this.connectionRetryCount >= this.maxConnectionRetries) {
            console.warn(`${this.name} Max connection retries reached (${this.maxConnectionRetries}). Waiting for manual reconnect.`);
            this.connectionInProgress = false;
            return false;
        }
        
        this.connectionRetryCount++;

        if (this.audioStreamer && !this.audioStreamer.isInitialized) {
            try {
                await this.audioStreamer.initialize();
                console.log(`${this.name} AudioStreamer initialized successfully.`);
            } catch (error) {
                console.error(`${this.name} FATAL: Failed to initialize AudioStreamer:`, error);
                this.emit('error', { type: 'audio_setup_error', message: 'Failed to initialize audio playback.' });
                this.connectionInProgress = false;
                return false;
            }
        }

        console.log(`${this.name} Attempting to connect WebSocket... (attempt ${this.connectionRetryCount}/${this.maxConnectionRetries})`);
        try {
            // Ensure we have the latest API key from settings
            const settings = settingsService.getSettings();
            if (!settings.apiKey) {
                throw new Error('API key not available');
            }
            
            // Refresh client config with latest settings if this is a retry
            if (this.connectionRetryCount > 1) {
                console.log(`${this.name} Refreshing client config for retry attempt.`);
                this.client.config = this.config || getConfig();
            }
            
            await this.client.connect();
            this.isConnected = true;
            this.connectionRetryCount = 0;
            this.emit('connected');
            console.log(`${this.name} WebSocket connected successfully.`);
            this.connectionInProgress = false;
            return true;
        } catch (error) {
            console.error(`${this.name} WebSocket connection failed:`, error);
            this.isConnected = false;
            this.emit('connection_failed', error);
            this.connectionInProgress = false;
            
            // If this is a TTS agent, retry quickly for better user experience
            if (this.name.includes('TTS') && this.connectionRetryCount < this.maxConnectionRetries) {
                console.info(`${this.name} Scheduling immediate retry for TTS...`);
                setTimeout(() => this.connect(), 1000);
            }
            
            return false;
        }
    }

    async sendText(text) {
        if (!text || text.trim() === '') {
            console.warn(`${this.name} Attempted to send empty text message.`);
            return false;
        }

        if (!this.isConnected || !this.client.isConnected()) {
            console.warn(`${this.name} Not connected. Attempting to connect before sending text...`);
            const connected = await this.connect();
            if (!connected) {
                console.error(`${this.name} Connection failed. Cannot send text.`);
                this.emit('error', { type: 'send_error', message: 'Cannot send text, WebSocket not connected.' });
                return false;
            }
        }

        // Reset audio received flag before sending new text (for TTS)
        if (this.name.includes('TTS')) {
            this.audioReceived = false;
        }

        console.debug(`${this.name} Sending text via WebSocket: "${text.substring(0, 50)}..."`);
        try {
            const success = await this.client.sendText(text);
            if (success) {
                this.emit('text_sent', text);
                
                // For TTS, set a timeout to check if we got audio
                if (this.name.includes('TTS')) {
                    setTimeout(() => {
                        if (!this.audioReceived) {
                            console.warn(`${this.name} No audio received within 5 seconds, possible TTS issue`);
                            
                            // Emit a warning event that can be handled by the app
                            this.emit('tts_timeout', { text });
                            
                            // TTS-specific recovery - force reconnection if no audio was received
                            if (this.connectionRetryCount < this.maxConnectionRetries) {
                                console.info(`${this.name} Forcing reconnect due to TTS timeout`);
                                this.isConnected = false;
                                this.connect();
                            }
                        }
                    }, 5000);
                }
            } else {
                this.emit('error', { type: 'send_error', message: 'WebSocket client failed to send text.' });
                
                // If text send fails but we thought we were connected, force reconnect
                if (this.isConnected) {
                    console.warn(`${this.name} Text send failed despite connected state. Forcing reconnect...`);
                    this.isConnected = false;
                    setTimeout(() => this.connect(), 500);
                }
            }
            return success;
        } catch (error) {
            console.error(`${this.name} Error sending text via WebSocket:`, error);
            this.emit('error', { type: 'send_error', message: error.message || 'Failed to send text message.' });
            return false;
        }
    }

    /**
     * Sends audio data (ArrayBuffer) via WebSocket, encoded as Base64.
     * @param {ArrayBuffer} audioBuffer - Raw audio data from recorder.
     * @returns {Promise<boolean>} True if audio was sent successfully.
     */
    async sendAudio(audioBuffer) {
        if (!this.isConnected) {
            console.warn(`${this.name} Cannot send audio, WebSocket not connected.`);
            return false;
        }
        if (!(audioBuffer instanceof ArrayBuffer) || audioBuffer.byteLength === 0) {
            console.warn(`${this.name} Invalid audio buffer provided to sendAudio.`);
            return false;
        }

        try {
            // --- REVERT: Convert ArrayBuffer back to Base64 ---
            const base64Audio = arrayBufferToBase64(audioBuffer);
            // --- END REVERT ---

            // console.debug(`${this.name} Sending audio buffer (Base64 length: ${base64Audio.length}) via WebSocket.`); // Too verbose
            // --- REVERT: Pass Base64 string to client ---
            const success = await this.client.sendRealtimeAudio(base64Audio);
            // --- END REVERT ---
            return success;
        } catch (error) {
            console.error(`${this.name} Error sending audio via WebSocket:`, error);
            this.emit('error', { type: 'send_error', message: error.message || 'Failed to send audio data.' });
            return false;
        }
    }

    stopPlayback() {
        if (this.audioStreamer) {
            console.log(`${this.name} Stopping audio playback.`);
            this.audioStreamer.stop();
            this.emit('playback_stopped');
        }
    }

    async disconnect() {
        console.log(`${this.name} Disconnecting...`);
        this.connectionInProgress = false;
        this.stopPlayback();

        if (this.audioStreamer) {
            this.audioStreamer.dispose();
            console.log(`${this.name} AudioStreamer disposed.`);
        }
        
        if (this.client) {
            await this.client.disconnect();
        }

        this.isConnected = false;
        console.log(`${this.name} Disconnected.`);
        this.emit('disconnected');
    }

    getConnectionStatus() {
        return this.isConnected && this.client && this.client.isConnected();
    }

    /**
     * Add an event listener with simpler syntax
     * @param {string} eventName - Name of the event
     * @param {EventHandler} callback - Event callback
     * @returns {GeminiAgent} this - For chaining
     */
    on(eventName, callback) {
        this.addEventListener(eventName, (event) => callback(event.detail));
        return this;
    }
    
    /**
     * Emit an event
     * @param {string} eventName - Name of the event
     * @param {*} data - Event data
     * @private
     */
    emit(eventName, data) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }

    setPlaybackVolume(volume) {
        if (this.audioStreamer) {
            this.audioStreamer.setVolume(volume);
        }
    }

    setPlaybackRate(rate) {
        if (this.audioStreamer) {
            const clampedRate = Math.min(Math.max(rate, 0.5), 3.0);
            this.audioStreamer.setPlaybackRate(clampedRate);
            settingsService.updateSetting('voiceSpeed', clampedRate);
            console.debug(`${this.name} Playback rate set to ${clampedRate} and saved.`);
        }
    }

    /**
     * Gets the audio node that outputs the streamed audio.
     * @returns {AudioNode|null} The output node (likely a GainNode) or null.
     */
    getAudioOutputNode() {
        return this.audioStreamer?.getOutputNode();
    }
}

// Helper function to decode Base64 to Uint8Array (imported locally to avoid circular dependency)
function _base64ToUint8Array(base64) {
    try {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes;
    } catch (error) {
        console.error("Failed to decode base64 string:", error);
        return null;
    }
} 