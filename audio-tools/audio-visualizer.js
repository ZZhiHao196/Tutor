/**
 * AudioVisualizer creates a waveform visualization
 * using Web Audio API's AnalyserNode to process audio data in real-time.
 */
export class AudioVisualizer {
    constructor(audioContext, canvasId) {
        console.log("Creating AudioVisualizer for canvas:", canvasId);
        
        if (!audioContext) {
            throw new Error('AudioContext is required for AudioVisualizer');
        }
        
        this.audioContext = audioContext;
        this.canvas = document.getElementById(canvasId);
        
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        // Set up audio nodes
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 1024; // For detailed waveform
        this.analyser.smoothingTimeConstant = 0.85; // Increased smoothing
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
        
        // Visualization settings
        this.colors = {
            idle: '#2196F3', // Blue
            ai: '#9C27B0'    // Purple
        };
        this.currentColor = this.colors.idle;
        this.lineWidth = 2;
        
        // Animation
        this.isAnimating = false;
        this.animationId = null;
        this.currentMode = 'idle';
        
        // Initial setup
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        console.log("AudioVisualizer initialized successfully");
    }
    
    /**
     * Connects an audio node to the visualizer
     */
    connectSource(sourceNode) {
        try {
            console.log("Connecting source to visualizer analyzer");
            sourceNode.connect(this.analyser);
            return true;
        } catch (error) {
            console.error("Failed to connect source to visualizer:", error);
            return false;
        }
    }
    
    /**
     * Sets the visualization mode
     */
    setMode(mode) {
        console.log("Setting visualizer mode to:", mode);
        this.currentMode = mode;
        this.currentColor = this.colors[mode] || this.colors.idle;
    }
    
    /**
     * Visualizes the idle state (flat line)
     */
    visualizeIdle() {
        this.setMode('idle');
    }
    
    /**
     * Visualizes AI responding state
     */
    visualizeAIResponding() {
        this.setMode('ai');
    }
    
    /**
     * Starts the visualization animation
     */
    start(mode) {
        if (mode) {
            this.setMode(mode);
        }
        
        if (!this.isAnimating) {
            this.isAnimating = true;
            console.log("Starting visualizer animation, mode:", this.currentMode);
            this.draw();
        }
    }
    
    /**
     * Stops the visualization animation
     */
    stop() {
        this.isAnimating = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.clearCanvas();
    }
    
    /**
     * Clears the canvas
     */
    clearCanvas() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    /**
     * Handles canvas resize
     */
    resize() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        if (!container) {
            console.warn("Canvas parent element not found");
            return;
        }
        
        this.canvas.width = container.offsetWidth;
        this.canvas.height = container.offsetHeight;
        
        // Immediately redraw after resize
        if (this.isAnimating) {
            this.draw();
        } else {
            this.drawFlatLine(); // Draw a flat line when not animating
        }
    }
    
    /**
     * Draws a flat line
     */
    drawFlatLine() {
        if (!this.ctx || !this.canvas) return;
        
        this.clearCanvas();
        const centerY = this.canvas.height / 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.canvas.width, centerY);
        this.ctx.strokeStyle = this.colors.idle;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.stroke();
    }
    
    /**
     * Draws the visualization frame with actual audio data
     */
    draw = () => {
        if (!this.isAnimating || !this.ctx || !this.canvas) {
            return;
        }
        
        this.clearCanvas();
        
        // Get audio data from the analyzer
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerY = height / 2;
        
        // For idle mode, either draw flat line or very subtle variations
        if (this.currentMode === 'idle') {
            // Even in idle mode, we'll show audio data but with minimal amplitude
            const sliceWidth = width / this.bufferLength;
            let x = 0;
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, centerY);
            
            // Draw actual audio data but with reduced amplitude
            for (let i = 0; i < this.bufferLength; i++) {
                const v = this.dataArray[i] / 128.0; // Convert to range of 0-2
                const y = centerY + ((v - 1) * height * 0.05); // Reduced amplitude by 95%
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.ctx.strokeStyle = this.colors.idle;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.stroke();
        } else {
            // For AI mode, show full waveform
            const sliceWidth = width / this.bufferLength;
            let x = 0;
            
            this.ctx.beginPath();
            
            for (let i = 0; i < this.bufferLength; i++) {
                const v = this.dataArray[i] / 128.0;
                const y = centerY + ((v - 1) * height * 0.4); // Full amplitude
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
                
                x += sliceWidth;
            }
            
            this.ctx.strokeStyle = this.colors.ai;
            this.ctx.lineWidth = this.lineWidth;
            
            // Add glow effect for better visibility
            this.ctx.shadowBlur = 5;
            this.ctx.shadowColor = this.colors.ai;
            
            this.ctx.stroke();
            
            // Reset shadow for next frame
            this.ctx.shadowBlur = 0;
        }
        
        // Request next frame if still animating
        if (this.isAnimating) {
            this.animationId = requestAnimationFrame(this.draw);
        }
    }
    
    /**
     * Clean up resources and event listeners
     */
    cleanup() {
        this.stop();
        window.removeEventListener('resize', () => this.resize());
        if (this.analyser) {
            this.analyser.disconnect();
        }
        console.log("AudioVisualizer cleaned up");
    }
} 