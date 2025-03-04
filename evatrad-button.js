// --------------------- Classe EvatradUI --------------------- //
class EvatradUI {
    constructor() {
        // Récupération du modal
        this.modalElement = document.getElementById('evatradCallModal');
        if (this.modalElement) {
            this.modal = new bootstrap.Modal(this.modalElement);
            this.callStatus = this.modalElement.querySelector('#callStatus');
            this.myTranscription = this.modalElement.querySelector('#myTranscription');
            this.otherTranscription = this.modalElement.querySelector('#otherTranscription');
            this.endCallButton = this.modalElement.querySelector('#endCallButton');
        }

        // Performance tracking
        this.metrics = {
            audioLatency: [],
            processingTimes: [],
            networkLatency: []
        };

        // Gestion audio TTS (Receiver → Caller) sous forme de queue
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.currentSource = null;
        this.audioContext = null;
        
        // Audio buffer cache - improved with expiration
        this.audioBufferCache = new Map();
        this.audioBufferCacheMaxSize = 100; // Limit cache size
        
        // Initialize audio context early to avoid iOS delays
        this.ensureAudioContextInitialized();
        
        // Pre-warm audio context to avoid startup delays
        this.preWarmAudioContext();
        
        // Set up Web Worker for audio decoding
        this.setupAudioDecoder();

        this.onEndCallClick = null;
        if (this.endCallButton) {
            this.endCallButton.addEventListener('click', () => {
                if (typeof this.onEndCallClick === 'function') {
                    this.onEndCallClick();
                }
            });
        }
        
        // Set up connection monitoring
        this.setupConnectionMonitoring();

        // Bind to parent for reference
        this.parent = null;
    }

    // Set parent reference
    setParent(parent) {
        this.parent = parent;
    }

    // Set up Web Worker for audio decoding
    setupAudioDecoder() {
        if (window.Worker) {
            this.decoder = new Worker('/js/audio-decoder-worker.js');
            this.pendingDecodes = new Map();
            this.nextDecodeId = 1;
            
            this.decoder.onmessage = (e) => {
                if (e.data.buffer) {
                    this.pendingDecodes.get(e.data.id)?.resolve(e.data.buffer);
                } else if (e.data.error) {
                    this.pendingDecodes.get(e.data.id)?.reject(new Error(e.data.error));
                }
                this.pendingDecodes.delete(e.data.id);
            };
        } else {
            console.warn("Web Workers not supported in this browser - audio decoding will be on main thread");
        }
    }

    // Monitor connection quality and adapt settings
    setupConnectionMonitoring() {
        this.connectionQuality = 'high'; // 'high', 'medium', 'low'
        
        if ('connection' in navigator) {
            const updateConnectionQuality = () => {
                const conn = navigator.connection;
                if (conn.downlink < 1 || conn.rtt > 500) {
                    this.connectionQuality = 'low';
                } else if (conn.downlink < 5 || conn.rtt > 100) {
                    this.connectionQuality = 'medium';
                } else {
                    this.connectionQuality = 'high';
                }
                console.log(`Connection quality: ${this.connectionQuality}, downlink: ${conn.downlink}Mbps, RTT: ${conn.rtt}ms`);
            };
            
            navigator.connection.addEventListener('change', updateConnectionQuality);
            updateConnectionQuality(); // Initial check
        }
    }

    // Pre-warm audio context to avoid latency on first audio
    async preWarmAudioContext() {
        try {
            if (!this.audioContext) return;
            
            // Create a short silent buffer
            const buffer = this.audioContext.createBuffer(1, 1024, 44100);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start();
            console.log("Audio context pre-warmed");
            
            // Set up gain nodes for volume control
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.8; // Default to 80% volume
            this.masterGain.connect(this.audioContext.destination);
            
            // Set up dynamic compressor to improve audio quality
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.value = -24;
            this.compressor.knee.value = 30;
            this.compressor.ratio.value = 12;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.25;
            this.compressor.connect(this.masterGain);
        } catch (err) {
            console.warn("Error pre-warming audio context:", err);
        }
    }
    
    // ---- Interface du modal ----
    showModal() {
        if (this.modal) {
            this.modal.show();
        }
    }
    
    hideModal() {
        if (this.modal) {
            this.modal.hide();
        }
    }
    
    setCallStatus(text) {
        if (this.callStatus) {
            this.callStatus.textContent = text;
        }
    }
    
    clearTranscriptions() {
        if (this.myTranscription) {
            this.myTranscription.innerHTML = '';
        }
        if (this.otherTranscription) {
            this.otherTranscription.innerHTML = '';
        }
    }

