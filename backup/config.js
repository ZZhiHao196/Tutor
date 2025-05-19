import { settingsService } from '../settings/settings.js'; // Import service instance

// Get WebSocket URL
export const getWebsocketUrl = () => {

    return 'wss://socket.zzhihao.sbs'; // Default Gemini WebSocket endpoint (via proxy)
};

// Audio configuration
export const AUDIO_CONFIG = {
    get sampleRate() { return settingsService.getSetting('sampleRate', 22000); }, 
    maxRecordingDuration: 60000, // Maximum recording duration (ms)
};

// Audio sampling rate - ensure it matches model requirements
export const MODEL_SAMPLE_RATE = settingsService.getSetting('sampleRate', 22000); 

const thresholds = {
    0: "BLOCK_NONE",
    1: "BLOCK_ONLY_HIGH",
    2: "BLOCK_MEDIUM_AND_ABOVE",
    3: "BLOCK_LOW_AND_ABOVE"
};

// Get complete configuration
export const getConfig = (options = {}) => { // Add options parameter
    const { 
        forceGemini = false, 
        isTtsAgent = false, 
        isCallPage = window.location.pathname.includes('call') // Determine page context here
    } = options; // Destructure with default
    
    const settings = settingsService.getSettings(); // Use the service instance
    
    // Voice mapping (similar to worker.js for consistency)
    const voiceMap = {
        'Aoede': 'en-US-Neural2-F',    // Example Female
        'Puck': 'en-US-Neural2-D',     // Example Male
        'Charon': 'en-US-Neural2-J',
        'Kore': 'en-US-Neural2-G',
        'Fenrir': 'en-US-Neural2-A',
        // Add other mappings from your worker.js if needed
    };

    console.debug(`[Config] Getting config. forceGemini: ${forceGemini}, isTtsAgent: ${isTtsAgent}, isCallPage: ${isCallPage}, useDomesticAPI: ${settings.useDomesticAPI}`);

    // Determine which model type to use
    let modelToUse;
    if (forceGemini || isTtsAgent || isCallPage) {
        // For TTS, Call page, or explicit forcing, always use the Gemini model
        modelToUse = settings.modelType || DEFAULT_SETTINGS.modelType;
        
        // 确保用于通话和TTS的模型支持bidiGenerateContent
        if (forceGemini) {
            // 检查模型名称是否支持bidiGenerateContent（通过名称判断）
            const isTtsSupportedModel = 
                modelToUse.includes('-exp') || 
                modelToUse === 'gemini-2.0-flash-live-001' ||
                modelToUse === 'gemini-2.0-flash-live-preview-04-09';
                
            if (!isTtsSupportedModel) {
                console.warn(`[Config] Selected model ${modelToUse} does not support WebSocket bidirectional calls. Using gemini-2.0-flash-live-001 instead.`);
                modelToUse = 'gemini-2.0-flash-live-001'; // 使用最新支持的Live API模型
            }
        }
        
        console.debug(`[Config] Using Gemini model (forced/TTS/Call): ${modelToUse}`);
    } else {
        // For general chat, respect domestic setting
        modelToUse = settings.useDomesticAPI
            ? settings.domesticModelType || DEFAULT_SETTINGS.domesticModelType
            : settings.modelType || DEFAULT_SETTINGS.modelType;
        console.debug(`[Config] Using model based on context: ${modelToUse} (useDomesticAPI: ${settings.useDomesticAPI})`);
    }

    // Determine API service endpoints - Note: This section seems unused currently as endpoint isn't returned
    const apiEndpoints = {
        default: 'https://socket.zzhihao.sbs',  // Default Cloudflare Worker proxy
        alternate: 'https://generativelanguage.googleapis.com',  // Direct API call (requires proxy)
        local: 'http://localhost:8080'  // Local proxy (if available)
    };
    
    // Process model name - handle all variants of Gemini models
    let modelPath;
    if (modelToUse.startsWith('models/')) {
        modelPath = modelToUse; // Already has the prefix
    } else if (modelToUse.includes('gemini-')) {
        // Standard format for most Gemini models
        modelPath = 'models/' + modelToUse;
    } else {
        // Fallback for any other format (like domestic models)
        modelPath = modelToUse; // Don't add prefix for non-Gemini models
        console.debug(`[Config] Using non-prefixed model path: ${modelPath}`);
    }
    
    console.debug(`[Config] Using model path for API: ${modelPath} (from ${modelToUse})`);
    
    // 统一使用系统指令的格式 - 同时支持驼峰和蛇形命名
    const systemText = settings.systemInstructions || 
                    (isCallPage ? 
                        "You are an English language tutor helping the user practice speaking. Keep responses encouraging, concise and clear. Focus on fluency and pronunciation. Speak naturally as in a conversation." :
                        "You are a helpful assistant");
    
    // 修改基础配置，支持两种格式
    const config = {
        model: modelPath,
        generation_config: {
            temperature: parseFloat(settings.temperature) || DEFAULT_SETTINGS.temperature,
            top_p: parseFloat(settings.topP) || DEFAULT_SETTINGS.topP,
            top_k: parseInt(settings.topK) || DEFAULT_SETTINGS.topK, 
            max_output_tokens: parseInt(settings.maxTokens) || DEFAULT_SETTINGS.maxTokens,
        }
    };
    
    // 对于WebSocket API (isTtsAgent或forceGemini)使用 system_instruction
    // 对于普通API调用使用 systemInstruction
    if (isTtsAgent || forceGemini) {
        // (snake_case)
        config.system_instruction = {
            parts: [{
                text: systemText
            }]
        };
    } else {
        // (camelCase)
        config.systemInstruction = {
            parts: [{
                text: systemText
            }]
        };
    }
    
    // Only add tools if you actually have function declarations
    if (settings.useFunctions) {
        config.tools = [{
            function_declarations: []
        }];
    }
    
    // Add speech_config if it's the call page OR if specifically requested for a TTS agent
    // This ensures TTS agent gets the config regardless of the page it runs on.
    if (isCallPage || isTtsAgent) {
        console.debug("[Config] Call page or TTS Agent detected, adding speech_config.");
        // Ensure generation_config exists
        if (!config.generation_config) {
            config.generation_config = {};
        }
        // Get voice type from settings or use default voice
        const requestedVoiceType = settingsService.getSetting('voiceType') || 'Aoede';
        const googleVoiceName = voiceMap[requestedVoiceType] || voiceMap['Aoede']; // Fallback to default mapped voice
        
        console.log(`[!!! CONFIG !!!] Requested voice: "${requestedVoiceType}", Mapped to Google TTS voice_name: "${googleVoiceName}" for Live Agent.`);
        
        config.generation_config.response_modalities = ["AUDIO"];
        config.generation_config.speech_config = {
            "voice_config": {
                "prebuilt_voice_config": {
                    "voice_name": googleVoiceName // Use the mapped Google-specific voice name
                }
            },
            "language_code": "en-US"
        };
        
        console.debug("[Config] Added speech_config and response_modalities:", 
                     JSON.stringify({ 
                         speech_config: config.generation_config.speech_config, 
                         response_modalities: config.generation_config.response_modalities
                     }));
    }
    
    console.debug("[Config] Final config object:", JSON.stringify(config, null, 2));
    return config;
}; 

// Add DEFAULT_SETTINGS export or define it within this file if not already
const DEFAULT_SETTINGS = {
    modelType: 'gemini-2.0-flash-live-001', // 使用最新支持Live API的模型
    temperature: 0.7,
    maxTokens: 1024,
    voiceSpeed: 1.1,
    topP: 0.95,
    topK: 40,
    systemInstructions: 'You are a helpful English tutor. Help the user practice English conversation.',
    voiceType: 'Aoede', // Valid Gemini Live API voice (other options: Puck, Charon, Kore, Fenrir, Leda, Orus, Zephyr)
    chatApiProxyUrl: '' // Default empty, should be set by user
   
};

// Export default configuration
export default {
    getConfig,
    getWebsocketUrl,
    MODEL_SAMPLE_RATE,
    AUDIO_CONFIG
}; 