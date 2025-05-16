import { DEFAULT_SETTINGS } from '../settings.js'; // Import from the main settings file

// Default settings structure
// export const defaultSettings = { ... }; // REMOVED local defaultSettings

// Function to load settings from localStorage
export function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('appSettings');
        if (!savedSettings) {
            console.debug("No saved settings found, using defaults from settings.js.");
            return { ...DEFAULT_SETTINGS }; // Use imported DEFAULT_SETTINGS
        }
        const parsed = JSON.parse(savedSettings);
        // Merge with defaults to ensure all keys are present
        return { ...DEFAULT_SETTINGS, ...parsed }; // Use imported DEFAULT_SETTINGS
    } catch (error) {
        console.error('Error loading settings from localStorage:', error);
        return { ...DEFAULT_SETTINGS }; // Use imported DEFAULT_SETTINGS on error
    }
}

// Function to save settings to localStorage
export function saveSettings(settings) {
    try {
        // Ensure all settings fields exist by merging with defaults
        const settingsToSave = { ...DEFAULT_SETTINGS, ...settings }; // Use imported DEFAULT_SETTINGS
        
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
