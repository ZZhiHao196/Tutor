// Import markdownToHtml utility
import { markdownToHtml } from '../utils/utils.js';

// DOM elements
const elements = {
    recordTypeFilter: document.getElementById('record-type'),
    dateFilter: document.getElementById('date-filter'),
    recordList: document.getElementById('record-list'),
    emptyState: document.getElementById('empty-state'),
    totalTime: document.getElementById('total-time'),
    totalSessions: document.getElementById('total-sessions'),
    progressChart: document.getElementById('progress-chart'),
    exportButton: document.getElementById('export-button'),
    downloadProgress: document.getElementById('download-progress'),
    avgSessionLength: document.getElementById('avg-session-length'),
    weeklyGoal: document.getElementById('weekly-goal'),
    goalProgress: document.getElementById('goal-progress'),
    learningStreak: document.getElementById('learning-streak')
};


// Sample data (in a real app, this would come from localStorage or a database)
const sampleRecords = [
    // This would be populated from localStorage or backend
];

// Tab switching functionality
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(button => {
        // Mark as initialized to avoid duplicate listeners
        button.dataset.initialized = 'true';
      
        button.addEventListener('click', (event) => {
            // Prevent default to ensure no unexpected behavior
            event.preventDefault();
            
            console.log(`Tab button clicked: ${button.textContent.trim()}`);
            
            // Remove active class from all tabs and buttons
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Add active class to clicked button and corresponding tab
            button.classList.add('active');
            const tabId = button.dataset.tab;
           
            const tabElement = document.getElementById(`${tabId}-tab`);
            if (tabElement) {
                tabElement.classList.add('active');
                console.log(`Successfully activated tab: ${tabId}-tab`);
            } else {
                console.error(`Tab element not found: ${tabId}-tab`);
                // Attempt to find tab by alternative means
                const tabElements = document.querySelectorAll('.tab-content');
                console.log(`Found ${tabElements.length} tab content elements`);
            }
        });
    });
}

// Initialize the page
function initialize() {
    // Set up tab switching
    setupTabSwitching();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load and display records
    loadRecords();
    
    // Update stats
    updateStats();
    
    // Generate learning progress chart
    generateProgressChart();
    
    console.log("Record page initialization complete.");
}

// Set up event listeners for filters and navigation
function setupEventListeners() {
    // Filter by record type
    if (elements.recordTypeFilter) {
        elements.recordTypeFilter.addEventListener('change', filterRecords);
    }
    
    // Filter by date
    if (elements.dateFilter) {
        // Set lang attribute to ensure consistent date format
        elements.dateFilter.setAttribute('lang', 'en');
        
        // Force locale for date picker (this helps with some browsers)
        if (navigator.language !== 'en-US') {
            try {
                // This helps normalize the date format in some browsers
                elements.dateFilter.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
            } catch (e) {
                console.warn('Could not enforce font for date picker:', e);
            }
        }
        
        elements.dateFilter.addEventListener('change', filterRecords);
    }
    
    // Export button for downloading study records
    if (elements.exportButton) {
        elements.exportButton.addEventListener('click', exportStudyData);
    }
    
    // Add click event for each record to expand/collapse details
    document.addEventListener('click', function(e) {
        if (e.target && e.target.closest('.record-item')) {
            const recordItem = e.target.closest('.record-item');
            
            // Skip if click was on expand button (handled separately)
            if (e.target.closest('.record-expand-btn')) {
                return;
            }
            
            // Measure width before expansion to maintain it
            const currentWidth = recordItem.offsetWidth;
            
            // Toggle expanded class
            recordItem.classList.toggle('expanded');
            
            // Set explicit width to prevent layout shifts
            recordItem.style.width = `${currentWidth}px`;
            
            // Update icon rotation if applicable
            const expandBtn = recordItem.querySelector('.record-expand-btn');
            if (expandBtn) {
                const svg = expandBtn.querySelector('svg');
                if (svg) {
                    svg.style.transform = recordItem.classList.contains('expanded') ? 'rotate(180deg)' : '';
                }
            }
        }
    });
}

// Load records from storage
function loadRecords() {
    // In a real app, this would load from localStorage or fetch from a server
    const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
    
    if (records.length === 0) {
        // Show empty state if no records
        if (elements.emptyState) {
            elements.emptyState.style.display = 'flex';
        }
    } else {
        // Hide empty state and display records
        if (elements.emptyState) {
            elements.emptyState.style.display = 'none';
        }
        displayRecords(records);
    }
}

