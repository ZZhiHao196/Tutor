/**
 * Configuration options for AudioRecorder
 * @typedef {Object} AudioRecorderOptions
 * @property {number} [silenceThreshold=0.01] - Threshold for silence detection (0-1)
 * @property {number} [silenceDuration=1500] - Duration of silence to consider speech ended (ms)
 * @property {boolean} [vadEnabled=true] - Enable voice activity detection
 * @property {boolean} [autoGainEnabled=true] - Enable automatic gain control
 * @property {number} [sampleRate=16000] - Recording sample rate in Hz
 * @property {number} [minGain=0.5] - Minimum gain value for AGC
 * @property {number} [maxGain=4.0] - Maximum gain value for AGC
 * @property {number} [initialGain=1.0] - Initial gain value for AGC
 */

/**
 * AudioRecorder manages the capture and processing of audio input from the user's microphone.
 * It uses the Web Audio API and AudioWorklet to process audio in real-time with minimal latency.
 */
export class AudioRecorder extends EventTarget {
    /**
     * Creates an AudioRecorder instance
     * @param {AudioRecorderOptions & { audioContext?: AudioContext }} options - Configuration options including an optional AudioContext
     */
    constructor(options = {}) {
        super();
        
        // Core configuration
        this.config = {
            sampleRate: options.sampleRate || 16000,
            vadEnabled: options.vadEnabled !== undefined ? options.vadEnabled : true,
            silenceThreshold: options.silenceThreshold || 0.01,
            silenceDuration: options.silenceDuration || 1500,
            autoGainEnabled: options.autoGainEnabled !== undefined ? options.autoGainEnabled : true,
            minGain: options.minGain || 0.5,
            maxGain: options.maxGain || 4.0,
            initialGain: options.initialGain || 1.0
        };
        
        // Audio state
        this.audio = {
            stream: null,
            context: options.audioContext || null, // Use provided context or null initially
            source: null,
            processor: null,
            gainNode: null
        };
        
        // Recording state
        this.state = {
            isInitialized: false,
            isRecording: false,
            isSuspended: false,
            isSpeaking: false,
            currentGain: this.config.initialGain,
            speechTimeout: null,
            onAudioData: null,
            lastError: null
        };
        
        console.log('AudioRecorder initialized with options:', {
            vadEnabled: this.config.vadEnabled,
            silenceThreshold: this.config.silenceThreshold,
            silenceDuration: this.config.silenceDuration,
            autoGainEnabled: this.config.autoGainEnabled,
            sampleRate: this.config.sampleRate
        });
    }

    /**
     * Gets the audio source node that can be connected to other nodes
     * @returns {MediaStreamAudioSourceNode|null} - The audio source node or null if not initialized
     */
    get sourceNode() {
        return this.audio?.source || null;
    }

