import { initializeSettingsPanel, initializeSpeedOptions, settingsService } from '../settings/settings.js'; // Keep UI functions

// DOM Elements
const elements = {
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings'),
    chatBtn: document.getElementById('chat-btn'),
    callBtn: document.getElementById('call-btn'),
    recordBtn: document.getElementById('record-btn')
};

// Initialize settings
function initialize() {
 
    // --- SettingsService initializes automatically on import ---
    console.log("Utils/Index: Initializing event listeners.");

    // 添加全局未处理的Promise错误处理
    window.addEventListener('unhandledrejection', function(event) {
        // 忽略特定错误 - 比如来自Chrome扩展的错误
        if (event.reason && event.reason.message && event.reason.message.includes('permission error')) {
            console.warn('忽略扩展相关权限错误:', event.reason);
            event.preventDefault(); // 阻止默认错误处理
            return;
        }
        
        // 处理其他类型的未捕获Promise错误
        console.error('未处理的Promise错误:', event.reason);
    });

    // Set up event listeners
    setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
    // Settings modal
    elements.settingsBtn.addEventListener('click', openSettingsModal);
    elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    window.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeSettingsModal();
        }
    });

    // Navigation buttons
    elements.chatBtn.addEventListener('click', () => {
        checkApiSettingsAndNavigate('chat');
    });

    elements.callBtn.addEventListener('click', () => {
        checkApiSettingsAndNavigate('call');
    });

    elements.recordBtn.addEventListener('click', () => {
        navigateTo('../pages/record.html');
    });
}

// Open settings modal
function openSettingsModal() {
    elements.settingsModal.style.display = 'block';
    // Initialize settings panel with current values
    initializeSettingsPanel();
    // Initialize speed options
    initializeSpeedOptions();
}

// Close settings modal
function closeSettingsModal() {
    elements.settingsModal.style.display = 'none';
}

// Navigate to a page
function navigateTo(path) {
    try {
        window.location.href = path;
    } catch (error) {
        console.error('导航失败:', error);
        alert('无法导航到所选页面');
    }
}

// Check API settings before navigating
function checkApiSettingsAndNavigate(pageType) {
    const settings = settingsService.getSettings();
    let apiKeyMissing = false;
    let missingApiType = "";
    let destinationPath = "";

    if (pageType === 'chat') {
        destinationPath = '../pages/chat.html';
        if (settings.useDomesticAPI) {
            if (!settings.domesticApiKey) {
                apiKeyMissing = true;
                missingApiType = "国内API (ECNU)";
            }
        } else {
            if (!settings.apiKey) {
                apiKeyMissing = true;
                missingApiType = "Gemini API";
            }
        }
    } else if (pageType === 'call') {
        destinationPath = '../pages/call.html';
        // Call page typically uses Gemini API for voice features
        if (!settings.apiKey) {
            apiKeyMissing = true;
            missingApiType = "Gemini API";
        }
    }

    if (apiKeyMissing) {
        alert(`请先在设置中配置 ${missingApiType} 密钥，然后才能使用此功能。您可以点击主页右上角的齿轮图标进行设置。`);
        openSettingsModal();
    } else {
        navigateTo(destinationPath);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);

// Update stats when visible
function updateStats() {
    // Here you would typically fetch real stats from storage
    // For now we'll just update the display with placeholder data
    
    // Get stats elements
    const studyTimeElement = document.querySelector('.stat-item:nth-child(1) .stat-value');
    const wordsLearnedElement = document.querySelector('.stat-item:nth-child(2) .stat-value');
    const accuracyElement = document.querySelector('.stat-item:nth-child(3) .stat-value');
    
    // Load stats from localStorage or use defaults
    const stats = JSON.parse(localStorage.getItem('studyStats')) || {
        studyTime: 120, // minutes
        wordsLearned: 250,
        accuracy: 85 // percentage
    };
    
    // Update display
    if (studyTimeElement) studyTimeElement.textContent = `${stats.studyTime} minutes`;
    if (wordsLearnedElement) wordsLearnedElement.textContent = stats.wordsLearned;
    if (accuracyElement) accuracyElement.textContent = `${stats.accuracy}%`;
}

// Update stats on page load
document.addEventListener('DOMContentLoaded', updateStats);

// Export functions for potential use in other modules
export { initialize, openSettingsModal, closeSettingsModal }; 