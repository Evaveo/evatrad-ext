import { MESSAGE_TYPES } from './constants.js';

export class CallButtonAudioManager {
    constructor(websocket) {
        this.ws = websocket;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.stream = null;
        this.isRecording = false;
        this.audioQueue = [];
        this.isPlayingAudio = false;
    }

    async setupAudioStream() {
        try {
            // Demander l'accès au microphone avec des contraintes spécifiques
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 48000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Configurer le MediaRecorder avec les options optimales
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) {
                throw new Error('No supported audio format found');
            }

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType,
                bitsPerSecond: 96000
            });

            // Configurer les gestionnaires d'événements
            this.mediaRecorder.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    try {
                        const timestamp = Date.now();
                        const base64Audio = await this.convertAudioToBase64(e.data);
                        this.sendAudioToServer(base64Audio, timestamp);
                    } catch (error) {
                        console.error('Error processing audio data:', error);
                    }
                }
            };

            return true;
        } catch (error) {
            console.error('Erreur lors de l\'accès au microphone:', error);
            return false;
        }
    }

    getSupportedMimeType() {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
        return types.find(type => MediaRecorder.isTypeSupported(type));
    }

    async convertAudioToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    sendAudioToServer(base64Audio, timestamp) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: MESSAGE_TYPES.AUDIO,
                audio: base64Audio.split(',')[1],
                timestamp: timestamp,
                source: MESSAGE_TYPES.SOURCE.CALLER
            }));
        }
    }

    startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.isRecording = true;
            this.mediaRecorder.start(250); // Envoyer les données toutes les 250ms
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.isRecording = false;
            this.mediaRecorder.stop();
        }
    }

    async handleIncomingAudio(base64Audio) {
        try {
            // Create data URL for MP3 audio
            const dataUrl = `data:audio/mpeg;base64,${base64Audio}`;
            
            // Create and configure audio element
            const audio = new Audio();
            audio.preload = 'auto';  // Ensure audio is preloaded
            
            // Set up audio element
            await new Promise((resolve, reject) => {
                audio.addEventListener('canplaythrough', resolve, { once: true });
                audio.addEventListener('error', (e) => reject(new Error(`Audio loading error: ${e.target.error.message}`)), { once: true });
                audio.src = dataUrl;  // Set source after adding event listeners
            });

            // Add to queue once audio is ready
            this.audioQueue.push(audio);

            // Start playing if not already playing
            if (!this.isPlayingAudio) {
                await this.playNextInQueue();
            }
        } catch (error) {
            console.error('Erreur lors du traitement de l\'audio:', error);
        }
    }

    async playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlayingAudio = false;
            return;
        }

        this.isPlayingAudio = true;
        const audio = this.audioQueue.shift();

        try {
            audio.onended = () => {
                // Clean up this audio element
                audio.src = '';
                audio.remove();
                // Play next in queue
                this.playNextInQueue();
            };

            await audio.play();
        } catch (error) {
            console.error('Erreur lors de la lecture audio:', error);
            // Clean up on error
            audio.src = '';
            audio.remove();
            this.playNextInQueue(); // Passer au suivant en cas d'erreur
        }
    }

    // Nettoyer les ressources
    cleanup() {
        this.stopRecording();
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        // Clean up any remaining audio elements in the queue
        this.audioQueue.forEach(audio => {
            audio.src = '';
            audio.remove();
        });
        this.audioQueue = [];
        this.isPlayingAudio = false;
    }
}