// Display records in the UI
function displayRecords(records) {
    if (!elements.recordList) return;
    
    // Clear current list except for the empty state element
    const children = Array.from(elements.recordList.children);
    children.forEach(child => {
        if (child.id !== 'empty-state') {
            elements.recordList.removeChild(child);
        }
    });
    
    // Sort records by date (newest first)
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Add records to the list
    records.forEach(record => {
        const recordElement = createRecordElement(record);
        elements.recordList.appendChild(recordElement);
    });
}

// Create a record element
function createRecordElement(record) {
    const recordElement = document.createElement('div');
    recordElement.className = 'record-item';
    recordElement.dataset.type = record.type;
    recordElement.dataset.date = record.date;
    
    // Format the date for display
    const formattedDate = formatDate(record.date);
    
    // Create record content
    recordElement.innerHTML = `
        <div class="record-header">
            <div class="record-info">
                <div class="record-date">${formattedDate}</div>
                <div class="record-badges">
                    <span class="record-type-badge ${record.type}">${
                        record.type === 'voice' ? '语音对话' : '文字聊天'
                    }</span>
                    <span class="record-stat-badge">${record.duration} 分钟</span>
                </div>
            </div>
            <div class="record-actions">
                <button class="record-expand-btn" aria-label="Expand record">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 12L3 7H13L8 12Z" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="record-details">
            <div class="record-sections">
                <section class="record-section">
                    <h4 class="section-title">对话摘要</h4>
                    <p class="section-content">${
                        record.summary ? markdownToHtml(record.summary) : '暂无摘要内容'
                    }</p>
                </section>
                
                ${record.feedback ? `
                    <section class="record-section">
                        <h4 class="section-title">语言反馈</h4>
                        <div class="feedback-content">${markdownToHtml(record.feedback)}</div>
                    </section>` : ''
                }
            </div>
        </div>
    `;
    
    // Add listener for expand button within the function
    const expandBtn = recordElement.querySelector('.record-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', (e) => {
            // Prevent the event from propagating to avoid multiple toggles
            e.stopPropagation();
            
            // Measure width before expansion to maintain it
            const currentWidth = recordElement.offsetWidth;
            
            // Toggle expanded class
            recordElement.classList.toggle('expanded');
            
            // Set explicit width to prevent layout shifts
            recordElement.style.width = `${currentWidth}px`;
            
            // Update icon rotation
            const svg = expandBtn.querySelector('svg');
            if (svg) {
                svg.style.transform = recordElement.classList.contains('expanded') ? 'rotate(180deg)' : '';
            }
        });
    }
    
    return recordElement;
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    // Use en-US locale explicitly for consistent formatting
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Filter records based on selected filters
function filterRecords() {
    const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
    
    // Get filter values
    const typeFilter = elements.recordTypeFilter ? elements.recordTypeFilter.value : 'all';
    const dateFilter = elements.dateFilter ? elements.dateFilter.value : '';
    
    console.log('Filtering by date:', dateFilter);
    
    // Apply filters
    const filteredRecords = records.filter(record => {
        // Filter by type
        if (typeFilter !== 'all' && record.type !== typeFilter) {
            return false;
        }
        
        // Filter by date (compare only the date part)
        if (dateFilter) {
            const recordDate = new Date(record.date).toISOString().split('T')[0];
            console.log('Comparing dates:', recordDate, dateFilter);
            if (recordDate !== dateFilter) {
                return false;
            }
        }
        
        return true;
    });
    
    // Display filtered records
    displayRecords(filteredRecords);
}

// Update statistics
function updateStats() {
    const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
    
    if (records.length === 0) {
        updateUIStats({
            totalTime: 0,
            totalSessions: 0,
            avgSessionLength: 0,
            wordsPerSession: 0,
            weeklyGoalPercent: 0,
            learningStreak: 0
        });
        return;
    }
    
    // Calculate stats
    const stats = records.reduce((acc, record) => {
        acc.totalTime += record.duration || 0;
        acc.totalSessions++;
        
        // Track daily progress
        const recordDate = new Date(record.date).toISOString().split('T')[0];
        if (!acc.dailyProgress[recordDate]) {
            acc.dailyProgress[recordDate] = {
                duration: 0
            };
        }
        acc.dailyProgress[recordDate].duration += record.duration || 0;
        
        // Track days for streak calculation
        acc.activeDays.add(recordDate);
        
        return acc;
    }, { 
        totalTime: 0, 
        totalSessions: 0,
        dailyProgress: {},
        activeDays: new Set()
    });
    
    // Calculate average session length
    const avgSessionLength = stats.totalSessions > 0 ? 
        Math.round(stats.totalTime / stats.totalSessions) : 0;
    
    // Calculate weekly goal (assuming a goal of 5 sessions per week)
    const weeklyGoal = 5;
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday as start of week
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Count sessions this week
    const sessionsThisWeek = records.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= startOfWeek;
    }).length;
    
    const weeklyGoalPercent = Math.min(100, Math.round((sessionsThisWeek / weeklyGoal) * 100));
    
    // Calculate learning streak
    const learningStreak = calculateLearningStreak(Array.from(stats.activeDays));
    
    // Update UI with calculated stats
    updateUIStats({
        totalTime: stats.totalTime,
        totalSessions: stats.totalSessions,
        avgSessionLength,
        wordsPerSession: 0,
        weeklyGoalPercent,
        learningStreak
    });
    
    // Store for chart generation
    window.studyStats = {
        dailyProgress: stats.dailyProgress,
        totalTime: stats.totalTime
    };
}

