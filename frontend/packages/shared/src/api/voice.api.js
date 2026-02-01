import { getApiClient } from './client';
export const voiceApi = {
    /**
     * Transcribe an audio blob and return both English and Arabic text.
     */
    async transcribe(audioBlob) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        const res = await getApiClient().post('/api/voice/transcribe', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        return res.data.data;
    },
    /**
     * Translate text to both English and Arabic.
     */
    async translate(text) {
        const res = await getApiClient().post('/api/voice/translate', { text });
        return res.data.data;
    },
};
//# sourceMappingURL=voice.api.js.map