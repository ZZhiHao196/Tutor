// Default settings structure
export const defaultSettings = {
    modelType: 'gemini-2.0-flash-exp',
    apiKey: '',
    temperature: 1.8,
    maxTokens: 256,
    topP: 0.95,
    topK: 64,
    systemInstructions: 'You are a helpful English tutor. Help the user practice English conversation.',
    
    // Voice settings
    voiceSpeed: 1.2,
    voiceType: 'Aoede',
    
    // Proxy configuration - crucial for handling CORS issues with API calls
    // This should point to your Cloudflare worker or other proxy that can forward requests
    chatApiProxyUrl: '', 
    
    // Domestic model settings
    useDomesticAPI: false,
    domesticApiKey: '',
    domesticModelType: 'ecnu-max', // Default ecnu-max model
    
    // This endpoint is used by the proxy server, not directly by client code
    domesticApiEndpoint: 'https://chat.ecnu.edu.cn/open/api/v1'
};

// Function to load settings from localStorage
export function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('appSettings');
        if (!savedSettings) {
            console.debug("No saved settings found, using defaults.");
            return { ...defaultSettings }; // Return a copy of defaults
        }
        const parsed = JSON.parse(savedSettings);
        // Merge with defaults to ensure all keys are present
        return { ...defaultSettings, ...parsed };
    } catch (error) {
        console.error('Error loading settings from localStorage:', error);
        return { ...defaultSettings }; // Return defaults on error
    }
}

// Function to save settings to localStorage
export function saveSettings(settings) {
    try {
        // Ensure all settings fields exist by merging with defaults
        const settingsToSave = { ...defaultSettings, ...settings };
        
        // Check for missing proxy URL - critical for browser-based API calls
        if (!settingsToSave.chatApiProxyUrl) {
            console.warn('⚠️ No proxy URL configured. API calls will likely fail due to CORS issues.');
            
            // Additional warnings about API keys
            if (!settingsToSave.apiKey && !settingsToSave.useDomesticAPI) {
                console.warn('No Gemini API key provided.');
            }
            if (settingsToSave.useDomesticAPI && !settingsToSave.domesticApiKey) {
                console.warn('Using Domestic API but no API key provided.');
            }
        }
        
        localStorage.setItem('appSettings', JSON.stringify(settingsToSave));
        console.debug("Settings saved to localStorage.");
        return true;
    } catch (error) {
        console.error('Error saving settings to localStorage:', error);
        return false;
    }
}
