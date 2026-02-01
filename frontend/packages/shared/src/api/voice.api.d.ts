export interface TranscriptionResult {
    en: string;
    ar: string;
    detected_language?: string;
}
export declare const voiceApi: {
    /**
     * Transcribe an audio blob and return both English and Arabic text.
     */
    transcribe(audioBlob: Blob): Promise<TranscriptionResult>;
    /**
     * Translate text to both English and Arabic.
     */
    translate(text: string): Promise<TranscriptionResult>;
};
//# sourceMappingURL=voice.api.d.ts.map