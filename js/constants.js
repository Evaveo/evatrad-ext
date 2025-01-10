// Message types
export const MESSAGE_TYPES = {
    TRANSCRIPTION: {
        INTERIM: 'transcription-interim',
        FINAL: 'transcription-final'
    },
    AUDIO: 'audio',
    LANGUAGE: 'language',
    ERROR: 'error',
    CALL_STATUS: 'call-status',
    SOURCE: {
        CALLER: 'caller',
        RECEIVER: 'receiver',
        SYSTEM: 'system'
    }
};

// Languages configuration
export const LANGUAGES = {
    'en': 'English',
    'fr': 'Français',
    'es': 'Español',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'ru': 'Русский',
    'ja': '日本語',
    'ko': '한국어',
    'zh': '中文'
};

// Language codes mapping
export const LANGUAGE_CODES = {
    'en': 'en-US',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'de': 'de-DE',
    'it': 'it-IT',
    'pt': 'pt-BR',
    'ru': 'ru-RU',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'zh': 'zh-CN'
};

// Audio configuration
export const AUDIO_CONFIG = {
    CALLER: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        channels: 1,
        model: 'default'
    },
    RECEIVER: {
        encoding: 'MULAW',
        sampleRateHertz: 8000,
        channels: 1,
        model: 'phone_call'
    }
};

// WebSocket events
export const WS_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ERROR: 'error',
    MESSAGE: 'message'
};

// Validation functions
export function validateLanguage(lang) {
    return LANGUAGES.hasOwnProperty(lang);
}

export function validateSource(source) {
    return Object.values(MESSAGE_TYPES.SOURCE).includes(source);
}

export function getLanguageCode(lang) {
    return LANGUAGE_CODES[lang] || 'en-US';
}

export function getDisplayLanguage(code) {
    const lang = Object.keys(LANGUAGE_CODES).find(key => LANGUAGE_CODES[key] === code);
    return LANGUAGES[lang] || 'English';
}