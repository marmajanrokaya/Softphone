/**
 * Web SoftPhone Application
 * Main application logic and UI handling
 */

// Debug mode flag
const DEBUG = true;

/**
 * Logger utility for debug output
 */
function log(...args) {
    if (DEBUG) {
        console.log('[App]', ...args);
    }
}

function logError(...args) {
    console.error('[App ERROR]', ...args);
}

/**
 * Call History Manager - Handles localStorage for recent calls
 */
class CallHistoryManager {
    constructor() {
        this.storageKey = 'softphone_call_history';
        this.maxEntries = 50;
    }
    
    /**
     * Add a call record to history
     * @param {Object} callData - Call information
     */
    addCall(callData) {
        const history = this.getHistory();
        
        const record = {
            id: Date.now().toString(),
            number: callData.number,
            type: callData.type, // 'incoming', 'outgoing'
            status: callData.status, // 'answered', 'missed', 'rejected'
            duration: callData.duration || 0,
            timestamp: Date.now()
        };
        
        // Add to beginning of array
        history.unshift(record);
        
        // Limit entries
        if (history.length > this.maxEntries) {
            history.pop();
        }
        
        localStorage.setItem(this.storageKey, JSON.stringify(history));
        log('Call history updated');
    }
    
    /**
     * Get call history
     * @returns {Array} Array of call records
     */
    getHistory() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            logError('Failed to load call history:', error);
            return [];
        }
    }
    
    /**
     * Clear all call history
     */
    clearHistory() {
        localStorage.removeItem(this.storageKey);
        log('Call history cleared');
    }
    
    /**
     * Format timestamp for display
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Formatted date/time string
     */
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        // Less than 1 minute
        if (diff < 60000) {
            return 'Just now';
        }
        
        // Less than 1 hour
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes} min ago`;
        }
        
        // Less than 24 hours
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        }
        
        // Otherwise show date
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    /**
     * Format duration for display
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration string
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

/**
 * Settings Manager - Handles localStorage for app settings
 */
class SettingsManager {
    constructor() {
        this.storageKey = 'softphone_settings';
    }
    
    /**
     * Save settings
     * @param {Object} settings - Settings object
     */
    save(settings) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(settings));
            log('Settings saved');
        } catch (error) {
            logError('Failed to save settings:', error);
        }
    }
    
    /**
     * Load settings
     * @returns {Object} Settings object
     */
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : this.getDefaultSettings();
        } catch (error) {
            logError('Failed to load settings:', error);
            return this.getDefaultSettings();
        }
    }
    
    /**
     * Get default settings
     * @returns {Object} Default settings
     */
    getDefaultSettings() {
        return {
            username: '',
            password: '',
            domain: '',
            wsUrl: '',
            displayName: '',
            autoReconnect: true
        };
    }
    
    /**
     * Clear settings (logout)
     */
    clear() {
        localStorage.removeItem(this.storageKey);
        log('Settings cleared');
    }
}

/**
 * Main Application Class
 */
class SoftPhoneApp {
    constructor() {
        this.sipClient = null;
        this.settingsManager = new SettingsManager();
        this.callHistoryManager = new CallHistoryManager();
        
        this.currentNumber = '';
        this.currentCallNumber = '';
        this.isMuted = false;
        this.isSpeakerOn = false;
        this.incomingCallerId = '';
        this.incomingCallStartTime = null;
        this.incomingCallTimerInterval = null;
        
        this.ringtoneElement = null;
        this.remoteAudioElement = null;
        
        this.init();
    }
    
    /**
     * Initialize the application
     */
    init() {
        log('Initializing SoftPhone application...');
        
        // Get DOM elements
        this.ringtoneElement = document.getElementById('ringtone');
        this.remoteAudioElement = document.getElementById('remote-audio');
        
        // Generate ringtone (simple beep pattern)
        this.generateRingtone();
        
        // Load saved settings
        this.loadSettingsToUI();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Check if already logged in
        const settings = this.settingsManager.load();
        if (settings.username && settings.password && settings.domain && settings.wsUrl) {
            log('Saved credentials found, ready to connect');
        }
        
        log('Application initialized');
    }
    
    /**
     * Generate a simple ringtone using Web Audio API
     */
    generateRingtone() {
        try {
            // Create a simple dual-tone ringtone
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create ringtone buffer (2 seconds loop)
            const sampleRate = audioContext.sampleRate;
            const duration = 2;
            const buffer = audioContext.createBuffer(2, sampleRate * duration, sampleRate);
            
            for (let channel = 0; channel < 2; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < sampleRate * duration; i++) {
                    const t = i / sampleRate;
                    // Ring pattern: 1 second on, 1 second off
                    if (t % 2 < 1) {
                        // Dual tone: 425 Hz + 450 Hz (standard ring tone)
                        data[i] = 0.3 * (Math.sin(2 * Math.PI * 425 * t) + Math.sin(2 * Math.PI * 450 * t));
                    } else {
                        data[i] = 0;
                    }
                }
            }
            
            // Store for later use
            this.ringtoneBuffer = buffer;
            this.audioContext = audioContext;
            
            log('Ringtone generated');
        } catch (error) {
            logError('Failed to generate ringtone:', error);
        }
    }
    
    /**
     * Play ringtone
     */
    playRingtone() {
        try {
            if (this.audioContext && this.ringtoneBuffer) {
                const source = this.audioContext.createBufferSource();
                source.buffer = this.ringtoneBuffer;
                source.loop = true;
                source.connect(this.audioContext.destination);
                source.start();
                this.ringtoneSource = source;
                log('Ringtone playing');
            }
        } catch (error) {
            logError('Failed to play ringtone:', error);
        }
    }
    
    /**
     * Stop ringtone
     */
    stopRingtone() {
        try {
            if (this.ringtoneSource) {
                this.ringtoneSource.stop();
                this.ringtoneSource = null;
                log('Ringtone stopped');
            }
        } catch (error) {
            logError('Failed to stop ringtone:', error);
        }
    }
    
    /**
     * Load settings to UI
     */
    loadSettingsToUI() {
        const settings = this.settingsManager.load();
        
        // Login form
        document.getElementById('sip-username').value = settings.username || '';
        document.getElementById('sip-password').value = settings.password || '';
        document.getElementById('sip-domain').value = settings.domain || '';
        document.getElementById('ws-url').value = settings.wsUrl || '';
        document.getElementById('display-name').value = settings.displayName || '';
        document.getElementById('auto-reconnect').checked = settings.autoReconnect !== false;
        
        // Settings form
        document.getElementById('set-sip-username').value = settings.username || '';
        document.getElementById('set-sip-password').value = settings.password || '';
        document.getElementById('set-sip-domain').value = settings.domain || '';
        document.getElementById('set-ws-url').value = settings.wsUrl || '';
        document.getElementById('set-display-name').value = settings.displayName || '';
        document.getElementById('set-auto-reconnect').checked = settings.autoReconnect !== false;
    }
    
    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
        
        // Settings form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveSettings();
        });
        
        // Dial pad buttons
        document.querySelectorAll('.dial-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const digit = btn.dataset.digit;
                this.appendDigit(digit);
            });
        });
        
        // DTMF buttons
        document.querySelectorAll('.dtmf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const digit = btn.dataset.digit;
                this.sendDTMF(digit);
            });
        });
        
        // Call button
        document.getElementById('call-btn').addEventListener('click', () => {
            this.makeCall();
        });
        
        // Clear button
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearNumber();
        });
        
        // Backspace button
        document.getElementById('backspace-btn').addEventListener('click', () => {
            this.backspace();
        });
        
        // End call button
        document.getElementById('end-call-btn').addEventListener('click', () => {
            this.hangupCall();
        });
        
        // Mute button
        document.getElementById('mute-btn').addEventListener('click', () => {
            this.toggleMute();
        });
        
        // Speaker button
        document.getElementById('speaker-btn').addEventListener('click', () => {
            this.toggleSpeaker();
        });
        
        // DTMF toggle button
        document.getElementById('dtmf-toggle-btn').addEventListener('click', () => {
            this.toggleDTMFPad();
        });
        
        // Accept call button
        document.getElementById('accept-call-btn').addEventListener('click', () => {
            this.answerCall();
        });
        
        // Reject call button
        document.getElementById('reject-call-btn').addEventListener('click', () => {
            this.rejectCall();
        });
        
        // Navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });
        
        // Settings modal
        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettingsModal();
        });
        
        document.getElementById('close-settings-btn').addEventListener('click', () => {
            this.hideSettingsModal();
        });
        
        document.querySelector('.modal-overlay').addEventListener('click', () => {
            this.hideSettingsModal();
        });
        
        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });
        
        // Clear history button
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            this.clearCallHistory();
        });
        
        // Call back button
        document.getElementById('call-back-btn').addEventListener('click', () => {
            this.showScreen('phone-screen');
        });
        
        // Keyboard support
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
        });
        
        // Recent calls list item click delegation
        document.getElementById('recent-calls-list').addEventListener('click', (e) => {
            const callItem = e.target.closest('.call-item');
            if (callItem) {
                const number = callItem.dataset.number;
                if (number) {
                    this.currentNumber = number;
                    this.updateNumberDisplay();
                    this.switchView('dialer');
                }
            }
        });
    }
    
    /**
     * Handle keyboard input
     * @param {KeyboardEvent} e - Keyboard event
     */
    handleKeyPress(e) {
        // Only handle keys when not in a modal
        if (document.getElementById('settings-modal').classList.contains('hidden') === false) {
            return;
        }
        
        const key = e.key;
        
        // Number keys and *, #
        if (/^[0-9*#]$/.test(key)) {
            e.preventDefault();
            this.appendDigit(key);
        }
        
        // Backspace
        if (key === 'Backspace') {
            e.preventDefault();
            this.backspace();
        }
        
        // Enter = Call
        if (key === 'Enter' && this.currentNumber) {
            e.preventDefault();
            this.makeCall();
        }
        
        // Escape = Hangup
        if (key === 'Escape') {
            e.preventDefault();
            if (this.sipClient && this.sipClient.isInCall()) {
                this.hangupCall();
            }
        }
    }
    
    /**
     * Append digit to current number
     * @param {string} digit - Digit to append
     */
    appendDigit(digit) {
        if (this.currentNumber.length < 20) {
            this.currentNumber += digit;
            this.updateNumberDisplay();
        }
    }
    
    /**
     * Remove last digit
     */
    backspace() {
        this.currentNumber = this.currentNumber.slice(0, -1);
        this.updateNumberDisplay();
    }
    
    /**
     * Clear number display
     */
    clearNumber() {
        this.currentNumber = '';
        this.updateNumberDisplay();
    }
    
    /**
     * Update number display
     */
    updateNumberDisplay() {
        const display = document.getElementById('number-display');
        display.value = this.currentNumber;
    }
    
    /**
     * Handle login/connect
     */
    async handleLogin() {
        const username = document.getElementById('sip-username').value.trim();
        const password = document.getElementById('sip-password').value;
        const domain = document.getElementById('sip-domain').value.trim();
        const wsUrl = document.getElementById('ws-url').value.trim();
        const displayName = document.getElementById('display-name').value.trim();
        const autoReconnect = document.getElementById('auto-reconnect').checked;
        
        if (!username || !password || !domain || !wsUrl) {
            this.showLoginStatus('Please fill in all required fields', 'error');
            return;
        }
        
        // Save settings
        this.settingsManager.save({
            username,
            password,
            domain,
            wsUrl,
            displayName,
            autoReconnect
        });
        
        try {
            // Create SIP client
            this.sipClient = new SIPClient();
            
            // Set up remote audio element reference
            this.sipClient.remoteAudioElement = this.remoteAudioElement;
            
            // Set up event handlers
            this.sipClient.onConnectionStateChanged = (state) => {
                this.updateConnectionStatus(state);
            };
            
            this.sipClient.onRegistrationStateChanged = (state) => {
                this.updateRegistrationStatus(state);
            };
            
            this.sipClient.onIncomingCall = (callerId, invitation) => {
                this.handleIncomingCall(callerId);
            };
            
            this.sipClient.onCallAccepted = (session) => {
                this.handleCallAccepted(session);
            };
            
            this.sipClient.onCallTerminated = () => {
                this.handleCallTerminated();
            };
            
            this.sipClient.onCallFailed = (reason) => {
                this.handleCallFailed(reason);
            };
            
            this.sipClient.onCallTimerUpdate = (time) => {
                this.updateCallTimer(time);
            };
            
            // Connect to SIP server
            await this.sipClient.connect({
                username,
                password,
                domain,
                wsUrl,
                displayName
            });
            
            // Register
            await this.sipClient.register();
            
            this.showLoginStatus('Connecting...', 'success');
        } catch (error) {
            logError('Login failed:', error);
            this.showLoginStatus(`Connection failed: ${error.message}`, 'error');
        }
    }
    
    /**
     * Show login status message
     * @param {string} message - Status message
     * @param {string} type - Message type (error/success)
     */
    showLoginStatus(message, type) {
        const statusEl = document.getElementById('login-status');
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
    }
    
    /**
     * Update connection status UI
     * @param {string} state - Connection state
     */
    updateConnectionStatus(state) {
        const indicator = document.getElementById('registration-status');
        const text = document.getElementById('status-text');
        
        switch (state) {
            case 'connecting':
                indicator.className = 'status-indicator connecting';
                text.textContent = 'Connecting...';
                break;
            case 'connected':
                indicator.className = 'status-indicator connecting';
                text.textContent = 'Connected';
                break;
            case 'disconnected':
                indicator.className = 'status-indicator disconnected';
                text.textContent = 'Disconnected';
                break;
        }
    }
    
    /**
     * Update registration status UI
     * @param {string} state - Registration state
     */
    updateRegistrationStatus(state) {
        const indicator = document.getElementById('registration-status');
        const text = document.getElementById('status-text');
        
        switch (state) {
            case 'registering':
                indicator.className = 'status-indicator connecting';
                text.textContent = 'Registering...';
                break;
            case 'registered':
                indicator.className = 'status-indicator registered';
                text.textContent = 'Registered';
                break;
            case 'unregistered':
            case 'terminated':
                indicator.className = 'status-indicator disconnected';
                text.textContent = 'Not Registered';
                break;
            case 'rejected':
                indicator.className = 'status-indicator disconnected';
                text.textContent = 'Registration Failed';
                break;
        }
    }
    
    /**
     * Make outgoing call
     */
    async makeCall() {
        if (!this.currentNumber) {
            return;
        }
        
        if (!this.sipClient || !this.sipClient.isConnected()) {
            alert('Not connected to SIP server');
            return;
        }
        
        try {
            this.currentCallNumber = this.currentNumber;
            
            // Show call screen
            document.getElementById('call-number').textContent = this.currentCallNumber;
            document.getElementById('call-status').textContent = 'Calling...';
            document.getElementById('call-timer').textContent = '00:00';
            this.showScreen('call-screen');
            
            // Make the call
            await this.sipClient.makeCall(this.currentCallNumber);
            
            // Add to call history (will be updated on answer)
            this.callHistoryManager.addCall({
                number: this.currentCallNumber,
                type: 'outgoing',
                status: 'answered',
                duration: 0
            });
        } catch (error) {
            logError('Call failed:', error);
            alert(`Call failed: ${error.message}`);
            this.showScreen('phone-screen');
        }
    }
    
    /**
     * Handle incoming call
     * @param {string} callerId - Caller ID
     */
    handleIncomingCall(callerId) {
        this.incomingCallerId = callerId;
        
        // Update incoming call screen
        document.getElementById('incoming-number').textContent = callerId;
        document.getElementById('incoming-timer').textContent = '';
        
        // Show incoming call screen
        this.showScreen('incoming-screen');
        
        // Play ringtone
        this.playRingtone();
    }
    
    /**
     * Answer incoming call
     */
    async answerCall() {
        try {
            await this.sipClient.answerCall();
            
            // Stop ringtone
            this.stopRingtone();
            
            // Update call history
            this.callHistoryManager.addCall({
                number: this.incomingCallerId,
                type: 'incoming',
                status: 'answered',
                duration: 0
            });
        } catch (error) {
            logError('Failed to answer call:', error);
            alert('Failed to answer call');
        }
    }
    
    /**
     * Reject incoming call
     */
    async rejectCall() {
        try {
            await this.sipClient.rejectCall();
            
            // Stop ringtone
            this.stopRingtone();
            
            // Update call history
            this.callHistoryManager.addCall({
                number: this.incomingCallerId,
                type: 'incoming',
                status: 'missed',
                duration: 0
            });
            
            // Return to phone screen
            this.showScreen('phone-screen');
        } catch (error) {
            logError('Failed to reject call:', error);
        }
    }
    
    /**
     * Handle call accepted (established)
     * @param {SIP.Session} session - SIP session
     */
    handleCallAccepted(session) {
        log('Call accepted/established');
        
        // Hide incoming screen if visible
        if (!document.getElementById('incoming-screen').classList.contains('hidden')) {
            this.stopRingtone();
        }
        
        // Update call screen
        document.getElementById('call-status').textContent = 'In Call';
        
        // Show appropriate screen
        if (document.getElementById('incoming-screen').classList.contains('hidden') === false) {
            document.getElementById('call-number').textContent = this.incomingCallerId;
            this.showScreen('call-screen');
        }
    }
    
    /**
     * Handle call terminated
     */
    handleCallTerminated() {
        log('Call terminated');
        
        // Stop ringtone if playing
        this.stopRingtone();
        
        // Update call history with final duration
        const duration = this.sipClient.callStartTime 
            ? Math.floor((Date.now() - this.sipClient.callStartTime) / 1000)
            : 0;
        
        // Update the most recent call entry
        const history = this.callHistoryManager.getHistory();
        if (history.length > 0) {
            history[0].duration = duration;
            localStorage.setItem('softphone_call_history', JSON.stringify(history));
        }
        
        // Return to phone screen after short delay
        setTimeout(() => {
            this.showScreen('phone-screen');
        }, 1000);
    }
    
    /**
     * Handle call failure
     * @param {string} reason - Failure reason
     */
    handleCallFailed(reason) {
        logError('Call failed:', reason);
        alert(`Call failed: ${reason}`);
        this.showScreen('phone-screen');
    }
    
    /**
     * Hangup current call
     */
    async hangupCall() {
        try {
            await this.sipClient.hangupCall();
            this.showScreen('phone-screen');
        } catch (error) {
            logError('Failed to hangup:', error);
            this.showScreen('phone-screen');
        }
    }
    
    /**
     * Toggle mute
     */
    toggleMute() {
        if (this.sipClient) {
            this.isMuted = this.sipClient.toggleMute();
            document.getElementById('mute-btn').classList.toggle('active', this.isMuted);
        }
    }
    
    /**
     * Toggle speaker (note: browser support varies)
     */
    toggleSpeaker() {
        this.isSpeakerOn = !this.isSpeakerOn;
        document.getElementById('speaker-btn').classList.toggle('active', this.isSpeakerOn);
        
        // Try to set audio output (only works in some browsers)
        if (this.remoteAudioElement && typeof this.remoteAudioElement.setSinkId === 'function') {
            // Would need to enumerate devices and select speaker
            log('Speaker toggle requested (browser support required)');
        }
    }
    
    /**
     * Toggle DTMF pad visibility
     */
    toggleDTMFPad() {
        const dtmfPad = document.getElementById('dtmf-pad');
        dtmfPad.classList.toggle('hidden');
        document.getElementById('dtmf-toggle-btn').classList.toggle('active', !dtmfPad.classList.contains('hidden'));
    }
    
    /**
     * Send DTMF digit
     * @param {string} digit - DTMF digit
     */
    sendDTMF(digit) {
        if (this.sipClient) {
            this.sipClient.sendDTMF(digit);
        }
    }
    
    /**
     * Update call timer display
     * @param {string} time - Formatted time string
     */
    updateCallTimer(time) {
        document.getElementById('call-timer').textContent = time;
    }
    
    /**
     * Switch main view (dialer/recent)
     * @param {string} view - View name
     */
    switchView(view) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        // Show/hide sections
        const dialerSection = document.getElementById('dialer-section');
        const recentSection = document.getElementById('recent-section');
        
        if (view === 'dialer') {
            dialerSection.classList.remove('hidden');
            recentSection.classList.add('hidden');
        } else if (view === 'recent') {
            dialerSection.classList.add('hidden');
            recentSection.classList.remove('hidden');
            this.renderCallHistory();
        }
    }
    
    /**
     * Render call history list
     */
    renderCallHistory() {
        const list = document.getElementById('recent-calls-list');
        const history = this.callHistoryManager.getHistory();
        
        if (history.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No recent calls</p>';
            return;
        }
        
        list.innerHTML = history.map(call => {
            const iconClass = call.type === 'incoming' ? 'incoming' : 'outgoing';
            const icon = call.status === 'missed' ? '📞' : (call.type === 'incoming' ? '📥' : '📤');
            const iconColorClass = call.status === 'missed' ? 'missed' : iconClass;
            
            return `
                <div class="call-item" data-number="${this.escapeHtml(call.number)}">
                    <span class="call-icon ${iconColorClass}">${icon}</span>
                    <div class="call-info">
                        <div class="call-number">${this.escapeHtml(call.number)}</div>
                        <div class="call-date">${this.callHistoryManager.formatTimestamp(call.timestamp)}</div>
                    </div>
                    <div class="call-duration">${call.duration > 0 ? this.callHistoryManager.formatDuration(call.duration) : ''}</div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Clear call history
     */
    clearCallHistory() {
        if (confirm('Are you sure you want to clear all call history?')) {
            this.callHistoryManager.clearHistory();
            this.renderCallHistory();
        }
    }
    
    /**
     * Show settings modal
     */
    showSettingsModal() {
        document.getElementById('settings-modal').classList.remove('hidden');
    }
    
    /**
     * Hide settings modal
     */
    hideSettingsModal() {
        document.getElementById('settings-modal').classList.add('hidden');
    }
    
    /**
     * Handle save settings
     */
    handleSaveSettings() {
        const settings = {
            username: document.getElementById('set-sip-username').value.trim(),
            password: document.getElementById('set-sip-password').value,
            domain: document.getElementById('set-sip-domain').value.trim(),
            wsUrl: document.getElementById('set-ws-url').value.trim(),
            displayName: document.getElementById('set-display-name').value.trim(),
            autoReconnect: document.getElementById('set-auto-reconnect').checked
        };
        
        this.settingsManager.save(settings);
        
        // Also update login form
        document.getElementById('sip-username').value = settings.username;
        document.getElementById('sip-password').value = settings.password;
        document.getElementById('sip-domain').value = settings.domain;
        document.getElementById('ws-url').value = settings.wsUrl;
        document.getElementById('display-name').value = settings.displayName;
        document.getElementById('auto-reconnect').checked = settings.autoReconnect;
        
        this.hideSettingsModal();
        alert('Settings saved successfully');
    }
    
    /**
     * Handle logout
     */
    async handleLogout() {
        try {
            // Disconnect SIP
            if (this.sipClient) {
                await this.sipClient.disconnect();
                this.sipClient = null;
            }
            
            // Clear settings
            this.settingsManager.clear();
            
            // Reset UI
            document.getElementById('sip-username').value = '';
            document.getElementById('sip-password').value = '';
            document.getElementById('sip-domain').value = '';
            document.getElementById('ws-url').value = '';
            document.getElementById('display-name').value = '';
            document.getElementById('auto-reconnect').checked = true;
            
            this.hideSettingsModal();
            this.updateConnectionStatus('disconnected');
            this.updateRegistrationStatus('terminated');
            
            this.showScreen('login-screen');
        } catch (error) {
            logError('Logout failed:', error);
        }
    }
    
    /**
     * Show specific screen
     * @param {string} screenId - Screen element ID
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        });
        
        const targetScreen = document.getElementById(screenId);
        targetScreen.classList.remove('hidden');
        targetScreen.classList.add('active');
    }
    
    /**
     * Escape HTML special characters
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.softPhoneApp = new SoftPhoneApp();
});
