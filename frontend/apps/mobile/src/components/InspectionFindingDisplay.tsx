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
import { Audio, Video, ResizeMode } from 'expo-av';
import { useTranslation } from 'react-i18next';
import { tokenStorage } from '../storage/token-storage';
import type { InspectionAnswer } from '@inspection/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface InspectionFindingDisplayProps {
  answer: InspectionAnswer | any;
  title?: string;
  defectDescription?: string | null;
}

const ANSWER_COLORS: Record<string, string> = {
  pass: '#4CAF50',
  fail: '#E53935',
  yes: '#4CAF50',
  no: '#E53935',
};

export default function InspectionFindingDisplay({
  answer,
  title,
  defectDescription,
}: InspectionFindingDisplayProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [token, setToken] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    tokenStorage.getAccessToken().then(setToken);
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const answerValue = answer.answer_value?.toLowerCase() || '';
  const answerColor = ANSWER_COLORS[answerValue] || '#757575';

  // Get question text (Arabic or English)
  const questionText = isArabic && answer.checklist_item?.question_text_ar
    ? answer.checklist_item.question_text_ar
    : answer.checklist_item?.question_text || '';

  // Get media URLs from file objects (Cloudinary direct URLs)
  const photoUrl = answer.photo_file?.url || null;
  const videoUrl = answer.video_file?.url || null;
  const voiceUrl = answer.voice_note?.url || null;

  const hasPhoto = !!photoUrl;
  const hasVideo = !!videoUrl;
  const hasVoice = !!voiceUrl || !!answer.voice_note_id;
  const hasComment = !!answer.comment;

  // Get voice note URL with token fallback
  const getVoiceUrl = (): string | null => {
    if (voiceUrl) return voiceUrl;
    if (answer.voice_note_id && token) {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001';
      return `${baseUrl}/api/files/${answer.voice_note_id}/stream?token=${token}`;
    }
    return null;
  };

  const handlePlayVoice = async () => {
    const url = getVoiceUrl();
    if (!url) return;

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

      const { sound } = await Audio.Sound.createAsync({ uri: url });
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

  return (
    <View style={styles.container}>
      {/* Header with question and answer badge */}
      <View style={styles.header}>
        {(title || questionText) && (
          <Text style={[styles.title, isArabic && styles.rtlText]} numberOfLines={3}>
            {title || questionText}
          </Text>
        )}
        <View style={[styles.answerBadge, { backgroundColor: answerColor }]}>
          <Text style={styles.answerText}>{answer.answer_value?.toUpperCase() || 'N/A'}</Text>
        </View>
      </View>

      {/* Category & Critical indicator */}
      {answer.checklist_item?.category && (
        <View style={styles.tagsRow}>
          <View style={[styles.categoryTag, { backgroundColor: answer.checklist_item.category === 'mechanical' ? '#E3F2FD' : '#FFF8E1' }]}>
            <Text style={{ fontSize: 11, color: answer.checklist_item.category === 'mechanical' ? '#1565C0' : '#F57F17', fontWeight: '600' }}>
              {answer.checklist_item.category}
            </Text>
          </View>
          {answer.checklist_item?.critical_failure && (
            <View style={[styles.categoryTag, { backgroundColor: '#FFEBEE' }]}>
              <Text style={{ fontSize: 11, color: '#C62828', fontWeight: '600' }}>
                {t('inspection.critical', 'Critical')}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Defect description */}
      {defectDescription && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('common.description', 'Description')}:</Text>
          <Text style={[styles.commentText, isArabic && styles.rtlText]}>{defectDescription}</Text>
        </View>
      )}

      {/* Comment / AI Analysis */}
      {hasComment && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('inspection.comment', 'Comment')}:</Text>
          <Text style={[styles.commentText, isArabic && styles.rtlText]}>{answer.comment}</Text>
        </View>
      )}

      {/* Photo */}
      {hasPhoto && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('inspection.photo', 'Photo')}:</Text>
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Video */}
      {hasVideo && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('inspection.video', 'Video')}:</Text>
          <Video
            source={{ uri: videoUrl }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
          />
        </View>
      )}

      {/* Voice Note */}
      {hasVoice && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('inspection.voiceNote', 'Voice Note')}:</Text>
          <View style={styles.audioPlayer}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayVoice}
              disabled={isLoadingAudio}
            >
              {isLoadingAudio ? (
                <ActivityIndicator size="small" color="#075E54" />
              ) : (
                <Text style={styles.playIcon}>{isPlaying ? '\u23F9' : '\u25B6\uFE0F'}</Text>
              )}
              <Text style={styles.playLabel}>
                {isLoadingAudio
                  ? t('common.loading', 'Loading...')
                  : isPlaying
                    ? t('common.stop', 'Stop')
                    : t('inspection.playVoiceNote', 'Play voice note')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* No media fallback */}
      {!hasComment && !hasPhoto && !hasVideo && !hasVoice && (
        <Text style={styles.noDataText}>{t('common.noData', 'No additional details')}</Text>
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
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
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
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
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
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
  video: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  audioPlayer: {
    padding: 12,
    backgroundColor: '#DCF8C6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c5e1a5',
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
