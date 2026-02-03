import { useState, useRef, useCallback } from 'react';
import { Input, Button, Space, Typography, Spin, message, Tooltip } from 'antd';
import { AudioOutlined, LoadingOutlined, TranslationOutlined } from '@ant-design/icons';
import { voiceApi, aiApi } from '@inspection/shared';
import { useTranslation } from 'react-i18next';
import type { TextAreaProps } from 'antd/es/input';

interface VoiceTextAreaProps extends TextAreaProps {
  /** Called after transcription with both language versions */
  onTranscribed?: (en: string, ar: string) => void;
  /** Called after voice is recorded and saved, with the audio file ID */
  onVoiceRecorded?: (audioFileId: number) => void;
  /** Called with the local blob URL for immediate playback */
  onLocalBlobUrl?: (url: string) => void;
  /** Language hint for Whisper transcription ('en' or 'ar') */
  language?: string;
}

export default function VoiceTextArea({ onTranscribed, onVoiceRecorded, onLocalBlobUrl, language, ...textAreaProps }: VoiceTextAreaProps) {
  const { t, i18n } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [enText, setEnText] = useState<string | null>(null);
  const [arText, setArText] = useState<string | null>(null);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const localBlobUrlRef = useRef<string | null>(null);

  // Translate the current text to both languages
  const handleTranslate = useCallback(async () => {
    const currentValue = (textAreaProps.value as string) || '';
    if (!currentValue.trim()) {
      message.warning(t('common.enterTextFirst', 'Please enter some text first'));
      return;
    }

    setTranslating(true);
    try {
      // Translate to both languages in parallel
      const [enResult, arResult] = await Promise.all([
        aiApi.translate(currentValue, 'en'),
        aiApi.translate(currentValue, 'ar'),
      ]);

      const enTranslation = (enResult.data as any)?.data?.translation || '';
      const arTranslation = (arResult.data as any)?.data?.translation || '';

      setEnText(enTranslation);
      setArText(arTranslation);

      // Update textarea with both translations
      if (textAreaProps.onChange) {
        const parts: string[] = [];
        if (enTranslation) parts.push(`EN: ${enTranslation}`);
        if (arTranslation) parts.push(`AR: ${arTranslation}`);
        const combined = parts.join('\n');
        const syntheticEvent = {
          target: { value: combined },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        textAreaProps.onChange(syntheticEvent);
      }

      message.success(t('common.translated', 'Text translated'));
    } catch (error) {
      message.error(t('common.translateError', 'Translation failed'));
    } finally {
      setTranslating(false);
    }
  }, [textAreaProps.value, textAreaProps.onChange, t]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        if (blob.size < 100) {
          message.warning('Recording too short');
          return;
        }

        // Create a local blob URL for immediate playback
        if (localBlobUrlRef.current) URL.revokeObjectURL(localBlobUrlRef.current);
        const blobUrl = URL.createObjectURL(blob);
        localBlobUrlRef.current = blobUrl;
        onLocalBlobUrl?.(blobUrl);

        setTranscribing(true);
        setTranscriptionFailed(false);
        try {
          const result = await voiceApi.transcribe(blob, undefined, undefined, language);

          // Notify parent of saved audio file
          if (result.audio_file?.id) {
            onVoiceRecorded?.(result.audio_file.id);
          }

          if (result.transcription_failed) {
            setTranscriptionFailed(true);
            setEnText(null);
            setArText(null);
            message.warning('Voice saved but transcription failed. You can re-record or type manually.');
          } else {
            setEnText(result.en);
            setArText(result.ar);

            // Put both languages into the textarea
            if (textAreaProps.onChange) {
              const parts: string[] = [];
              if (result.en) parts.push(`EN: ${result.en}`);
              if (result.ar) parts.push(`AR: ${result.ar}`);
              const combined = parts.join('\n');
              const syntheticEvent = {
                target: { value: combined },
              } as React.ChangeEvent<HTMLTextAreaElement>;
              textAreaProps.onChange(syntheticEvent);
            }

            onTranscribed?.(result.en, result.ar);
          }
        } catch {
          setTranscriptionFailed(true);
          message.warning('Voice saved but transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      message.error('Microphone access denied');
    }
  }, [textAreaProps.onChange, onTranscribed, onVoiceRecorded, onLocalBlobUrl, language]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  const handleMicClick = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  return (
    <div>
      <Space.Compact style={{ display: 'flex', width: '100%' }}>
        <Input.TextArea {...textAreaProps} style={{ ...textAreaProps.style, flex: 1 }} />
        <Tooltip title={t('common.translate', 'Translate to EN/AR')}>
          <Button
            icon={translating ? <LoadingOutlined /> : <TranslationOutlined />}
            onClick={handleTranslate}
            disabled={transcribing || translating || recording}
            style={{ height: 'auto', minHeight: 60 }}
          />
        </Tooltip>
        <Button
          type={recording ? 'primary' : 'default'}
          danger={recording}
          icon={transcribing ? <LoadingOutlined /> : <AudioOutlined />}
          onClick={handleMicClick}
          disabled={transcribing || translating}
          style={{ height: 'auto', minHeight: 60 }}
          title={recording ? 'Stop recording' : 'Start voice input'}
        />
      </Space.Compact>

      {transcribing && (
        <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
          <Spin size="small" /> {t('common.transcribing', 'Saving & transcribing...')}
        </div>
      )}

      {translating && (
        <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
          <Spin size="small" /> {t('common.translating', 'Translating to EN/AR...')}
        </div>
      )}

      {/* Transcription failure notice */}
      {transcriptionFailed && !transcribing && (
        <div
          style={{
            marginTop: 4,
            padding: '4px 10px',
            background: '#fffbe6',
            borderRadius: 4,
            border: '1px solid #ffe58f',
            fontSize: 12,
            color: '#ad6800',
          }}
        >
          Transcription failed — voice recording saved. You can type your note manually.
        </div>
      )}

      {/* Transcription results */}
      {(enText || arText) && !transcribing && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 10px',
            background: '#f9f9f9',
            borderRadius: 4,
            border: '1px solid #e8e8e8',
            fontSize: 12,
          }}
        >
          {enText && (
            <div style={{ marginBottom: arText ? 2 : 0 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>EN:</Typography.Text>{' '}
              <Typography.Text style={{ fontSize: 12 }}>{enText}</Typography.Text>
            </div>
          )}
          {arText && (
            <div dir="rtl">
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>AR:</Typography.Text>{' '}
              <Typography.Text style={{ fontSize: 12 }}>{arText}</Typography.Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
