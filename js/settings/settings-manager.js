import {settingsTemplate, generateSettingsHTML} from './settings-template.js';

class SettingsManager{

    constructor(){
        this.template = settingsTemplate;
        this.settings = {};
        this.elements = {};
        
        // Initialize everything
        this.generateAndInjectHTML();
        this.initializeElements();
        this.setupEventListeners();
        this.loadSettings();
    }
    
    //generate HTML from template and inject into DOM
    generateAndInjectHTML(){
        try {
            const settingsHTML = generateSettingsHTML(this.template);
            const container = document.querySelector('.app-container') || document.body;
            
            // Create temp div and inject HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = settingsHTML;
            
            while (tempDiv.firstChild) {
                container.appendChild(tempDiv.firstChild);
            }
            
            console.log('Settings HTML injected successfully');
        } catch (error) {
            console.error('Failed to generate settings HTML:', error);
        }
    }

    //initialize DOM elements references
    initializeElements(){
        try {
            // Get main elements
            this.elements.modal = document.getElementById('settings-modal');
            this.elements.settingsBtn = document.getElementById('settingsBtn');
            this.elements.closeBtn = document.getElementById('close-settings');
            this.elements.saveBtn = document.getElementById('save-settings');
            this.elements.form = document.getElementById('settings-form');
            
            // Get all form inputs from template
            this.template.modal.content.body.form.groups.forEach(group => {
                group.items.forEach(item => {
                    this.elements[item.id] = document.getElementById(item.id);
                });
            });
            
            console.log('Elements initialized:', Object.keys(this.elements).length, 'elements');
        } catch (error) {
            console.error('Failed to initialize elements:', error);
        }
    }

    //set up all event listeners
    setupEventListeners(){
        try {
            // Open/close modal
            if (this.elements.settingsBtn) {
                this.elements.settingsBtn.addEventListener('click', () => this.openModal());
            }
            
            if (this.elements.closeBtn) {
                this.elements.closeBtn.addEventListener('click', () => this.closeModal());
            }
            
            // Close on outside click
            if (this.elements.modal) {
                this.elements.modal.addEventListener('click', (e) => {
                    if (e.target === this.elements.modal) {
                        this.closeModal();
                    }
                });
            }
            
            // Save button
            if (this.elements.saveBtn) {
                this.elements.saveBtn.addEventListener('click', () => this.saveSettings());
            }
            
            // Range sliders update display
            document.querySelectorAll('input[type="range"]').forEach(range => {
                range.addEventListener('input', (e) => {
                    const display = e.target.parentElement.querySelector('.value-display');
                    if (display) display.textContent = e.target.value;
                });
            });
            
            // Speed options
            document.querySelectorAll('.speed-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    console.debug('Speed option clicked:', e.target.dataset.speed);
                    // Remove active from all speed options
                    document.querySelectorAll('.speed-option').forEach(opt => {
                        opt.classList.remove('active');
                    });
                    // Add active to clicked option
                    e.target.classList.add('active');
                    console.debug('Active class added to option:', e.target.dataset.speed);
                });
            });
            
            console.log('Event listeners setup complete');
        } catch (error) {
            console.error('Failed to setup event listeners:', error);
        }
    }

    //load settings from local storage or use defaults
    loadSettings(){
        try {
            const saved = localStorage.getItem('english-tutor-settings');
            this.settings = saved ? JSON.parse(saved) : {...this.template.defaults};
            
            // Also check for separately stored API key
            const apiKey = localStorage.getItem('apiKey');
            if (apiKey) {
                this.settings.apiKey = apiKey;
            }
            
            // Apply to standard form elements
            Object.keys(this.settings).forEach(key => {
                const elementId = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                const element = document.getElementById(elementId);
                if (element) {
                    element.value = this.settings[key];
                } else if (key !== 'voiceSpeed') {
                    // Only log missing elements if it's not voiceSpeed (which is commented out)
                    console.debug(`Element not found for key ${key} -> ${elementId}`);
                }
            });
            
            // Update range slider displays
            document.querySelectorAll('input[type="range"]').forEach(range => {
                const display = range.parentElement.querySelector('.value-display');
                if (display) display.textContent = range.value;
            });
            
            // Voice Speed functionality is commented out for future implementation
            // TODO: Implement voice speed selection in the future
            // const currentSpeed = this.settings.voiceSpeed || 1.0;
            // setTimeout(() => {
            //     const speedOptions = document.querySelectorAll('.speed-option');
            //     speedOptions.forEach(option => {
            //         option.classList.remove('active');
            //         if (parseFloat(option.dataset.speed) === currentSpeed) {
            //             option.classList.add('active');
            //         }
            //     });
            // }, 100);
            
            console.log('Settings loaded:', this.settings);
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.settings = {...this.template.defaults};
        }
    }

    //save settings
    saveSettings(){
        try {
            const newSettings = {};
            
            // Collect form values from standard form inputs
            this.template.modal.content.body.form.groups.forEach(group => {
                group.items.forEach(item => {
                    if (item.type === 'speed-options') {
                        // Voice Speed functionality is commented out for future implementation
                        // TODO: Implement voice speed selection in the future
                        // const activeSpeed = document.querySelector('.speed-option.active');
                        // if (activeSpeed) {
                        //     newSettings.voiceSpeed = parseFloat(activeSpeed.dataset.speed);
                        // } else {
                        //     newSettings.voiceSpeed = 1.0; // default
                        // }
                        console.debug('Voice speed functionality is temporarily disabled');
                    } else {
                        // Handle standard form inputs
                        const element = document.getElementById(item.id);
                        if (element) {
                            const key = item.id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                            
                            if (element.type === 'number' || element.type === 'range') {
                                newSettings[key] = parseFloat(element.value);
                            } else {
                                newSettings[key] = element.value;
                            }
                        }
                    }
                });
            });
            
            // Check if there are any changes from previous settings
            const oldSettings = this.settings || {};
            const hasChanges = this.hasSettingsChanged(oldSettings, newSettings);
            
            // Save to localStorage
            this.settings = newSettings;
            localStorage.setItem('english-tutor-settings', JSON.stringify(this.settings));
            
            // Also save API key separately for compatibility
            if (this.settings.apiKey) {
                localStorage.setItem('apiKey', this.settings.apiKey);
            }
            
            console.log('Settings saved:', this.settings);
            
            // Show appropriate notification
            if (hasChanges) {
                this.showNotification('Settings saved! Click refresh button to apply changes.');
            } else {
                this.showNotification('Settings saved successfully!');
            }
            
            this.elements.modal.classList.remove('active');
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings');
        }
    }
    
    // Check if settings have changed
    hasSettingsChanged(oldSettings, newSettings) {
        const importantKeys = ['voiceType', 'sampleRate', 'temperature', 'topP', 'topK', 'systemInstructions', 'modelType'];
        
        for (const key of importantKeys) {
            if (oldSettings[key] !== newSettings[key]) {
                console.debug(`Setting changed: ${key} from ${oldSettings[key]} to ${newSettings[key]}`);
                return true;
            }
        }
        return false;
    }

    // Simple helper functions
    openModal() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('active');
        }
    }

    closeModal() {
        if (this.elements.modal) {
            this.elements.modal.classList.remove('active');
        }
    }
    
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification show';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    // Get current settings for other components
    getSettings() {
        return {...this.settings};
    }
}

export default SettingsManager;