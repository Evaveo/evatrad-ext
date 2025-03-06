// --------------------- Language Constants --------------------- //
// Language mappings for STT services
const STT_LANGUAGE_MAPPING = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt-BR': 'pt-BR',
    'ru': 'ru-RU',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN'
  };
  
  // Azure TTS voices mapping
  const AZURE_VOICES = {
    'en-US': 'en-US-JennyNeural',
    'en-GB': 'en-GB-SoniaNeural',
    'fr-FR': 'fr-FR-DeniseNeural',
    'de-DE': 'de-DE-KatjaNeural',
    'it-IT': 'it-IT-ElsaNeural',
    'es-ES': 'es-ES-ElviraNeural',
    'es-MX': 'es-MX-DaliaNeural',
    'pt-BR': 'pt-BR-FranciscaNeural',
    'pt-PT': 'pt-PT-RaquelNeural',
    'ja-JP': 'ja-JP-NanamiNeural',
    'ko-KR': 'ko-KR-SunHiNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural',
    'ru-RU': 'ru-RU-SvetlanaNeural'
  };
  
  // Twilio voice mapping
  const TWILIO_VOICES = {
    'en-US': 'alice',
    'en-GB': 'alice',
    'fr-FR': 'lea',
    'de-DE': 'marlene',
    'it-IT': 'carla',
    'es-ES': 'conchita',
    'es-MX': 'conchita',
    'pt-BR': 'camila',
    'pt-PT': 'ines',
    'ja-JP': 'mizuki',
    'ko-KR': 'seoyeon',
    'zh-CN': 'zhiyu',
    'ru-RU': 'tatyana'
  };
  