    // ---- Transcriptions with improved rendering ----
    appendTranscription(source, originalText, translatedText, isFinal, audioBase64) {
        // source = 'caller' ou 'receiver'
        const isCaller = (source === 'caller');
        const container = isCaller ? this.myTranscription : this.otherTranscription;
        if (!container) return;

        // Find existing interim element to replace
        let existingInterim = container.querySelector('.transcription-item.interim');
        
        // For final transcriptions that replace interim ones
        if (isFinal && existingInterim) {
            existingInterim.remove();
        }

        // Create or update transcription element
        let div;
        if (!isFinal && existingInterim) {
            // Update existing interim instead of creating new element
            div = existingInterim;
            div.innerHTML = `
                <div class="original">${originalText}</div>
                <div class="translation">${translatedText}</div>
            `;
        } else {
            // Create new element
            div = document.createElement('div');
            div.classList.add('transcription-item', isFinal ? 'final' : 'interim');
            div.innerHTML = `
                <div class="original">${originalText}</div>
                <div class="translation">${translatedText}</div>
            `;
            container.appendChild(div);
        }

        // Auto-scroll to latest message
        container.scrollTop = container.scrollHeight;

        // S'il y a un audioBase64 (TTS partielle ou finale pour caller)
        if (audioBase64) {
            // Play the audio
            this.queueAudio(audioBase64);
        }
    }

    // ---- Gestion du bouton principal ----
    updateMainButton(button, inCall) {
        if (!button) return;
        if (inCall) {
            button.textContent = 'Raccrocher';
            button.classList.add('btn-danger');
            button.classList.remove('btn-primary');
        } else {
            button.textContent = 'Appeler';
            button.classList.remove('btn-danger');
            button.classList.add('btn-primary');
        }
    }
    
    setOnEndCallClick(callback) {
        this.onEndCallClick = callback;
    }

    // ---- Queue audio with priority system ----
    queueAudio(audioBase64, priority = 'normal') {
        // Clean up cache if too large
        if (this.audioBufferCache.size > this.audioBufferCacheMaxSize) {
            // Delete oldest 20% of entries
            const entriesToDelete = Math.floor(this.audioBufferCacheMaxSize * 0.2);
            const keys = Array.from(this.audioBufferCache.keys()).slice(0, entriesToDelete);
            keys.forEach(key => this.audioBufferCache.delete(key));
        }
        
        // Add to queue with timestamp and priority
        // Priority can be 'high', 'normal', 'low'
        this.audioQueue.push({
            audio: audioBase64,
            timestamp: Date.now(),
            priority
        });
        
        // Sort queue by priority (high first)
        this.audioQueue.sort((a, b) => {
            const priorityValues = { 'high': 0, 'normal': 1, 'low': 2 };
            return priorityValues[a.priority] - priorityValues[b.priority] || 
                   a.timestamp - b.timestamp;
        });
        
        // Start playback if not already playing
        if (!this.isPlayingAudio) {
            this.playNextAudio();
        }
    }
    
    async playNextAudio() {
        if (this.audioQueue.length === 0 || this.isPlayingAudio) return;
        this.isPlayingAudio = true;

        const queueItem = this.audioQueue.shift();
        const audioBase64 = queueItem.audio;
        const startTime = Date.now();
        
        try {
            // Use the optimized playback method
            await this.playInlineAudioFast(audioBase64);
            
            // Track latency for analytics
            const playbackTime = Date.now() - startTime;
            this.metrics.audioLatency.push(playbackTime);
            
            // Keep only the last 20 measurements
            if (this.metrics.audioLatency.length > 20) {
                this.metrics.audioLatency.shift();
            }
        } catch (err) {
            console.error('Audio playback error:', err);
            
            // Try fallback method
            try {
                await this.playInlineAudio(audioBase64);
            } catch (fallbackErr) {
                console.error('All audio playback methods failed:', fallbackErr);
            }
        } finally {
            this.isPlayingAudio = false;
            
            // Continue playing queue with a small delay to prevent browser audio glitches
            setTimeout(() => {
                this.playNextAudio();
            }, 50);
        }
    }

