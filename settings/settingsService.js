import { defaultSettings, loadSettings as loadFromStorage, saveSettings as saveToStorage } from './settingsUtils.js'; // We'll move utils here

class SettingsService {
    constructor() {
        // Initialize with defaults, then load saved settings
        this._settings = { ...defaultSettings };
        this.load();
        console.log("SettingsService Initialized.");
    }

    // Load settings from storage
    load() {
        try {
            const loaded = loadFromStorage(); // Use the utility function
            // Merge loaded settings with defaults to ensure all keys exist
            this._settings = { ...defaultSettings, ...loaded };
            console.debug("SettingsService: Settings loaded:", this._settings);
        } catch (error) {
            console.error("SettingsService: Error loading settings, using defaults.", error);
            // Fallback to defaults in case of error
            this._settings = { ...defaultSettings };
        }
    }

    // Get all current settings (returns a copy)
    getSettings() {
        return { ...this._settings };
    }

    // Get a specific setting value
    getSetting(key, defaultValue = undefined) {
        return this._settings.hasOwnProperty(key) ? this._settings[key] : defaultValue;
    }

    // Update a setting and save to storage
    updateSetting(key, value) {
        if (this._settings[key] !== value) {
            console.debug(`SettingsService: Updating setting '${key}' from`, this._settings[key], "to", value);
            this._settings[key] = value;
            try {
                saveToStorage(this._settings); // Use the utility function to save
                 // Optional: Add event emission here if other components need to react
                // this.emit('update', { key, value });
                return true;
            } catch (error) {
                console.error(`SettingsService: Error saving setting ${key}:`, error);
                return false;
            }
        }
        return false; // No change needed
    }
    
    // Check if proxy is configured (required for browser-based API access)
    isProxyConfigured() {
        return !!this._settings.chatApiProxyUrl;
    }
    
    // Check if Domestic API is enabled
    isDomesticAPIEnabled() {
        return this._settings.useDomesticAPI;
    }
    
    // Get current model type based on settings
    getCurrentModelType() {
        if (this.isDomesticAPIEnabled()) {
            return this._settings.domesticModelType || 'ecnu-max';
        }
        return this._settings.modelType || 'gemini-2.0-flash-exp';
    }
    
    // Get active API key based on current API type
    getActiveApiKey() {
        if (this.isDomesticAPIEnabled()) {
            return this._settings.domesticApiKey;
        }
        return this._settings.apiKey;
    }
}

// Create and export the single instance (singleton)
export const settingsService = new SettingsService();

// Ensure settings are loaded when the module is imported

