import SettingsManager from '../settings/settings-manager.js';

// Create an instance of SettingsManager
const settingsManager = new SettingsManager();

// DOM elements object
const elements = {
    // Button elements
    refreshBtn: document.getElementById('refreshBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    micBtn: document.getElementById('micBtn'),

    // Text input elements
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),

    // Visualizer canvas
    visualizerCanvas: document.getElementById('visualizer')
};

/**
 * Ensure the agent is connected and initialized
 * @param {GeminiAgent} agent - The GeminiAgent instance
 * @returns {Promise<void>}
 */

const ensureAgentReady = async (agent) => {
    try {
        // Step 1: Check and establish connection if needed
        if (!agent.connected) {
            console.info('Connecting agent...');
            await agent.connect();
            
            // Give a small delay for connection to stabilize
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Step 2: Verify connection with retry logic
        let retries = 3;
        let connected = false;
        
        while (retries > 0 && !connected) {
            if (agent.client && agent.client.isConnected()) {
                connected = true;
                break;
            }
            
            console.debug(`Connection check failed, retries left: ${retries - 1}`);
            retries--;
            
            if (retries > 0) {
                // Wait a bit before retry
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Try to reconnect if still not connected
                if (!agent.connected) {
                    console.info('Retrying connection...');
                    await agent.connect();
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        if (!connected) {
            throw new Error('Failed to establish WebSocket connection after retries');
        }
        
        // Step 3: Initialize if needed
        if (!agent.initialized) {
            console.info('Initializing agent...');
            await agent.initialize();
        }
        
        console.debug('Agent is ready for use');
        
    } catch (error) {
        console.error('Error ensuring agent is ready:', error);
        throw error;
    }
};



export function setupEventListeners(agent){
   
    //micrphone toggle handler
    elements.micBtn.addEventListener('click',async()=>{
      try{
        console.debug('Mic button clicked, ensuring agent is ready...');
        await ensureAgentReady(agent);
        console.debug('Agent ready, toggling microphone...');
        await agent.toggleMic();
        elements.micBtn.classList.toggle('active');        
      }catch(error){
        console.error('Error toggling mic', error);
        elements.micBtn.classList.remove('active');
        
        // Show user-friendly error message
        if (error.message.includes('WebSocket connection')) {
          console.warn('WebSocket connection issue detected. Please check your internet connection and try refreshing the page.');
          // Optional: Show a user notification
          // You could add a toast/notification system here
        } else if (error.message.includes('Permission')) {
          console.warn('Microphone permission was denied. Please allow microphone access and try again.');
        } else {
          console.warn('An unexpected error occurred with the microphone. Please try again.');
        }
      }
        
    });


    //message sending handler
    const sendMessage = async() =>{
        try{
            await ensureAgentReady(agent);
            const text =elements.messageInput.value.trim();
            await agent.sendText(text);
            elements.messageInput.value = '';
        }catch(error){
            console.error('Error Sending Message',error);
        }};
    
        elements.sendBtn.addEventListener('click',sendMessage);
        elements.messageInput.addEventListener('keypress',(event)=>{
            if(event.key === 'Enter'){
                event.preventDefault();
                sendMessage();
            }
        });

        //refresh button handler
        elements.refreshBtn.addEventListener('click',async()=>{
            try{
                console.info('🔄 Starting refresh process...');
                
                // Disable refresh button during refresh to prevent multiple clicks
                elements.refreshBtn.disabled = true;
                elements.refreshBtn.textContent = 'Refreshing...';
                
                // Step 1: Stop any ongoing audio recording
                if (agent.audioRecorder && agent.audioRecorder.isRecording) {
                    console.info('🎤 Stopping audio recorder...');
                    await agent.audioRecorder.stop();
                }
                
                // Step 2: Stop audio playback and clear audio streamer
                if (agent.audioStreamer) {
                    console.info('🔊 Stopping audio playback and clearing audio streamer...');
                    agent.audioStreamer.stop();
                    agent.audioStreamer.clear(); // Clear any buffered audio
                }
                
                // Step 3: Clear audio visualizer
                if (agent.visualizer) {
                    console.info('📊 Clearing audio visualizer...');
                    agent.visualizer.clear();
                    agent.visualizer.stop();
                }
                
                // Step 4: Clear chat display
                if (agent.chatManager) {
                    console.info('💬 Clearing chat history...');
                    agent.chatManager.clear();
                }
                
                // Step 5: Disconnect WebSocket
                console.info('🔌 Disconnecting WebSocket...');
                if (agent.client && agent.client.isConnected()) {
                    agent.client.disconnect();
                }
                
                // Step 6: Wait a moment for cleanup
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Step 7: Reload current settings (in case they were changed)
                console.info('⚙️ Reloading settings...');
                settingsManager.loadSettings();
                
                // Log current settings for debugging
                const currentSettings = settingsManager.getSettings();
                console.debug('Current settings after reload:', currentSettings);
                
                // Step 8: Reconnect with fresh settings
                console.info('🔗 Reconnecting with current settings...');
                agent.connected = false;
                agent.initialized = false;
                
                // Reset UI states
                elements.micBtn.classList.remove('active');
                elements.messageInput.value = '';
                
                // Reconnect
                await ensureAgentReady(agent);
                
                console.info('✅ Refresh completed successfully!');
                
                // Show success message briefly
                elements.refreshBtn.textContent = 'Refreshed!';
                setTimeout(() => {
                    elements.refreshBtn.textContent = 'Refresh';
                }, 1000);
                
            } catch(error) {
                console.error('❌ Error during refresh:', error);
                elements.refreshBtn.textContent = 'Refresh Failed';
                setTimeout(() => {
                    elements.refreshBtn.textContent = 'Refresh';
                }, 2000);
            } finally {
                // Re-enable refresh button
                elements.refreshBtn.disabled = false;
            }
        });

     
        
}

// Initialize settings
settingsManager;