    // ---- Low-latency audio playback with Web Worker ----
    async playInlineAudioFast(base64) {
        const startTime = performance.now();
        
        try {
            // Skip if this is a waiting message and we're already in-call
            if (this.parent && !this.parent.waitingLoopActive && 
                this.parent.currentWaitingAudio === base64) {
                console.log('Skipping waiting message as call is now active');
                return;
            }
            
            // Ensure audio context is initialized
            this.ensureAudioContextInitialized();
            
            // Check cache first
            if (this.audioBufferCache.has(base64)) {
                const cachedBuffer = this.audioBufferCache.get(base64);
                const decodingTime = performance.now() - startTime;
                this.metrics.processingTimes.push({
                    type: 'decode-cached',
                    time: decodingTime
                });
                return this.playAudioBuffer(cachedBuffer);
            }
            
            let arrayBuffer;
            
            // Use Web Worker for decoding if available
            if (this.decoder) {
                const decodeId = this.nextDecodeId++;
                arrayBuffer = await new Promise((resolve, reject) => {
                    this.pendingDecodes.set(decodeId, { resolve, reject });
                    this.decoder.postMessage({ id: decodeId, base64 });
                });
            } else {
                // Fallback to main thread decoding
                arrayBuffer = this.decodeBase64ToArrayBuffer(base64);
            }
            
            // Measure decoding time
            const decodingTime = performance.now() - startTime;
            
            // Start decoding audio
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Cache the decoded buffer
            this.audioBufferCache.set(base64, audioBuffer);
            
            // Measure total processing time
            const totalProcessingTime = performance.now() - startTime;
            this.metrics.processingTimes.push({
                type: 'decode-new',
                time: totalProcessingTime
            });
            
            // Play the audio
            return this.playAudioBuffer(audioBuffer);
            
        } catch (error) {
            console.error('Error in fast audio playback:', error);
            throw error;
        }
    }
    
    // Play an already decoded audio buffer with optimizations
    playAudioBuffer(audioBuffer) {
        return new Promise((resolve, reject) => {
            try {
                if (!audioBuffer) {
                    throw new Error('Invalid audio buffer');
                }
                
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect through processing chain
                if (this.compressor) {
                    source.connect(this.compressor);
                } else if (this.masterGain) {
                    source.connect(this.masterGain);
                } else {
                    source.connect(this.audioContext.destination);
                }
                
                // Handle playback completion
                source.onended = () => {
                    resolve();
                };
                
                // Add timeout safety in case onended doesn't fire
                const timeout = setTimeout(() => {
                    if (this.currentSource === source) {
                        console.log('Audio playback timeout safety triggered');
                        resolve();
                    }
                }, audioBuffer.duration * 1000 + 500);
                
                // Start immediately
                source.start(0);
                
                // Store current source for potential cleanup
                this.currentSource = source;
                
                // Attach timeout to source for cleanup
                source._cleanupTimeout = timeout;
            } catch (err) {
                reject(err);
            }
        });
    }

    // ---- Original playback method (as fallback) ----
    playInlineAudio(base64) {
        return new Promise(async (resolve, reject) => {
            try {
                this.ensureAudioContextInitialized();
                
                const arrayBuffer = this.decodeBase64ToArrayBuffer(base64);
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect to audio graph
                if (this.masterGain) {
                    source.connect(this.masterGain);
                } else {
                    source.connect(this.audioContext.destination);
                }

                source.onended = () => {
                    resolve();
                };
                
                // Add timeout safety
                const timeout = setTimeout(() => {
                    resolve();
                }, audioBuffer.duration * 1000 + 500);
                
                source.start(0);
                this.currentSource = source;
                source._cleanupTimeout = timeout;
            } catch (error) {
                reject(error);
            }
        });
    }

    // Ensure audio context is initialized with optimized settings
    ensureAudioContextInitialized() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            
            // Check for browser support
            if (!AudioContext) {
                console.error('AudioContext not supported in this browser!');
                return;
            }
            
            this.audioContext = new AudioContext({
                latencyHint: 'interactive',  // Request low latency
                sampleRate: 44100            // Standard sample rate
            });
        }
        
        // Resume if suspended (for iOS/Safari)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(console.error);
        }
    }

    // Decode base64 to ArrayBuffer in chunks for better performance
    decodeBase64ToArrayBuffer(base64) {
        try {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            
            // Process in smaller chunks to avoid blocking main thread
            const chunkSize = 1024 * 10; // 10KB chunks
            for (let i = 0; i < len; i += chunkSize) {
                const end = Math.min(i + chunkSize, len);
                for (let j = i; j < end; j++) {
                    bytes[j] = binaryString.charCodeAt(j);
                }
            }
            
            return bytes.buffer;
        } catch (error) {
            console.error('Base64 decoding error:', error);
            throw error;
        }
    }

    // ---- Stop all audio with comprehensive cleanup ----
    stopAllAudio() {
        // Stop current audio source
        if (this.currentSource) {
            try {
                this.currentSource.stop();
                
                // Clear associated timeout
                if (this.currentSource._cleanupTimeout) {
                    clearTimeout(this.currentSource._cleanupTimeout);
                }
            } catch (err) {
                console.error('Error stopping current audio source:', err);
            }
            this.currentSource = null;
        }
        
        // Clear the queue
        this.audioQueue = [];
        this.isPlayingAudio = false;
        
        // Lower gain to make sure no sound plays
        if (this.masterGain) {
            // Gradual fade out for smoother experience
            const now = this.audioContext.currentTime;
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0, now + 0.1);
            
            // Reset gain after short delay
            setTimeout(() => {
                this.masterGain.gain.value = 0.8;
            }, 300);
        }
    }

    // ---- Stop current audio playback ----
    stopCurrentAudio() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
                
                // Clear associated timeout
                if (this.currentSource._cleanupTimeout) {
                    clearTimeout(this.currentSource._cleanupTimeout);
                }
            } catch (err) {
                console.error('Error stopping current audio source:', err);
            }
            this.currentSource = null;
        }
    }
    
    // ---- Utility methods ----
    getAverageAudioLatency() {
        if (this.metrics.audioLatency.length === 0) return 0;
        const sum = this.metrics.audioLatency.reduce((a, b) => a + b, 0);
        return sum / this.metrics.audioLatency.length;
    }
    
    // Cleanup resources when no longer needed
    cleanup() {
        this.stopAllAudio();
        
        // Terminate worker if exists
        if (this.decoder) {
            this.decoder.terminate();
            this.decoder = null;
        }
        
        // Clear all caches
        this.audioBufferCache.clear();
        this.pendingDecodes.clear();
    }
}

