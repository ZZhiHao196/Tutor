/**
 * 精简版工具函数 - 仅保留聊天所需功能
 */

/**
 * 将Blob对象转换为JSON
 * @param {Blob} blob - 要转换的Blob对象
 * @returns {Promise<Object>} 解析后的JSON对象
 */
export async function blobToJSON(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                console.debug('Blob读取成功，内容长度:', reader.result.length);
                // 如果结果为空，返回空对象
                if (!reader.result || reader.result.trim() === '') {
                    console.warn('Blob内容为空');
                    resolve({});
                    return;
                }
                
                // 打印部分内容以便调试
                const preview = reader.result.substring(0, 200) + 
                    (reader.result.length > 200 ? '...' : '');
                console.debug('Blob内容预览:', preview);
                
                const json = JSON.parse(reader.result);
                resolve(json);
            } catch (error) {
                console.error('无法解析Blob为JSON:', error);
                console.error('原始内容预览:', 
                    reader.result ? reader.result.substring(0, 500) : 'null');
                // 尝试提供一些有用的信息，而不是直接失败
                resolve({ 
                    error: {
                        message: `解析JSON失败: ${error.message}`,
                        rawData: reader.result ? reader.result.substring(0, 1000) : null
                    }
                });
            }
        };
        reader.onerror = () => {
            console.error('读取Blob失败:', reader.error);
            reject(new Error('无法读取Blob: ' + (reader.error || '未知错误')));
        };
        reader.readAsText(blob);
    });
}

/**
 * 将ArrayBuffer转换为base64字符串
 * @param {ArrayBuffer} buffer - 要转换的ArrayBuffer
 * @returns {string} base64字符串
 */
export function arrayBufferToBase64(buffer) {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary.push(String.fromCharCode(bytes[i]));
    }
    return btoa(binary.join(''));
}

/**
 * Base64 to Blob conversion (for audio playback)
 * @param {string} base64 - Base64 encoded string
 * @param {string} contentType - MIME type for the blob
 * @returns {Blob} Converted blob
 */
export function base64ToBlob(base64, contentType = '') {
    if (!base64) {
        console.warn("base64ToBlob received empty input");
        return new Blob([], { type: contentType });
    }
    try {
        const byteCharacters = atob(base64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);
            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }
        return new Blob(byteArrays, { type: contentType });
    } catch (error) {
        console.error("Error in base64ToBlob:", error);
        return new Blob([], { type: contentType });
    }
}

/**
 * Enhanced Base64 to Blob conversion with DataURI support for more reliable audio playback
 * @param {string} base64Data - Base64 encoded string or DataURI
 * @param {string} fallbackType - Fallback MIME type if not specified in DataURI
 * @returns {Object} An object with the blob and detected MIME type
 */
export function enhancedBase64ToBlob(base64Data, fallbackType = 'audio/mp3') {
    // FUNCTION REMOVED: USE ORIGINAL base64ToBlob FUNCTION INSTEAD
    // This is a placeholder to prevent any code that might still be using this function from crashing
    console.warn("enhancedBase64ToBlob is deprecated - using base64ToBlob instead");
    return { 
        blob: base64ToBlob(base64Data, fallbackType),
        mimeType: fallbackType
    };
}

/**
 * 生成随机ID
 * @param {number} length - ID长度
 * @returns {string} 随机ID
 */
export function generateId(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间(毫秒)
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, wait = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Format a date string
 * @param {string|Date} date - Date string or Date object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    const formatOptions = { ...defaultOptions, ...options };
    return dateObj.toLocaleDateString(undefined, formatOptions);
}

/**
 * Format time in milliseconds to minutes and seconds
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Extract vocabulary from text based on patterns
 * @param {string} text - Text to analyze
 * @returns {Array} Array of vocabulary objects
 */
export function extractVocabulary(text) {
    const vocabulary = [];
    
    // Match patterns like: **Word:** Definition **Example:** Example sentence
    const regex = /\*\*([^:]+):\*\*\s*([^*]+)(?:\*\*Example:\*\*\s*(.+?))?(?=\n\n|\n\*\*|$)/gi;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        vocabulary.push({
            term: match[1].trim(),
            definition: match[2].trim(),
            example: match[3] ? match[3].trim() : null
        });
    }
    
    return vocabulary;
}

/**
 * Store data in localStorage with expiration
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @param {number} expiryInMinutes - Expiration time in minutes
 */
