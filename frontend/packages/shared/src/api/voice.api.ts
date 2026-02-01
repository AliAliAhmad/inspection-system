import { getApiClient } from './client';

export interface TranscriptionResult {
  en: string;
  ar: string;
  detected_language?: string;
}

export const voiceApi = {
  /**
   * Transcribe an audio blob and return both English and Arabic text.
   */
  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const res = await getApiClient().post<{ status: string; data: TranscriptionResult }>(
      '/api/voice/transcribe',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return res.data.data;
  },

  /**
   * Translate text to both English and Arabic.
   */
  async translate(text: string): Promise<TranscriptionResult> {
    const res = await getApiClient().post<{ status: string; data: TranscriptionResult }>(
      '/api/voice/translate',
      { text },
    );
    return res.data.data;
  },
};
