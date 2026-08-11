/**
 * SIP.js WebRTC Client Module
 * Handles all SIP/WebRTC communication with Asterisk PJSIP server
 */

// Debug mode flag - set to false for production
const DEBUG = true;

/**
 * Logger utility for debug output
 */
function log(...args) {
    if (DEBUG) {
        console.log('[SoftPhone]', ...args);
    }
}

function logError(...args) {
    console.error('[SoftPhone ERROR]', ...args);
}

/**
 * SIPClient class - Manages SIP connection and calls using SIP.js
 */
class SIPClient {
    constructor() {
        this.userAgent = null;
        this.registerer = null;
        this.session = null;
        this.incomingSession = null;
        this.remoteAudioElement = null;
        this.isMuted = false;
        this.callStartTime = null;
        this.callTimerInterval = null;
        
        // Event callbacks
        this.onConnectionStateChanged = null;
        this.onRegistrationStateChanged = null;
        this.onIncomingCall = null;
        this.onCallAccepted = null;
        this.onCallTerminated = null;
        this.onCallFailed = null;
    }
    
    /**
     * Initialize and connect to SIP server
     * @param {Object} config - SIP configuration
     * @param {string} config.username - SIP username/extension
     * @param {string} config.password - SIP password
     * @param {string} config.domain - SIP domain/server
     * @param {string} config.wsUrl - WebSocket URL (wss://...)
     * @param {string} config.displayName - Optional display name
     */
    async connect(config) {
        try {
            log('Connecting to SIP server...', config.domain);
            
            if (this.onConnectionStateChanged) {
                this.onConnectionStateChanged('connecting');
            }
            
            // Create SIP UserAgent configuration
            const userAgentOptions = {
                uri: SIP.UserAgent.makeURI(`sip:${config.username}@${config.domain}`),
                transportOptions: {
                    server: config.wsUrl,
                    traceSip: DEBUG
                },
                authorizationUsername: config.username,
                authorizationPassword: config.password,
                displayName: config.displayName || config.username,
                
                // WebRTC specific options
                sessionDescriptionHandlerFactoryOptions: {
                    peerConnectionConfiguration: {
                        iceGatheringTimeout: 5000,
                        rtcpMuxPolicy: 'require',
                        bundlePolicy: 'max-bundle'
                    }
                },
                
                // Codec preferences for Asterisk compatibility
                sessionDescriptionHandlerFactory: SIP.Web.defaultSessionDescriptionHandlerFactory,
                
                // Contact options
                contactParams: {
                    transport: 'ws'
                },
                
                // Registration options
                register: true,
                registererOptions: {
                    expires: 300, // 5 minutes
                    retries: 3
                }
            };
            
            // Create the UserAgent
            this.userAgent = new SIP.UserAgent(userAgentOptions);
            
            // Set up event handlers
            this.userAgent.delegate = {
                onConnect: () => {
                    log('WebSocket connected');
                    if (this.onConnectionStateChanged) {
                        this.onConnectionStateChanged('connected');
                    }
                },
                onDisconnect: (error) => {
                    log('WebSocket disconnected', error ? error.message : '');
                    if (this.onConnectionStateChanged) {
                        this.onConnectionStateChanged('disconnected');
                    }
                },
                onInvite: (invitation) => {
                    log('Incoming call received');
                    this.handleIncomingCall(invitation);
                }
            };
            
            // Start the UserAgent
            await this.userAgent.start();
            log('UserAgent started successfully');
            
            return true;
        } catch (error) {
            logError('Failed to connect to SIP server:', error);
            throw error;
        }
    }
    
    /**
     * Register with SIP server
     */
    async register() {
        try {
            log('Registering with SIP server...');
            
            if (this.onRegistrationStateChanged) {
                this.onRegistrationStateChanged('registering');
            }
            
            // Create registerer
            this.registerer = new SIP.Registerer(this.userAgent);
            
            // Set up registration state handler
            this.registerer.stateChange.addListener((newState) => {
                log('Registration state changed:', SIP.RegistererState[newState]);
                
                switch (newState) {
                    case SIP.RegistererState.Registered:
                        log('Successfully registered');
                        if (this.onRegistrationStateChanged) {
                            this.onRegistrationStateChanged('registered');
                        }
                        break;
                        
                    case SIP.RegistererState.Unregistered:
                        log('Unregistered');
                        if (this.onRegistrationStateChanged) {
                            this.onRegistrationStateChanged('unregistered');
                        }
                        break;
                        
                    case SIP.RegistererState.Terminated:
                        log('Registration terminated');
                        if (this.onRegistrationStateChanged) {
                            this.onRegistrationStateChanged('terminated');
                        }
                        break;
                }
            });
            
            // Send REGISTER request
            const registerOptions = {
                requestDelegate: {
                    onReject: (response) => {
                        logError('Registration rejected:', response.statusCode, response.reasonPhrase);
                        if (this.onRegistrationStateChanged) {
                            this.onRegistrationStateChanged('rejected');
                        }
                    }
                }
            };
            
            await this.registerer.register(registerOptions);
            return true;
        } catch (error) {
            logError('Registration failed:', error);
            throw error;
        }
    }
    