    /**
     * Initializes and starts audio capture pipeline
     * Sets up audio context, worklet processor, and media stream
     * @param {Function} onAudioData - Callback receiving audio chunks as ArrayBuffer
     * @returns {Promise<boolean>} - Resolves to true if started successfully
     */
    async start(onAudioData) {
        if (this.state.isRecording) {
            console.warn('AudioRecorder is already recording');
            return true;
        }
        
        if (typeof onAudioData !== 'function') {
            throw new Error('AudioRecorder requires a valid onAudioData callback function');
        }
        
        this.state.onAudioData = onAudioData;
        this.state.lastError = null;
        
        try {
            // Request microphone access with specific audio processing requirements
            this.audio.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.config.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Verify that we actually received audio tracks
            if (!this.audio.stream || this.audio.stream.getAudioTracks().length === 0) {
                throw new Error('No audio tracks available from microphone');
            }
            
            // Initialize Web Audio API context and nodes if not provided
            if (!this.audio.context) {
                console.log("AudioRecorder: Creating new AudioContext.");
                this.audio.context = new AudioContext({ sampleRate: this.config.sampleRate });
            } else {
                console.log("AudioRecorder: Using provided AudioContext.");
            }
            
            // Verify context state
            if (this.audio.context.state === 'suspended') {
                // Auto-resume on user gesture in modern browsers
                console.log("AudioRecorder: Resuming suspended AudioContext.");
                await this.audio.context.resume();
            }
            
            this.audio.source = this.audio.context.createMediaStreamSource(this.audio.stream);
            
            // Set up gain node for volume adjustment if enabled
            if (this.config.autoGainEnabled) {
                this.audio.gainNode = this.audio.context.createGain();
                this.audio.gainNode.gain.value = this.state.currentGain;
                this.audio.source.connect(this.audio.gainNode);
            }

            // Load and initialize audio processing worklet
            try {
                // Check if AudioWorklet is supported
                if (!this.audio.context.audioWorklet) {
                    throw new Error('AudioWorklet not supported in this browser');
                }
                
                await this.audio.context.audioWorklet.addModule('../js/audio-tools/audio-processor.js');
                this.audio.processor = new AudioWorkletNode(this.audio.context, 'audio-recorder-worklet', {
                    processorOptions: {
                        sampleRate: this.config.sampleRate
                    }
                });
                
                // Handle processed audio chunks from worklet
                this.audio.processor.port.onmessage = this._handleProcessorMessage.bind(this);
                
                // Add error handler for processor
                this.audio.processor.onprocessorerror = (event) => {
                    console.error('Audio processor error:', event);
                    this._emitEvent('error', { 
                        message: 'Audio processor error occurred',
                        originalError: event
                    });
                };
                
                // Connect audio processing pipeline
                if (this.config.autoGainEnabled) {
                    this.audio.gainNode.connect(this.audio.processor);
                } else {
                    this.audio.source.connect(this.audio.processor);
                }
                
                this.audio.processor.connect(this.audio.context.destination);
                this.state.isRecording = true;
                this.state.isInitialized = true;
                
                console.log('Audio recording started successfully', {
                    sampleRate: this.config.sampleRate,
                    vadEnabled: this.config.vadEnabled,
                    autoGainEnabled: this.config.autoGainEnabled,
                    contextState: this.audio.context.state
                });
                
                this._emitEvent('started', { sampleRate: this.config.sampleRate });
                return true;
                
            } catch (workletError) {
                console.error('Failed to initialize audio worklet:', workletError);
                this.state.lastError = workletError;
                this._cleanup();
                throw new Error(`Failed to load audio processor: ${workletError.message}`);
            }
        } catch (error) {
            this.state.lastError = error;
            this._cleanup();
            let errorMessage = 'Failed to start audio recording';
            
            // Provide more specific error messages for common issues
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone access denied by user or system';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone detected on this device';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Microphone is already in use by another application';
            } else if (error.name === 'AbortError') {
                errorMessage = 'Hardware or permission issue with microphone';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Media access is not allowed in this context';
            } else {
                errorMessage = `${errorMessage}: ${error.message}`;
            }
            
            this._emitEvent('error', { message: errorMessage, originalError: error });
            throw new Error(errorMessage);
        }
    }

    /**
     * Handles messages from the audio processor worklet
     * @param {MessageEvent} event - Message event from worklet
     * @private
     */
    _handleProcessorMessage(event) {
        if (!this.state.isRecording) return;
        
        if (event.data.event === 'chunk' && this.state.onAudioData) {
            // Get the int16 audio buffer
            const int16Buffer = event.data.data.int16arrayBuffer;
            
            // Process voice activity detection if enabled
            if (this.config.vadEnabled) {
                const int16Array = new Int16Array(int16Buffer);
                const isSpeech = this._detectSpeech(int16Array);
                
                if (isSpeech) {
                    // Reset silence timeout
                    if (this.state.speechTimeout) {
                        clearTimeout(this.state.speechTimeout);
                        this.state.speechTimeout = null;
                    }
                    
                    // Set speaking state and emit event if changed
                    if (!this.state.isSpeaking) {
                        this.state.isSpeaking = true;
                        this._emitEvent('speechstart');
                        console.log('Speech detected');
                    }
                    
                    // Adjust gain if auto gain is enabled
                    if (this.config.autoGainEnabled) {
                        this._adjustGain(int16Array);
                    }
                } else if (this.state.isSpeaking) {
                    // Start silence timeout
                    if (!this.state.speechTimeout) {
                        this.state.speechTimeout = setTimeout(() => {
                            this.state.isSpeaking = false;
                            this._emitEvent('speechend');
                            console.log('Speech ended');
                            this.state.speechTimeout = null;
                        }, this.config.silenceDuration);
                    }
                }
            }
            
            // Call the data callback with the audio buffer
            try {
                this.state.onAudioData(int16Buffer);
            } catch (callbackError) {
                console.error('Error in audio data callback:', callbackError);
                this._emitEvent('error', { 
                    message: 'Error processing audio data in callback',
                    originalError: callbackError
                });
            }
        } else if (event.data.event === 'error') {
            console.error('Error from audio processor:', event.data.error);
            this._emitEvent('error', { 
                message: 'Audio processor reported an error',
                originalError: event.data.error
            });
        }
    }

    /**
     * Detects speech activity in an audio buffer
     * @param {Int16Array} buffer - Audio buffer to analyze
     * @returns {boolean} - True if speech is detected
     * @private
     */
    _detectSpeech(buffer) {
        // Early return for empty buffer
        if (!buffer || buffer.length === 0) return false;
        
        // Calculate RMS (Root Mean Square) energy
        let sum = 0;
        const len = buffer.length;
        for (let i = 0; i < len; i++) {
            const sample = buffer[i] / 32768; // Normalize to -1...1 range
            sum += sample * sample;
        }
        const rms = Math.sqrt(sum / len);
        
        // Compare with threshold
        return rms > this.config.silenceThreshold;
    }
    
    /**
     * Adjusts the gain based on audio levels
     * @param {Int16Array} buffer - Audio buffer to analyze
     * @private
     */
    _adjustGain(buffer) {
        if (!this.audio.gainNode || !buffer || buffer.length === 0) return;
        
        // Calculate peak level
        let peak = 0;
        const len = buffer.length;
        for (let i = 0; i < len; i++) {
            peak = Math.max(peak, Math.abs(buffer[i] / 32768));
        }
        
        // Target level is around 0.5 (50%)
        const targetLevel = 0.5;
        const adjustment = peak > 0.01 ? targetLevel / peak : 1.0;
        
        // Smooth adjustment (use more aggressive adjustment for low levels)
        const adaptFactor = peak < 0.1 ? 0.15 : 0.05;  // Faster adaptation for quiet audio
        this.state.currentGain = Math.max(
            this.config.minGain, 
            Math.min(this.config.maxGain, 
                this.state.currentGain * (1 - adaptFactor) + adjustment * adaptFactor
            )
        );
        
        // Apply gain with appropriate ramp time
        // Use shorter ramp time for low levels (faster response when too quiet)
        const rampTime = peak < 0.1 ? 0.05 : 0.1;
        this.audio.gainNode.gain.setTargetAtTime(
            this.state.currentGain, 
            this.audio.context.currentTime, 
            rampTime
        );
    }

    /**
     * Gracefully stops audio recording and cleans up resources
     * @returns {Promise<boolean>} - Resolves to true if stopped successfully
     */
    async stop() {
        if (!this.state.isRecording) {
            console.warn('AudioRecorder is not recording');
            return false;
        }

        try {
            await this._cleanup();
            this._emitEvent('stopped');
            console.info('Audio recording stopped successfully');
            return true;
        } catch (error) {
            console.error('Error stopping audio recording:', error);
            this.state.lastError = error;
            this._emitEvent('error', { 
                message: 'Failed to stop audio recording',
                originalError: error
            });
            return false;
        }
    }

    /**
     * Cleans up audio resources
     * @private
     * @returns {Promise<void>}
     */
    async _cleanup() {
        // Stop all active media tracks
        if (this.audio.stream) {
            this.audio.stream.getTracks().forEach(track => track.stop());
            this.audio.stream = null;
        }

        // Close audio context
        if (this.audio.context) {
            if (this.audio.context.state !== 'closed') {
                try {
                    await this.audio.context.close();
                } catch (err) {
                    console.warn('Error closing audio context:', err);
                }
            }
            this.audio.context = null;
        }
        
        // Clear processor and gain node
        this.audio.processor = null;
        this.audio.gainNode = null;
        this.audio.source = null;
        
        // Clear any pending speech timeouts
        if (this.state.speechTimeout) {
            clearTimeout(this.state.speechTimeout);
            this.state.speechTimeout = null;
        }
        
        this.state.isRecording = false;
        this.state.isSuspended = false;
        this.state.isSpeaking = false;
    }

    /**
     * Suspends microphone input without destroying the audio context
     * @returns {Promise<boolean>} - True if suspended successfully
     */
    async suspendMic() {
        if (!this.state.isRecording || this.state.isSuspended) {
            return false;
        }
        
        try {
            if (this.audio.context && this.audio.context.state === 'running') {
                await this.audio.context.suspend();
            }
            
            if (this.audio.stream) {
                this.audio.stream.getTracks().forEach(track => track.enabled = false);
            }
            
            this.state.isSuspended = true;
            this._emitEvent('suspended');
            console.info('Microphone suspended');
            return true;
        } catch (error) {
            console.error('Failed to suspend microphone:', error);
            this.state.lastError = error;
            this._emitEvent('error', { 
                message: 'Failed to suspend microphone',
                originalError: error
            });
            return false;
        }
    }

    /**
     * Resumes microphone input if previously suspended
     * @returns {Promise<boolean>} - True if resumed successfully
     */
    async resumeMic() {
        if (!this.state.isRecording || !this.state.isSuspended) {
            return false;
        }
        
        try {
            if (this.audio.context && this.audio.context.state === 'suspended') {
                await this.audio.context.resume();
            }
            
            if (this.audio.stream) {
                this.audio.stream.getTracks().forEach(track => track.enabled = true);
            }
            
            this.state.isSuspended = false;
            this._emitEvent('resumed');
            console.info('Microphone resumed');
            return true;
        } catch (error) {
            console.error('Failed to resume microphone:', error);
            this.state.lastError = error;
            this._emitEvent('error', { 
                message: 'Failed to resume microphone',
                originalError: error
            });
            return false;
        }
    }

    /**
     * Toggles microphone state between suspended and active
     * @returns {Promise<boolean>} - True if toggled successfully
     */
    async toggleMic() {
        if (this.state.isSuspended) {
            return await this.resumeMic();
        } else {
            return await this.suspendMic();
        }
    }
    
    /**
     * Sets the voice activity detection threshold
     * @param {number} threshold - New threshold value (0-1)
     * @returns {boolean} - True if setting was updated
     */
    setVADThreshold(threshold) {
        if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
            console.warn('Invalid VAD threshold value. Must be between 0 and 1');
            return false;
        }
        
        this.config.silenceThreshold = threshold;
        return true;
    }
    
    /**
     * Enables or disables voice activity detection
     * @param {boolean} enabled - Whether VAD should be enabled
     */
    enableVAD(enabled) {
        this.config.vadEnabled = !!enabled;
    }
    
    /**
     * Checks if the recorder is currently recording
     * @returns {boolean} - True if recording
     */
    isActive() {
        return this.state.isRecording;
    }
    
    /**
     * Checks if the microphone is currently suspended
     * @returns {boolean} - True if suspended
     */
    isMicSuspended() {
        return this.state.isSuspended;
    }
    
    /**
     * Checks if speech is currently detected
     * @returns {boolean} - True if speech is detected
     */
    isSpeechDetected() {
        return this.state.isSpeaking;
    }
    
    /**
     * Gets the last error that occurred
     * @returns {Error|null} - The last error or null
     */
    getLastError() {
        return this.state.lastError;
    }
    
    /**
     * Emits an event with optional detail data
     * @param {string} eventName - Name of the event
     * @param {*} [detail=null] - Optional event details
     * @private
     */
    _emitEvent(eventName, detail = null) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
}