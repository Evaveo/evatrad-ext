import { MESSAGE_TYPES } from './constants.js';

export class CallButtonAudioManager {
    constructor(websocket) {
        this.ws = websocket;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.stream = null;
        this.isRecording = false;
        this.chunks = [];
    }

    async setupAudioStream() {
        try {
            // Demander l'accès au microphone avec des contraintes spécifiques
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            this.audioContext = new AudioContext({
                sampleRate: 16000
            });

            // Configurer le MediaRecorder avec les options optimales
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 16000
            });

            // Gérer les données audio
            this.mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    this.chunks.push(event.data);
                    
                    // Créer un blob avec tous les chunks
                    const audioBlob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
                    this.chunks = []; // Réinitialiser les chunks

                    // Convertir en base64 et envoyer
                    if (this.ws.readyState === WebSocket.OPEN) {
                        const base64data = await this.blobToBase64(audioBlob);
                        this.ws.send(JSON.stringify({
                            type: MESSAGE_TYPES.AUDIO,
                            audio: base64data.split(',')[1],
                            source: MESSAGE_TYPES.SOURCE.CALLER
                        }));
                    }
                }
            };

            return true;
        } catch (error) {
            console.error('Erreur lors de l\'accès au microphone:', error);
            return false;
        }
    }

    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.isRecording = true;
            this.chunks = [];
            this.mediaRecorder.start(100); // Envoyer les données toutes les 100ms
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.isRecording = false;
            this.mediaRecorder.stop();
            this.chunks = [];
        }
    }

    handleIncomingAudio(audioData) {
        try {
            console.log('Analyse des données audio reçues:', {
                dataType: typeof audioData,
                length: audioData?.length,
                firstChars: audioData?.substring(0, 50)
            });

            // Vérifier si l'audio est déjà au format data URL
            if (audioData.startsWith('data:audio')) {
                console.log('Audio déjà au format data URL');
                this.playAudio(audioData);
            } else {
                // Essayer différents formats MIME
                const formats = [
                    'audio/wav',
                    'audio/webm',
                    'audio/ogg',
                    'audio/mpeg'
                ];

                for (const format of formats) {
                    try {
                        const dataUrl = `data:${format};base64,${audioData}`;
                        console.log(`Tentative avec le format: ${format}`);
                        this.playAudio(dataUrl);
                        break;
                    } catch (err) {
                        console.log(`Échec avec le format ${format}:`, err);
                    }
                }
            }
        } catch (error) {
            console.error('Erreur lors du traitement de l\'audio:', error);
            this.fallbackAudioPlay(audioData);
        }
    }

    playAudio(dataUrl) {
        const audio = new Audio(dataUrl);
        
        audio.onloadedmetadata = () => {
            console.log('Métadonnées audio chargées:', {
                durée: audio.duration,
                volume: audio.volume,
                format: audio.src.split(';')[0].split(':')[1]
            });
        };

        audio.onplay = () => console.log('Lecture audio démarrée');
        audio.onended = () => console.log('Lecture audio terminée');
        audio.onerror = (e) => {
            console.error('Erreur de lecture audio:', {
                error: e,
                code: audio.error?.code,
                message: audio.error?.message
            });
            throw e; // Propager l'erreur pour essayer la méthode de secours
        };

        return audio.play();
    }

    async fallbackAudioPlay(audioData) {
        try {
            console.log('Tentative de lecture avec Web Audio API');
            
            // Si les données sont en base64, les convertir
            let arrayBuffer;
            if (typeof audioData === 'string') {
                const binaryString = atob(audioData);
                arrayBuffer = new ArrayBuffer(binaryString.length);
                const bytes = new Uint8Array(arrayBuffer);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
            } else {
                arrayBuffer = audioData;
            }

            const audioContext = new AudioContext();
            console.log('Décodage des données audio...');
            
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log('Données audio décodées:', {
                durée: audioBuffer.duration,
                nombreCanaux: audioBuffer.numberOfChannels,
                tauxEchantillonnage: audioBuffer.sampleRate
            });
            
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            
            source.start(0);
            console.log('Lecture audio de secours démarrée');
        } catch (error) {
            console.error('Échec de la méthode de secours:', error);
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
        this.chunks = [];
    }
}