export function storeWithExpiry(key, value, expiryInMinutes = 1440) { // Default: 1 day
    const now = new Date();
    const item = {
        value: value,
        expiry: now.getTime() + expiryInMinutes * 60 * 1000
    };
    localStorage.setItem(key, JSON.stringify(item));
}

/**
 * Get data from localStorage with expiration check
 * @param {string} key - Storage key
 * @returns {*} Stored value or null if expired
 */
export function getWithExpiry(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    
    const item = JSON.parse(itemStr);
    const now = new Date();
    
    if (now.getTime() > item.expiry) {
        localStorage.removeItem(key);
        return null;
    }
    
    return item.value;
}

/**
 * Calculate learning streak from array of dates
 * @param {Array} dates - Array of date strings
 * @returns {number} Streak count
 */
export function calculateStreak(dates) {
    if (!dates || dates.length === 0) return 0;
    
    // Convert strings to Date objects and sort descending
    const sortedDates = dates
        .map(dateStr => new Date(dateStr))
        .sort((a, b) => b - a);
    
    // Check if current streak is active (today or yesterday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const latestDate = new Date(sortedDates[0]);
    latestDate.setHours(0, 0, 0, 0);
    
    // If latest activity was before yesterday, streak is broken
    if (latestDate < yesterday) return 0;
    
    // Count consecutive days
    let streak = 1;
    let currentDate = latestDate;
    
    for (let i = 1; i < sortedDates.length; i++) {
        const nextDate = new Date(sortedDates[i]);
        nextDate.setHours(0, 0, 0, 0);
        
        const expectedPrevDate = new Date(currentDate);
        expectedPrevDate.setDate(expectedPrevDate.getDate() - 1);
        
        if (nextDate.getTime() === expectedPrevDate.getTime()) {
            streak++;
            currentDate = nextDate;
        } else {
            break;
        }
    }
    
    return streak;
}

// ---------------------------
// Modal Management Functions
// ---------------------------

/**
 * Show a save session modal
 * @param {Object} elements - UI elements object containing modal elements
 * @param {Object} state - Application state
 * @param {Function} onSave - Callback when Save button is clicked
 * @param {Function} onDontSave - Callback when Don't Save button is clicked
 */
export function showSaveModal(elements, state, onSave, onDontSave) {
    // Ensure backdrop and buttons exist
    if (!elements.saveModalBackdrop || !elements.modalSaveBtn || !elements.modalDontSaveBtn) {
        console.error("Modal elements not found in cache for showSaveModal.");
        // Fallback: Exit if modal cannot be shown correctly
        if (onDontSave) onDontSave();
        return;
    }

    const saveBtn = elements.modalSaveBtn;
    const dontSaveBtn = elements.modalDontSaveBtn;

    // Reset recommend class
    saveBtn.classList.remove('recommend');
    dontSaveBtn.classList.remove('recommend');

    // Set message and apply recommend class based on turn count
    if (elements.modalTurnCount) {
        elements.modalTurnCount.textContent = state.userTurnCount;
    }
    
    const modalMessage = document.getElementById('modal-message');
    if (modalMessage) {
        if (state.userTurnCount <= 2) {
            modalMessage.innerHTML = `This conversation is quite short (${state.userTurnCount} turns). Saving is optional.`;
            dontSaveBtn.classList.add('recommend'); // Recommend NOT saving
        } else {
            modalMessage.innerHTML = `Do you want to save this conversation (${state.userTurnCount} turns)?`;
            saveBtn.classList.add('recommend'); // Recommend saving
        }
    } else {
        console.error("'modal-message' element not found for modal text.");
    }

    // Add one-time event listeners for buttons
    if (onSave && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', async () => {
            console.log("Save button clicked");
            await onSave();
        });
        saveBtn.dataset.listenerAttached = true;
    }
    
    if (onDontSave && !dontSaveBtn.dataset.listenerAttached) {
        dontSaveBtn.addEventListener('click', () => {
            console.log("Don't Save button clicked");
            onDontSave();
        });
        dontSaveBtn.dataset.listenerAttached = true;
    }

    // Show the modal
    elements.saveModalBackdrop.style.display = 'flex';
    setTimeout(() => {
        elements.saveModalBackdrop.classList.add('visible');
    }, 10);
}

/**
 * Hide the save session modal
 * @param {Object} elements - UI elements object containing modal elements
 */
export function hideSaveModal(elements) {
    if (!elements.saveModalBackdrop) {
        console.error("Modal backdrop not found for hiding.");
        return;
    }
    
    elements.saveModalBackdrop.classList.remove('visible');
}

