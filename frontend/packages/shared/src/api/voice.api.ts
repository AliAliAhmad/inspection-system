import { getApiClient } from './client';
import type { FileRecord } from '../types/file.types';

export interface TranscriptionResult {
  en: string;
  ar: string;
  detected_language?: string;
  transcription_failed?: boolean;
  audio_file?: FileRecord | null;
}

/**
 * The file extension that matches what the recorder actually produced.
 *
 * Safari records audio/mp4, Chrome records audio/webm, and React Native hands
 * us whatever the phone chose. Defaults to webm because that is what every
 * caller produced before Safari was supported, so nothing already working moves.
 */
function audioExtension(blob: Blob): string {
  const type = (blob.type || '').toLowerCase();
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'webm';
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
    language?: string,
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    // The NAME decides the extension the server sees, and the server uses that
    // extension to pick the temp-file suffix for Whisper and the storage type
    // in Cloudinary. It was hard-coded 'recording.webm', so a Safari recording
    // — which is mp4 — would have arrived labelled as something it is not.
    formData.append('audio', audioBlob, `recording.${audioExtension(audioBlob)}`);
    if (relatedType) formData.append('related_type', relatedType);
    if (relatedId != null) formData.append('related_id', String(relatedId));
    if (language) formData.append('language', language);

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
