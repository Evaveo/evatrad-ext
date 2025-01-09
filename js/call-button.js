import { MESSAGE_TYPES } from './constants.js';
import { CallButtonAudioManager } from './call-button-audio.js';

class EVACallButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.audioManager = null;
        this.callActive = false;
    }

    async connectedCallback() {
        // Get attributes or use defaults
        const callerLang = this.getAttribute('caller-lang') || 'fr-FR';
        const receiverLang = this.getAttribute('receiver-lang') || 'en-US';
        const phoneNumber = this.getAttribute('phone') || '';
        const buttonText = this.getAttribute('text') || 'APPELER';
        const buttonColor = this.getAttribute('color') || '#4CAF50';
        const buttonHoverColor = this.getAttribute('hover-color') || '#45a049';
        const buttonSize = this.getAttribute('size') || 'medium';
        const buttonFont = this.getAttribute('font') || 'Arial';
        const buttonIcon = this.getAttribute('icon') || '';

        // Define size styles
        const sizeStyles = {
            small: {
                padding: '8px 16px',
                fontSize: '14px',
                iconSize: '12px'
            },
            medium: {
                padding: '15px 32px',
                fontSize: '16px',
                iconSize: '16px'
            },
            large: {
                padding: '20px 40px',
                fontSize: '18px',
                iconSize: '20px'
            }
        };

        const currentSize = sizeStyles[buttonSize] || sizeStyles.medium;

        // Create button with styles
        this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                .eva-call-button {
                    background-color: ${buttonColor};
                    border: none;
                    border-radius: 4px;
                    color: white;
                    padding: ${currentSize.padding};
                    text-align: center;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: ${currentSize.fontSize};
                    font-family: ${buttonFont}, sans-serif;
                    margin: 4px 2px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .eva-call-button i {
                    font-size: ${currentSize.iconSize};
                }
                .eva-call-button:hover {
                    background-color: ${buttonHoverColor};
                    transform: translateY(-1px);
                }
                .eva-call-button:active {
                    transform: translateY(1px);
                }
                .eva-call-button:disabled {
                    background-color: #cccccc;
                    cursor: not-allowed;
                    transform: none;
                }
                .eva-call-button.active {
                    background-color: #dc3545;
                }
                .eva-call-button.active:hover {
                    background-color: #c82333;
                }
            </style>
            <button class="eva-call-button">
                ${buttonIcon ? `<i class="${buttonIcon}"></i>` : ''}
                <span class="button-text">${buttonText}</span>
            </button>
        `;

        // Add click handler
        const button = this.shadowRoot.querySelector('button');
        const buttonTextSpan = this.shadowRoot.querySelector('.button-text');
        button.addEventListener('click', async () => {
            if (!this.callActive) {
                // Démarrer l'appel
                button.disabled = true;
                if (await this.startCall()) {
                    this.callActive = true;
                    button.classList.add('active');
                    buttonTextSpan.textContent = 'RACCROCHER';
                    button.disabled = false;
                } else {
                    button.disabled = false;
                }
            } else {
                // Terminer l'appel
                await this.endCall();
                this.callActive = false;
                button.classList.remove('active');
                buttonTextSpan.textContent = buttonText;
            }
        });

        // Initialize WebSocket
        this.initWebSocket();
    }

    initWebSocket() {
        const wsUrl = document.querySelector('meta[name="websocket-url"]')?.content;
        if (!wsUrl) {
            console.error('WebSocket URL not found in meta tags');
            return;
        }

        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            // Send initial language settings
            this.updateLanguages();
        };

        this.ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Message WebSocket reçu:', {
                    type: data.type,
                    source: data.source,
                    hasAudio: data.type === MESSAGE_TYPES.AUDIO ? (data.audio ? 'oui' : 'non') : 'N/A',
                    messageSize: event.data.length
                });
                
                switch (data.type) {
                    case MESSAGE_TYPES.AUDIO:
                        if (data.source === MESSAGE_TYPES.SOURCE.RECEIVER) {
                            console.log('Audio du receiver détecté:', {
                                audioLength: data.audio ? data.audio.length : 0,
                                isBase64: data.audio ? this.isBase64(data.audio) : false
                            });
                            
                            if (this.audioManager && data.audio) {
                                console.log('Envoi de l\'audio au gestionnaire pour lecture');
                                this.audioManager.handleIncomingAudio(data.audio);
                            } else {
                                console.error('Problème avec l\'audio:', {
                                    audioManagerExists: !!this.audioManager,
                                    audioDataExists: !!data.audio
                                });
                            }
                        }
                        break;

                    case MESSAGE_TYPES.TRANSCRIPTION:
                        console.log('Transcription reçue:', data.text);
                        // Envoyer la transcription pour traduction
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({
                                type: MESSAGE_TYPES.TRANSLATION_REQUEST,
                                text: data.text,
                                source: data.source,
                                sourceLang: data.source === MESSAGE_TYPES.SOURCE.CALLER ? 
                                    this.getAttribute('caller-lang') : 
                                    this.getAttribute('receiver-lang'),
                                targetLang: data.source === MESSAGE_TYPES.SOURCE.CALLER ? 
                                    this.getAttribute('receiver-lang') : 
                                    this.getAttribute('caller-lang')
                            }));
                        }
                        break;

                    case MESSAGE_TYPES.TRANSLATION:
                        // Envoyer le texte traduit pour la synthèse vocale
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({
                                type: MESSAGE_TYPES.TTS_REQUEST,
                                text: data.translatedText,
                                source: data.source,
                                language: data.source === MESSAGE_TYPES.SOURCE.CALLER ? 
                                    this.getAttribute('receiver-lang') : 
                                    this.getAttribute('caller-lang')
                            }));
                        }
                        break;

                    case MESSAGE_TYPES.CALL_STATUS:
                        // Gérer les changements de statut d'appel
                        if (data.status === 'completed' || data.status === 'failed') {
                            this.endCall();
                        }
                        break;
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.cleanup();
            setTimeout(() => this.initWebSocket(), 1000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    updateLanguages() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            const callerLang = this.getAttribute('caller-lang') || 'fr-FR';
            const receiverLang = this.getAttribute('receiver-lang') || 'en-US';

            // Update caller language
            this.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.LANGUAGE,
                source: MESSAGE_TYPES.SOURCE.CALLER,
                language: callerLang
            }));

            // Update receiver language
            this.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.LANGUAGE,
                source: MESSAGE_TYPES.SOURCE.RECEIVER,
                language: receiverLang
            }));
        }
    }

    async startCall() {
        try {
            // Initialiser l'audio
            this.audioManager = new CallButtonAudioManager(this.ws);
            const audioInitialized = await this.audioManager.setupAudioStream();
            
            if (!audioInitialized) {
                throw new Error('Failed to initialize audio');
            }

            const phone = this.getAttribute('phone');
            if (!phone) {
                throw new Error('Phone number is required');
            }

            const response = await fetch('/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: phone
                })
            });

            if (!response.ok) {
                throw new Error('Failed to start call');
            }

            // Démarrer l'enregistrement audio
            this.audioManager.startRecording();
            
            console.log('Call started successfully');
            return true;
        } catch (error) {
            console.error('Error starting call:', error);
            this.cleanup();
            return false;
        }
    }

    async endCall() {
        try {
            // Arrêter l'enregistrement audio
            if (this.audioManager) {
                this.audioManager.stopRecording();
            }

            const response = await fetch('/end-call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    callSid: this.callSid
                })
            });

            if (!response.ok) {
                throw new Error('Failed to end call');
            }

            console.log('Call ended successfully');
            this.cleanup();
        } catch (error) {
            console.error('Error ending call:', error);
        }
    }

    cleanup() {
        if (this.audioManager) {
            this.audioManager.cleanup();
            this.audioManager = null;
        }
    }

    disconnectedCallback() {
        this.cleanup();
    }

    isBase64(str) {
        try {
            return btoa(atob(str)) === str;
        } catch (err) {
            return false;
        }
    }
}

// Register the custom element
customElements.define('eva-call-button', EVACallButton);
