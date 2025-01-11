class EvatradButton {
    constructor(buttonElement, config) {
        if (!config.phoneNumber) {
            throw new Error('Le numéro de téléphone est requis');
        }
        
        this.button = buttonElement;
        this.config = {
            phoneNumber: config.phoneNumber,
            callerLanguage: config.callerLanguage || 'fr-FR',
            receiverLanguage: config.receiverLanguage || 'en-US',
            wsUrl: config.wsUrl || 'wss://759e162763ba.ngrok.app/browser'
        };

        this.isRecording = false;
        this.mediaRecorder = null;
        this.ws = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.audioContext = null;
        this.currentCallSid = null;

        this.init();
    }

    init() {
        this.createCallInterface();
        this.initAudioContext();
        this.button.addEventListener('click', () => this.showCallInterface());
    }

    initAudioContext() {
        document.addEventListener('click', () => {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }, { once: true });
    }

    createCallInterface() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'evatradCallModal_' + Math.random().toString(36).substr(2, 9);
        modal.setAttribute('tabindex', '-1');
        
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Appel en cours</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="callStatus" class="alert alert-info">Initialisation...</div>
                        <div class="transcription">
                            <h3>Ma transcription</h3>
                            <div id="myTranscription"></div>
                        </div>
                        <div class="transcription">
                            <h3>Transcription de l'interlocuteur</h3>
                            <div id="otherTranscription"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-danger" id="endCallButton">Terminer l'appel</button>
                    </div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            .transcription {
                margin: 20px;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 5px;
                height: 200px;
                overflow-y: auto;
            }
            .original {
                color: #333;
                margin-bottom: 5px;
            }
            .translation {
                color: #666;
                font-style: italic;
                margin-left: 10px;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
        
        this.modal = new bootstrap.Modal(modal);
        
        modal.querySelector('#endCallButton').addEventListener('click', () => this.endCall());
        modal.addEventListener('hidden.bs.modal', () => this.endCall());

        this.modalElement = modal;
        this.callStatus = modal.querySelector('#callStatus');
        this.myTranscription = modal.querySelector('#myTranscription');
        this.otherTranscription = modal.querySelector('#otherTranscription');
    }

    showCallInterface() {
        if (!this.config.phoneNumber) {
            alert('Veuillez entrer un numéro de téléphone');
            return;
        }
        this.modal.show();
        this.startCall();
    }

    async startCall() {
        try {
            if (!this.config.phoneNumber) {
                alert('Veuillez entrer un numéro de téléphone');
                return;
            }

            const response = await fetch('/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    to: this.config.phoneNumber,
                    callerLanguage: this.config.callerLanguage,
                    receiverLanguage: this.config.receiverLanguage
                })
            });

            const data = await response.json();
            if (data.success) {
                console.log('Appel initié avec succès - SID:', data.callSid);
                this.currentCallSid = data.callSid;
                await this.connectWebSocket();
                await this.startRecording();
                this.callStatus.textContent = 'Appel en cours...';
                this.button.classList.add('recording');
            } else {
                this.callStatus.textContent = data.error || 'Erreur lors de l\'initiation de l\'appel';
                throw new Error(data.error || 'Erreur lors de l\'initiation de l\'appel');
            }
        } catch (error) {
            console.error('Error starting call:', error);
            this.callStatus.textContent = 'Erreur lors du démarrage de l\'appel';
            this.endCall();
        }
    }

    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.wsUrl);

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('WebSocket message received:', data);
                        
                        switch (data.type) {
                            case 'audio':
                                if (data.source === 'receiver' && data.audio) {
                                    console.log('Playing receiver audio');
                                    this.playAudioStream(data.audio);
                                }
                                break;

                            case 'transcription-interim':
                            case 'transcription-final':
                                const transcriptionDiv = data.source === 'caller' ? this.myTranscription : this.otherTranscription;
                                const p = document.createElement('p');
                                p.innerHTML = `
                                    <div class="original">${data.originalText}</div>
                                    ${data.translatedText ? `<div class="translation">(${data.translatedText})</div>` : ''}
                                `;
                                transcriptionDiv.appendChild(p);
                                transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;

                                if (data.source === 'receiver' && data.audioBase64) {
                                    console.log('Playing transcription audio from receiver');
                                    this.playAudioStream(data.audioBase64);
                                }
                                break;

                            case 'error':
                                console.error('Server error:', data.error);
                                if (this.callStatus) {
                                    this.callStatus.textContent = 'Erreur: ' + data.error;
                                    this.callStatus.className = 'alert alert-danger';
                                }
                                break;

                            case 'call-status':
                                console.log('Call status:', data);
                                if (this.callStatus) {
                                    this.callStatus.textContent = data.message || 'Appel en cours...';
                                }
                                break;
                        }
                    } catch (error) {
                        console.error('Error handling WebSocket message:', error);
                    }
                };

                this.ws.onopen = () => {
                    console.log('WebSocket Connected');
                    // Envoyer la configuration initiale
                    this.ws.send(JSON.stringify({
                        type: 'call',
                        phoneNumber: this.config.phoneNumber,
                        callerLanguage: this.config.callerLanguage,
                        receiverLanguage: this.config.receiverLanguage
                    }));
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket Error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket closed');
                    this.endCall();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = 'audio/webm';
            
            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            
            this.mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            const base64Audio = reader.result.split(',')[1];
                            this.ws.send(JSON.stringify({
                                type: 'audio',
                                source: 'caller',
                                audio: base64Audio,
                                language: this.config.callerLanguage,
                                timestamp: Date.now()
                            }));
                        }
                    };
                    reader.readAsDataURL(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start(250);
            this.isRecording = true;
        } catch (error) {
            console.error('Error starting recording:', error);
            throw error;
        }
    }

    playAudioStream(base64Audio) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.audioQueue.push(base64Audio);
        if (!this.isPlaying) {
            this.playNextInQueue();
        }
    }

    async playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const base64Audio = this.audioQueue.shift();

        try {
            const byteCharacters = atob(base64Audio);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            
            const audioBuffer = await this.audioContext.decodeAudioData(byteArray.buffer);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.onended = () => this.playNextInQueue();
            source.start(0);
        } catch (error) {
            console.error('Error playing audio:', error);
            this.playNextInQueue();
        }
    }

    async endCall() {
        if (this.currentCallSid) {
            try {
                const response = await fetch('/end-call', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        callSid: this.currentCallSid
                    })
                });

                const data = await response.json();
                if (data.success) {
                    this.currentCallSid = null;
                }
            } catch (error) {
                console.error('Error ending call:', error);
            }
        }

        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.button.classList.remove('recording');

        if (this.modal) {
            this.modal.hide();
        }

        if (this.myTranscription) this.myTranscription.innerHTML = '';
        if (this.otherTranscription) this.otherTranscription.innerHTML = '';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EvatradButton;
}
