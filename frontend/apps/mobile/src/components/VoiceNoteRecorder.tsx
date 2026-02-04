import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Audio } from 'expo-av';
import { voiceApi } from '@inspection/shared';

interface VoiceNoteRecorderProps {
  onVoiceNoteRecorded: (voiceNoteId: number, transcription?: { en: string; ar: string }) => void;
  existingVoiceUrl?: string | null;
  existingTranscription?: { en: string; ar: string } | null;
  disabled?: boolean;
  language?: string;
}

/**
 * Generate waveform image URL from Cloudinary audio URL
 */
function getWaveformUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  return url
    .replace('/upload/', '/upload/fl_waveform,co_rgb:25D366,b_rgb:DCF8C6,w_200,h_32/')
    .replace(/\.[^.]+$/, '.png');
}

/**
 * Convert Cloudinary audio URL to MP3 format for better iOS compatibility
 */
function getAudioMp3Url(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp3/');
}

export default function VoiceNoteRecorder({
  onVoiceNoteRecorded,
  existingVoiceUrl,
  existingTranscription,
  disabled = false,
  language = 'en',
}: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [localAudioUri, setLocalAudioUri] = useState<string | null>(null);
  const [cloudinaryUrl, setCloudinaryUrl] = useState<string | null>(existingVoiceUrl || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcription, setTranscription] = useState<{ en: string; ar: string } | null>(existingTranscription || null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Microphone access is needed for voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) return;

      setLocalAudioUri(uri);
      setIsUploading(true);

      // Upload to Cloudinary
      const response = await fetch(uri);
      const blob = await response.blob();
      const result = await voiceApi.transcribe(blob);

      if (result.audio_file?.id) {
        setCloudinaryUrl(result.audio_file.url || null);
        const trans = { en: result.en || '', ar: result.ar || '' };
        setTranscription(trans);
        onVoiceNoteRecorded(result.audio_file.id, trans);
      }
    } catch (err) {
      console.error('Failed to upload voice note:', err);
      Alert.alert('Error', 'Failed to upload voice note');
    } finally {
      setIsUploading(false);
    }
  }, [onVoiceNoteRecorded]);

  const playAudio = useCallback(async () => {
    const audioUrl = cloudinaryUrl || localAudioUri;
    if (!audioUrl) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const playUrl = audioUrl.includes('cloudinary.com') ? getAudioMp3Url(audioUrl) : audioUrl;
      const { sound } = await Audio.Sound.createAsync({ uri: playUrl });
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play audio:', err);
      setIsPlaying(false);
    }
  }, [cloudinaryUrl, localAudioUri]);

  const stopAudio = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
    }
  }, []);

  const handleMicPress = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const hasAudio = !!(cloudinaryUrl || localAudioUri);
  const waveformUrl = cloudinaryUrl ? getWaveformUrl(cloudinaryUrl) : null;

  return (
    <View style={styles.container}>
      {/* Recording/Mic Button */}
      <View style={styles.recordingRow}>
        <TouchableOpacity
          style={[
            styles.micButton,
            isRecording && styles.micButtonRecording,
            disabled && styles.buttonDisabled,
          ]}
          onPress={handleMicPress}
          disabled={disabled || isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎤'}</Text>
          )}
        </TouchableOpacity>

        {isRecording && (
          <View style={styles.recordingInfo}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
            <Text style={styles.recordingLabel}>Recording...</Text>
          </View>
        )}

        {isUploading && (
          <Text style={styles.uploadingText}>Uploading voice note...</Text>
        )}
      </View>

      {/* Audio Playback */}
      {hasAudio && !isRecording && !isUploading && (
        <View style={styles.audioPlayer}>
          {waveformUrl && (
            <Image
              source={{ uri: waveformUrl }}
              style={styles.waveform}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.playButton}
            onPress={isPlaying ? stopAudio : playAudio}
          >
            <Text style={styles.playIcon}>{isPlaying ? '⏹' : '▶️'}</Text>
            <Text style={styles.playLabel}>
              {isPlaying ? 'Stop' : 'Play voice note'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Transcription Display */}
      {transcription && (transcription.en || transcription.ar) && !isRecording && !isUploading && (
        <View style={styles.transcriptionContainer}>
          <Text style={styles.transcriptionLabel}>📝 Transcription:</Text>
          <Text style={styles.transcriptionText}>
            {language === 'ar' ? transcription.ar : transcription.en}
          </Text>
          {language === 'en' && transcription.ar && (
            <Text style={styles.transcriptionSecondary}>
              العربية: {transcription.ar}
            </Text>
          )}
          {language === 'ar' && transcription.en && (
            <Text style={styles.transcriptionSecondary}>
              English: {transcription.en}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  micButtonRecording: {
    backgroundColor: '#f5222d',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 22,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f5222d',
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    fontVariant: ['tabular-nums'],
  },
  recordingLabel: {
    fontSize: 12,
    color: '#999',
  },
  uploadingText: {
    fontSize: 12,
    color: '#1677ff',
    marginLeft: 8,
  },
  audioPlayer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#DCF8C6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c5e1a5',
  },
  waveform: {
    width: '100%',
    height: 32,
    marginBottom: 8,
    borderRadius: 4,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playIcon: {
    fontSize: 18,
  },
  playLabel: {
    fontSize: 13,
    color: '#075E54',
    fontWeight: '500',
  },
  transcriptionContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1677ff',
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  transcriptionText: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  transcriptionSecondary: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
