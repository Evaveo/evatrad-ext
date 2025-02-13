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

        // Gestion audio mixte (original + TTS)
        this.audioContext = null;
        this.originalVoiceGain = null;    // Pour la voix originale
        this.ttsVoiceGain = null;         // Pour la traduction TTS
        this.initAudioMixing();

        // Buffer pour stocker l'audio original
        this.originalAudioBuffer = null;
        
        // Configuration de la synchronisation
        this.syncConfig = {
            ttsDelay: 0,      // Pas de délai pour le TTS
            originalDelay: 0   // Pas de délai pour l'original non plus
        };

        // Stockage des sources audio courantes
        this.currentSources = {
            original: null,
            tts: null
        };

        this.onEndCallClick = null;
        if (this.endCallButton) {
            this.endCallButton.addEventListener('click', () => {
                if (typeof this.onEndCallClick === 'function') {
                    this.onEndCallClick();
                }
            });
        }
    }

    // Initialisation du mixage audio avec nouveaux niveaux
    initAudioMixing() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.originalVoiceGain = this.audioContext.createGain();
        this.originalVoiceGain.gain.value = 0.3; // Baissé à 30%

        this.ttsVoiceGain = this.audioContext.createGain();
        this.ttsVoiceGain.gain.value = 1.0; // Monté à 100%

        this.originalVoiceGain.connect(this.audioContext.destination);
        this.ttsVoiceGain.connect(this.audioContext.destination);
    }

    // Stockage de l'audio original
    storeOriginalAudio(base64Audio) {
        this.originalAudioBuffer = base64Audio;
    }

    // Récupération de l'audio original stocké
    getStoredOriginalAudio() {
        return this.originalAudioBuffer;
    }

    // Lecture synchronisée des audios
    async playSynchronizedAudios(originalBase64, ttsBase64) {
        if (!this.audioContext) {
            this.initAudioMixing();
        }

        try {
            // Décoder les deux audios
            const originalArrayBuffer = this.decodeBase64ToArrayBuffer(originalBase64);
            const ttsArrayBuffer = this.decodeBase64ToArrayBuffer(ttsBase64);

            const [originalBuffer, ttsBuffer] = await Promise.all([
                this.audioContext.decodeAudioData(originalArrayBuffer),
                this.audioContext.decodeAudioData(ttsArrayBuffer)
            ]);

            // Créer les sources audio
            const originalSource = this.audioContext.createBufferSource();
            const ttsSource = this.audioContext.createBufferSource();

            originalSource.buffer = originalBuffer;
            ttsSource.buffer = ttsBuffer;

            // Connecter aux gains respectifs
            originalSource.connect(this.originalVoiceGain);
            ttsSource.connect(this.ttsVoiceGain);

            // Démarrer les deux sources en même temps
            const startTime = this.audioContext.currentTime;
            originalSource.start(startTime + this.syncConfig.originalDelay);
            ttsSource.start(startTime + this.syncConfig.ttsDelay);

            // Stocker les sources pour pouvoir les arrêter si besoin
            this.currentSources = {
                original: originalSource,
                tts: ttsSource
            };

            // Retourner une promesse qui se résout quand la lecture est terminée
            return new Promise((resolve) => {
                ttsSource.onended = resolve;
            });
        } catch (error) {
            console.error('Erreur lors de la synchronisation:', error);
            throw error;
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

        // Crée la div .transcription-item
        const div = document.createElement('div');
        div.classList.add('transcription-item', isFinal ? 'final' : 'interim');
        div.innerHTML = `
            <div class="original">${originalText}</div>
            <div class="translation">${translatedText}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        // S’il y a un audioBase64 (TTS partielle ou finale pour caller)
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
            console.error('Erreur lecture audio TTS dans queue:', err);
        } finally {
            this.isPlayingAudio = false;
            this.playNextAudio(); // on enchaîne
        }
    }

    // ---- Lecture d’un audio MP3 base64 (TTS) en “inline” ----
    playInlineAudio(base64) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.audioContext) {
                    this.initAudioMixing();
                }
                const arrayBuffer = this.decodeBase64ToArrayBuffer(base64);
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                const source = this.audioContext.createBufferSource();
                source.buffer = audioBuffer;
                // Connecter au gain TTS au lieu de destination directe
                source.connect(this.ttsVoiceGain);

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

    // Crée un en-tête WAV pour des données audio mu-law 8kHz
    createWavHeader(dataLength) {
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        
        // "RIFF" chunk descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        this.writeString(view, 8, 'WAVE');
        
        // "fmt " sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);               // Sous-chunk taille
        view.setUint16(20, 7, true);                // Format = 7 (mu-law)
        view.setUint16(22, 1, true);                // Canaux = 1 (mono)
        view.setUint32(24, 8000, true);             // Sample rate = 8000
        view.setUint32(28, 8000, true);             // Byte rate
        view.setUint16(32, 1, true);                // Block align
        view.setUint16(34, 8, true);                // Bits per sample
        
        // "data" sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);       // Taille des données
        
        return new Uint8Array(buffer);
    }

    // Utilitaire pour écrire une chaîne dans un DataView
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Nouvelle méthode pour jouer la voix originale
    playOriginalVoice(base64Audio) {
        try {
            // Convertir base64 en Uint8Array
            const binaryString = atob(base64Audio);
            const audioData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                audioData[i] = binaryString.charCodeAt(i);
            }

            // Créer un AudioBuffer 8kHz mono
            const audioBuffer = this.audioContext.createBuffer(1, audioData.length, 8000);
            
            // Copier les données brutes
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < audioData.length; i++) {
                channelData[i] = (audioData[i] - 128) / 128.0; // Conversion en -1..1
            }

            // Lecture
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.originalVoiceGain);
            source.start(0);

        } catch (err) {
            console.error('Erreur lecture audio original:', err);
        }
    }

    // Ajouter la méthode decodeBase64ToBuffer pour le WAV
    decodeBase64ToBuffer(base64) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i=0; i<len; i++){
            bytes[i] = binary.charCodeAt(i);
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
        
        // Réinitialiser les gains
        if (this.originalVoiceGain) {
            this.originalVoiceGain.gain.value = 0.5;
        }
        if (this.ttsVoiceGain) {
            this.ttsVoiceGain.gain.value = 0.8;
        }
    }

    // Méthode pour ajuster les volumes
    setVolumes(originalVolume, ttsVolume) {
        if (this.originalVoiceGain) {
            this.originalVoiceGain.gain.value = originalVolume;
        }
        if (this.ttsVoiceGain) {
            this.ttsVoiceGain.gain.value = ttsVolume;
        }
    }

    // Méthode pour synchroniser les audios
    syncAudio(originalBase64, translationBase64) {
        // Décode les base64 en ArrayBuffer
        const originalArrayBuffer = this.decodeBase64ToArrayBuffer(originalBase64);
        const translationArrayBuffer = this.decodeBase64ToArrayBuffer(translationBase64);

        // Crée des AudioBuffer
        const originalAudioBuffer = this.audioContext.createBuffer(1, originalArrayBuffer.byteLength, 8000);
        const translationAudioBuffer = this.audioContext.createBuffer(1, translationArrayBuffer.byteLength, 8000);

        // Copie les données brutes
        const originalChannelData = originalAudioBuffer.getChannelData(0);
        const translationChannelData = translationAudioBuffer.getChannelData(0);
        for (let i = 0; i < originalArrayBuffer.byteLength; i++) {
            originalChannelData[i] = (originalArrayBuffer[i] - 128) / 128.0; // Conversion en -1..1
        }
        for (let i = 0; i < translationArrayBuffer.byteLength; i++) {
            translationChannelData[i] = (translationArrayBuffer[i] - 128) / 128.0; // Conversion en -1..1
        }

        // Stocke les AudioBuffer dans le buffer de synchronisation
        this.audioBuffer.original = originalAudioBuffer;
        this.audioBuffer.translation = translationAudioBuffer;

        // Démarre la lecture des audios synchronisées
        this.playSyncedAudio();
    }

    // Méthode pour jouer les audios synchronisées
    playSyncedAudio() {
        // Crée des sources audio
        const originalSource = this.audioContext.createBufferSource();
        const translationSource = this.audioContext.createBufferSource();

        // Connecte les sources aux gains
        originalSource.connect(this.originalVoiceGain);
        translationSource.connect(this.ttsVoiceGain);

        // Démarre la lecture des audios
        originalSource.start(0);
        translationSource.start(this.syncDelay / 1000); // Démarre la traduction après un délai

        // Stocke les sources dans le buffer de synchronisation
        this.audioBuffer.originalSource = originalSource;
        this.audioBuffer.translationSource = translationSource;
    }

    // Méthode pour jouer les audios de manière synchronisée
    async playSynchronizedAudio(originalAudio, translatedAudio, timestamp) {
        const now = Date.now();
        const elapsed = now - timestamp;
        
        // Calculer les délais de lecture
        const translationDelay = Math.max(0, this.syncDelay - elapsed);
        const originalDelay = Math.max(0, translationDelay - 200); // Légèrement avant la traduction

        try {
            // Décoder les audios
            const originalArrayBuffer = this.decodeBase64ToArrayBuffer(originalAudio);
            const translationArrayBuffer = this.decodeBase64ToArrayBuffer(translatedAudio);
            
            const originalBuffer = await this.audioContext.decodeAudioData(originalArrayBuffer);
            const translationBuffer = await this.audioContext.decodeAudioData(translationArrayBuffer);

            // Créer et configurer les sources audio
            const originalSource = this.audioContext.createBufferSource();
            const translationSource = this.audioContext.createBufferSource();

            originalSource.buffer = originalBuffer;
            translationSource.buffer = translationBuffer;

            // Connecter aux gains respectifs
            originalSource.connect(this.originalVoiceGain);
            translationSource.connect(this.ttsVoiceGain);

            // Programmer la lecture synchronisée
            const startTime = this.audioContext.currentTime;
            originalSource.start(startTime + originalDelay / 1000);
            translationSource.start(startTime + translationDelay / 1000);

            // Retourner une promesse qui se résout quand la traduction est terminée
            return new Promise((resolve) => {
                translationSource.onended = resolve;
            });
        } catch (error) {
            console.error('Erreur lors de la synchronisation audio:', error);
            throw error;
        }
    }
}

// Table de conversion µ-law vers PCM linéaire
EvatradUI.prototype.initMulawTable = function() {
    if (this.mulawTable) return;
    
    this.mulawTable = new Int16Array(256);
    const MULAW_BIAS = 33;
    const SIGN_BIT = 0x80;
    const QUANT_MASK = 0xf;
    const SEGMENT_SHIFT = 4;
    const SEGMENT_MASK = 0x70;

    for (let i = 0; i < 256; i++) {
        let value = i ^ 0xFF; // Complément à 1
        const sign = (value & SIGN_BIT) ? -1 : 1;
        value &= ~SIGN_BIT;

        const segment = (value & SEGMENT_MASK) >> SEGMENT_SHIFT;
        let result = ((value & QUANT_MASK) << 3) + MULAW_BIAS;
        result <<= segment;
        result = (sign * (result - MULAW_BIAS));

        this.mulawTable[i] = result;
    }
}

// Conversion d'un chunk µ-law en PCM 16-bit
EvatradUI.prototype.convertMulawToPcm = function(mulawData) {
    if (!this.mulawTable) {
        this.initMulawTable();
    }

    const pcmData = new Int16Array(mulawData.length);
    for (let i = 0; i < mulawData.length; i++) {
        pcmData[i] = this.mulawTable[mulawData[i]];
    }
    return pcmData;
}

// Crée un en-tête WAV pour des données audio PCM 16-bit
EvatradUI.prototype.createWavHeader = function(dataLength) {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    
    // "RIFF" chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength * 2, true); // * 2 car PCM 16-bit
    this.writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);                // Sous-chunk taille
    view.setUint16(20, 1, true);                 // Format = 1 (PCM)
    view.setUint16(22, 1, true);                 // Canaux = 1 (mono)
    view.setUint32(24, 8000, true);              // Sample rate = 8000
    view.setUint32(28, 8000 * 2, true);          // Byte rate (8000 * 2 car 16-bit)
    view.setUint16(32, 2, true);                 // Block align (2 car 16-bit)
    view.setUint16(34, 16, true);                // Bits per sample (16-bit)
    
    // "data" sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength * 2, true);    // Taille des données (* 2 car 16-bit)
    
    return new Uint8Array(buffer);
}

// Nouvelle méthode pour jouer la voix originale
EvatradUI.prototype.playOriginalVoice = async function(base64Wav) {
    try {
        if (!this.audioContext) {
            this.initAudioMixing();
        }

        // Conversion base64 en µ-law
        const binaryString = atob(base64Wav);
        const mulawData = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            mulawData[i] = binaryString.charCodeAt(i);
        }

        // Conversion µ-law -> PCM 16-bit
        const pcmData = this.convertMulawToPcm(mulawData);
        
        // Créer l'en-tête WAV (pour PCM 16-bit)
        const header = this.createWavHeader(pcmData.length);
        
        // Combiner l'en-tête et les données PCM
        const completeWav = new Uint8Array(header.length + pcmData.byteLength);
        completeWav.set(header);
        completeWav.set(new Uint8Array(pcmData.buffer), header.length);

        // Décoder
        const audioBuffer = await this.audioContext.decodeAudioData(completeWav.buffer);
        
        // Lecture
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.originalVoiceGain);
        source.start(0);
        
        // Garder la référence
        this.currentSource = source;

    } catch (err) {
        console.error('Erreur lecture voix originale:', err);
        console.log('Type d\'erreur:', err.name);
        console.log('Message:', err.message);
        console.log('Code:', err.code);
    }
}

// Ajouter la méthode decodeBase64ToBuffer pour le WAV
EvatradUI.prototype.decodeBase64ToBuffer = function(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i=0; i<len; i++){
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
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

        // AudioContext, gain pour la voix off
        this.audioContext = null;
        this.originalVoiceGain = null;

        // Initialisation
        this.attachEvents(buttonElement);
        if (this.ui) {
            // On récupère l’audioContext du UI, si déjà créé
            if (this.ui.audioContext) {
                this.audioContext = this.ui.audioContext;
            }
            this.ui.setOnEndCallClick(() => this.endCall());
        }
    }

    attachEvents(button) {
        button.addEventListener('click', () => {
            if (this.currentCallSid) {
                this.endCall();
            } else {
                if (this.ui) {
                    this.ui.showModal();
                }
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

            // Pour iOS ou autres, s'assurer que l’audioContext est bien créé
            this.ensureAudioContextInitialized();

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
                if (this.ui) {
                    this.ui.setCallStatus(data.error || "Erreur lors de l'initiation de l'appel");
                }
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

    async playWelcomeMessage() {
        try {
            this.playingWelcome = true;
            const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=welcome`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = this.arrayBufferToBase64(arrayBuffer);

            if (this.ui) {
                await this.ui.playInlineAudio(base64);
            } else {
                await this.playAudioStandalone(base64);
            }
        } catch (err) {
            console.error('Erreur playWelcomeMessage:', err);
        } finally {
            this.playingWelcome = false;
        }
    }

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

                // Pause
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
                case 'init':
                    // Reçu après la connexion WS, on envoie le callSid
                    this.ws.send(JSON.stringify({
                        type: 'init',
                        callSid: this.currentCallSid
                    }));
                    break;

                case 'receiver_raw_audio':
                    // Au lieu de jouer directement, on stocke l'audio original
                    if (this.ui) {
                        this.ui.storeOriginalAudio(message.data);
                    }
                    break;

                case 'transcription-final':
                case 'transcription-interim':
                    const isFinal = message.type === 'transcription-final';

                    // Si c'est un message final du receiver avec audio
                    if (isFinal && message.source === 'receiver' && this.ui) {
                        // Jouer les deux audios de manière synchronisée
                        this.ui.playSynchronizedAudios(
                            this.ui.getStoredOriginalAudio(),
                            message.audioBase64
                        );
                    }

                    // Gérer la transcription comme avant
                    this.handleTranscriptionMessage(message);
                    break;

                case 'call-ended':
                    console.log('Call ended by server');
                    this.cleanupAfterCall();
                    break;

                default:
                    console.log('Unknown message type:', message.type);
                    break;
            }
        } catch (err) {
            console.error('Error parsing websocket message:', err);
        }
    }

    handleTranscriptionMessage(msg) {
        const isCaller = (msg.source === 'caller');
        const isFinal = (msg.type === 'final');

        if (this.ui) {
            this.ui.appendTranscription(
                msg.source,
                msg.originalText,
                msg.translatedText,
                isFinal,
                isCaller ? msg.audioBase64 : null
            );

            // Si c'est un message final du receiver avec audio
            if (!isCaller && isFinal && msg.originalAudioBuffer && msg.audioBase64) {
                // Synchroniser les audios avec le timestamp
                const now = Date.now();
                const elapsed = now - msg.timestamp;
                const translationDelay = Math.max(0, this.ui.syncDelay - elapsed);
                const originalDelay = Math.max(0, translationDelay - 200);

                // Préparer et jouer les audios synchronisés
                this.ui.playSynchronizedAudio(
                    msg.originalAudioBuffer,
                    msg.audioBase64,
                    msg.timestamp
                );
            }
        } else {
            // Mode standalone : jouer uniquement le TTS
            if (isFinal && msg.audioBase64) {
                this.playAudioStandalone(msg.audioBase64);
            }
        }
    }

    // ---- Lecture "voix off" : WAV 8kHz en base64 ----
    async playOriginalVoiceOff(base64Wav) {
        if (this.ui) {
            // Si on a une UI, on utilise sa méthode de lecture avec gain
            await this.ui.playOriginalVoice(base64Wav);
        } else {
            // Sinon on utilise la lecture standalone
            await this.playAudioStandalone(base64Wav);
        }
    }

    decodeBase64ToBuffer(base64) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i=0; i<len; i++){
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
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

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

            this.mediaRecorder.start(100); // More frequent chunks => lower latency
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

        if (this.ui) {
            this.ui.hideModal();
            this.ui.updateMainButton(this.button, false);
            this.ui.clearTranscriptions();
        }
        // On pourrait stopper la "voix off" => baisser gain ou recréer un gainNode
        if (this.originalVoiceGain) {
            this.originalVoiceGain.gain.value = 0; // ou .disconnect()
        }
    }

    // ---- S’assurer que l’audioContext est créé ----
    ensureAudioContextInitialized() {
        if (!this.audioContext) {
            if (this.ui && this.ui.audioContext) {
                this.audioContext = this.ui.audioContext;
            } else {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
        }
    }

    // ---- Méthode utilitaire : lecture "standalone" si pas d’UI ----
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
