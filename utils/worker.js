/**
 * Cloudflare Worker to proxy requests to the Google Gemini API and ECNU API.
 * It securely adds the appropriate API key and forwards requests based on the path.
 */

// --- Constants ---
const GOOGLE_API_HOST = 'generativelanguage.googleapis.com';
const ECNU_API_PATH = '/chat/completions'; // Specific path for ECNU chat
const GOOGLE_TTS_API_HOST = 'texttospeech.googleapis.com'; // Google Text-to-Speech API

// Define allowed origins. For production, replace '*' with your actual frontend domain(s).
const ALLOWED_ORIGIN = '*'; // Or restrict to 'http://127.0.0.1:5501', etc.

// --- Main Fetch Handler ---
export default {
    async fetch(request, env, ctx) {
        // --- Handle CORS Preflight Request ---
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        const url = new URL(request.url);

        // --- Route based on path ---
        try {
            if (url.pathname.startsWith('/proxy/gemini')) {
                console.log('Routing to Gemini handler...');
                return await handleGeminiRequest(request, env);
            } else if (url.pathname.startsWith('/proxy/ecnu')) {
                console.log('Routing to ECNU handler...');
                return await handleEcnuRequest(request, env);
            } else if (url.pathname.startsWith('/audio')) {
                console.log('Routing to Audio handler...');
                return await handleAudioRequest(request, env);
            } else {
                console.log(`Invalid path accessed: ${url.pathname}`);
                return addCorsHeaders(new Response('Invalid proxy path. Use /proxy/gemini, /proxy/ecnu, or /audio.', { status: 404 }));
            }
        } catch (error) {
            console.error('General Proxy Error:', error);
            // Ensure CORS headers even on unexpected errors
            return addCorsHeaders(new Response(`Proxy error: ${error.message}`, { status: 500 }));
        }
    },
};

// --- Gemini API Handler ---
async function handleGeminiRequest(request, env) {
    if (request.method !== 'POST') {
        return addCorsHeaders(new Response('Method Not Allowed for Gemini proxy', { status: 405 }));
    }

    // --- Get API Key from Secrets ---
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Worker Error: GEMINI_API_KEY secret not set.');
        return addCorsHeaders(new Response('Gemini API key not configured on proxy server.', { status: 500 }));
    }

    // --- Get Request Body ---
    const requestBody = await request.json();

    // --- Determine Target Model (extracted from request body for Gemini) ---
    // Model is defined in the URL for the actual Google API call
    const modelTypeMatch = request.url.match(/models\/([^:]+):generateContent/);
    // Fallback if model is not in URL (less likely with current frontend, but safer)
    const modelType = modelTypeMatch ? modelTypeMatch[1] : (requestBody?.generationConfig?.modelType || 'gemini-2.0-flash-exp'); 
    console.log(`Proxying Gemini request for model: ${modelType}`);

    // --- Construct Google API URL ---
    const googleApiUrl = `https://${GOOGLE_API_HOST}/v1beta/models/${modelType}:generateContent?key=${apiKey}`;
    console.log(`Forwarding Gemini request to: ${googleApiUrl.split('?')[0]}?key=...`);

    // --- Prepare Request to Google ---
    const googleRequestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody) // Forward the body structure from frontend
    };

    // --- Make the Request to Google ---
    const googleResponse = await fetch(googleApiUrl, googleRequestOptions);
    console.log(`Received response from Google, status: ${googleResponse.status}`);

    // --- Return Google's Response with CORS ---
    const response = new Response(googleResponse.body, {
        status: googleResponse.status,
        statusText: googleResponse.statusText,
        headers: googleResponse.headers
    });

    addCorsHeaders(response); // Add CORS headers
    return response;
}

