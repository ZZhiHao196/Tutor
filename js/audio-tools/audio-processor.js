/**
 * AudioProcessingWorklet handles real-time audio processing in a dedicated thread.
 * It converts incoming Float32 audio samples to Int16 format for efficient network transmission
 * and processing by speech recognition systems. Optimized for performance.
 */

// Define constants outside the class for potential minor performance gains
const BUFFER_SIZE = 2048;
const INT16_MAX = 32767;
const INT16_MIN = -32768;
const TARGET_SAMPLE_RATE = 16000; // Explicitly define target rate

class AudioProcessingWorklet extends AudioWorkletProcessor {
    /**
     * Initializes the audio processing worklet with optimized parameters.
     */
    constructor(options = {}) {
        super();
        // Use sampleRate from processor options if available, otherwise use context sampleRate
        this.sampleRate = options.processorOptions?.sampleRate || sampleRate || TARGET_SAMPLE_RATE; // Use context's sampleRate

        // Pre-allocate buffer for Int16 samples
        this.buffer = new Int16Array(BUFFER_SIZE);
        this.bufferWriteIndex = 0;

        // Noise gate and dynamics processing parameters (tuned slightly)
        this.noiseFloor = options.processorOptions?.noiseFloor || 0.008; // Slightly higher default
        this.attackTime = options.processorOptions?.attackTime || 0.005; // Faster attack
        this.releaseTime = options.processorOptions?.releaseTime || 0.08; // Faster release

        // Compressor parameters (tuned slightly)
        this.threshold = options.processorOptions?.threshold || 0.15; // Higher threshold
        this.ratio = options.processorOptions?.ratio || 3.0; // Lower ratio
        this.makeupGain = options.processorOptions?.makeupGain || 1.2; // Lower makeup gain

        // State variables for dynamics processing
        this.envFollower = 0;
        // Calculate coefficients based on actual sample rate
        this.attackCoeff = Math.exp(-1 / (this.attackTime * this.sampleRate));
        this.releaseCoeff = Math.exp(-1 / (this.releaseTime * this.sampleRate));

        // Optimization: Pre-calculate inverse ratio for compression
        this.invRatio = 1 / this.ratio;

        // Error handling state
        this.errorReported = false; // Prevent flooding logs with the same error

        console.log(`AudioProcessorWorklet initialized with sampleRate: ${this.sampleRate}`);
    }

    /**
     * Efficiently processes incoming audio data chunks.
     * @param {Array<Float32Array[]>} inputs - Array of input channels.
     * @param {Array<Float32Array[]>} outputs - Array of output channels (ignored).
     * @param {Record<string, Float32Array>} parameters - Audio parameters (ignored).
     * @returns {boolean} - Return true to keep the processor alive.
     */
    process(inputs, outputs, parameters) {
        // Use the first input and first channel - assuming mono input
        const inputChannel = inputs[0]?.[0];

        if (inputChannel) {
             // Optimization: Directly process the input array without creating intermediate variables if possible
            try {
                this.processChunk(inputChannel);
            } catch (error) {
                if (!this.errorReported) {
                    this.port.postMessage({
                        event: 'error',
                        error: {
                            message: `Processing error: ${error.message}`,
                            stack: error.stack // Include stack trace if available
                        }
                    });
                    this.errorReported = true; // Report error only once
                    console.error("AudioProcessingWorklet Error:", error);
                }
                 // Even if error occurs, try to continue processing future chunks
            }
        }
        // Keep processor alive
        return true;
    }


    /**
     * Sends the accumulated audio buffer to the main thread efficiently.
     */
    sendAndClearBuffer() {
        if (this.bufferWriteIndex > 0) {
             // Create a new ArrayBuffer from the slice to transfer ownership
             const bufferToSend = this.buffer.slice(0, this.bufferWriteIndex).buffer;
            try {
                this.port.postMessage({
                    event: 'chunk',
                    data: {
                        int16arrayBuffer: bufferToSend,
                    },
                }, [bufferToSend]); // Transfer ownership of the buffer
            } catch (postMessageError) {
                 console.error("AudioProcessingWorklet: Failed to post message", postMessageError);
                 // Don't reset index if postMessage fails, maybe retry next time?
                 // For now, log error and reset to prevent buffer overflow
                 this.bufferWriteIndex = 0;
            }
            // Reset index after successful or failed postMessage
            this.bufferWriteIndex = 0;
        }
         // Reset error flag after attempting to send data
         this.errorReported = false;
    }


    /**
     * Optimized processing for a single audio sample (in-place modifications avoided).
     * @param {number} sample - Input audio sample in [-1.0, 1.0] range.
     * @returns {number} - Processed audio sample.
     */
    processSample(sample) {
        // Update envelope follower
        const inputAbs = Math.abs(sample);
        this.envFollower = inputAbs > this.envFollower
            ? this.attackCoeff * this.envFollower + (1 - this.attackCoeff) * inputAbs
            : this.releaseCoeff * this.envFollower + (1 - this.releaseCoeff) * inputAbs;

        // Apply noise gate (early return for silence)
        if (this.envFollower < this.noiseFloor) {
            return 0;
        }

        // Apply compression if above threshold
        let compressedSample = sample;
        if (inputAbs > this.threshold) {
             // Optimization: Use pre-calculated inverse ratio
            const gainReduction = this.threshold + (inputAbs - this.threshold) * this.invRatio;
            // Apply gain reduction based on original sign
            compressedSample = sample > 0 ? gainReduction : -gainReduction;
        }

        // Apply makeup gain and hard limiter
        // Optimization: Combine makeup gain and limiter check
        const outputSample = compressedSample * this.makeupGain;

        // Clamp the output sample efficiently
        return outputSample > 0.95 ? 0.95 : (outputSample < -0.95 ? -0.95 : outputSample);
    }


    /**
     * Optimized conversion of Float32 chunk to Int16 format.
     * @param {Float32Array} float32Array - Input audio samples.
     */
    processChunk(float32Array) {
        const numSamples = float32Array.length;
        let currentBufferIndex = this.bufferWriteIndex; // Local variable for faster access

        for (let i = 0; i < numSamples; i++) {
            const processedSample = this.processSample(float32Array[i]);
            // Convert processed Float32 sample to Int16
            // Optimization: Direct calculation and clamping
            const int16Value = Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(processedSample * INT16_MAX)));

            // Check if buffer has space before writing
            if (currentBufferIndex < BUFFER_SIZE) {
                 this.buffer[currentBufferIndex++] = int16Value;
            } else {
                 // Buffer is full, send it and reset index
                 this.bufferWriteIndex = currentBufferIndex; // Update class member
                 this.sendAndClearBuffer();
                 this.buffer[0] = int16Value; // Start filling the new buffer
                 currentBufferIndex = 1;
            }
        }
         // Update the class member with the final index
         this.bufferWriteIndex = currentBufferIndex;

         // Send any remaining samples in the buffer *after* processing the whole chunk
         // This reduces the number of postMessage calls compared to sending every time the buffer fills mid-chunk
         this.sendAndClearBuffer();
    }
}

registerProcessor('audio-recorder-worklet', AudioProcessingWorklet);