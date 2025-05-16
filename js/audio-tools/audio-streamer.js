/**
 * AudioStreamer handles the playback of audio data received from the Gemini API.
 * It buffers the incoming audio data and plays it smoothly, handling the complexities
 * of real-time streaming audio playback.
 */
export class AudioStreamer {
    /**
     * Creates an instance of AudioStreamer.
     * @param {AudioContext} [providedAudioContext=null] - An optional existing AudioContext.
     * @param {number} modelSampleRate - The sample rate of the incoming audio.
     * @param {number} [initialPlaybackRate=1.0] - The initial playback speed.
     */
    constructor(providedAudioContext = null, modelSampleRate = 22000, initialPlaybackRate = 1.0) {
        // Audio pipeline components
        this.audioContext = providedAudioContext; // Use provided context if available
        this.audioSource = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.modelSampleRate = modelSampleRate;
        this.isInitialized = false;
        
        // Buffer management
        this.bufferSize = 4096;
        this.minBufferSize = 2048;
        this.maxBufferSize = 16384;
        this.totalSamples = 0;
        this.currentTime = 0;
        
        // Playback configuration
        this.playbackRate = Math.max(0.5, Math.min(3.0, initialPlaybackRate));
        this.volume = 1.0;
        this.gainNode = null;

        console.log(`AudioStreamer: Initialized with playbackRate: ${this.playbackRate}`);
    }

    /**
     * Initialize the AudioStreamer, setting up the Web Audio API context
     * and necessary audio nodes for playback.
     */
    initialize() {
        if (this.isInitialized) return;
        
        try {
            // Create audio context if not provided
            if (!this.audioContext) {
                const AudioContextGlobal = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContextGlobal({ sampleRate: this.modelSampleRate });
                console.log(`AudioStreamer: Created new AudioContext. Actual sample rate: ${this.audioContext.sampleRate}`);
            } else {
                console.log(`AudioStreamer: Using provided AudioContext. Sample rate: ${this.audioContext.sampleRate}`);
            }
            
            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.setVolume(this.volume);
            this.gainNode.connect(this.audioContext.destination);
            
            this.isInitialized = true;
            console.log('AudioStreamer: Initialized successfully.');
        } catch (error) {
            console.error('AudioStreamer: Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Processes audio data in Uint8Array format and queues it for playback.
     * Converts to AudioBuffer and manages the streaming playback.
     * @param {Uint8Array} audioData - Raw audio data to process.
     */
    streamAudio(audioData) {
        if (!this.isInitialized) {
            this.initialize();
        }
        
        try {
            if (!(audioData instanceof Uint8Array) || audioData.length === 0) {
                console.warn("AudioStreamer: Received invalid audio data chunk.");
                return;
            }

            // Decode the audio data - it's likely in 16-bit PCM format
            const bufferLength = audioData.byteLength % 2 === 0 ? audioData.byteLength : audioData.byteLength - 1;
            if (bufferLength <= 0) return; // Skip empty or odd-byte buffers
            const pcmData = new Int16Array(audioData.buffer, audioData.byteOffset, bufferLength / 2);
            
            // Convert to float32 for Web Audio API
            const floatData = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
                // Convert from int16 (-32768 to 32767) to float32 (-1.0 to 1.0)
                floatData[i] = pcmData[i] / 32768.0;
            }
            
            // Create a buffer with the correct number of channels
            const audioBuffer = this.audioContext.createBuffer(1, floatData.length, this.modelSampleRate);
            
            // Copy the float32 data to the buffer
            audioBuffer.copyToChannel(floatData, 0);
            
            // Add to the queue and play if not already playing
            this.audioQueue.push(audioBuffer);
            this.totalSamples += floatData.length;
            
            if (!this.isPlaying) {
                this.playNextChunk();
            }
        } catch (error) {
            console.error('AudioStreamer: Error processing audio data:', error);
        }
    }

    /**
     * Play the next audio chunk in the queue.
     */
    playNextChunk() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        
        const buffer = this.audioQueue.shift();
        const source = this.audioContext.createBufferSource();
        
        // Configure the buffer source
        source.buffer = buffer;
        //console.log(`AudioStreamer: Applying playbackRate ${this.playbackRate} to new chunk.`);
        source.playbackRate.value = this.playbackRate;
        
        // Connect to the audio graph
        source.connect(this.gainNode);
        
        // When this chunk finishes, play the next one
        source.onended = () => {
            this.playNextChunk();
        };
        
        // Start playback
        source.start();
        this.audioSource = source;
    }

    /**
     * Set the playback rate for audio.
     * @param {number} rate - The new playback rate (1.0 is normal speed).
     */
    setPlaybackRate(rate) {
        const newRate = Math.max(0.5, Math.min(3.0, rate));
        if (this.playbackRate !== newRate) {
            console.log(`AudioStreamer: Setting playbackRate from ${this.playbackRate} to ${newRate}`);
            this.playbackRate = newRate;

            if (this.audioSource) {
                try {
                    console.log(`AudioStreamer: Updating current source node playbackRate to ${this.playbackRate}`);
                    this.audioSource.playbackRate.value = this.playbackRate;
                } catch (error) {
                    console.error("AudioStreamer: Error setting playbackRate on active source:", error);
                }
            }
        }
    }

    /**
     * Set the volume for audio playback.
     * @param {number} volume - The new volume (0.0 to 1.0).
     */
    setVolume(volume) {
        this.volume = Math.max(0.0, Math.min(1.0, volume));
        console.log(`AudioStreamer: Setting volume to ${this.volume}`);
        if (this.gainNode && this.audioContext) {
            this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
        }
    }

    /**
     * Stop audio playback and clear the queue.
     */
    stop() {
        if (this.audioSource) {
            this.audioSource.onended = null;
            this.audioSource.stop();
            this.audioSource = null;
        }
        
        this.audioQueue = [];
        this.isPlaying = false;
        this.totalSamples = 0;
    }

    /**
     * Clean up resources.
     */
    dispose() {
        this.stop();
        
        if (this.audioContext) {
            console.log("AudioStreamer: Closing AudioContext.");
            this.audioContext.close().then(() => {
                console.log("AudioStreamer: AudioContext closed.");
            }).catch(error => {
                console.error("AudioStreamer: Error closing AudioContext:", error);
            });
            this.audioContext = null;
        }
        
        this.isInitialized = false;
    }

    /**
     * Returns the gain node, which can be used as the output connection point.
     * @returns {GainNode|null} The gain node instance.
     */
    getOutputNode() {
        return this.gainNode;
    }
} 