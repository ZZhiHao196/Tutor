export const getWebsocketUrl=()=>{
    // Return only the base proxy URL, like in the successful backup project
    // The full path and API key will be constructed in client.js
    return 'wss://socket.zzhihao.sbs';
}

// Helper function to get settings from unified settings object or fallback to individual keys
const getSettingValue = (key, fallbackKey, defaultValue, parseFunction = null) => {
    // First try to get from unified settings
    const settings = localStorage.getItem('english-tutor-settings');
    if (settings) {
        try {
            const parsedSettings = JSON.parse(settings);
            if (parsedSettings[key] !== undefined) {
                const value = parsedSettings[key];
                return parseFunction ? parseFunction(value) : value;
            }
        } catch (error) {
            console.debug('Error parsing unified settings:', error);
        }
    }
    
    // Fallback to individual key in localStorage
    const fallbackValue = localStorage.getItem(fallbackKey || key);
    if (fallbackValue !== null) {
        return parseFunction ? parseFunction(fallbackValue) : fallbackValue;
    }
    
    // Return default value
    return defaultValue;
};

export const MODEL_SAMPLE_RATE = getSettingValue('sampleRate', 'sampleRate', 24000, parseInt);

export const getConfig = () => ({
    model: 'models/gemini-2.0-flash-exp',
    generationConfig: {
        temperature: getSettingValue('temperature', 'temperature', 1.8, parseFloat),
        top_p: getSettingValue('topP', 'top_p', 0.95, parseFloat),
        top_k: getSettingValue('topK', 'top_k', 65, parseInt),
        responseModalities: "audio",
        speechConfig: {
            voiceConfig: { 
                prebuiltVoiceConfig: { 
                    voiceName: getSettingValue('voiceType', 'voiceName', 'Aoede')
                }
            }
        }
    },
    systemInstruction: {
        parts: [{
            text: getSettingValue('systemInstructions', 'systemInstructions', "You are a helpful English tutor. Help the user practice English conversation.")
        }]
    },
});