    /**
     * Handle incoming call
     * @param {SIP.Invitation} invitation - Incoming SIP invitation
     */
    handleIncomingCall(invitation) {
        this.incomingSession = invitation;
        
        // Get caller information
        const callerId = invitation.remoteIdentity?.displayName || 
                        invitation.remoteIdentity?.uri?.user || 
                        'Unknown';
        
        log('Incoming call from:', callerId);
        
        // Set up call state handler
        invitation.stateChange.addListener((newState) => {
            log('Incoming call state:', SIP.SessionState[newState]);
            
            switch (newState) {
                case SIP.SessionState.Establishing:
                    // Call is being established
                    break;
                    
                case SIP.SessionState.Established:
                    log('Incoming call answered');
                    this.setupMediaSession(invitation);
                    if (this.onCallAccepted) {
                        this.onCallAccepted(invitation);
                    }
                    break;
                    
                case SIP.SessionState.Terminated:
                    log('Incoming call terminated');
                    this.cleanupCall();
                    if (this.onCallTerminated) {
                        this.onCallTerminated();
                    }
                    break;
            }
        });
        
        // Notify about incoming call
        if (this.onIncomingCall) {
            this.onIncomingCall(callerId, invitation);
        }
    }
    
    /**
     * Make an outgoing call
     * @param {string} number - Phone number or extension to call
     */
    async makeCall(number) {
        try {
            log('Making call to:', number);
            
            if (!this.userAgent || !this.userAgent.isConnected()) {
                throw new Error('Not connected to SIP server');
            }
            
            // Create target URI
            const target = SIP.UserAgent.makeURI(`sip:${number}@${this.userAgent.configuration.uri.host}`);
            
            if (!target) {
                throw new Error('Invalid target number');
            }
            
            // Create inviter options
            const inviterOptions = {
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: false
                    }
                }
            };
            
            // Create and send INVITE
            this.session = new SIP.Inviter(this.userAgent, target, inviterOptions);
            
            // Set up session state handler
            this.session.stateChange.addListener((newState) => {
                log('Outgoing call state:', SIP.SessionState[newState]);
                
                switch (newState) {
                    case SIP.SessionState.Establishing:
                        log('Call is establishing...');
                        break;
                        
                    case SIP.SessionState.Established:
                        log('Call established');
                        this.setupMediaSession(this.session);
                        if (this.onCallAccepted) {
                            this.onCallAccepted(this.session);
                        }
                        break;
                        
                    case SIP.SessionState.Terminated:
                        log('Call terminated');
                        this.cleanupCall();
                        if (this.onCallTerminated) {
                            this.onCallTerminated();
                        }
                        break;
                }
            });
            
            // Set up delegate for rejection handling
            this.session.delegate = {
                onReject: (response) => {
                    logError('Call rejected:', response?.statusCode, response?.reasonPhrase);
                    this.cleanupCall();
                    if (this.onCallFailed) {
                        this.onCallFailed(response?.reasonPhrase || 'Call rejected');
                    }
                },
                onCancel: () => {
                    log('Call cancelled');
                    this.cleanupCall();
                    if (this.onCallFailed) {
                        this.onCallFailed('Call cancelled');
                    }
                }
            };
            