// --- ECNU API Handler ---
async function handleEcnuRequest(request, env) {
    if (request.method !== 'POST') {
        return addCorsHeaders(new Response('Method Not Allowed for ECNU proxy', { status: 405 }));
    }

    try {
        // Get request body to extract the API key
        const requestBody = await request.json();
        
        // --- Extract the API Key from the request body ---
        // Use the one provided in the request, or fall back to environment variable
        const apiKey = requestBody.apiKey || env.ECNU_API_KEY;
        
        // Remove apiKey from the body before forwarding
        if (requestBody.apiKey) {
            delete requestBody.apiKey;
        }
        
        // --- Get the API Endpoint from environment ---
        const apiEndpointBase = env.ECNU_API_ENDPOINT; // e.g., 'https://chat.ecnu.edu.cn/open/api/v1'

        if (!apiKey) {
            console.error('Worker Error: ECNU API key not found in request or environment.');
            return addCorsHeaders(new Response('ECNU API key not provided in request and not configured on proxy server.', { status: 400 }));
        }

        if (!apiEndpointBase) {
            console.error('Worker Error: ECNU_API_ENDPOINT not set.');
            return addCorsHeaders(new Response('ECNU API endpoint not configured on proxy server.', { status: 500 }));
        }

        // --- Construct ECNU API URL ---
        // Ensure the base endpoint doesn't have a trailing slash before adding the path
        const ecnuApiUrl = `${apiEndpointBase.replace(/\/?$/, '')}${ECNU_API_PATH}`;
        console.log(`Forwarding ECNU request to: ${ecnuApiUrl}`);

        // --- Prepare Request to ECNU ---
        // Pass along the modified request body (without apiKey)
        const ecnuRequestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` // Add the Bearer token
            },
            body: JSON.stringify(requestBody) // Forward the cleaned body
        };

        // --- Make the Request to ECNU ---
        const ecnuResponse = await fetch(ecnuApiUrl, ecnuRequestOptions);
        console.log(`Received response from ECNU, status: ${ecnuResponse.status}`);

        // --- Return ECNU's Response with CORS ---
        // Important: Clone headers or create new ones, don't directly modify potentially immutable headers
        const responseHeaders = new Headers(ecnuResponse.headers);
        
        const response = new Response(ecnuResponse.body, {
            status: ecnuResponse.status,
            statusText: ecnuResponse.statusText,
            headers: responseHeaders // Use the mutable headers copy
        });

        addCorsHeaders(response); // Add CORS headers
        return response;
    } catch (error) {
        console.error('ECNU API proxy error:', error);
        return addCorsHeaders(new Response(`ECNU API proxy error: ${error.message}`, { status: 500 }));
    }
}

// --- Audio/Text-to-Speech Handler ---
async function handleAudioRequest(request, env) {
    if (request.method !== 'POST') {
        return addCorsHeaders(new Response('Method Not Allowed for Audio proxy', { status: 405 }));
    }

    try {
        // Get request body to extract text and API key
        const requestBody = await request.json();
        
        // Extract the text, voice, and API key from the request body
        const { text, voice, apiKey: requestApiKey } = requestBody;
        
        // Use the API key from the request or fall back to environment variable
        // Ensure this API key is enabled for Google Cloud Text-to-Speech API in your GCP project.
        const apiKey = requestApiKey || env.GEMINI_API_KEY; 
        
        if (!apiKey) {
            console.error('Worker Error: API key not found in request or environment for audio generation');
            return addCorsHeaders(new Response('API key not provided in request and not configured on proxy server', { status: 400 }));
        }
        
        if (!text) {
            return addCorsHeaders(new Response('Text parameter is required for text-to-speech', { status: 400 }));
        }
        
        // Map our voice names to Google's voice names
        // Gemini offers these voices: Aoede, Puck, Charon, Kore, Fenrir
        const voiceMap = {
            'Aoede': 'en-US-Neural2-F', // Female voice
            'Puck': 'en-US-Neural2-D',  // Male voice
            'Charon': 'en-US-Neural2-J', // Male voice 
            'Kore': 'en-US-Neural2-G',  // Female voice
            'Fenrir': 'en-US-Neural2-A',  // Male voice
          
        };
        
        // Get the Google voice name. These Neural2 voices are Google's premium, natural-sounding voices.
        // If the requested voice isn't in the map, or no voice is provided, default to a high-quality female Neural2 voice.
        const googleVoice = voiceMap[voice] || 'en-US-Neural2-F';
        
        // Prepare the request to Google's Text-to-Speech API
        const ttsUrl = `https://${GOOGLE_TTS_API_HOST}/v1/text:synthesize?key=${apiKey}`;
        
        const ttsRequestBody = {
            input: {
                text: text
            },
            voice: {
                languageCode: 'en-US',
                name: googleVoice
            },
            audioConfig: {
                audioEncoding: 'OGG_OPUS',
                speakingRate: requestBody.speakingRate || 1.0,
                pitch: 0.0
            }
        };
        
        console.log(`Sending TTS request to Google for text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        const ttsResponse = await fetch(ttsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ttsRequestBody)
        });
        
        if (!ttsResponse.ok) {
            console.error(`Google TTS API error: ${ttsResponse.status} ${ttsResponse.statusText}`);
            const errorText = await ttsResponse.text();
            console.error('TTS Error details:', errorText);
            return addCorsHeaders(new Response(`Text-to-speech error: ${ttsResponse.statusText}`, { 
                status: ttsResponse.status 
            }));
        }
        
        // Parse Google's response
        const ttsData = await ttsResponse.json();
        
        // Return the audio content with proper CORS headers
        return addCorsHeaders(new Response(JSON.stringify({ 
            audioContent: ttsData.audioContent 
        }), {
            headers: { 'Content-Type': 'application/json' }
        }));
    } catch (error) {
        console.error('Audio endpoint error:', error);
        return addCorsHeaders(new Response(`Audio proxy error: ${error.message}`, { status: 500 }));
    }
}

// --- CORS Helper Functions ---

/**
 * Handles CORS preflight (OPTIONS) requests.
 */
function handleOptions(request) {
    const headers = request.headers;
    if (
        headers.get('Origin') !== null &&
        headers.get('Access-Control-Request-Method') !== null &&
        headers.get('Access-Control-Request-Headers') !== null
    ) {
        // Handle CORS preflight requests.
        const respHeaders = new Headers({
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS', // Allow POST and OPTIONS
            'Access-Control-Allow-Headers': headers.get('Access-Control-Request-Headers'), // Reflect requested headers
            'Access-Control-Max-Age': '86400', // Cache preflight response for 1 day
        });
        console.log('Handling CORS Preflight request');
        return new Response(null, { status: 204, headers: respHeaders }); // 204 No Content
    } else {
        // Handle standard OPTIONS request.
        console.log('Handling standard OPTIONS request');
        const respHeaders = new Headers({ Allow: 'POST, OPTIONS' });
        return new Response(null, { status: 200, headers: respHeaders });
    }
}

/**
 * Adds necessary CORS headers to a Response object.
 * Modifies the response headers in place.
 * @param {Response} response - The Response object to modify.
 */
function addCorsHeaders(response) {
    // Ensure headers are mutable if they came from fetch response
    if (!response.headers) {
        response.headers = new Headers();
    }
    response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Allow common headers + Authorization
    // The function modifies the response object directly, no explicit return needed,
    // but returning it doesn't hurt and can be convenient.
    return response; 
}
