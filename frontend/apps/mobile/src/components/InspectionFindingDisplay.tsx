import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { tokenStorage } from '../storage/token-storage';
import type { InspectionAnswer } from '@inspection/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface InspectionFindingDisplayProps {
  answer: InspectionAnswer;
  title?: string;
}

const ANSWER_COLORS: Record<string, string> = {
  pass: '#4CAF50',
  fail: '#E53935',
  yes: '#4CAF50',
  no: '#E53935',
};

function getCloudinaryOptimizedUrl(url: string, width: number): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/c_fill,w_${width},q_auto,f_auto/`);
}

function getAudioMp3Url(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/f_mp3/');
}

function getWaveformUrl(url: string): string {
  if (!url || !url.includes('cloudinary.com')) return '';
  return url
    .replace('/upload/', '/upload/fl_waveform,co_rgb:25D366,b_rgb:DCF8C6,w_200,h_32/')
    .replace(/\.[^.]+$/, '.png');
}

export default function InspectionFindingDisplay({
  answer,
  title,
}: InspectionFindingDisplayProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    tokenStorage.getAccessToken().then(setToken);
  }, []);

  const answerValue = answer.answer_value?.toLowerCase() || '';
  const answerColor = ANSWER_COLORS[answerValue] || '#757575';
  const hasPhoto = !!(answer.photo_path || (answer as any).photo_url);
  const hasVoice = !!(answer.voice_note_id || (answer as any).voice_note);
  const hasComment = !!answer.comment;

  // Get photo URL
  const getPhotoUrl = (): string | null => {
    if ((answer as any).photo_url) {
      return getCloudinaryOptimizedUrl((answer as any).photo_url, Math.round(SCREEN_WIDTH - 64));
    }
    if (answer.photo_path) {
      // If it's a full URL already
      if (answer.photo_path.startsWith('http')) {
        return getCloudinaryOptimizedUrl(answer.photo_path, Math.round(SCREEN_WIDTH - 64));
      }
      // Build API URL for photo
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001';
      return `${baseUrl}${answer.photo_path}`;
    }
    return null;
  };

  // Get voice note URL
  const getVoiceUrl = (): string | null => {
    const voiceNote = (answer as any).voice_note;
    if (voiceNote?.url) {
      return getAudioMp3Url(voiceNote.url);
    }
    if (answer.voice_note_id && token) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001';
      return `${baseUrl}/api/files/${answer.voice_note_id}/stream?token=${token}`;
    }
    return null;
  };

  const getWaveformImageUrl = (): string | null => {
    const voiceNote = (answer as any).voice_note;
    if (voiceNote?.url) {
      return getWaveformUrl(voiceNote.url);
    }
    return null;
  };

  const handlePlayVoice = async () => {
    const voiceUrl = getVoiceUrl();
    if (!voiceUrl) return;

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setIsPlaying(false);
        return;
      }

      setIsLoadingAudio(true);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync({ uri: voiceUrl });
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          soundRef.current = null;
        }
      });

      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play voice note:', err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const photoUrl = getPhotoUrl();
  const waveformUrl = getWaveformImageUrl();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {title && <Text style={styles.title} numberOfLines={2}>{title}</Text>}
        <View style={[styles.answerBadge, { backgroundColor: answerColor }]}>
          <Text style={styles.answerText}>{answer.answer_value?.toUpperCase() || 'N/A'}</Text>
        </View>
      </View>

      {/* Comment */}
      {hasComment && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Comment:</Text>
          <Text style={styles.commentText}>{answer.comment}</Text>
        </View>
      )}

      {/* Photo */}
      {hasPhoto && photoUrl && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Photo:</Text>
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Voice Note */}
      {hasVoice && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Voice Note:</Text>
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
              onPress={handlePlayVoice}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#075E54" />
              ) : (
                <Text style={styles.playIcon}>{isPlaying ? '⏹' : '▶️'}</Text>
              )}
              <Text style={styles.playLabel}>
                {isLoadingAudio ? 'Loading...' : isPlaying ? 'Stop' : 'Play voice note'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* No additional media */}
      {!hasComment && !hasPhoto && !hasVoice && (
        <Text style={styles.noDataText}>No additional details</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginRight: 12,
  },
  answerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  answerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 6,
  },
  commentText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 20,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  audioPlayer: {
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
  noDataText: {
    fontSize: 13,
    color: '#9e9e9e',
    fontStyle: 'italic',
  },
});