// ---------------------------
// Session Management Functions
// ---------------------------

/**
 * Create a session record for saving
 * @param {Object} state - Application state with session data
 * @param {string} type - Type of session ('text' or 'voice')
 * @param {Array} transcript - Transcript of the conversation (no longer stored in the record)
 * @param {string} summary - Summary of the session
 * @param {string|Object} feedback - Feedback on the user's language skills
 * @returns {Object} Session record
 */
export function createSessionRecord(state, type, transcript = [], summary = null, feedback = null) {
    if (!state.startTime) {
        console.warn("Cannot create session record, start time not recorded.");
        return null;
    }
    
    const endTime = new Date();
    const durationMinutes = Math.round((endTime - state.startTime) / (1000 * 60));
    
    // Generate a basic summary if none provided
    const recordSummary = summary || 
        `${type === 'text' ? 'Text' : 'Voice'} chat with ${state.userTurnCount} user turns.`;
    
    // Handle feedback which can be a string or an object with feedback and topicSummary
    let finalFeedback = null;
    
    if (feedback) {
        if (typeof feedback === 'string') {
            finalFeedback = feedback;
        } else if (typeof feedback === 'object' && feedback.feedback) {
            finalFeedback = feedback.feedback;
        }
    }
    
    return {
        date: state.startTime.toISOString(),
        duration: durationMinutes,
        type: type,
        turnCount: state.userTurnCount,
        summary: recordSummary,
        feedback: finalFeedback,
        apiType: state.apiType || 'unknown'
    };
}

// ---------------------------
// System Message Functions
// ---------------------------

/**
 * Display a system message
 * @param {string} message - Message text to display
 * @param {string} type - Message type ('info', 'error', 'recommend')
 * @param {HTMLElement|null} elementContainer - Container element to append/update messages
 * @param {string} className - Additional CSS class to apply
 * @returns {HTMLElement} The message element
 */
export function displaySystemMessage(message, type = 'info', elementContainer = null, className = '') {
    let messageElement;
    console.info(`System Message (${type}):`, message);
    
    // If no container is provided, check if a system message element already exists
    if (!elementContainer) {
        messageElement = document.querySelector('.system-status-message');
        if (!messageElement) {
            // Create message element if it doesn't exist
            messageElement = document.createElement('div');
            messageElement.className = `system-status-message ${className}`;
            document.body.appendChild(messageElement);
        }
    } else {
        messageElement = elementContainer;
    }
    
    // Update content and classes
    messageElement.textContent = message;
    messageElement.className = `system-status-message ${className} ${type}`;
    messageElement.style.display = message ? 'block' : 'none';
    
    return messageElement;
}

// ---------------------------
// Markdown Utilities
// ---------------------------

/**
 * Convert markdown to HTML
 * @param {string} markdown - Markdown text to convert
 * @returns {string} Converted HTML
 */
export function markdownToHtml(markdown) {
    if (!markdown) return '';
    
    // handle code blocks (```code```)
    markdown = markdown.replace(/```([\s\S]*?)```/g, (match, code) => {
        // Basic HTML escaping for code content
        const escapedCode = code
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        return `<pre><code>${escapedCode}</code></pre>`;
    });
    
    // handle inline code (`code`)
    markdown = markdown.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // handle bold (**text**)
    markdown = markdown.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // handle italic (*text*)
    markdown = markdown.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, '<em>$1</em>'); // Avoid **
    
    // handle headings (## Heading)
    markdown = markdown.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    markdown = markdown.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    markdown = markdown.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // handle list items (- item or * item)
    markdown = markdown.replace(/^\s*([-*]) (.*$)/gm, '<li>$2</li>');
    
    // wrap consecutive list items in ul tags
    markdown = markdown.replace(/^(<li>.*<\/li>\s*)+/gm, (match) => `<ul>${match}</ul>`);
    
    // handle links ([text](url))
    markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // handle paragraphs and line breaks
    const paragraphs = markdown.split('\n').map(line => line.trim()).filter(line => line).map(line => {
        // If line doesn't look like an HTML tag already processed, wrap in <p>
        if (!line.match(/^<(ul|li|h[1-3]|pre|code|strong|em|a)/)) {
             // Convert remaining newlines within a paragraph block to <br>
             return `<p>${line.replace(/\n/g, '<br>')}</p>`;
        }
        return line; // Keep already processed HTML lines
    }).join('\n'); // Join paragraphs with newline for potential later processing
    
    return paragraphs;
}