// --------------------- Classe EvatradButton (avec voix off) --------------------- //
class EvatradButton {
    constructor(buttonElement, config, uiInstance) {
        if (!config.phoneNumber) {
            throw new Error('Le numéro de téléphone est requis');
        }
        if (!config.apiBaseUrl) {
            throw new Error("L'URL de base de l'API est requise");
        }

        this.button = buttonElement;
        this.ui = uiInstance;
        this.config = {
            phoneNumber: config.phoneNumber,
            callerLanguage: config.callerLanguage || 'fr-FR',
            receiverLanguage: config.receiverLanguage || 'en-US',
            apiBaseUrl: config.apiBaseUrl,
            partialTtsInterval: config.partialTtsInterval || 2000,
            connectionTimeout: config.connectionTimeout || 10000, // 10s default
            autoReconnect: config.autoReconnect !== false, // enabled by default
            lowLatencyMode: config.lowLatencyMode !== false, // enabled by default
        };

        // État
        this.isRecording = false;
        this.mediaRecorder = null;
        this.ws = null;
        this.currentCallSid = null;
        this.isEndingCall = false;
        this.playingWelcome = false;
        this.playingWaiting = false;
        this.waitingLoopActive = false;
        this.receiverReady = false; // pour info si besoin
        
        // Connection monitoring
        this.lastReconnectTime = 0;
        this.reconnectAttempts = 0;
        this.lastPingTime = 0;
        this.pingInterval = null;
        this.connectionTimeout = null;
        
        // Network latency tracking
        this.networkLatency = 0;
        this.lastNetworkCheck = 0;

        // AudioContext, gain pour la voix off
        this.audioContext = null;
        this.originalVoiceGain = null;
        
        // Audio buffer cache
        this.audioBufferCache = new Map();
        
        // Status polling as WebSocket fallback
        this.statusPollingInterval = null;

        // Initialisation
        this.attachEvents(buttonElement);
        
        if (this.ui) {
            // Set parent reference in UI
            this.ui.setParent(this);
            
            // On récupère l'audioContext du UI, si déjà créé
            if (this.ui.audioContext) {
                this.audioContext = this.ui.audioContext;
            }
            
            this.ui.setOnEndCallClick(() => this.endCall());
        }
        
        // Pre-initialize for faster first response
        this.ensureAudioContextInitialized();
    }

    attachEvents(button) {
        button.addEventListener('click', () => {
            this.ensureAudioContextInitialized();
            if (this.currentCallSid) {
                this.endCall();
            } else {
                // Use a timeout to catch UI freezes during initialization
                this.connectionTimeout = setTimeout(() => {
                    if (!this.currentCallSid && !this.isEndingCall) {
                        console.error('Call initialization timeout');
                        this.handleConnectionError(new Error('Call initialization timeout'));
                    }
                }, this.config.connectionTimeout);
                
                if (this.ui) {
                    this.ui.showModal();
                }
                
                this.startCall();
            }
        });
    }

    // ---- Connection error handling ----
    handleConnectionError(error) {
        console.error('Connection error:', error);
        
        if (this.ui) {
            this.ui.setCallStatus(`Erreur de connexion: ${error.message}`);
        }
        
        // Clean up any pending timeouts
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        // Start polling as fallback if WebSocket fails
        if (this.config.autoReconnect && !this.statusPollingInterval && this.currentCallSid) {
            this.startPollingForStatus();
        }
    }