// Update the UI with calculated stats
function updateUIStats(stats) {
    if (elements.totalTime) elements.totalTime.textContent = stats.totalTime;
    if (elements.totalSessions) elements.totalSessions.textContent = stats.totalSessions;
    
    // Performance metrics
    if (elements.avgSessionLength) elements.avgSessionLength.textContent = `${stats.avgSessionLength} min`;
    if (elements.weeklyGoal) elements.weeklyGoal.textContent = `${stats.weeklyGoalPercent}%`;
    if (elements.goalProgress) elements.goalProgress.style.width = `${stats.weeklyGoalPercent}%`;
    if (elements.learningStreak) elements.learningStreak.textContent = `${stats.learningStreak} days`;
}

// Calculate the current learning streak (consecutive days)
function calculateLearningStreak(activeDays) {
    if (activeDays.length === 0) return 0;
    
    // Sort dates in descending order (newest first)
    activeDays.sort((a, b) => new Date(b) - new Date(a));
    
    let streak = 1;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    // Check if user practiced today or yesterday to maintain streak
    const hasRecentActivity = activeDays.includes(today) || activeDays.includes(yesterdayStr);
    if (!hasRecentActivity) return 0;
    
    // Count consecutive days
    for (let i = 0; i < activeDays.length - 1; i++) {
        const currentDate = new Date(activeDays[i]);
        const nextDate = new Date(activeDays[i + 1]);
        
        // Calculate difference in days
        const diffDays = Math.round((currentDate - nextDate) / (1000 * 60 * 60 * 24));
        
        // If difference is 1 day, continue streak
        if (diffDays === 1) {
            streak++;
        } else {
            break;
        }
    }
    
    return streak;
}

