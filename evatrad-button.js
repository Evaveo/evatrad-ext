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

        // Gestion audio TTS (Receiver → Caller) sous forme de queue
        this.audioQueue = [];
        this.isPlayingAudio = false;
        this.currentSource = null;
        this.audioContext = null;

        this.onEndCallClick = null;
        if (this.endCallButton) {
            this.endCallButton.addEventListener('click', () => {
                if (typeof this.onEndCallClick === 'function') {
                    this.onEndCallClick();
                }
            });
        }
    }

    // ---- Interface du modal ----
    showModal() {
        if (this.modal) this.modal.show();
    }
    hideModal() {
        if (this.modal) this.modal.hide();
    }
    setCallStatus(text) {
        if (this.callStatus) {
            this.callStatus.textContent = text;
        }
    }
    clearTranscriptions() {
        if (this.myTranscription) this.myTranscription.innerHTML = '';
        if (this.otherTranscription) this.otherTranscription.innerHTML = '';
    }

    // ---- Transcriptions ----
    appendTranscription(source, originalText, translatedText, isFinal, audioBase64) {
        // source = 'caller' ou 'receiver'
        const isCaller = (source === 'caller');
        const container = isCaller ? this.myTranscription : this.otherTranscription;
        if (!container) return;

        // Efface la transcription interim si on reçoit un "final"
        if (isFinal) {
            const oldInterim = container.querySelector('.transcription-item.interim');
            if (oldInterim) oldInterim.remove();
        }

        // Crée une div .transcription-item
        const div = document.createElement('div');
        div.classList.add('transcription-item', isFinal ? 'final' : 'interim');
        div.innerHTML = `
            <div class="original">${originalText}</div>
            <div class="translation">${translatedText}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        // S’il y a un audioBase64 (receiver → caller), on le joue via la queue
        if (audioBase64) {
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

    // ---- Queue audio (Receiver → Caller) ----
    queueAudio(audioBase64) {
        this.audioQueue.push(audioBase64);
        if (!this.isPlayingAudio) {
            this.playNextAudio();
        }
    }
    async playNextAudio() {
        if (this.audioQueue.length === 0 || this.isPlayingAudio) return;
        this.isPlayingAudio = true;

        const audioBase64 = this.audioQueue.shift();
        try {
            await this.playInlineAudio(audioBase64);
        } catch (err) {
            console.error('Erreur lecture audio dans queue:', err);
        } finally {
            this.isPlayingAudio = false;
            this.playNextAudio(); // on enchaîne
        }
    }

    // ---- Lecture d’un audio en base64 (MP3) de manière "inline" (synchrone) ----
    // Ici, on crée un AudioBuffer et on attend la fin pour résoudre la Promise.
    playInlineAudio(base64) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    await this.audioContext.resume();
                }
                const arrayBuffer = this.decodeBase64ToArrayBuffer(base64);
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this.audioContext.destination);

                source.onended = () => {
                    resolve();
                };
                source.start(0);
            } catch (error) {
                reject(error);
            }
        });
    }

    // Convertit un base64 en ArrayBuffer
    decodeBase64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // ---- Arrêter tout l’audio en cours (fin d’appel) ----
    stopAllAudio() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (err) {
                console.error('Erreur en stoppant la source audio:', err);
            }
            this.currentSource = null;
        }
        this.audioQueue = [];
        this.isPlayingAudio = false;
    }
}


// --------------------- Classe EvatradButton --------------------- //
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
            partialTtsInterval: config.partialTtsInterval || 2000
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

        // Initialisation
        this.initAudioContext();
        this.attachEvents(buttonElement);
        if (this.ui) {
            this.ui.setOnEndCallClick(() => this.endCall());
        }
    }

    attachEvents(button) {
        button.addEventListener('click', () => {
            if (this.currentCallSid) {
                this.endCall();
            } else {
                if (this.ui) this.ui.showModal();
                this.startCall();
            }
        });
    }

    // ---- Démarrage de l’appel ----
    async startCall() {
        try {
            if (this.ui) {
                this.ui.clearTranscriptions();
                this.ui.setCallStatus('Initialisation...');
            }

            // 1) Jouer le message de bienvenue côté Caller
            await this.playWelcomeMessage();

            // 2) Démarrer la boucle d’attente
            this.startWaitingLoop();

            // 3) Faire la requête POST /call
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
            const data = await response.json();
            if (!data.success) {
                if (this.ui) this.ui.setCallStatus(data.error || "Erreur lors de l'initiation de l'appel");
                throw new Error(data.error || 'Erreur /call');
            }

            this.currentCallSid = data.callSid;
            if (this.ui) {
                this.ui.setCallStatus('Appel en cours...');
                this.ui.updateMainButton(this.button, true);
            }

            // 4) Connecter le WebSocket
            await this.connectWebSocket();

        } catch (error) {
            console.error('Erreur startCall:', error);
            if (this.ui) {
                this.ui.setCallStatus("Erreur lors du démarrage de l'appel");
            }
            this.endCall();
        }
    }

    // ---- Message de bienvenue ----
    async playWelcomeMessage() {
        try {
            this.playingWelcome = true;
            const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=welcome`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = this.arrayBufferToBase64(arrayBuffer);

            if (this.ui) {
                // On utilise la méthode inline du UI pour attendre la fin
                await this.ui.playInlineAudio(base64);
            } else {
                // S'il n'y a pas d'UI, on peut faire un Audio(...) direct
                await this.playAudioStandalone(base64);
            }
        } catch (err) {
            console.error('Erreur playWelcomeMessage:', err);
        } finally {
            this.playingWelcome = false;
        }
    }

    // ---- Boucle d’attente ----
    async startWaitingLoop() {
        this.waitingLoopActive = true;
        this.playingWaiting = true;

        while (this.waitingLoopActive) {
            try {
                const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=waiting`;
                const resp = await fetch(url);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const base64 = this.arrayBufferToBase64(arrayBuffer);

                if (this.ui) {
                    await this.ui.playInlineAudio(base64);
                } else {
                    await this.playAudioStandalone(base64);
                }

                // Petite pause
                if (this.waitingLoopActive) {
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (error) {
                console.error('Erreur startWaitingLoop:', error);
                break;
            }
        }
        this.playingWaiting = false;
    }

    stopWaitingLoop() {
        this.waitingLoopActive = false;
    }

    // ---- WebSocket ----
    async connectWebSocket() {
        const wsBaseUrl = this.config.apiBaseUrl.replace(/^http/, 'ws');
        const wsUrl = `${wsBaseUrl}/browser`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connecté.');
            this.ws.send(JSON.stringify({
                type: 'init',
                callSid: this.currentCallSid
            }));
        };

        this.ws.onmessage = (event) => {
            this.handleWebSocketMessage(event);
        };

        this.ws.onerror = (error) => {
            console.error('Erreur WebSocket:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket fermé.');
        };
    }

    handleWebSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);

            switch (message.type) {
                case 'call_status':
                    if (this.ui && message.status) {
                        this.ui.setCallStatus(message.status);
                    }
                    // Démarrer l'enregistrement dès que l'appel est décroché
                    if (message.status === 'in-progress' || message.status === 'answered') {
                        console.log('Call in progress => stop waiting + start recording');
                        this.stopWaitingLoop();
                        // Démarrer l'enregistrement immédiatement
                        this.startRecording().catch(console.error);
                    }
                    break;

                case 'receiver_tts_done':
                    // On ne démarre plus l'enregistrement ici car déjà fait au 'in-progress'
                    console.log('Receiver TTS done (receiver ready)');
                    this.receiverReady = true;
                    break;

                case 'transcription-interim':
                case 'transcription-final':
                    this.handleTranscriptionMessage(message);
                    break;

                case 'receiver_audio':
                    // On ne fait rien avec l'audio du receiver pour l'instant
                    break;

                case 'call_ended':
                    this.cleanupAfterCall();
                    break;

                default:
                    console.log('Unhandled websocket message type:', message.type);
                    break;
            }
        } catch (err) {
            console.error('Error parsing websocket message:', err);
        }
    }

    handleTranscriptionMessage(msg) {
        const isFinal = (msg.type === 'transcription-final');
        const source = msg.source; // "caller" ou "receiver"
        if (!this.ui) return;
        this.ui.appendTranscription(
            source,
            msg.originalText,
            msg.translatedText,
            isFinal,
            msg.audioBase64
        );
    }

    // ---- Enregistrement micro (Caller → Serveur) ----
    async startRecording() {
        try {
            console.log('Starting mic recording...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            let mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm;codecs=opus';
            }
            console.log('Using mime type:', mimeType);

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            console.log('Sending audio chunk:', e.data.size, 'bytes');
                            this.ws.send(JSON.stringify({
                                type: 'audio',
                                source: 'caller',
                                audio: base64data,
                                language: this.config.callerLanguage
                            }));
                        }
                    };
                    reader.readAsDataURL(e.data);
                }
            };

            this.mediaRecorder.start(100); // More frequent chunks for better latency
            this.isRecording = true;
            console.log('MediaRecorder started');
        } catch (error) {
            console.error('Error in startRecording:', error);
            throw error;
        }
    }

    // ---- Fin d’appel ----
    async endCall() {
        if (this.isEndingCall) return;
        this.isEndingCall = true;

        try {
            if (this.currentCallSid) {
                const response = await fetch(`${this.config.apiBaseUrl}/end-call`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callSid: this.currentCallSid })
                });
                if (!response.ok) {
                    console.error('Erreur serveur end-call:', response.statusText);
                }
            }
        } catch (error) {
            console.error('Erreur endCall:', error);
        } finally {
            this.cleanupAfterCall();
            this.isEndingCall = false;
        }
    }

    // ---- Nettoyage ----
    cleanupAfterCall() {
        console.log('Cleanup after call');
        this.stopWaitingLoop();
        if (this.ui) {
            this.ui.stopAllAudio();
        }

        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.currentCallSid = null;
        this.button.classList.remove('recording');
        if (this.ui) {
            this.ui.hideModal();
            this.ui.updateMainButton(this.button, false);
            this.ui.clearTranscriptions();
        }
    }

    // ---- AudioContext pour iOS ----
    initAudioContext() {
        document.addEventListener('click', () => {
            if (this.ui && !this.ui.audioContext) {
                this.ui.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext initialisé (iOS).');
            }
        }, { once: true });
    }

    // ---- Méthode utilitaire : lecture "standalone" si pas d’UI ----
    // (si tu n’as pas envie de stocker l’audio dans la queue du UI)
    async playAudioStandalone(base64) {
        return new Promise(async (resolve, reject) => {
            try {
                const audio = new Audio(`data:audio/mp3;base64,${base64}`);
                audio.onended = () => resolve();
                audio.onerror = (e) => reject(e);
                audio.play();
            } catch (err) {
                reject(err);
            }
        });
    }

    // ---- Convert ArrayBuffer → base64 ----
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}

// Exporte globalement
window.EvatradUI = EvatradUI;
window.EvatradButton = EvatradButton;