    // ---- Démarrage de l'appel ----
    async startCall() {
        try {
            if (this.ui) {
                this.ui.clearTranscriptions();
                this.ui.setCallStatus('Initialisation...');
            }

            // Pour iOS ou autres, s'assurer que l'audioContext est bien créé
            this.ensureAudioContextInitialized();

            // Safety timeout - stop waiting after 60 seconds if no answer
            this.waitingLoopSafetyTimeout = setTimeout(() => {
                console.log('Safety timeout reached, stopping waiting loop');
                this.stopWaitingLoop();
                this.endCall();
            }, 60000); // 60 seconds

            // 1) Jouer le message de bienvenue côté Caller
            await this.playWelcomeMessage();

            // 2) Démarrer la boucle d'attente
            this.startWaitingLoop();

            // 3) Faire la requête POST /call
            const startCallTime = Date.now();
            const response = await fetch(`${this.config.apiBaseUrl}/call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: this.config.phoneNumber,
                    callerLanguage: this.config.callerLanguage,
                    receiverLanguage: this.config.receiverLanguage,
                    partialTtsInterval: this.config.partialTtsInterval
                })
            });
            
            // Track network latency
            this.networkLatency = Date.now() - startCallTime;
            
            const data = await response.json();
            if (!data.success) {
                if (this.ui) {
                    this.ui.setCallStatus(data.error || "Erreur lors de l'initiation de l'appel");
                }
                throw new Error(data.error || 'Erreur /call');
            }

            this.currentCallSid = data.callSid;
            
            // Clear the connection timeout since we got a successful response
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            
            if (this.ui) {
                this.ui.setCallStatus('Appel en cours...');
                this.ui.updateMainButton(this.button, true);
            }

            // 4) Connecter le WebSocket
            await this.connectWebSocket();

        } catch (error) {
            console.error('Erreur startCall:', error);
            this.handleConnectionError(error);
            
            if (this.ui) {
                this.ui.setCallStatus(`Erreur: ${error.message}`);
            }
            
            // Don't auto-end call to allow for fallback mechanisms
            
        }
    }

    // Méthode pour jouer le message de bienvenue
    async playWelcomeMessage() {
        try {
            this.playingWelcome = true;
        
            // Update UI
            if (this.ui) {
                this.ui.setCallStatus('Bienvenue...');
            }
        
            // Fetch welcome message audio
            const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=welcome`;
            const finalUrl = url + `&t=${Date.now()}`; // Prevent caching
        
            const resp = await fetch(finalUrl);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = this.arrayBufferToBase64(arrayBuffer);
        
            // Play the welcome message
            if (this.ui) {
                await this.ui.playInlineAudioFast(base64);
            } else {
                await this.playAudioStandalone(base64);
            }
        
            // REMOVE THIS LINE:
            // this.startWaitingLoop();
        } catch (error) {
            console.error('Error playing welcome message:', error);
        } finally {
            this.playingWelcome = false;
        }
    }

    // Méthode pour démarrer la boucle d'attente
    async startWaitingLoop() {
        // Clear any existing waiting loop
        this.stopWaitingLoop();
    
        // Set up new loop
        this.waitingLoopActive = true;
        this.playingWaiting = true;
        this.currentWaitingAudio = null;
    
        // Configurable delays
        const LOOP_DELAY = 3000; // Delay between waiting messages
        const RETRY_DELAY = 5000; // Delay on error
    
        // Helper function to play audio
        const playAudio = async (base64) => {
            if (this.ui) {
                // Lower priority for waiting messages
                await this.ui.playInlineAudioFast(base64);
            } else {
                await this.playAudioStandalone(base64);
            }
        };
    
        // Recursive function to play waiting messages
        const playWaitingMessage = async () => {
            // Exit if the loop has been stopped
            if (!this.waitingLoopActive) {
                console.log('Waiting loop stopped');
                this.playingWaiting = false;
                return;
            }
    
            try {
                // Update UI
                if (this.ui) {
                    this.ui.setCallStatus('En attente de réponse...');
                }
    
                // Fetch waiting message audio
                const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=waiting`;
                const finalUrl = url + `&t=${Date.now()}`; // Prevent caching
    
                const resp = await fetch(finalUrl);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const base64 = this.arrayBufferToBase64(arrayBuffer);
    
                // Exit if the loop has been stopped while fetching
                if (!this.waitingLoopActive) {
                    console.log('Waiting loop stopped after fetch');
                    this.playingWaiting = false;
                    return;
                }
    
                // Store current audio for possible interruption
                this.currentWaitingAudio = base64;
    
                // Play the waiting message
                await playAudio(base64);
    
                // Exit if the loop has been stopped during playback
                if (!this.waitingLoopActive) {
                    console.log('Waiting loop stopped after playback');
                    this.playingWaiting = false;
                    return;
                }
    
                // Schedule the next message
                this.waitingTimeoutId = setTimeout(playWaitingMessage, LOOP_DELAY);
            } catch (error) {
                console.error('Error in waiting loop:', error);
    
                // Retry after a delay if the loop is still active
                if (this.waitingLoopActive) {
                    console.log(`Retrying waiting loop in ${RETRY_DELAY}ms...`);
                    this.waitingTimeoutId = setTimeout(playWaitingMessage, RETRY_DELAY);
                } else {
                    this.playingWaiting = false;
                }
            }
        };
    
        // Start the first message
        playWaitingMessage();
    }

    // Méthode pour arrêter la boucle d'attente
    stopWaitingLoop() {
        console.log('Stop waiting loop called');
        this.waitingLoopActive = false;
        
        // Clear safety timeout
        if (this.waitingLoopSafetyTimeout) {
            clearTimeout(this.waitingLoopSafetyTimeout);
            this.waitingLoopSafetyTimeout = null;
        }
        
        // Cancel the current timeout if it exists
        if (this.waitingTimeoutId) {
            clearTimeout(this.waitingTimeoutId);
            this.waitingTimeoutId = null;
        }
        
        // Stop any currently playing waiting audio
        if (this.ui && this.currentWaitingAudio) {
            this.ui.stopCurrentAudio();
        }
        
        this.currentWaitingAudio = null;
        this.playingWaiting = false;
    }

    // ---- WebSocket avec logique de reconnexion améliorée ----
    async connectWebSocket() {
        // Get WebSocket URL from meta tag if available
        let wsUrl;
        const metaWsUrl = document.querySelector('meta[name="websocket-url"]');
        
        if (metaWsUrl && metaWsUrl.content) {
            wsUrl = metaWsUrl.content;
            console.log('Using WebSocket URL from meta tag:', wsUrl);
        } else {
            const wsBaseUrl = this.config.apiBaseUrl.replace(/^http/, 'ws');
            wsUrl = `${wsBaseUrl}/browser`;
            console.log('Using WebSocket URL from config:', wsUrl);
        }
        
        try {
            console.log('Connecting to WebSocket:', wsUrl);
            
            // Close any existing connection
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
            
            // Set up connection timeout
            const connectionTimeoutId = setTimeout(() => {
                console.error('WebSocket connection timeout');
                this.handleConnectionError(new Error('WebSocket connection timeout'));
                
                // Start polling as fallback
                if (this.currentCallSid) {
                    this.startPollingForStatus();
                }
                
            }, 10000); // 10 second timeout
            
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected.');
                
                // Clear connection timeout
                clearTimeout(connectionTimeoutId);
                
                this.reconnectAttempts = 0; // Reset reconnect counter
                
                // Send initialization
                this.ws.send(JSON.stringify({
                    type: 'init',
                    callSid: this.currentCallSid
                }));
                
                // Start ping interval to keep connection alive
                this.startPingInterval();
            };

            this.ws.onmessage = (event) => {
                // Log latency for analytics
                if (this.lastPingTime > 0) {
                    const latency = Date.now() - this.lastPingTime;
                    this.lastPingTime = 0; // Reset
                    
                    if (this.ui) {
                        this.ui.metrics.networkLatency.push(latency);
                        // Keep only last 20 measurements
                        if (this.ui.metrics.networkLatency.length > 20) {
                            this.ui.metrics.networkLatency.shift();
                        }
                    }
                }
                
                this.handleWebSocketMessage(event);
            };

            this.ws.onerror = (error) => {
                console.error('Erreur WebSocket:', error);
                clearTimeout(connectionTimeoutId);
                this.handleConnectionError(error);
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket fermé.');
                clearTimeout(connectionTimeoutId);
                
                // Stop ping interval
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }
                
                // Auto-reconnect if still in a call and not too many attempts
                if (this.currentCallSid && this.config.autoReconnect && this.reconnectAttempts < 5) {
                    const now = Date.now();
                    // Avoid reconnecting too quickly (at least 1s between attempts)
                    if (now - this.lastReconnectTime > 1000) {
                        this.lastReconnectTime = now;
                        this.reconnectAttempts++;
                        
                        console.log(`Attempting to reconnect WebSocket (attempt ${this.reconnectAttempts})...`);
                        
                        // Exponential backoff
                        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
                        setTimeout(() => this.connectWebSocket(), delay);
                    }
                } else if (this.currentCallSid) {
                    // Start polling as WebSocket fallback
                    this.startPollingForStatus();
                }
            };
        } catch (error) {
            console.error('Error establishing WebSocket connection:', error);
            this.handleConnectionError(error);
        }
    }
    
    // Keep WebSocket connection alive with pings
    startPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Record time for latency calculation
                this.lastPingTime = Date.now();
                
                try {
                    this.ws.send(JSON.stringify({
                        type: 'ping',
                        timestamp: this.lastPingTime
                    }));
                } catch (error) {
                    console.error('Error sending ping:', error);
                    // Try to reconnect on error
                    if (this.config.autoReconnect) {
                        this.connectWebSocket();
                    }
                }
            } else if (this.ws && this.ws.readyState !== WebSocket.CONNECTING) {
                // Try to reconnect if not already connecting
                if (this.config.autoReconnect) {
                    this.connectWebSocket();
                }
            }
        }, 15000); // Every 15 seconds
    }
    
    // Polling as fallback when WebSocket fails
    startPollingForStatus() {
        console.log('Starting status polling as WebSocket fallback');
        
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }
        
        if (!this.currentCallSid) return;
        
        // Update UI
        if (this.ui) {
            this.ui.setCallStatus('Mode de secours actif...');
        }
        
        // Start polling every 2 seconds
        this.statusPollingInterval = setInterval(async () => {
            if (!this.currentCallSid) {
                clearInterval(this.statusPollingInterval);
                return;
            }
            
            try {
                // Use regular HTTP request as fallback
                const response = await fetch(
                    `${this.config.apiBaseUrl}/check-call-status?callSid=${this.currentCallSid}`
                );
                const data = await response.json();
                
                // Process status update
                if (data.status === 'in-progress' || data.status === 'answered') {
                    console.log('Polling detected call is active, stopping waiting loop');
                    this.stopWaitingLoop();
                    
                    // Start recording if not already
                    if (!this.isRecording) {
                        this.startRecording().catch(console.error);
                    }
                    
                    // Update UI
                    if (this.ui) {
                        this.ui.setCallStatus(`Appel en cours (mode secours)`);
                    }
                    
                    // Reduce polling frequency once connected
                    clearInterval(this.statusPollingInterval);
                    this.statusPollingInterval = setInterval(this.checkCallStatus.bind(this), 5000);
                } else if (data.status === 'completed' || data.status === 'failed') {
                    // Call ended
                    console.log('Polling detected call ended');
                    this.cleanupAfterCall();
                    clearInterval(this.statusPollingInterval);
                }
            } catch (err) {
                console.error('Error polling for call status:', err);
            }
        }, 2000);
    }

    // Helper method to check call status
    async checkCallStatus() {
        if (!this.currentCallSid) {
            clearInterval(this.statusPollingInterval);
            return;
        }
        
        try {
            const response = await fetch(
                `${this.config.apiBaseUrl}/check-call-status?callSid=${this.currentCallSid}`
            );
            const data = await response.json();
            
            if (data.status === 'completed' || data.status === 'failed') {
                console.log('Call ended, cleaning up');
                this.cleanupAfterCall();
                clearInterval(this.statusPollingInterval);
            }
        } catch (err) {
            console.error('Error checking call status:', err);
        }
    }

    // Handle WebSocket messages
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WS message:', data.type);

            switch (data.type) {
                case 'call_ended':
                    this.cleanupAfterCall();
                    break;

                case 'call_status':
                    if (data.status === 'in-progress') {
                        // Call connected, stop waiting loop
                        this.stopWaitingLoop();
                        this.startRecording();
                        if (this.ui) {
                            this.ui.setCallStatus("Appel en cours");
                        }
                    } else {
                        if (this.ui) {
                            this.ui.setCallStatus(`Statut: ${data.status}`);
                        }
                    }
                    break;

                case 'audio_chunk':
                    if (this.ui) {
                        this.ui.queueAudio(data.audioBase64);
                    }
                    break;

                case 'transcription-interim':
                case 'transcription-final':
                    if (this.ui) {
                        this.ui.appendTranscription(
                            data.source,
                            data.originalText,
                            data.translatedText,
                            data.type === 'transcription-final'
                        );
                    }
                    break;

                case 'pong':
                    // Calculate network latency
                    if (this.lastPingTime > 0) {
                        this.networkLatency = Date.now() - this.lastPingTime;
                        this.lastPingTime = 0;
                    }
                    break;
            }
        } catch (err) {
            console.error('Error processing WebSocket message:', err);
        }
    }

    // Start recording from the user's microphone
    async startRecording() {
        if (this.isRecording) return;
        
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Set up recording
            this.audioContext = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
            const microphone = this.audioContext.createMediaStreamSource(stream);
            
            // Create a gain node for the original voice (to be heard at a lower volume)
            this.originalVoiceGain = this.audioContext.createGain();
            this.originalVoiceGain.gain.value = 0.3; // 30% volume
            microphone.connect(this.originalVoiceGain);
            this.originalVoiceGain.connect(this.audioContext.destination);
            
            // Create media recorder for WebSocket streaming
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 16000
            });
            
            // Handle audio data
            this.mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    // Convert to base64
                    const reader = new FileReader();
                    reader.readAsArrayBuffer(event.data);
                    reader.onloadend = () => {
                        const base64 = this.arrayBufferToBase64(reader.result);
                        
                        // Send to server
                        this.ws.send(JSON.stringify({
                            type: 'audio',
                            audio: base64
                        }));
                    };
                }
            });
            
            // Start recording
            this.mediaRecorder.start(500); // Send data every 500ms
            this.isRecording = true;
            
            // Store the stream for later cleanup
            this.microphoneStream = stream;
            
            console.log('Recording started');
        } catch (error) {
            console.error('Error starting recording:', error);
            if (this.ui) {
                this.ui.setCallStatus(`Erreur micro: ${error.message}`);
            }
        }
    }

    // Play audio standalone (without UI instance)
    async playAudioStandalone(base64) {
        return new Promise((resolve, reject) => {
            try {
                // Create audio element
                const audio = new Audio('data:audio/mp3;base64,' + base64);
                audio.volume = 0.8;
                
                // Set up listeners
                audio.onended = () => {
                    resolve();
                };
                
                audio.onerror = (err) => {
                    console.error('Audio playback error:', err);
                    reject(err);
                };
                
                // Add safety timeout
                const timeout = setTimeout(() => {
                    resolve();
                }, 10000); // 10 second maximum
                
                // Play
                audio.play().catch(err => {
                    clearTimeout(timeout);
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    // Convert ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    // Clean up resources after call ends
    cleanupAfterCall() {
        console.log('Cleaning up after call');
        
        // Stop recording
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (err) {
                console.error('Error stopping media recorder:', err);
            }
        }
        
        // Stop microphone stream
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }
        
        // Stop all audio
        if (this.ui) {
            this.ui.stopAllAudio();
            this.ui.setCallStatus('Appel terminé');
            this.ui.updateMainButton(this.button, false);
        }
        
        // Reset state
        this.isRecording = false;
        this.currentCallSid = null;
        this.isEndingCall = false;
        this.stopWaitingLoop();
        
        // Stop polling if active
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }
    }

    // End call method
    async endCall() {
        if (!this.currentCallSid || this.isEndingCall) return;
        
        this.isEndingCall = true;
        
        try {
            if (this.ui) {
                this.ui.setCallStatus('Fin de l\'appel en cours...');
            }
            
            // Stop waiting loop first
            this.stopWaitingLoop();
            
            // Make API call to end the call
            await fetch(`${this.config.apiBaseUrl}/end-call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callSid: this.currentCallSid })
            });
            
