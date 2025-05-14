import { settingsService } from '../settings/settings.js';     // Import the service instead

/**
 * Client for interacting with the Gemini 2.0 Flash Multimodal Live API via WebSockets.
 * 
 */

// Helper function to decode Base64 to Uint8Array
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

export class GeminiWebsocketClient extends EventTarget {
    /**
     * Creates a new GeminiWebsocketClient with the given configuration.
     * @param {string} name - Name for the websocket client.
     * @param {string} url - URL for the Gemini API that contains the API key.
     * @param {Object} config - Configuration object for the Gemini API.
     */
    constructor(name, url, config) {
        super();
        this.name = name || 'WebSocketClient';
        this.url = url;
        this.ws = null;
        this.config = config;
        this.isConnecting = false;
        this.connectionPromise = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5; // Increased from 3
        this.reconnectDelay = 1000; // Initial reconnect delay 1 second
        this.keepAliveInterval = null;
        this.lastMessageTime = 0;
        this.pingInterval = 30000; // 30 seconds
    }

    /**
     * Check if WebSocket is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Start the keep-alive ping mechanism
     * @private
     */
    startKeepAlive() {
        // Clear any existing interval
        this.stopKeepAlive();
        
        // Record initial message time
        this.lastMessageTime = Date.now();
        
        // Set up ping interval
        this.keepAliveInterval = setInterval(() => {
            // Skip if not connected
            if (!this.isConnected()) {
                console.debug(`${this.name} Keep-alive skipped - not connected`);
                return;
            }
            
            // Check if we've received messages recently
            const timeSinceLastMessage = Date.now() - this.lastMessageTime;
            
            // Send ping if we haven't received a message in a while
            if (timeSinceLastMessage > this.pingInterval) {
                console.debug(`${this.name} Sending keep-alive ping`);
                
                // Send a ping message as JSON
                try {
                    this.sendJSON({ ping: Date.now() });
                    this.lastMessageTime = Date.now(); // Reset timer after ping
                } catch (error) {
                    console.error(`${this.name} Error sending keep-alive:`, error);
                }
            }
        }, this.pingInterval);
        
        console.debug(`${this.name} Keep-alive mechanism started (interval: ${this.pingInterval}ms)`);
    }
    