// Messages d'accueil pour le Caller
const WELCOME_MESSAGES = {
    'fr-FR': "Bienvenue au support informatique. La conversation qui va suivre est issue d'une traduction automatique, il est préférable de faire des phrases courtes et de rester vigilant.",
    'en-US': "Welcome to IT support. The following conversation will be automatically translated. It is recommended to use short sentences and remain cautious.",
    'es-ES': "Bienvenido al soporte informático. La siguiente conversación será traducida automáticamente. Se recomienda usar frases cortas y permanecer atento.",
    'de-DE': "Willkommen beim IT-Support. Das folgende Gespräch wird automatisch übersetzt. Es wird empfohlen, kurze Sätze zu verwenden und aufmerksam zu bleiben.",
    'it-IT': "Benvenuto al supporto informatico. La conversazione che segue sarà tradotta automaticamente. Si consiglia di utilizzare frasi brevi e rimanere vigili.",
    'pt-BR': "Bem-vindo ao suporte de TI. A conversa a seguir será traduzida automaticamente. Recomenda-se usar frases curtas e permanecer atento.",
    'ja-JP': "ITサポートへようこそ。以下の会話は自動的に翻訳されます。短い文を使用し、注意深くすることをお勧めします。",
    'ko-KR': "IT 지원에 오신 것을 환영합니다. 다음 대화는 자동으로 번역됩니다. 짧은 문장을 사용하고 주의를 기울이는 것이 좋습니다.",
    'zh-CN': "欢迎使用IT支持。以下对话将自动翻译。建议使用简短的句子并保持警惕。",
    'ru-RU': "Добро пожаловать в службу поддержки ИТ. Следующий разговор будет автоматически переведен. Рекомендуется использовать короткие фразы и оставаться внимательным."
  };
  
  // Messages d'attente pour le Caller
  const WAITING_MESSAGES = {
    'fr-FR': "Nous recherchons votre correspondant, veuillez patienter.",
    'en-US': "We are looking for your correspondent, please wait.",
    'es-ES': "Estamos buscando a su interlocutor, por favor espere.",
    'de-DE': "Wir suchen Ihren Gesprächspartner, bitte warten Sie.",
    'it-IT': "Stiamo cercando il suo interlocutore, per favore attenda.",
    'pt-BR': "Estamos procurando seu correspondente, por favor aguarde.",
    'ja-JP': "担当者を探しています、お待ちください。",
    'ko-KR': "담당자를 찾고 있습니다. 잠시만 기다려주세요.",
    'zh-CN': "我们正在寻找您的联系人，请稍候。",
    'ru-RU': "Мы ищем вашего собеседника, пожалуйста, подождите."
  };
  
  // Messages que le RECEIVER entend quand il décroche
  const RECEIVER_INCOMING_MESSAGES = {
    'fr-FR': "Appel entrant avec traduction automatique.",
    'en-US': "Incoming call with automatic translation.",
    'es-ES': "Llamada entrante con traducción automática.",
    'de-DE': "Eingehender Anruf mit automatischer Übersetzung.",
    'it-IT': "Chiamata in arrivo con traduzione automatica.",
    'pt-BR': "Chamada recebida com tradução automática.",
    'ja-JP': "自動翻訳機能付きの着信通話です。",
    'ko-KR': "자동 번역이 포함된 수신 전화입니다.",
    'zh-CN': "带有自动翻译的来电。",
    'ru-RU': "Входящий звонок с автоматическим переводом."
  };
  
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
              this.waitingMessage = this.modalElement.querySelector('#waitingMessage');
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
      
      setWaitingMessageVisible(visible) {
          if (this.waitingMessage) {
              this.waitingMessage.style.display = visible ? 'block' : 'none';
              if (visible) {
                  this.waitingMessage.classList.add('pulse');
              } else {
                  this.waitingMessage.classList.remove('pulse');
              }
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
  
          // Get full language codes using the mapping
          this.config.callerLanguage = this.getFullLanguageCode(this.config.callerLanguage);
          this.config.receiverLanguage = this.getFullLanguageCode(this.config.receiverLanguage);
  
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
          
          // Preloaded audio messages cache
          this.preloadedAudio = new Map();
          
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
          
          // Preload audio messages for faster response
          this.preloadAudioMessages();
      }
  
      // Helper method to get full language code
      getFullLanguageCode(lang) {
          if (lang.includes('-')) return lang;
          return STT_LANGUAGE_MAPPING[lang] || `${lang}-${lang.toUpperCase()}`;
      }
  
      // Preload welcome and waiting audio messages
      async preloadAudioMessages() {
          const types = ['welcome', 'waiting'];
          try {
              // Preload in parallel
              await Promise.all(types.map(async (type) => {
                  const cacheKey = `${type}_${this.config.callerLanguage}`;
                  try {
                      const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=${type}`;
                      const finalUrl = url + `&t=${Date.now()}`; // Prevent caching
              
                      const resp = await fetch(finalUrl);
                      const blob = await resp.blob();
                      const arrayBuffer = await blob.arrayBuffer();
                      const base64 = this.arrayBufferToBase64(arrayBuffer);
                      
                      // Store for future use
                      this.preloadedAudio.set(cacheKey, base64);
                      console.log(`Preloaded ${type} audio for ${this.config.callerLanguage}`);
                  } catch (error) {
                      console.error(`Error preloading ${type} audio:`, error);
                  }
              }));
          } catch (error) {
              console.error('Error in preloading audio messages:', error);
          }
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
    
            // 2) Démarrer la boucle d'attente APRÈS que le message de bienvenue soit terminé
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
      
              // Use preloaded audio if available
              let base64;
              const cacheKey = `welcome_${this.config.callerLanguage}`;
              
              if (this.preloadedAudio.has(cacheKey)) {
                  console.log('Using preloaded welcome message');
                  base64 = this.preloadedAudio.get(cacheKey);
              } else {
                  try {
                      // Fetch welcome message audio
                      const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=welcome`;
                      const finalUrl = url + `&t=${Date.now()}`; // Prevent caching
              
                      const resp = await fetch(finalUrl);
                      const blob = await resp.blob();
                      const arrayBuffer = await blob.arrayBuffer();
                      base64 = this.arrayBufferToBase64(arrayBuffer);
                      
                      // Store for future use
                      this.preloadedAudio.set(cacheKey, base64);
                  } catch (fetchError) {
                      console.warn('Failed to fetch welcome audio, using fallback text', fetchError);
                      
                      // Use text from constants as fallback
                      const welcomeText = WELCOME_MESSAGES[this.config.callerLanguage] || 
                                        WELCOME_MESSAGES['en-US'];
                      
                      // Here you would implement a client-side TTS fallback if needed
                      console.log(`Using fallback welcome message: ${welcomeText}`);
                      
                      // TODO: Implement a proper client-side TTS fallback
                      // For now, we'll continue without audio in this case
                  }
              }
      
              // Only proceed if we have audio to play
              if (base64) {
                  // Play the welcome message
                  if (this.ui) {
                      await this.ui.playInlineAudioFast(base64);
                  } else {
                      await this.playAudioStandalone(base64);
                  }
              }
          } catch (error) {
              console.error('Error playing welcome message:', error);
          } finally {
              this.playingWelcome = false;
          }
      }
  
        // Add this method to your EvatradButton class
        startWaitingLoop() {
            console.log('Starting waiting loop');
            this.waitingLoopActive = true;
            
            // Show waiting message in UI
            if (this.ui) {
            this.ui.setWaitingMessageVisible(true);
            }
            
            // Function to play waiting message
            const playWaitingMessage = async () => {
            if (!this.waitingLoopActive) return;
            this.playingWaiting = true;
            
            try {
                // Use preloaded audio if available
                let base64;
                const cacheKey = `waiting_${this.config.callerLanguage}`;
                
                if (this.preloadedAudio.has(cacheKey)) {
                console.log('Using preloaded waiting message');
                base64 = this.preloadedAudio.get(cacheKey);
                } else {
                // Fetch waiting message audio
                const url = `${this.config.apiBaseUrl}/audio-messages?language=${this.config.callerLanguage}&type=waiting`;
                const finalUrl = url + `&t=${Date.now()}`; // Prevent caching
                
                const resp = await fetch(finalUrl);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                base64 = this.arrayBufferToBase64(arrayBuffer);
                
                // Store for future use
                this.preloadedAudio.set(cacheKey, base64);
                }
                
                // Remember current waiting audio for potential skipping
                this.currentWaitingAudio = base64;
                
                // Play the waiting message
                if (this.ui) {
                await this.ui.playInlineAudioFast(base64);
                } else {
                await this.playAudioStandalone(base64);
                }
            } catch (error) {
                console.error('Error playing waiting message:', error);
            }
            
            this.playingWaiting = false;
            
            // Schedule next waiting message if loop still active
            if (this.waitingLoopActive) {
                this.waitingTimeoutId = setTimeout(playWaitingMessage, 5000); // Play every 5 seconds
            }
            };
            
            // Start playing waiting messages
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
          
          // Hide waiting message
          if (this.ui) {
              this.ui.setWaitingMessageVisible(false);
          }
          
          this.currentWaitingAudio = null;
          this.playingWaiting = false;
      }
      

      // Add this method to your EvatradButton class
    async connectWebSocket() {
    try {
      if (this.ws) {
        // If there's an existing connection, close it properly
        try {
          this.ws.close();
        } catch (err) {
          console.error('Error closing existing WebSocket:', err);
        }
        this.ws = null;
      }
  
      // Find the WebSocket URL
      let wsUrl = null;
      const metaTag = document.querySelector('meta[name="websocket-url"]');
      if (metaTag) {
        wsUrl = metaTag.content;
      } else {
        // Fallback to local WebSocket
        wsUrl = 'ws://' + window.location.host + '/browser';
      }
  
      console.log('Connecting to WebSocket:', wsUrl);
  
      // Create a new WebSocket connection
      this.ws = new WebSocket(wsUrl);
  
      this.ws.onopen = () => {
        console.log('WebSocket connection established');
        
        // Send initialization message with callSid
        if (this.currentCallSid) {
          this.ws.send(JSON.stringify({
            type: 'init',
            callSid: this.currentCallSid
          }));
        }
        
        // Start keeping connection alive with pings
        this.startPingInterval();
      };
  
      this.ws.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };
  
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.handleConnectionError(error);
      };
  
      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        
        // Attempt to reconnect if configured to do so
        if (this.config.autoReconnect && this.currentCallSid) {
          // Wait a bit before reconnecting
          setTimeout(() => this.connectWebSocket(), 2000);
        }
      };
  
      return true;
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.handleConnectionError(error);
      return false;
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


// Add this method to your EvatradButton class
async startRecording() {
    if (this.isRecording) return;
    
    try {
      console.log('Starting audio recording');
      
      // Request microphone access
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
  
      // Create a media recorder if supported
      if (typeof MediaRecorder !== 'undefined') {
        const options = { mimeType: 'audio/webm;codecs=opus' };
        this.mediaRecorder = new MediaRecorder(this.microphoneStream, options);
        
        // Add data handling
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && this.ws && this.ws.readyState === 1) {
            // Convert the audio data to base64 and send it
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = reader.result.split(',')[1];
              if (this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({
                  type: 'audio',
                  audio: base64Data
                }));
              }
            };
            reader.readAsDataURL(event.data);
          }
        };
        
        // Start recording with appropriate timeslice (e.g., 100ms chunks)
        this.mediaRecorder.start(100);
        this.isRecording = true;
        
        console.log('Recording started');
        return true;
      } else {
        console.error('MediaRecorder is not supported in this browser');
        throw new Error('MediaRecorder not supported');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      this.isRecording = false;
      
      if (this.ui) {
        this.ui.setCallStatus(`Error: ${error.message}`);
      }
      
      throw error;
    }
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
                              data.type === 'transcription-final',
                              data.audioBase64 // Pass audio if available
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
          this.preloadedAudio.clear();
          
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
      
