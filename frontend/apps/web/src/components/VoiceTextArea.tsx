import { useState, useRef, useCallback } from 'react';
import { Input, Button, Space, Typography, Spin, message } from 'antd';
import { AudioOutlined, LoadingOutlined } from '@ant-design/icons';
import { voiceApi } from '@inspection/shared';
import type { TextAreaProps } from 'antd/es/input';

interface VoiceTextAreaProps extends TextAreaProps {
  /** Called after transcription with both language versions */
  onTranscribed?: (en: string, ar: string) => void;
}

export default function VoiceTextArea({ onTranscribed, ...textAreaProps }: VoiceTextAreaProps) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [enText, setEnText] = useState<string | null>(null);
  const [arText, setArText] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

        setTranscribing(true);
        try {
          const result = await voiceApi.transcribe(blob);
          setEnText(result.en);
          setArText(result.ar);

          // Set the textarea value via onChange simulation
          if (textAreaProps.onChange) {
            const combined = result.en || result.ar || '';
            const syntheticEvent = {
              target: { value: combined },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            textAreaProps.onChange(syntheticEvent);
          }

          onTranscribed?.(result.en, result.ar);
        } catch {
          message.error('Transcription failed');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      message.error('Microphone access denied');
    }
  }, [textAreaProps.onChange, onTranscribed]);

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
        <Button
          type={recording ? 'primary' : 'default'}
          danger={recording}
          icon={transcribing ? <LoadingOutlined /> : <AudioOutlined />}
          onClick={handleMicClick}
          disabled={transcribing}
          style={{ height: 'auto', minHeight: 60 }}
          title={recording ? 'Stop recording' : 'Start voice input'}
        />
      </Space.Compact>

      {transcribing && (
        <div style={{ marginTop: 4, color: '#999', fontSize: 12 }}>
          <Spin size="small" /> Transcribing...
        </div>
      )}

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
