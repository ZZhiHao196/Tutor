// tutor/settings/settings.js

// Default settings
const DEFAULT_SETTINGS = {
    modelType: 'gemini-2.0-flash-exp',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 1024,
    voiceSpeed: 1.2,
    topP: 0.95,
    topK: 40,
    systemInstructions: 'You are a helpful English tutor. Help the user practice English conversation.',
    voiceType: 'Aoede',
    chatApiProxyUrl: '',
    useDomesticAPI: false,
    domesticApiKey: '',
    domesticApiEndpoint: 'https://chat.ecnu.edu.cn/open/api/v1',
    domesticModelType: 'ecnu-max'
};

/**
 * Settings service for managing application settings
 */
class SettingsService {
    constructor() {
        this._settings = { ...DEFAULT_SETTINGS };
        this._listeners = [];
        this.load();
        console.log("SettingsService Initialized.");
    }
    
    /**
     * Loads settings from localStorage
     */
    load() {
        try {
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                this._settings = { ...DEFAULT_SETTINGS, ...parsed };
            }
            console.debug("Settings loaded:", this._settings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this._settings = { ...DEFAULT_SETTINGS };
        }
    }
    
    /**
     * Saves settings to localStorage
     * @returns {boolean} Whether the save was successful
     */
    save() {
        try {
            localStorage.setItem('appSettings', JSON.stringify(this._settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }
    
    /**
     * Gets all settings
     * @returns {Object} Copy of settings
     */
    getSettings() {
        return { ...this._settings };
    }
    
    /**
     * Gets a specific setting
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Setting value
     */
    getSetting(key, defaultValue = undefined) {
        return this._settings.hasOwnProperty(key) ? this._settings[key] : defaultValue;
    }
    
    /**
     * Updates a setting
     * @param {string} key - Setting key
     * @param {*} value - New value
     * @returns {boolean} Whether update was successful
     */
    updateSetting(key, value) {
        if (this._settings[key] !== value) {
            this._settings[key] = value;
            const result = this.save();
            if (result) {
                this._notifyListeners({ key, value });
            }
            return result;
        }
        return false;
    }
    
    /**
     * Updates multiple settings at once
     * @param {Object} settings - Settings object with key/value pairs
     * @returns {boolean} Whether update was successful
     */
    updateSettings(settings) {
        let changed = false;
        
        Object.entries(settings).forEach(([key, value]) => {
            if (this._settings[key] !== value) {
                this._settings[key] = value;
                changed = true;
            }
        });
        
        if (changed) {
            return this.save();
        }
        
        return false;
    }
    
    /**
     * Add a settings change listener
     * @param {Function} listener - Callback function(key, value)
     */
    addListener(listener) {
        this._listeners.push(listener);
    }
    
    /**
     * Remove a settings change listener
     * @param {Function} listener - Callback to remove
     */
    removeListener(listener) {
        this._listeners = this._listeners.filter(l => l !== listener);
    }
    
    /**
     * Notify all listeners of a setting change
     * @param {Object} change - {key, value}
     * @private
     */
    _notifyListeners(change) {
        this._listeners.forEach(listener => {
            try {
                listener(change);
            } catch (error) {
                console.error('Error in settings listener:', error);
            }
        });
    }
}

// Create singleton instance
export const settingsService = new SettingsService();

// Initialize settings panel
export function initializeSettingsPanel() {
    try {
        const settings = settingsService.getSettings();
        const elements = {
            modelType: document.getElementById('model-type'),
            apiKey: document.getElementById('api-key'),
            temperature: document.getElementById('temperature'),
            maxTokens: document.getElementById('max-tokens'),
            voiceType: document.getElementById('voice-type'),
            topP: document.getElementById('top-p'),
            topK: document.getElementById('top-k'),
            systemInstructions: document.getElementById('system-instructions'),
            voiceSpeed: document.getElementById('voice-speed'),
            chatApiProxyUrl: document.getElementById('chat-api-proxy-url'),
            useDomesticAPI: document.getElementById('use-domestic-api'),
            domesticApiKey: document.getElementById('domestic-api-key'),
            domesticModelType: document.getElementById('domestic-model-type'),
            domesticApiEndpoint: document.getElementById('domestic-api-endpoint')
        };

        // Fill inputs using settings from the service
        Object.entries(elements).forEach(([key, element]) => {
            if (element) {
                const value = settings[key];
                if (element.type === 'range') {
                    element.value = value;
                    const display = element.nextElementSibling;
                    if (display) display.textContent = value;
                     if (key === 'voiceSpeed') {
                         element.min = 0.5;
                         element.max = 3.0;
                         element.step = 0.1;
                     }
                } else if (element.type === 'checkbox') {
                    element.checked = !!value;
                } else if (key === 'voiceType' && element.tagName === 'SELECT') {
                    element.value = value;
                } else if (key === 'domesticModelType' && element.tagName === 'SELECT') {
                    element.value = value;
                } else {
                    element.value = value || '';
                }
            }
        });

        // Update the display/hide logic for domestic API settings
        const toggleDomesticAPISection = () => {
            const useDomesticAPI = document.getElementById('use-domestic-api');
            const domesticAPISection = document.getElementById('domestic-api-section');
            
            if (useDomesticAPI && domesticAPISection) {
                domesticAPISection.style.display = useDomesticAPI.checked ? 'block' : 'none';
            }
        };

        // Initialize domestic API section visibility
        toggleDomesticAPISection();

        // Add toggle listener
        const useDomesticAPICheckbox = document.getElementById('use-domestic-api');
        if (useDomesticAPICheckbox) {
            useDomesticAPICheckbox.addEventListener('change', toggleDomesticAPISection);
        }

        // Range input listeners
        document.querySelectorAll('input[type="range"]').forEach(range => {
            range.addEventListener('input', (e) => {
                const display = e.target.nextElementSibling;
                if (display) {
                    display.textContent = e.target.value;
                }
            });
        });

        // Add a note about proxy requirement to proxy URL input
        const proxyUrlInput = document.getElementById('chat-api-proxy-url');
        if (proxyUrlInput) {
            // Add a label note if it doesn't already have one
            const note = proxyUrlInput.nextElementSibling;
            if (note && note.classList.contains('input-note')) {
                note.innerHTML = '<b>Required for ALL API access</b>. Use your Cloudflare worker URL (e.g., https://gemini-proxy.zzhihao.top)';
            }
        }

        // Save button listener
        const saveButton = document.getElementById('save-settings');
        if (saveButton) {
            saveButton.addEventListener('click', (e) => {
                // Prevent form submission if inside a form
                e.preventDefault();
                
                let settingsChanged = false;
                Object.entries(elements).forEach(([key, element]) => {
                    if (element) {
                        let newValue;
                         if (element.type === 'range' || element.type === 'number') {
                             newValue = parseFloat(element.value);
                         } else if (element.tagName === 'TEXTAREA') {
                             newValue = element.value.trim();
                         } else if (element.type === 'checkbox') {
                             newValue = element.checked;
                         } else {
                             newValue = element.value;
                         }
                        if (settingsService.getSetting(key) !== newValue) {
                           settingsService.updateSetting(key, newValue);
                           settingsChanged = true;
                        }
                    }
                });

                const activeSpeedOption = document.querySelector('.speed-option.active');
                if (activeSpeedOption) {
                    const newSpeed = parseFloat(activeSpeedOption.dataset.speed);
                     if (settingsService.getSetting('voiceSpeed') !== newSpeed) {
                        settingsService.updateSetting('voiceSpeed', newSpeed);
                        settingsChanged = true;
                     }
                }

                const modal = document.getElementById('settings-modal');
                if (modal) modal.style.display = 'none';

                // Check proxy configuration after saving
                const newSettings = settingsService.getSettings();
                if (!newSettings.chatApiProxyUrl) {
                    showNotification('⚠️ Warning: No proxy URL configured. API calls may fail!', 'warning');
                } else if (settingsChanged) {
                    showNotification('Settings saved successfully!');
                } else {
                    showNotification('No changes detected.');
                }
            });
        }
        
        // Prevent form submission
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                // Let the save button handler take care of saving
            });
        }
    } catch (error) {
        console.error('Error initializing settings panel:', error);
        showNotification('Error loading settings panel.', 'error');
    }
}

// Initialize voice speed options
export function initializeSpeedOptions() {
    try {
        const currentSpeed = settingsService.getSetting('voiceSpeed', 1.0);
        const speedOptions = document.querySelectorAll('.speed-option');

        speedOptions.forEach(option => {
            const speed = parseFloat(option.dataset.speed);
            if (speed === currentSpeed) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
             option.addEventListener('click', () => {
                 speedOptions.forEach(opt => opt.classList.remove('active'));
                 option.classList.add('active');
             });
        });
    } catch (error) {
        console.error('Error initializing speed options:', error);
    }
}

// Show notification
export function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// For backward compatibility
export const getCurrentSettings = () => settingsService.getSettings();
export const updateSetting = (key, value) => settingsService.updateSetting(key, value);