    /**
     * Stop the keep-alive mechanism
     * @private
     */
    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            console.debug(`${this.name} Keep-alive mechanism stopped`);
        }
    }

    /**
     * Establishes a WebSocket connection and initializes the session with a configuration.
     * @returns {Promise} Resolves when the connection is established and setup is complete
     */
    async connect() {
        if (this.isConnected()) {
            console.debug(`${this.name} WebSocket already connected, no need to reconnect`);
            return this.connectionPromise || Promise.resolve();
        }

        if (this.isConnecting) {
            console.debug(`${this.name} WebSocket is connecting, waiting for connection to complete...`);
            return this.connectionPromise;
        }

        console.info(`🔗 ${this.name} Establishing WebSocket connection...`);
        this.isConnecting = true;
        this.connectionPromise = new Promise((resolve, reject) => {
            try {
               
                const apiKey = settingsService.getSetting('apiKey'); // Use the service
                
                if (!apiKey) {
                    throw new Error('API key not found in settings or localStorage for WebSocket connection');
                }
                
                // Extract model type from config
                const modelType = this.config?.model?.replace('models/', '') || 'gemini-2.0-flash-exp';
                console.debug(`${this.name} Using model type for WebSocket: ${modelType}`);
                
                // Get the base proxy URL from config
                const baseProxyUrl = this.url; // Provided by getWebsocketUrl() -> wss://socket.zzhihao.sbs
                
                // 所有模型目前都使用同一个WebSocket路径
                const googleWsPath = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
                console.debug(`${this.name} Using WebSocket path for model ${modelType}: ${googleWsPath}`);
                
                if (!baseProxyUrl || !baseProxyUrl.startsWith('wss://')) {
                    throw new Error(`Invalid base WebSocket URL provided: ${baseProxyUrl}`);
                }

                // Final URL for the WebSocket connection
                const targetWsUrl = `${baseProxyUrl}${googleWsPath}?key=${apiKey}`; 
                console.info(`${this.name} Connecting to WebSocket proxy for ${modelType}: ${targetWsUrl.split('?')[0]}?key=...`);

                const ws = new WebSocket(targetWsUrl); 
                this.ws = ws;
                ws.binaryType = 'arraybuffer';

                const connectionTimeout = setTimeout(() => {
                    if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) {
                        console.warn(`${this.name} WebSocket connection timeout after 10 seconds`);
                        ws.close();
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 10000); // 10 seconds connection timeout

                // Send setup message upon successful connection
                ws.addEventListener('open', () => {
                    console.info(`🔗 ${this.name} Successfully connected to WebSocket`);
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    this.reconnectAttempts = 0; // Reset reconnection counter
                    
                    // Start keep-alive mechanism
                    this.startKeepAlive();

                    // Configure
                    try {
                        console.debug(`${this.name} Sending configuration for model: ${this.config?.model}`);
                        this.sendJSON({ setup: this.config });
                        console.debug(`${this.name} Configuration sent successfully`);
                        resolve();
                    } catch (configError) {
                        console.error(`${this.name} Error sending configuration:`, configError);
                        this.disconnect();
                        reject(configError);
                    }
                });

                // Handle connection errors
                ws.addEventListener('error', (error) => {
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    const reason = error.reason || 'Unknown';
                    const message = `${this.name} Unable to connect to "${targetWsUrl.split('?')[0]}" for model ${modelType}. Reason: ${reason}`;
                    console.error(message, error);
                    this.tryReconnect(reject);
                });

                // Handle connection close
                ws.addEventListener('close', (event) => {
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    if (this.ws === ws) {
                        this.ws = null;
                        
                        // Stop keep-alive when connection closes
                        this.stopKeepAlive();
                        
                        // Log more details about close
                        const cleanClose = (event.code === 1000 || event.code === 1001);
                        const level = cleanClose ? 'info' : 'warn';
                        console[level](`${this.name} WebSocket connection closed, code: ${event.code}, reason: ${event.reason || 'No reason'}, wasClean: ${event.wasClean}`);
                        
                        // Trigger close event for upper layer application handling
                        this.dispatchEvent(new CustomEvent('disconnected', { detail: event }));
                        
                        // Try automatic reconnection for non-normal close
                        if (!cleanClose) {
                            this.tryReconnect(reject);
                        }
                    }
                });

                // Listen for incoming messages, handling Blob or ArrayBuffer binary streams
                ws.addEventListener('message', async (event) => {
                    // Update last message time for keep-alive
                    this.lastMessageTime = Date.now();
                    
                    let blob;
                    if (event.data instanceof Blob) {
                        blob = event.data;
                    } else if (event.data instanceof ArrayBuffer) {
                        // Convert ArrayBuffer to Blob for uniform processing
                        blob = new Blob([event.data]);
                    } else if (typeof event.data === 'string') {
                        // Handle text messages directly
                        try {
                            const jsonData = JSON.parse(event.data);
                            
                            // Handle ping responses
                            if (jsonData.pong) {
                                console.debug(`${this.name} Received pong from server`);
                                return;
                            }
                            
                            // Process normal text message
                            await this.receive(new Blob([event.data], { type: 'application/json' }));
                            return;
                        } catch (e) {
                            console.warn(`${this.name} Received non-JSON text message:`, event.data);
                            return;
                        }
                    } else {
                        console.error(`${this.name} Received unknown format message:`, event);
                        return;
                    }
                    await this.receive(blob);
                });
            } catch (error) {
                this.isConnecting = false;
                console.error(`${this.name} Error creating WebSocket:`, error);
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    /**
     * Try automatic reconnection
     * @param {Function} rejectPromise - Original Promise's reject function
     */
    async tryReconnect(rejectPromise) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn(`${this.name} Maximum reconnection attempts reached (${this.maxReconnectAttempts}), no further attempts`);
            this.dispatchEvent(new CustomEvent('reconnect_failed'));
            if (rejectPromise) rejectPromise(new Error('WebSocket reconnection failed'));
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        console.info(`${this.name} Will attempt reconnection #${this.reconnectAttempts} in ${delay}ms...`);
        
        // Trigger reconnection event
        this.dispatchEvent(new CustomEvent('reconnecting', {
            detail: { attempt: this.reconnectAttempts, delay }
        }));
        
        // Delayed reconnection
        setTimeout(async () => {
            try {
                // Check if we already reconnected during the delay
                if (this.isConnected()) {
                    console.debug(`${this.name} Already reconnected during delay, skipping reconnect attempt`);
                    return;
                }
                
                // Try to reconnect
                await this.connect();
                console.info(`${this.name} Reconnection successful!`);
                this.dispatchEvent(new CustomEvent('reconnected'));
            } catch (error) {
                console.error(`${this.name} Reconnection failed:`, error);
                // Don't call rejectPromise, let the reconnection mechanism continue working
            }
        }, delay);
    }

    /**
     * Closes the WebSocket connection
     */
    disconnect() {
        this.stopKeepAlive();
        
        if (this.ws) {
            try {
                this.ws.close(1000, "Normal closure");
            } catch (e) {
                console.error(`${this.name} Error closing WebSocket:`, e);
            }
            this.ws = null;
            this.isConnecting = false;
            this.connectionPromise = null;
            console.info(`${this.name} WebSocket connection disconnected`);
            
            // Trigger disconnection event
            this.dispatchEvent(new CustomEvent('disconnected'));
        }
    }

    /**
     * Processes incoming WebSocket messages.
     * Handles various response types.
     */
    async receive(blob) {
        try {
            // --- ADD RAW LOG ---
            console.debug(`${this.name} [client.js] Received raw message (type: ${blob.constructor.name}, size: ${blob.size})`);
            const rawText = await blob.text(); // Try to read as text first for debugging
            
            // Don't log enormous messages
            const shouldLog = blob.size < 10000;
            if (shouldLog) {
                console.log(`${this.name} [client.js] Received raw text content:`, rawText);
            } else {
                console.log(`${this.name} [client.js] Received large message (${blob.size} bytes, not logging content)`);
            }
            // --- END RAW LOG ---

            // Now try to parse as JSON
            let response;
            try {
                response = JSON.parse(rawText); // Use the text we already read
            } catch (jsonError) {
                console.error(`${this.name} Failed to parse message as JSON:`, jsonError);
                return;
            }

            // Check if response contains error information
            if (response.error) {
                console.error(`${this.name} Received error response:`, response.error);
                this.dispatchEvent(new CustomEvent('error', { detail: response.error }));
                return;
            }
            
            // Handle ping/pong
            if (response.ping) {
                console.debug(`${this.name} Received ping, sending pong`);
                this.sendJSON({ pong: Date.now() });
                return;
            }
            if (response.pong) {
                console.debug(`${this.name} Received pong response`);
                return;
            }
            
            // Process different response formats
            if (response.serverContent) {
                // WebSocket native format
                this.handleServerContent(response.serverContent);
            } else if (response.candidates) {
                // Direct API response format
                this.handleCandidates(response.candidates);
            } else if (response.text) {
                // Simplified format
                console.log(`${this.name} Received simplified format text:`, response.text);
                this.dispatchEvent(new CustomEvent('text', { detail: response.text }));
                this.dispatchEvent(new CustomEvent('turn_complete'));
            } else if (response.setupComplete) {
                // Handle setupComplete message format
                console.log(`${this.name} Received setupComplete message:`, response.setupComplete);
                this.dispatchEvent(new CustomEvent('setup_complete', { detail: response.setupComplete }));
            } else {
                console.warn(`${this.name} Unknown message format:`, response);
            }
        } catch (error) {
            console.error(`${this.name} Error processing message:`, error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
    }
    
    /**
     * Process server content format messages (Updated to handle audio-only parts and inlineData)
     * @param {Object} content - Server content object
     */
    handleServerContent(content) {
        let turnCompleteReceived = content.turnComplete === true;
        let hasText = false;
        let hasAudio = false;
        let combinedText = '';

        // Modified condition to accept both turn and modelTurn
        const modelTurn = content.modelTurn || content.turn;
        if (modelTurn && Array.isArray(modelTurn.parts)) {
            modelTurn.parts.forEach(part => {
                // Process text parts
                if (part.text) {
                    combinedText += part.text;
                    hasText = true;
                }
                
                // Process audio data (new format uses inlineData)
                if (part.inlineData && part.inlineData.mimeType?.startsWith('audio/')) {
                    const audioData = _base64ToUint8Array(part.inlineData.data);
                    if (audioData) {
                        console.debug(`${this.name} Received audio data (${audioData.length} bytes)`);
                        this.dispatchEvent(new CustomEvent('audio', { detail: part.inlineData.data }));
                        hasAudio = true;
                    }
                }
            });

            // Check modelTurn's own turnComplete
            if (modelTurn.turnComplete === true) {
                turnCompleteReceived = true;
            }
        }
        
        // Handle any text content
        if (hasText) {
            console.debug(`${this.name} Received text content: ${combinedText.substring(0, 100)}${combinedText.length > 100 ? '...' : ''}`);
            this.dispatchEvent(new CustomEvent('text', { detail: combinedText }));
        }
        
        // Handle turnComplete signal
        if (turnCompleteReceived) {
            console.debug(`${this.name} Received conversation turn completion signal`);
            this.dispatchEvent(new CustomEvent('turn_complete'));
        }
    }
    
    /**
     * Process candidate response format messages
     * @param {Array<Object>} candidates - List of candidate responses
     */
    handleCandidates(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            console.warn(`${this.name} Received candidates format is invalid or empty:`, candidates);
            return;
        }

        // Usually only care about the first candidate
        const candidate = candidates[0];
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            let combinedText = '';
            let hasAudio = false;

            candidate.content.parts.forEach(part => {
                if (part.text) {
                    combinedText += part.text;
                }
                // ---> Check for audioContent <----
                if (part.audioContent) {
                    const audioData = _base64ToUint8Array(part.audioContent);
                    if (audioData) {
                        console.debug(`${this.name} emitting audio chunk (${audioData.length} bytes)`);
                        this.dispatchEvent(new CustomEvent('audio', { detail: part.audioContent }));
                        hasAudio = true;
                    }
                }
                // ---> End audio check <----
            });

            if (combinedText) {
                 // Determine if it's a transcription or final text based on candidate's finishReason
                 if (candidate.finishReason && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED' && candidate.finishReason !== 'MAX_TOKENS') {
                     console.debug(`${this.name} Received final text (candidates):`, combinedText);
                     this.dispatchEvent(new CustomEvent('text', { detail: combinedText }));
                 } else {
                     console.debug(`${this.name} Received intermediate transcription (candidates):`, combinedText);
                     this.dispatchEvent(new CustomEvent('transcription', { detail: combinedText }));
                 }
            }

            // Determine if conversation turn has ended based on finishReason
            if (candidate.finishReason && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED') {
                 console.debug(`${this.name} emitting turn_complete (candidates, reason: ${candidate.finishReason})`);
                 this.dispatchEvent(new CustomEvent('turn_complete'));
            }

        } else {
            console.warn(`${this.name} Received unknown structure candidate content:`, candidate.content);
        }
    }

    /**
     * Sends a text message to the Gemini API.
     * 
     * @param {string} text - The text to send to Gemini.
     * @param {boolean} endOfTurn - If false model will wait for more input without sending a response.
     * @returns {Promise<boolean>} A promise that resolves with true if sent successfully, false otherwise.
     */
    async sendText(text, endOfTurn = true) {
        if (!this.isConnected()) {
            console.warn(`${this.name} WebSocket not connected before sending text, attempting to reconnect...`);
            try {
                await this.connect();
            } catch (connectError) {
                 console.error(`${this.name} Reconnect failed before sending text:`, connectError);
                 return false;
            }
            if (!this.isConnected()) {
                 console.error(`${this.name} Still not connected after attempting reconnect. Cannot send text.`);
                return false;
            }
        }

        const formattedText = { 
            clientContent: { 
                turns: [{
                    role: 'user', 
                    parts: { text: text }
                }], 
                turnComplete: endOfTurn 
            } 
        };

        const success = await this.sendJSON(formattedText);
        if(success) {
             console.debug(`${this.name} Sent text: ${text.substring(0,100)}${text.length > 100 ? '...' : ''}`);
        } else {
             console.warn(`${this.name} Failed to send JSON for text message.`);
        }
        return success;
    }

    /**
     * Sends a JSON object to the Gemini API.
     * Ensures connection before sending and handles potential reconnection attempts.
     * 
     * @param {Object} json - The JSON object to send.
     * @returns {Promise<boolean>} A promise that resolves with true if sent successfully, false otherwise.
     */
    async sendJSON(json) {        
        if (!this.isConnected()) {
            console.warn(`${this.name} WebSocket not connected, attempting to reconnect...`);
            try {
                await this.connect(); // Attempt to connect or wait for existing connection attempt
            } catch (connectError) {
                 console.error(`${this.name} Reconnect failed before sending JSON:`, connectError);
                 return false; // Indicate send failure
            }
            // Re-check connection after attempting to connect
            if (!this.isConnected()) {
                 console.error(`${this.name} Still not connected after attempting reconnect. Cannot send JSON.`);
                 return false; // Indicate send failure
            }
        }

        try {
            // Update last message timestamp since we're sending
            this.lastMessageTime = Date.now();
            
            const jsonString = JSON.stringify(json);
            
            // Only log non-ping messages
            if (!json.ping && !json.pong) {
                console.debug(`[client.js] Sending JSON via WebSocket:`, 
                    jsonString.substring(0, 200) + (jsonString.length > 200 ? '...' : ''));
            }
            
            this.ws.send(jsonString);
            return true; // Indicate send success
        } catch (error) {
            console.error(`${this.name} Failed to send JSON data:`, error);
            // Check if the error is due to the WebSocket being closed and attempt reconnect
            if (this.ws && (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED)) {
                console.warn(`${this.name} Send failed because WebSocket is closing/closed. Attempting reconnect.`);
                this.tryReconnect(); // Attempt background reconnect
            }
            // Don't re-throw here, return false to indicate failure
            return false;
        }
    }

    /**
     * Sends realtime audio data chunk using the JSON format with Base64 encoding.
     * @param {string} base64Audio - Base64-encoded audio data (PCM16)
     * @returns {Promise<boolean>} Whether the operation was successful
     */
    async sendRealtimeAudio(base64Audio) { // Parameter is now base64Audio (string)
        if (!this.isConnected()) {
            console.warn(`${this.name} WebSocket not connected before sending audio, attempting to reconnect...`);
             try {
                 await this.connect();
             } catch (connectError) {
                  console.error(`${this.name} Reconnect failed before sending audio:`, connectError);
                  return false;
             }
            if (!this.isConnected()) {
                 console.error(`${this.name} Still not connected after attempting reconnect. Cannot send audio.`);
                 return false;
            }
        }

        try {
            // --- REVERT: Send JSON structure with Base64 audio ---
            const data = {
                realtimeInput: {
                    mediaChunks: [{ mimeType: 'audio/pcm', data: base64Audio }]
                }
            };
            // Update last message timestamp since we're sending
            this.lastMessageTime = Date.now();
            
            // console.debug(`${this.name} Sending audio chunk as JSON (Base64 length: ${base64Audio.length})`); // Keep console less noisy
            const success = await this.sendJSON(data); // Use sendJSON to send the structured message
            return success;
            // --- END REVERT ---
        } catch (error) {
             console.error(`${this.name} Failed to send audio chunk:`, error);
             // Reconnect logic in sendJSON handles potential closure
             return false;
        }
    }

    /**
     * EventEmitter-like API for event handling
     * @param {string} eventName - Event name
     * @param {Function} callback - Callback function
     * @returns {GeminiWebsocketClient} this - Supports chaining
     */
    on(eventName, callback) {
        this.addEventListener(eventName, (event) => callback(event.detail));
        return this;
    }
} 