            // Send INVITE
            await this.session.invite(inviterOptions);
            return true;
        } catch (error) {
            logError('Failed to make call:', error);
            throw error;
        }
    }
    
    /**
     * Answer incoming call
     */
    async answerCall() {
        try {
            if (!this.incomingSession) {
                throw new Error('No incoming call to answer');
            }
            
            log('Answering incoming call...');
            
            const answerOptions = {
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: false
                    }
                }
            };
            
            await this.incomingSession.accept(answerOptions);
            return true;
        } catch (error) {
            logError('Failed to answer call:', error);
            throw error;
        }
    }
    
    /**
     * Reject incoming call
     */
    async rejectCall() {
        try {
            if (!this.incomingSession) {
                throw new Error('No incoming call to reject');
            }
            
            log('Rejecting incoming call...');
            
            await this.incomingSession.reject();
            this.incomingSession = null;
            return true;
        } catch (error) {
            logError('Failed to reject call:', error);
            throw error;
        }
    }
    
    /**
     * Hangup current call
     */
    async hangupCall() {
        try {
            log('Hanging up call...');
            
            // Hangup active session
            if (this.session && this.session.state === SIP.SessionState.Established) {
                await this.session.bye();
            }
            
            // Reject incoming session if exists
            if (this.incomingSession) {
                await this.incomingSession.reject();
                this.incomingSession = null;
            }
            
            this.cleanupCall();
            return true;
        } catch (error) {
            logError('Failed to hangup:', error);
            throw error;
        }
    }
    
    /**
     * Set up media session for WebRTC
     * @param {SIP.Session} session - SIP session
     */
    setupMediaSession(session) {
        try {
            log('Setting up media session...');
            
            // Get the peer connection from session description handler
            const sdh = session.sessionDescriptionHandler;
            if (!sdh) {
                logError('No session description handler available');
                return;
            }
            
            const peerConnection = sdh.peerConnection;
            if (!peerConnection) {
                logError('No peer connection available');
                return;
            }
            
            // Find remote track and attach to audio element
            peerConnection.ontrack = (event) => {
                log('Remote track received:', event.track.kind);
                
                if (event.track.kind === 'audio' && this.remoteAudioElement) {
                    this.remoteAudioElement.srcObject = event.streams[0];
                    this.remoteAudioElement.play().catch(err => {
                        logError('Failed to play remote audio:', err);
                    });
                }
            };
            
            // Start call timer
            this.startCallTimer();
        } catch (error) {
            logError('Failed to setup media session:', error);
        }
    }
    
    /**
     * Toggle mute/unmute
     */
    toggleMute() {
        try {
            if (!this.session) {
                return false;
            }
            
            const sdh = this.session.sessionDescriptionHandler;
            if (!sdh) {
                return false;
            }
            
            const peerConnection = sdh.peerConnection;
            if (!peerConnection) {
                return false;
            }
            
            // Get local audio tracks
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
            
            if (sender && sender.track) {
                this.isMuted = !this.isMuted;
                sender.track.enabled = !this.isMuted;
                log('Mute toggled:', this.isMuted);
                return this.isMuted;
            }
            
            return false;
        } catch (error) {
            logError('Failed to toggle mute:', error);
            return false;
        }
    }
    
    /**
     * Send DTMF digit
     * @param {string} digit - DTMF digit (0-9, *, #)
     */
    sendDTMF(digit) {
        try {
            if (!this.session || this.session.state !== SIP.SessionState.Established) {
                logError('Cannot send DTMF - no active call');
                return false;
            }
            
            log('Sending DTMF:', digit);
            
            // Use INFO method for DTMF (RFC 6086)
            const dtmfEvent = {
                duration: 100,
                volume: 10
            };
            
            // Send DTMF using SIP INFO
            this.session.info({
                body: {
                    content: `Signal=${digit}\r\nDuration=${dtmfEvent.duration}`,
                    contentType: 'application/dtmf-relay'
                }
            });
            
            // Also try RFC 2833 via WebRTC if available
            const sdh = this.session.sessionDescriptionHandler;
            if (sdh) {
                const peerConnection = sdh.peerConnection;
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                
                if (sender && sender.track) {
                    // Note: Direct DTMF tone generation through WebRTC requires audio context
                    // This is handled by the browser's WebRTC implementation
                }
            }
            
            return true;
        } catch (error) {
            logError('Failed to send DTMF:', error);
            return false;
        }
    }
    
    /**
     * Start call timer
     */
    startCallTimer() {
        this.callStartTime = Date.now();
        
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
        }
        
        this.callTimerInterval = setInterval(() => {
            if (this.onCallTimerUpdate) {
                const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const seconds = (elapsed % 60).toString().padStart(2, '0');
                this.onCallTimerUpdate(`${minutes}:${seconds}`);
            }
        }, 1000);
    }
    
    /**
     * Stop call timer
     */
    stopCallTimer() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        this.callStartTime = null;
    }
    
    /**
     * Clean up call resources
     */
    cleanupCall() {
        log('Cleaning up call resources...');
        
        this.stopCallTimer();
        
        // Clean up session
        if (this.session) {
            this.session = null;
        }
        
        // Clean up incoming session
        if (this.incomingSession) {
            this.incomingSession = null;
        }
        
        // Reset mute state
        this.isMuted = false;
        
        // Clear remote audio
        if (this.remoteAudioElement) {
            this.remoteAudioElement.srcObject = null;
        }
    }
    
    /**
     * Disconnect from SIP server
     */
    async disconnect() {
        try {
            log('Disconnecting from SIP server...');
            
            // Unregister first
            if (this.registerer) {
                await this.registerer.unregister();
                this.registerer = null;
            }
            
            // Stop the UserAgent
            if (this.userAgent) {
                await this.userAgent.stop();
                this.userAgent = null;
            }
            
            // Clean up any active calls
            this.cleanupCall();
            
            log('Disconnected successfully');
            return true;
        } catch (error) {
            logError('Failed to disconnect:', error);
            throw error;
        }
    }
    
    /**
     * Check if connected to SIP server
     */
    isConnected() {
        return this.userAgent && this.userAgent.isConnected();
    }
    
    /**
     * Check if in a call
     */
    isInCall() {
        return this.session !== null || this.incomingSession !== null;
    }
}

// Export for use in app.js
window.SIPClient = SIPClient;
