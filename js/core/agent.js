/**
 * Core application class that orchestrates the interaction between various components
 * of the Gemini 2 Live API. Manages audio streaming, WebSocket communication, audio transcription,
 * and coordinates the overall application functionality.
 */
import { GeminiWebsocketClient } from './client.js';
import { AudioRecorder } from '../audio/audio-recorder.js';
import { AudioStreamer } from '../audio/audio-streamer.js';
import { AudioVisualizer } from '../audio/audio-visualizer.js';


export class GeminiAgent{
    constructor({
        name = 'GeminiAgent',
        url,
        configFunction,
        transcribeModelsSpeech = true,
        transcribeUsersSpeech = false,
        modelSampleRate = 24000

    } = {}) {
        if (!url) throw new Error('WebSocket URL is required');
        if (!configFunction) throw new Error('Config function is required');

        this.initialized = false;
        this.connected = false;

        // For audio components
        this.audioContext = null;
        this.audioRecorder = null;
        this.audioStreamer = null;
        
        // Store function if provided, otherwise use static value
        this.modelSampleRateFunction = typeof modelSampleRate === 'function' ? modelSampleRate : () => modelSampleRate;
        this.configFunction = configFunction; // Store function instead of static config
        this.name = name;
        this.url = url;
        this.client = null;
    }

    setupEventListeners() {
        // Handle incoming audio data from the model
        this.client.on('audio', async (data) => {
            try {
                if (!this.audioStreamer.isInitialized) {
                    this.audioStreamer.initialize();
                }
                this.audioStreamer.streamAudio(new Uint8Array(data));

            } catch (error) {
                throw new Error('Audio processing error:' + error);
            }
        });

        // Handle model interruptions by stopping audio playback
        this.client.on('interrupted', () => {
            this.audioStreamer.stop();
            this.audioStreamer.isInitialized = false;
            this.emit('interrupted');
        });

        // Add an event handler when the model finishes speaking if needed
        this.client.on('turn_complete', () => {
            console.info('Model finished speaking');
            this.emit('turn_complete');
        });

        this.client.on('tool_call', async (toolCall) => {
            await this.handleToolCall(toolCall);
        });
    }
        

    /**
     * Connects to the Gemini API using the GeminiWebsocketClient.connect() method.
     */
    async connect() {
        // Get fresh configuration each time we connect
        const currentConfig = this.configFunction();
        console.debug('Using fresh configuration for connection:', currentConfig);
        
        this.client = new GeminiWebsocketClient(this.name, this.url, currentConfig);
        await this.client.connect();
        this.setupEventListeners();
        this.connected = true;
    }

    /**
     * Sends a text message to the Gemini API.
     * @param {string} text - The text message to send.
     */
    async sendText(text) {
        await this.client.sendText(text);
        this.emit('text_sent', text);
    }

    /**
     * Gracefully terminates all active connections and streams.
     * Ensures proper cleanup of audio, screen sharing, and WebSocket resources.
     */
    async disconnect() {
        try {
       
            // Cleanup audio resources in correct order
            if (this.audioRecorder) {
                this.audioRecorder.stop();
                this.audioRecorder = null;
            }

            // Cleanup audio visualizer before audio context
            if (this.visualizer) {
                this.visualizer.cleanup();
                this.visualizer = null;
            }

            // Clean up audio streamer before closing context
            if (this.audioStreamer) {
                this.audioStreamer.stop();
                this.audioStreamer = null;
            }

            // Finally close audio context
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }

            // Cleanup WebSocket
            this.client.disconnect();
            this.client = null;
            this.initialized = false;
            this.connected = false;
            
            console.info('Disconnected and cleaned up all resources');
        } catch (error) {
            throw new Error('Disconnect error:' + error);
        }
    }


    /**
     * Initiates audio recording from the microphone.
     * Streams audio data to the model in real-time, handling interruptions
     */
    async initialize() {
        try {            
            // Initialize audio components
            this.audioContext = new AudioContext();
            this.audioStreamer = new AudioStreamer(this.audioContext);
            this.audioStreamer.initialize();
            this.visualizer = new AudioVisualizer(this.audioContext, 'visualizer');
            this.audioStreamer.gainNode.connect(this.visualizer.analyser);
            this.visualizer.start();
            this.audioRecorder = new AudioRecorder();
        
            
            this.initialized = true;
            console.info(`${this.client.name} initialized successfully`);
            
            // Ensure client is connected before sending initial message
            if (this.client && this.client.isConnected()) {
            this.client.sendText('.');  // Trigger the model to start speaking first
            } else {
                console.warn('Client not connected, skipping initial message');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            throw new Error('Error during the initialization of the client: ' + error.message);
        }
    }

    async startRecording() {
        // Start recording with callback to send audio data to websocket 
        await this.audioRecorder.start(async (audioData) => {
            try {
                this.client.sendAudio(audioData);
            } catch (error) {
                console.error('Error sending audio data:', error);
                this.audioRecorder.stop();
            }
        });
    }

    /**
     * Toggles the microphone state between active and suspended
     */
    async toggleMic() {
        if (!this.audioRecorder.stream) {
            await this.startRecording();
            return;
        }
        await this.audioRecorder.toggleMic();
    }           

    // Add event emitter functionality
    on(eventName, callback) {
        if (!this._eventListeners) {
            this._eventListeners = new Map();
        }
        if (!this._eventListeners.has(eventName)) {
            this._eventListeners.set(eventName, []);
        }
        this._eventListeners.get(eventName).push(callback);
    }

    emit(eventName, data) {
        if (!this._eventListeners || !this._eventListeners.has(eventName)) {
            return;
        }
        for (const callback of this._eventListeners.get(eventName)) {
            callback(data);
        }
    }
}