// Generate vocabulary list
function generateVocabularyList() {
    if (!elements.vocabularyList) return;
    
    const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
    const allVocabulary = {};
    
    // Collect all vocabulary from records
    records.forEach(record => {
        if (record.vocabulary && Array.isArray(record.vocabulary)) {
            record.vocabulary.forEach(word => {
                const lowerTerm = word.term.toLowerCase();
                if (!allVocabulary[lowerTerm]) {
                    allVocabulary[lowerTerm] = {
                        term: word.term,
                        definition: word.definition,
                        example: word.example,
                        count: 0,
                        dates: []
                    };
                }
                allVocabulary[lowerTerm].count++;
                allVocabulary[lowerTerm].dates.push(record.date);
            });
        }
    });
    
    // Sort vocabulary by frequency
    const sortedVocabulary = Object.values(allVocabulary).sort((a, b) => b.count - a.count);
    
    // Generate HTML for vocabulary list
    elements.vocabularyList.innerHTML = `
        <h3>词汇列表 (${sortedVocabulary.length})</h3>
        <div class="vocabulary-search">
            <input type="text" id="vocabulary-search" placeholder="搜索词汇...">
        </div>
        <div class="vocabulary-items">
            ${sortedVocabulary.length > 0 ? 
                sortedVocabulary.map(word => `
                    <div class="vocabulary-item">
                        <div class="vocabulary-term">${word.term}</div>
                        <div class="vocabulary-definition">${word.definition}</div>
                        ${word.example ? `<div class="vocabulary-example">"${word.example}"</div>` : ''}
                        <div class="vocabulary-meta">
                            <span class="vocabulary-count">使用 ${word.count} 次</span>
                            <span class="vocabulary-first-seen">首次出现: ${formatDate(word.dates[0])}</span>
                        </div>
                    </div>
                `).join('') 
                : '<div class="empty-vocabulary">暂无已记录的词汇</div>'
            }
        </div>
    `;
    
    // Add search functionality
    const searchInput = document.getElementById('vocabulary-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const vocabularyItems = document.querySelectorAll('.vocabulary-item');
            
            vocabularyItems.forEach(item => {
                const term = item.querySelector('.vocabulary-term').textContent.toLowerCase();
                const definition = item.querySelector('.vocabulary-definition').textContent.toLowerCase();
                
                if (term.includes(searchTerm) || definition.includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
}

// Generate learning progress chart
function generateProgressChart() {
    if (!elements.progressChart) return;
    
    const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
    
    if (records.length === 0) {
        elements.progressChart.innerHTML = `
            <h3>Study Activity</h3>
            <div class="empty-chart">No study data available to display progress</div>
        `;
        return;
    }
    
    // Group records by date
    const recordsByDate = {};
    records.forEach(record => {
        const dateKey = new Date(record.date).toISOString().split('T')[0];
        if (!recordsByDate[dateKey]) {
            recordsByDate[dateKey] = {
                date: dateKey,
                duration: 0
            };
        }
        recordsByDate[dateKey].duration += record.duration || 0;
    });
    
    // Get last 7 days (or less if fewer days of data) - reduced from 14 to fit better in the side-by-side layout
    const sortedDates = Object.keys(recordsByDate).sort();
    const displayDates = sortedDates.slice(-7); // last 7 days with data
    
    // Create a chart visualization
    elements.progressChart.innerHTML = `
        <h3>Study Activity</h3>
        <div class="chart-legend">
            <div class="legend-item">
                <div class="color-box time-color"></div>
                <span>Study Time (minutes)</span>
            </div>
        </div>
        <div class="chart-container">
            <div class="chart-body">
                ${displayDates.map(date => {
                    const record = recordsByDate[date];
                    const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    
                    // Calculate heights (max height: 180px for better vertical space in side layout)
                    const maxDuration = Math.max(...displayDates.map(d => recordsByDate[d].duration));
                    
                    const timeHeight = maxDuration > 0 ? Math.max(4, (record.duration / maxDuration) * 180) : 0;
                    
                    return `
                        <div class="chart-column">
                            <div class="chart-bars">
                                <div class="time-bar" style="height: ${timeHeight}px;" title="${record.duration} minutes">
                                    <span class="bar-value">${record.duration}</span>
                                </div>
                            </div>
                            <div class="chart-label">${formattedDate}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Export study data as a JSON file
function exportStudyData() {
    if (!elements.exportButton || !elements.downloadProgress) return;
    
    try {
        const records = JSON.parse(localStorage.getItem('studyRecords')) || [];
        
        if (records.length === 0) {
            alert('暂无学习记录可导出');
            return;
        }
        
        // Create a downloadable JSON file
        const dataStr = JSON.stringify(records, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        // Create download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `中文学习记录_${new Date().toISOString().split('T')[0]}.json`;
        
        // Show progress
        elements.downloadProgress.style.display = 'block';
        elements.downloadProgress.textContent = '正在准备下载...';
        
        // Trigger download after a brief delay to show progress
        setTimeout(() => {
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
            
            elements.downloadProgress.textContent = '下载完成!';
            setTimeout(() => {
                elements.downloadProgress.style.display = 'none';
            }, 3000);
        }, 800);
    } catch (error) {
        console.error('导出学习数据失败: ', error);
        alert('导出学习数据失败: ' + error.message);
        elements.downloadProgress.style.display = 'none';
    }
}

// Add a new record
function addRecord(record) {
    try {
        // Validate record
        if (!record.date) record.date = new Date().toISOString();
        if (!record.type) throw new Error('Record type is required (voice or text)');
        if (!record.duration) record.duration = 0;

        // Get existing records
        const records = JSON.parse(localStorage.getItem('studyRecords')) || [];

        // Add the new record
        records.push(record);

        // Store back to localStorage
        localStorage.setItem('studyRecords', JSON.stringify(records));

        console.log('New record added:', record);

        // Reload and update UI if on the records page
        if (window.location.pathname.includes('record')) {
            loadRecords();
            updateStats();
            generateProgressChart();
        }

        return true;
    } catch (error) {
        console.error('Failed to add record:', error);
        return false;
    }
}

/**
 * Generate language feedback and topic summary for a conversation
 * @param {Array} messages - Array of message objects with role and text properties
 * @param {Function} apiCallFunction - Function to call the AI API with a prompt
 * @param {boolean} isConnected - Whether API connection is active
 * @param {boolean} isNoAudio - Whether to disable audio for generated feedback (default: false)
 * @returns {Object} Object containing topicSummary and feedback
 */
async function generateLanguageFeedback(messages, apiCallFunction, isConnected = true, isNoAudio = false) {
    // Only provide feedback if we have enough user messages
    const userMessages = messages.filter(msg => msg.role === 'user' || msg.speaker === 'user');
    if (userMessages.length < 2) {
        console.log("Not enough user messages to provide meaningful feedback");
        return {
            topicSummary: "This conversation was too brief for a meaningful summary.",
            feedback: "Please have a longer conversation to receive detailed feedback.",
            isNoAudio: isNoAudio
        };
    }
    
    try {
        // Extract user text from messages
        const userText = userMessages.map(msg => msg.text || msg.content || "").join("\n\n");
        
        // First, generate topic summary
        const summaryPrompt = `
Analyze the following user messages from an English learning conversation and provide a brief, concise summary (50-100 words) of the main topic discussed. 
Focus on what the conversation was about, not the language skills. Format as a simple paragraph without headings.

USER'S MESSAGES:
${userText}

FORMAT: Keep the summary brief and natural and well-structured, starting with an engaging intro.
`;

        // Next, create the language feedback prompt
        const feedbackPrompt = `
As an English tutor, analyze the following conversation snippets from a language learner and provide detailed feedback on these three dimensions:

USER'S MESSAGES:
${userText}

Please provide a constructive evaluation with specific examples on:

1. FLUENCY: Evaluate natural flow, sentence structures, and grammar patterns. Highlight strengths and areas for improvement.

2. VOCABULARY: Assess word choice, variety, and appropriateness. Note any particularly good word usage and suggest alternatives where appropriate.

3. CLARITY: Evaluate how effectively the user communicates ideas. Note strengths and identify any unclear expressions with refined versions.

For each dimension, include:
- Specific examples from the user's text
- Both strengths and areas to improve
- Refined examples that show improvements

FORMAT your response with clear headings and bullet points. Be encouraging but specific with your feedback.
`;

        // Call the API with both prompts
        let topicSummary, feedbackResponse;
        if (isConnected && apiCallFunction) {
            console.log("Generating topic summary...");
            topicSummary = await apiCallFunction(summaryPrompt);
            
            console.log("Generating language feedback...");
            feedbackResponse = await apiCallFunction(feedbackPrompt);
        } else {
            console.log("API not connected, using mock feedback");
            topicSummary = generateMockSummary(userText);
            feedbackResponse = generateMockFeedback(userText);
        }
        
        // Return both summary and feedback
        return {
            topicSummary,
            feedback: feedbackResponse,
            isNoAudio: isNoAudio
        };
    } catch (error) {
        console.error("Error generating language feedback:", error);
        return {
            topicSummary: "Could not generate conversation summary. Please check your API connection.",
            feedback: "Could not generate detailed feedback. Please check your API connection.",
            isNoAudio: isNoAudio
        };
    }
}

// Generate mock summary when API is not available
function generateMockSummary(userText) {
    return "We had an interesting conversation about daily routines and travel plans. You shared your interests in exploring new cultures and improving your language skills through practical conversations.";
}

// Generate mock feedback when API is not available
function generateMockFeedback(userText) {
    // Simple mock feedback for when the API isn't available
    return `
## Language Feedback

### FLUENCY
* **Strengths**: Good basic sentence structures and natural conversational flow.
* **Areas to Improve**: Watch for consistent verb tense usage.
* **Example**: Consider "I went to the store yesterday and bought some groceries" instead of mixing tenses.

### VOCABULARY
* **Strengths**: Good use of everyday vocabulary.
* **Areas to Improve**: Try incorporating more varied expressions.
* **Example**: Instead of "very good", try words like "excellent", "outstanding", or "remarkable".

### CLARITY
* **Strengths**: Main ideas are generally understandable.
* **Areas to Improve**: Some sentences could be more concise.
* **Example**: "I think that maybe we should possibly try to go" could be simplified to "Let's go".

Keep practicing! Your English is developing well.
`;
}

// Export functions for use in other modules
export { addRecord, generateLanguageFeedback }; 

// Initialize the application when imported as a module
// This ensures it runs when loaded in record.html
try {
    if (document.readyState === 'loading') {
        console.log("Document still loading, adding DOMContentLoaded listener");
        document.addEventListener('DOMContentLoaded', () => {
            console.log("DOMContentLoaded event fired from module export");
            initialize();
        });
    } else {
        console.log("Document already loaded, initializing immediately");
        initialize();
    }
} catch (error) {
    console.error("Error initializing record.js module:", error);
} 