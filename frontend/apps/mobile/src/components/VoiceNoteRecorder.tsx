import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import { getApiClient } from '@inspection/shared';

interface VoiceNoteRecorderProps {
  onVoiceNoteRecorded: (voiceNoteId: number, transcription?: { en: string; ar: string }) => void;
  onVoiceNoteDeleted?: () => void;
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
  onVoiceNoteDeleted,
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

  // Sync existing voice URL from props when it changes (e.g., when navigating back)
  useEffect(() => {
    if (existingVoiceUrl !== undefined) {
      setCloudinaryUrl(existingVoiceUrl || null);
    }
  }, [existingVoiceUrl]);

  // Sync existing transcription from props when it changes (e.g., when navigating back)
  useEffect(() => {
    if (existingTranscription !== undefined) {
      setTranscription(existingTranscription || null);
    }
  }, [existingTranscription]);

  // Cleanup audio resources when component unmounts or question changes
  useEffect(() => {
    return () => {
      // Stop and cleanup recording
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch((err) => {
          console.error('Error cleaning up recording:', err);
        });
        recordingRef.current = null;
      }

      // Stop and cleanup sound
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch((err) => {
          console.error('Error cleaning up sound:', err);
        });
        soundRef.current = null;
      }

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

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

      // Read audio file as base64
      console.log('Reading audio as base64...', uri);
      let base64: string;
      try {
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
        if (!base64) {
          throw new Error('File read returned empty result');
        }
        console.log('Base64 read successfully, length:', base64.length);
      } catch (readError: any) {
        console.error('Failed to read audio file:', readError);
        Alert.alert('Error', `Failed to read audio file: ${readError?.message || 'Unknown error'}`);
        throw readError;
      }

      console.log('Uploading voice note via base64...');

      // Upload as JSON with base64
      const response = await getApiClient().post(
        '/api/voice/transcribe',
        {
          audio_base64: base64,
          file_name: 'recording.m4a',
          file_type: 'audio/m4a',
          language: language || 'en',
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 180000, // 3 minutes
        }
      );

      const result = (response.data as any)?.data;

      // Log the response for debugging
      console.log('Voice upload response:', {
        hasAudioFile: !!result?.audio_file?.id,
        hasTranscription: !!(result?.en || result?.ar),
        transcriptionFailed: result?.transcription_failed
      });

      if (result?.audio_file?.id) {
        setCloudinaryUrl(result.audio_file.url || null);
        const trans = { en: result.en || '', ar: result.ar || '' };
        setTranscription(trans);
        onVoiceNoteRecorded(result.audio_file.id, trans);
      } else if (result?.transcription_failed) {
        // Audio saved but transcription failed
        Alert.alert('Note', 'Voice note saved. Transcription may not be available.');
        if (result?.audio_file?.id) {
          setCloudinaryUrl(result.audio_file.url || null);
          onVoiceNoteRecorded(result.audio_file.id, undefined);
        }
      }
    } catch (err: any) {
      console.error('Failed to upload voice note:', err);
      let message = err?.response?.data?.message || err?.message || 'Failed to upload voice note';

      // Better error message for network/timeout errors
      if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
        message = 'Upload timeout. The server may be starting up. Please try again in 30 seconds.';
      } else if (err?.message?.includes('Network Error') || !err?.response) {
        message = 'Network error. Please check your internet connection and try again.';
      }

      Alert.alert('Error', message);
    } finally {
      setIsUploading(false);
    }
  }, [onVoiceNoteRecorded, language]);

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

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Voice Note',
      'Are you sure you want to delete this voice recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Clear local state
            setLocalAudioUri(null);
            setCloudinaryUrl(null);
            setTranscription(null);
            setIsPlaying(false);

            // Stop any playing audio
            if (soundRef.current) {
              soundRef.current.unloadAsync();
              soundRef.current = null;
            }

            // Notify parent
            onVoiceNoteDeleted?.();
          },
        },
      ]
    );
  }, [onVoiceNoteDeleted]);

  const hasAudio = !!(cloudinaryUrl || localAudioUri);
  const waveformUrl = cloudinaryUrl ? getWaveformUrl(cloudinaryUrl) : null;

  return (
    <View style={styles.container}>
      {/* Compact Recording Row */}
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

        {isRecording ? (
          <View style={styles.recordingInfo}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
          </View>
        ) : isUploading ? (
          <Text style={styles.uploadingText}>Uploading...</Text>
        ) : hasAudio ? (
          // WhatsApp-style audio playback with waveform and delete
          <View style={styles.audioPlaybackContainer}>
            <TouchableOpacity
              style={styles.compactPlayButton}
              onPress={isPlaying ? stopAudio : playAudio}
            >
              <Text style={styles.playIconSmall}>{isPlaying ? '⏹' : '▶️'}</Text>
              {waveformUrl ? (
                <Image
                  source={{ uri: waveformUrl }}
                  style={styles.waveformSmall}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.playLabelSmall}>
                  {isPlaying ? 'Stop' : 'Play'}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hintText}>Hold to record</Text>
        )}
      </View>

      {/* Transcription Display */}
      {transcription && (transcription.en || transcription.ar) && (
        <View style={styles.transcriptionBox}>
          <Text style={styles.transcriptionLabel}>📝 Transcription:</Text>
          {transcription.en && (
            <Text style={styles.transcriptionText}>{transcription.en}</Text>
          )}
          {transcription.ar && (
            <Text style={[styles.transcriptionText, styles.transcriptionAr]}>
              {transcription.ar}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f2f5',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
  },
  micButtonRecording: {
    backgroundColor: '#f5222d',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  micIcon: {
    fontSize: 14,
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f5222d',
  },
  recordingTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f5222d',
    fontVariant: ['tabular-nums'],
  },
  uploadingText: {
    fontSize: 11,
    color: '#1677ff',
  },
  hintText: {
    fontSize: 11,
    color: '#999',
  },
  audioPlaybackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCF8C6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  playIconSmall: {
    fontSize: 14,
  },
  playLabelSmall: {
    fontSize: 11,
    color: '#075E54',
    fontWeight: '500',
  },
  waveformSmall: {
    width: 80,
    height: 24,
    borderRadius: 2,
  },
  deleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff4d4f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    fontSize: 12,
  },
  transcriptionBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1677ff',
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1677ff',
    marginBottom: 6,
  },
  transcriptionText: {
    fontSize: 13,
    color: '#262626',
    lineHeight: 18,
    marginBottom: 4,
  },
  transcriptionAr: {
    textAlign: 'right',
    fontFamily: 'System',
  },
});
