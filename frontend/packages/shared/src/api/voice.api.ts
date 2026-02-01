import { getApiClient } from './client';
import type { FileRecord } from '../types/file.types';

export interface TranscriptionResult {
  en: string;
  ar: string;
  detected_language?: string;
  transcription_failed?: boolean;
  audio_file?: FileRecord | null;
}

export const voiceApi = {
  /**
   * Upload and transcribe an audio blob.
   * The audio file is always saved. Transcription is attempted but may fail.
   * Returns both language versions and the saved audio file record.
   */
  async transcribe(
    audioBlob: Blob,
    relatedType?: string,
    relatedId?: number,
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (relatedType) formData.append('related_type', relatedType);
    if (relatedId != null) formData.append('related_id', String(relatedId));

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
