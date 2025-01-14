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
        this.audioQueue = [];
        this.isPlaying = false;
        this.isPlayingTranslation = false;
        this.audioContext = null;
        this.currentCallSid = null;
        this.waitingAudio = null;
        this.waitingAudioLoop = null;
        this.translationQueue = [];

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
            // Récupérer l'audio depuis le serveur
            const response = await fetch(`${this.config.apiBaseUrl}/waiting-message?language=${this.config.callerLanguage}`);
            const audioBlob = await response.blob();
            this.waitingAudio = new Audio(URL.createObjectURL(audioBlob));
            this.waitingAudio.loop = true;
            await this.waitingAudio.play();
        } catch (error) {
            console.error('Erreur lors de la lecture du message d\'attente:', error);
        }
    }

    stopWaitingMessage() {
        if (this.waitingAudio) {
            this.waitingAudio.pause();
            this.waitingAudio.currentTime = 0;
            this.waitingAudio = null;
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
                                if (data.source === 'receiver') {
                                    this.stopWaitingMessage(); // Arrêter le message d'attente quand on reçoit de l'audio
                                    console.log('Playing receiver original audio');
                                    this.playAudioStream(data.audio);
                                }
                                break;

                            case 'receiver_audio':
                                this.stopWaitingMessage();
                                console.log('Playing receiver mulaw audio');
                                this.playAudioStream(data.audio, false);
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

                                // Pour le receiver, on joue la traduction après l'audio original
                                if (data.source === 'receiver' && data.audioBase64 && data.type === 'transcription-final') {
                                    console.log('Playing translation audio for receiver');
                                    setTimeout(() => {
                                        this.playAudioStream(data.audioBase64, true);
                                    }, 500); // Petit délai pour laisser l'audio original se terminer
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

    playAudioStream(base64Audio, isTranslation = false) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Si c'est une traduction
        if (isTranslation) {
            // Stocker dans la queue de traduction
            this.translationQueue = this.translationQueue || [];
            this.translationQueue.push(base64Audio);
            
            // Si rien n'est en cours de lecture, commencer la lecture
            if (!this.isPlaying) {
                this.playNextTranslation();
            }
        } else {
            // C'est l'audio original en temps réel
            // Jouer directement si aucune traduction n'est en cours
            if (!this.isPlaying || !this.isPlayingTranslation) {
                this.playMulawAudio(base64Audio);
            }
        }
    }

    async playMulawAudio(base64Audio) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000  // Réduire le taux d'échantillonnage pour moins de distorsion
            });
        }

        // Ne pas jouer l'audio original si une traduction est en cours
        if (this.isPlayingTranslation) {
            return;
        }

        try {
            // Convertir base64 en ArrayBuffer
            const byteCharacters = atob(base64Audio);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
            }

            // Convertir mulaw en PCM avec une meilleure qualité
            const pcmData = this.mulawToPcm(byteArray);
            
            // Suréchantillonnage plus doux de 8kHz à 16kHz
            const upsampled = this.upsample(pcmData, 8000, 16000);
            
            // Créer un buffer audio
            const audioBuffer = this.audioContext.createBuffer(1, upsampled.length, 16000);
            const channelData = audioBuffer.getChannelData(0);
            
            // Copier les données avec un gain réduit
            const gain = 0.6; // Réduire le volume
            for (let i = 0; i < upsampled.length; i++) {
                // Ajouter un filtre passe-bas simple pour réduire le bruit haute fréquence
                if (i > 0) {
                    channelData[i] = Math.max(-1, Math.min(1, upsampled[i] * gain));
                    // Moyenne mobile pour lisser le signal
                    channelData[i] = (channelData[i] + channelData[i-1]) * 0.5;
                } else {
                    channelData[i] = Math.max(-1, Math.min(1, upsampled[i] * gain));
                }
            }

            // Créer le graphe audio
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            // Créer un gain node pour contrôler le volume
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0.8; // Réduire encore un peu le volume

            // Ajouter un compresseur plus doux
            const compressor = this.audioContext.createDynamicsCompressor();
            compressor.threshold.value = -18;  // Seuil plus haut
            compressor.knee.value = 10;        // Compression plus douce
            compressor.ratio.value = 4;        // Ratio plus faible
            compressor.attack.value = 0.005;   // Attaque un peu plus lente
            compressor.release.value = 0.1;    // Relâchement plus rapide

            // Ajouter un filtre passe-bas pour réduire les hautes fréquences qui grésillent
            const lowPassFilter = this.audioContext.createBiquadFilter();
            lowPassFilter.type = 'lowpass';
            lowPassFilter.frequency.value = 3500; // Couper les hautes fréquences
            lowPassFilter.Q.value = 0.5;

            // Ajouter un filtre passe-haut pour réduire les bruits de fond
            const highPassFilter = this.audioContext.createBiquadFilter();
            highPassFilter.type = 'highpass';
            highPassFilter.frequency.value = 85;
            highPassFilter.Q.value = 0.5;

            // Connecter les nœuds audio dans l'ordre
            source.connect(lowPassFilter);
            lowPassFilter.connect(highPassFilter);
            highPassFilter.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
        } catch (error) {
            console.error('Error playing mulaw audio:', error);
        }
    }

    upsample(pcmData, originalRate, targetRate) {
        const ratio = targetRate / originalRate;
        const upsampledLength = Math.floor(pcmData.length * ratio);
        const upsampled = new Float32Array(upsampledLength);
        
        // Utiliser une fenêtre de 4 points pour une interpolation plus douce
        for (let i = 0; i < upsampledLength; i++) {
            const exactIndex = i / ratio;
            const index1 = Math.floor(exactIndex);
            const index2 = Math.min(index1 + 1, pcmData.length - 1);
            const index0 = Math.max(0, index1 - 1);
            const index3 = Math.min(index2 + 1, pcmData.length - 1);
            const fraction = exactIndex - index1;
            
            // Interpolation cubique
            const a0 = pcmData[index3] - pcmData[index2] - pcmData[index0] + pcmData[index1];
            const a1 = pcmData[index0] - pcmData[index1] - a0;
            const a2 = pcmData[index2] - pcmData[index0];
            const a3 = pcmData[index1];
            
            const t = fraction;
            upsampled[i] = a0 * t * t * t + a1 * t * t + a2 * t + a3;
            
            // Appliquer un léger lissage
            if (i > 0) {
                upsampled[i] = 0.9 * upsampled[i] + 0.1 * upsampled[i-1];
            }
        }
        
        return upsampled;
    }

    mulawToPcm(mulawData) {
        // Table de conversion µ-law vers PCM linéaire optimisée
        const MULAW_DECODE_TABLE = new Float32Array([
            -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
            -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
            -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
            -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
            -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
            -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
            -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
            -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
            -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
            -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
            -876, -844, -812, -780, -748, -716, -684, -652,
            -620, -588, -556, -524, -492, -460, -428, -396,
            -372, -356, -340, -324, -308, -292, -276, -260,
            -244, -228, -212, -196, -180, -164, -148, -132,
            -120, -112, -104, -96, -88, -80, -72, -64,
            -56, -48, -40, -32, -24, -16, -8, 0,
            32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
            23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
            15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
            11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
            7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
            5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
            3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
            2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
            1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
            1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
            876, 844, 812, 780, 748, 716, 684, 652,
            620, 588, 556, 524, 492, 460, 428, 396,
            372, 356, 340, 324, 308, 292, 276, 260,
            244, 228, 212, 196, 180, 164, 148, 132,
            120, 112, 104, 96, 88, 80, 72, 64,
            56, 48, 40, 32, 24, 16, 8, 0
        ]);
        
        const pcmData = new Float32Array(mulawData.length);
        let prevSample = 0; // Pour le lissage
        
        for (let i = 0; i < mulawData.length; i++) {
            // Convertir avec moins de gain
            const rawValue = MULAW_DECODE_TABLE[mulawData[i]] / 32768.0;
            
            // Appliquer un lissage temporel pour réduire le bruit
            const smoothedValue = 0.85 * rawValue + 0.15 * prevSample;
            prevSample = smoothedValue;
            
            // Appliquer une compression douce
            pcmData[i] = Math.sign(smoothedValue) * Math.pow(Math.abs(smoothedValue), 1.1) * 0.7;
        }
        
        return pcmData;
    }

    async playNextTranslation() {
        if (!this.translationQueue || this.translationQueue.length === 0) {
            this.isPlaying = false;
            this.isPlayingTranslation = false;
            return;
        }

        this.isPlaying = true;
        this.isPlayingTranslation = true;
        const base64Audio = this.translationQueue.shift();

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

            // Ajouter un compresseur pour améliorer la dynamique
            const compressor = this.audioContext.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            // Ajouter un filtre passe-bande pour améliorer la voix
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            filter.Q.value = 0.5;

            // Connecter les nœuds audio
            source.connect(filter);
            filter.connect(compressor);
            compressor.connect(this.audioContext.destination);
            
            source.onended = () => {
                this.isPlayingTranslation = false;
                this.playNextTranslation();
            };
            
            source.start(0);
        } catch (error) {
            console.error('Error playing translation:', error);
            this.isPlayingTranslation = false;
            this.playNextTranslation();
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
