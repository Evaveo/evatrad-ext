class EvatradButton {
    constructor(buttonElement, config) {
        if (!config.phoneNumber) {
            throw new Error('Le numéro de téléphone est requis');
        }
        if (!config.apiBaseUrl) {
            throw new Error('L\'URL de base de l\'API est requise');
        }
        
        this.button = buttonElement;
        // Convertir l'URL de base en URL WebSocket
        const wsBaseUrl = config.apiBaseUrl.replace(/^http/, 'ws');
        
        this.config = {
            phoneNumber: config.phoneNumber,
            callerLanguage: config.callerLanguage || 'fr-FR',
            receiverLanguage: config.receiverLanguage || 'en-US',
            apiBaseUrl: config.apiBaseUrl,
            wsUrl: `${wsBaseUrl}/browser`
        };

        this.isRecording = false;
        this.mediaRecorder = null;
        this.ws = null;
        this.audioQueue = [];  // File d'attente pour les audios
        this.isPlayingAudio = false;  // Flag pour savoir si un audio est en cours
        this.isPlaying = false;
        this.isPlayingTranslation = false;
        this.audioContext = null;
        this.currentCallSid = null;
        this.waitingAudio = null;
        this.waitingAudioLoop = null;
        this.translationQueue = [];
        this.currentAudio = null; // Pour garder une référence à l'audio en cours

        this.init();
    }

    init() {
        this.createCallInterface();
        this.initAudioContext();
        this.button.addEventListener('click', () => {
            if (this.currentCallSid) {
                this.endCall();
            } else {
                this.showCallInterface();
            }
        });
    }

    updateButtonState(isInCall) {
        if (isInCall) {
            this.button.textContent = 'Raccrocher';
            this.button.classList.add('in-call');
            this.button.classList.add('btn-danger');
            this.button.classList.remove('btn-primary');
        } else {
            this.button.textContent = 'Appeler';
            this.button.classList.remove('in-call');
            this.button.classList.remove('btn-danger');
            this.button.classList.add('btn-primary');
        }
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

            // Démarrer le message d'attente
            await this.playWaitingMessage();

            const response = await fetch(`${this.config.apiBaseUrl}/call`, {
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
                this.updateButtonState(true);
                await this.connectWebSocket();
                await this.startRecording();
                this.callStatus.textContent = 'Appel en cours...';
                this.button.classList.add('recording');
            } else {
                this.stopWaitingMessage();
                this.callStatus.textContent = data.error || 'Erreur lors de l\'initiation de l\'appel';
                throw new Error(data.error || 'Erreur lors de l\'initiation de l\'appel');
            }
        } catch (error) {
            console.error('Error starting call:', error);
            this.stopWaitingMessage();
            this.callStatus.textContent = 'Erreur lors du démarrage de l\'appel';
            this.endCall();
        }
    }

    async playWaitingMessage() {
        try {
            // D'abord jouer le message de bienvenue
            const welcomeResponse = await fetch(`${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=welcome`);
            const welcomeBlob = await welcomeResponse.blob();
            const welcomeAudio = new Audio(URL.createObjectURL(welcomeBlob));
            
            // Attendre que le message de bienvenue soit terminé
            await new Promise((resolve) => {
                welcomeAudio.onended = resolve;
                welcomeAudio.play();
            });

            // Ensuite, commencer la boucle du message d'attente
            const waitingResponse = await fetch(`${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=waiting`);
            const waitingBlob = await waitingResponse.blob();
            this.waitingAudio = new Audio(URL.createObjectURL(waitingBlob));
            this.waitingAudio.loop = true;
            await this.waitingAudio.play();
        } catch (error) {
            console.error('Erreur lors de la lecture du message d\'attente:', error);
        }
    }

    stopWaitingMessage() {
        this.stopAllAudio();  // Arrêter tous les audios en cours et vider la file
        if (this.waitingAudio) {
            this.waitingAudio.pause();
            this.waitingAudio.currentTime = 0;
            this.waitingAudio = null;
        }
    }

    queueAudio(audioBase64) {
        this.audioQueue.push(audioBase64);
        // Si aucun audio n'est en cours, démarrer la lecture
        if (!this.isPlayingAudio) {
            this.playNextAudio();
        }
    }

    async playNextAudio() {
        if (this.audioQueue.length === 0 || this.isPlayingAudio) {
            return;
        }

        console.log('Lecture du prochain audio, taille de la file:', this.audioQueue.length);
        this.isPlayingAudio = true;
        const audioBase64 = this.audioQueue.shift();

        try {
            // Vérifier que l'audioContext est initialisé
            if (!this.audioContext) {
                console.log('Initialisation de audioContext');
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                await this.audioContext.resume();
            }

            // Décoder l'audio base64
            const response = await fetch(`data:audio/mp3;base64,${audioBase64}`);
            const arrayBuffer = await response.arrayBuffer();
            
            console.log('Décodage de l\'audio...');
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            console.log('Création de la source audio...');
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Jouer l'audio
            console.log('Démarrage de la lecture...');
            source.start(0);
            
            // Attendre la fin de la lecture
            await new Promise((resolve) => {
                source.onended = () => {
                    console.log('Audio terminé avec succès');
                    resolve();
                };
            });

            this.isPlayingAudio = false;
            this.playNextAudio();
        } catch (error) {
            console.error('Erreur lors de la lecture audio:', error);
            this.isPlayingAudio = false;
            this.playNextAudio();
        }
    }

    stopAllAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        this.audioQueue = [];  // Vider la file d'attente
        this.isPlayingAudio = false;
    }

    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.wsUrl);

                this.ws.onmessage = (event) => {
                    this.handleWebSocketMessage(event);
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

    handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);

            // Gérer les différents types de messages
            switch (message.type) {
                case 'call_status':
                    this.handleCallStatusMessage(message);
                    break;
                case 'transcription-interim':
                case 'transcription-final':
                    this.handleTranscriptionMessage(message);
                    break;
                case 'receiver_audio':
                    console.log('Audio du receiver reçu, longueur:', message.audio.length);
                    this.handleAudioMessage(message);
                    break;
                case 'language':
                    // Mise à jour de la langue
                    break;
                default:
                    console.log('Message type non géré:', message.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    handleCallStatusMessage(message) {
        console.log('Call status:', message);
        if (this.callStatus) {
            this.callStatus.textContent = message.message || 'Appel en cours...';
        }
    }

    handleTranscriptionMessage(message) {
        // Identifier qui parle (caller ou receiver)
        const transcriptionDiv = (message.source === 'caller') 
            ? this.myTranscription 
            : this.otherTranscription;
        
        // Arrêter le message d'attente si c'est le receiver qui parle
        if (message.source === 'receiver') {
            this.stopWaitingMessage();
        }

        // Gérer les transcriptions intermédiaires (pendant que la personne parle)
        if (message.type === 'transcription-interim') {
            // Chercher s'il existe déjà une div interim
            let interimDiv = transcriptionDiv.querySelector('.transcription-item.interim');
            
            // Si pas de div interim, en créer une
            if (!interimDiv) {
                interimDiv = document.createElement('div');
                interimDiv.classList.add('transcription-item', 'interim');
                transcriptionDiv.appendChild(interimDiv);
            }

            // Mettre à jour le contenu de la div interim
            interimDiv.innerHTML = `
                <div class="original">${message.originalText}</div>
                <div class="translation">${message.translatedText}</div>
            `;

            // Ajouter l'audio à la file d'attente s'il y en a un (cas du receiver)
            if (message.audioBase64) {
                this.queueAudio(message.audioBase64);
            }
            
            // Scroll vers le bas après la mise à jour
            this.scrollToBottom(transcriptionDiv);
        }
        
        // Gérer les transcriptions finales (quand la personne a fini de parler)
        else if (message.type === 'transcription-final') {
            // Supprimer la div interim car on a maintenant le texte final
            const oldInterim = transcriptionDiv.querySelector('.transcription-item.interim');
            if (oldInterim) {
                oldInterim.remove();
            }

            // Créer une nouvelle div pour le texte final
            const finalItem = document.createElement('div');
            finalItem.classList.add('transcription-item', 'final');
            finalItem.innerHTML = `
                <div class="original">${message.originalText}</div>
                <div class="translation">${message.translatedText}</div>
            `;
            transcriptionDiv.appendChild(finalItem);

            // Ajouter l'audio final à la file d'attente s'il y en a un (cas du receiver)
            if (message.audioBase64) {
                this.queueAudio(message.audioBase64);
            }

            // Scroll vers le bas après la mise à jour
            this.scrollToBottom(transcriptionDiv);
        }
    }

    handleAudioMessage(message) {
        console.log('Traitement du message audio');
        // Vérifier que l'audio est présent et valide
        if (!message.audio || typeof message.audio !== 'string') {
            console.error('Message audio invalide:', message);
            return;
        }

        try {
            // Vérifier si l'audio est en base64 valide
            const validBase64 = /^[A-Za-z0-9+/=]+$/.test(message.audio);
            if (!validBase64) {
                console.error('Format base64 invalide pour l\'audio');
                return;
            }

            console.log('Ajout de l\'audio à la file d\'attente');
            this.queueAudio(message.audio);
        } catch (error) {
            console.error('Erreur lors du traitement du message audio:', error);
        }
    }

    // Fonction utilitaire pour s'assurer que le scroll est bien en bas
    scrollToBottom(element) {
        // Attendre un peu que le contenu soit mis à jour
        requestAnimationFrame(() => {
            element.scrollTop = element.scrollHeight;
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

    async endCall() {
        try {
            if (this.currentCallSid) {
                await fetch(`${this.config.apiBaseUrl}/end-call`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        callSid: this.currentCallSid
                    })
                });
            }
        } catch (error) {
            console.error('Error ending call:', error);
        } finally {
            this.stopWaitingMessage();
            if (this.mediaRecorder && this.isRecording) {
                this.mediaRecorder.stop();
                this.isRecording = false;
            }
            if (this.ws) {
                this.ws.close();
                this.ws = null;
            }
            this.currentCallSid = null;
            this.updateButtonState(false);
            this.button.classList.remove('recording');
            this.modal.hide();
            if (this.myTranscription) this.myTranscription.innerHTML = '';
            if (this.otherTranscription) this.otherTranscription.innerHTML = '';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EvatradButton;
}