            // Clean up resources
            this.cleanupAfterCall();
            
        } catch (error) {
            console.error('Error ending call:', error);
            
            // Still cleanup even if API call fails
            this.cleanupAfterCall();
            
        } finally {
            this.isEndingCall = false;
        }
    }

    // Make sure AudioContext is initialized
    ensureAudioContextInitialized() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioContext = new AudioContext({
                    latencyHint: 'interactive',
                    sampleRate: 44100
                });
            } else {
                console.error('AudioContext not supported in this browser');
            }
        }
        
        // Resume if suspended (for iOS/Safari)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(console.error);
        }
    }

    // ---- Analytics and Monitoring ----
    getNetworkStats() {
        return {
            wsLatency: this.networkLatency,
            audioLatency: this.ui ? this.ui.getAverageAudioLatency() : 0,
            connectionQuality: this.ui ? this.ui.connectionQuality : 'unknown'
        };
    }

    // Clean up all resources
    dispose() {
        // End any active call
        if (this.currentCallSid) {
            this.endCall();
        }

        // Stop all intervals and timeouts
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
        }

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.waitingTimeoutId) {
            clearTimeout(this.waitingTimeoutId);
            this.waitingTimeoutId = null;
        }

        if (this.waitingLoopSafetyTimeout) {
            clearTimeout(this.waitingLoopSafetyTimeout);
            this.waitingLoopSafetyTimeout = null;
        }

        // Release audio resources
        if (this.originalVoiceGain) {
            this.originalVoiceGain.disconnect();
            this.originalVoiceGain = null;
        }

        // Clear all caches
        this.audioBufferCache.clear();
        
        // Clean up UI if present
        if (this.ui) {
            this.ui.cleanup();
        }

        // Remove button event listeners
        if (this.button) {
            const newButton = this.button.cloneNode(true);
            if (this.button.parentNode) {
                this.button.parentNode.replaceChild(newButton, this.button);
            }
            this.button = null;
        }
        
        console.log('EvatradButton disposed and resources released');
    }
}

// Add handler for page unload to clean up resources
window.addEventListener('beforeunload', () => {
    // Clean up any global instances
    if (window.previewButtonInstance) {
        window.previewButtonInstance.dispose();
    }
});

// Exporte globalement
window.EvatradUI = EvatradUI;
window.EvatradButton = EvatradButton;
