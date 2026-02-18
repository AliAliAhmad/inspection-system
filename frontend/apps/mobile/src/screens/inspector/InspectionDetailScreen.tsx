import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { Audio } from 'expo-av';
import { Video, ResizeMode } from 'expo-av';
import {
  inspectionsApi,
  Inspection,
  InspectionAnswer,
  getApiBaseUrl,
} from '@inspection/shared';

type ScreenRoute = RouteProp<RootStackParamList, 'InspectionDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const URGENCY_CONFIG: Record<number, { label: string; color: string; bgColor: string }> = {
  0: { label: 'OK', color: '#4CAF50', bgColor: '#E8F5E9' },
  1: { label: 'Monitor', color: '#FF9800', bgColor: '#FFF3E0' },
  2: { label: 'Attention', color: '#FF5722', bgColor: '#FBE9E7' },
  3: { label: 'Critical', color: '#F44336', bgColor: '#FFEBEE' },
};

export default function InspectionDetailScreen() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const route = useRoute<ScreenRoute>();
  const navigation = useNavigation<NavigationProp>();
  const { assignmentId } = route.params;

  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<number | null>(null);
  const [soundRef, setSoundRef] = useState<Audio.Sound | null>(null);

  const {
    data: inspection,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['inspectionDetail', assignmentId],
    queryFn: async () => {
      // Use full details endpoint to get ALL inspectors' answers + equipment name
      try {
        const res = await inspectionsApi.getAssignmentFullDetails(assignmentId);
        return (res.data as any).data ?? res.data;
      } catch {
        // Fallback to single-inspector view
        const res = await inspectionsApi.getByAssignment(assignmentId);
        return (res.data as any).data ?? res.data;
      }
    },
  });

  const getAnswerColor = (value: string | null): string => {
    if (!value) return '#9E9E9E';
    const lower = value.toLowerCase();
    if (lower === 'pass' || lower === 'yes') return '#4CAF50';
    if (lower === 'fail' || lower === 'no') return '#F44336';
    return '#2196F3';
  };

  const getAnswerBgColor = (value: string | null): string => {
    if (!value) return '#F5F5F5';
    const lower = value.toLowerCase();
    if (lower === 'pass' || lower === 'yes') return '#E8F5E9';
    if (lower === 'fail' || lower === 'no') return '#FFEBEE';
    return '#E3F2FD';
  };

  const getPhotoUrl = (answer: InspectionAnswer): string | null => {
    if (answer.photo_file?.url) return answer.photo_file.url;
    if (answer.photo_path) {
      if (answer.photo_path.startsWith('http')) return answer.photo_path;
      try {
        return `${getApiBaseUrl()}${answer.photo_path}`;
      } catch {
        return answer.photo_path;
      }
    }
    return null;
  };

  const getVideoUrl = (answer: InspectionAnswer): string | null => {
    if (answer.video_file?.url) return answer.video_file.url;
    if (answer.video_path) {
      if (answer.video_path.startsWith('http')) return answer.video_path;
      try {
        return `${getApiBaseUrl()}${answer.video_path}`;
      } catch {
        return answer.video_path;
      }
    }
    return null;
  };

  const getVoiceUrl = (answer: InspectionAnswer): string | null => {
    if (answer.voice_note?.url) return answer.voice_note.url;
    if (answer.voice_note_id) {
      try {
        return `${getApiBaseUrl()}/api/files/${answer.voice_note_id}/download`;
      } catch {
        return null;
      }
    }
    return null;
  };

  const playVoiceNote = useCallback(async (answer: InspectionAnswer) => {
    const url = getVoiceUrl(answer);
    if (!url) return;

    // Stop currently playing
    if (soundRef) {
      try {
        await soundRef.stopAsync();
        await soundRef.unloadAsync();
      } catch { /* ignore */ }
      setSoundRef(null);
      setPlayingVoiceId(null);
    }

    if (playingVoiceId === answer.id) {
      // Was playing this one, now stopped
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
      );
      setSoundRef(sound);
      setPlayingVoiceId(answer.id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingVoiceId(null);
          setSoundRef(null);
          sound.unloadAsync();
        }
      });
    } catch (err) {
      console.warn('Failed to play voice note', err);
      setPlayingVoiceId(null);
    }
  }, [soundRef, playingVoiceId]);

  // Get question text based on language
  const getQuestionText = (answer: InspectionAnswer): string => {
    const item = answer.checklist_item;
    if (!item) return `Question #${answer.checklist_item_id}`;
    if (isAr && item.question_text_ar) return item.question_text_ar;
    return item.question_text_en || item.question_text || '';
  };

  const getUrgencyLevel = (answer: any): number => {
    // Use saved urgency_level from answer if available
    if (answer.urgency_level != null && answer.urgency_level > 0) {
      return answer.urgency_level;
    }
    // Fallback: compute from checklist rules
    const item = answer.checklist_item;
    if (!item) return 0;

    const value = answer.answer_value?.toLowerCase();
    if (value === 'fail' || value === 'no') {
      return item.critical_failure ? 3 : 2;
    }
    return 0;
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (isError || !inspection) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = inspection as Inspection;
  const answers = data.answers || [];

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <Text style={styles.headerBackText}>{isAr ? '\u2192' : '\u2190'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('inspection_detail.title', 'Inspection Details')}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {(data as any).equipment_name || data.equipment?.name || `Equipment #${data.equipment_id}`}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* System Verdict Banner */}
        {data.result && (
          <View style={[
            styles.verdictBanner,
            {
              backgroundColor: data.result === 'pass' ? '#E8F5E9' : data.result === 'fail' ? '#FFEBEE' : '#FFF3E0',
              borderLeftColor: data.result === 'pass' ? '#4CAF50' : data.result === 'fail' ? '#F44336' : '#FF9800',
            },
          ]}>
            <Text style={[styles.verdictBannerText, {
              color: data.result === 'pass' ? '#2E7D32' : data.result === 'fail' ? '#C62828' : '#E65100',
            }]}>
              {data.result === 'pass' ? '\u2705' : data.result === 'fail' ? '\u274C' : '\u26A0\uFE0F'}{' '}
              {data.result?.toUpperCase()} - {answers.length} {t('inspection.question', 'questions')}
            </Text>
            {data.submitted_at && (
              <Text style={styles.verdictBannerDate}>
                {new Date(data.submitted_at).toLocaleString()}
              </Text>
            )}
          </View>
        )}

        {/* Answer Cards */}
        {answers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{t('common.noData')}</Text>
          </View>
        ) : (
          answers.map((answer, index) => {
            const photoUrl = getPhotoUrl(answer);
            const videoUrl = getVideoUrl(answer);
            const voiceUrl = getVoiceUrl(answer);
            const urgency = getUrgencyLevel(answer);
            const urgencyConfig = URGENCY_CONFIG[urgency] || URGENCY_CONFIG[0];
            const aiAnalysis = answer.photo_ai_analysis || answer.video_ai_analysis;

            return (
              <View key={answer.id} style={[styles.answerCard, { borderLeftColor: getAnswerColor(answer.answer_value) }]}>
                {/* Question Number & Text */}
                <View style={styles.questionRow}>
                  <View style={[styles.questionBadge, { backgroundColor: getAnswerColor(answer.answer_value) }]}>
                    <Text style={styles.questionBadgeText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.questionText} numberOfLines={3}>
                    {getQuestionText(answer)}
                  </Text>
                </View>

                {/* Answer Value */}
                <View style={[styles.answerValueContainer, { backgroundColor: getAnswerBgColor(answer.answer_value) }]}>
                  <Text style={[styles.answerValue, { color: getAnswerColor(answer.answer_value) }]}>
                    {answer.answer_value || '-'}
                  </Text>
                </View>

                {/* Urgency Badge - always show */}
                <View style={[styles.urgencyBadge, { backgroundColor: urgencyConfig.bgColor }]}>
                  <View style={[styles.urgencyDot, { backgroundColor: urgencyConfig.color }]} />
                  <Text style={[styles.urgencyText, { color: urgencyConfig.color }]}>
                    {urgencyConfig.label}
                  </Text>
                </View>

                {/* Comment */}
                {answer.comment && (
                  <View style={styles.commentContainer}>
                    <Text style={styles.commentLabel}>{t('inspection.comment')}:</Text>
                    <Text style={styles.commentText}>{answer.comment}</Text>
                  </View>
                )}

                {/* Photo */}
                {photoUrl ? (
                  <TouchableOpacity
                    onPress={() => setFullScreenPhoto(photoUrl)}
                    style={styles.mediaContainer}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                    <Text style={styles.mediaTapHint}>{t('inspection.photo')} - Tap to enlarge</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Video */}
                {videoUrl ? (
                  <View style={styles.mediaContainer}>
                    <Video
                      source={{ uri: videoUrl }}
                      style={styles.videoPlayer}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      isLooping={false}
                    />
                  </View>
                ) : null}

                {/* Voice Note */}
                {voiceUrl ? (
                  <TouchableOpacity
                    style={[styles.voiceButton, playingVoiceId === answer.id && styles.voiceButtonPlaying]}
                    onPress={() => playVoiceNote(answer)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.voiceButtonIcon}>
                      {playingVoiceId === answer.id ? '\u23F8' : '\u25B6\uFE0F'}
                    </Text>
                    <Text style={styles.voiceButtonText}>
                      {t('inspection_detail.play_voice', 'Play Voice Note')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* Voice Transcription */}
                {answer.voice_transcription && (
                  <View style={styles.transcriptionContainer}>
                    <Text style={styles.transcriptionLabel}>Voice Transcription:</Text>
                    <Text style={styles.transcriptionText}>
                      {isAr ? answer.voice_transcription.ar || answer.voice_transcription.en : answer.voice_transcription.en || answer.voice_transcription.ar}
                    </Text>
                  </View>
                )}

                {/* AI Analysis */}
                {aiAnalysis && (
                  <View style={styles.aiAnalysisContainer}>
                    <Text style={styles.aiAnalysisLabel}>
                      {t('inspection_detail.ai_analysis', 'AI Analysis')}:
                    </Text>
                    <Text style={styles.aiAnalysisText}>
                      {isAr ? aiAnalysis.ar || aiAnalysis.en : aiAnalysis.en || aiAnalysis.ar}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Full Screen Photo Modal */}
      <Modal
        visible={fullScreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          {/* Top bar with back button */}
          <View style={styles.modalTopBar}>
            <TouchableOpacity
              style={styles.modalBackBtn}
              onPress={() => setFullScreenPhoto(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalBackIcon}>{isAr ? '\u2192' : '\u2190'}</Text>
              <Text style={styles.modalBackText}>{t('common.back', 'Back')}</Text>
            </TouchableOpacity>
          </View>
          {fullScreenPhoto && (
            <Image
              source={{ uri: fullScreenPhoto }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
          {/* Bottom close button */}
          <TouchableOpacity
            style={styles.modalCloseBottomBtn}
            onPress={() => setFullScreenPhoto(null)}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCloseBottomText}>{t('common.close', 'Close')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#757575' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerBackBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerBackText: { fontSize: 24, color: '#fff', fontWeight: '700' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Content
  container: { flex: 1 },
  contentContainer: { padding: 16 },

  // Verdict Banner
  verdictBanner: {
    borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4,
  },
  verdictBannerText: { fontSize: 16, fontWeight: '700' },
  verdictBannerDate: { fontSize: 12, color: '#757575', marginTop: 4 },

  // Empty State
  emptyState: {
    padding: 40, alignItems: 'center',
  },
  emptyStateText: { fontSize: 16, color: '#9E9E9E' },

  // Answer Card
  answerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },

  // Question
  questionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  questionBadge: {
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  questionBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  questionText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#212121', lineHeight: 20 },

  // Answer Value
  answerValueContainer: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8,
  },
  answerValue: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },

  // Urgency
  urgencyBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    alignSelf: 'flex-start', marginBottom: 8,
  },
  urgencyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  urgencyText: { fontSize: 12, fontWeight: '600' },

  // Comment
  commentContainer: { marginBottom: 8 },
  commentLabel: { fontSize: 12, color: '#757575', marginBottom: 2 },
  commentText: { fontSize: 13, color: '#424242', lineHeight: 18 },

  // Media
  mediaContainer: { marginBottom: 8 },
  thumbnail: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#E0E0E0' },
  mediaTapHint: { fontSize: 11, color: '#9E9E9E', marginTop: 4, textAlign: 'center' },
  videoPlayer: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#000' },

  // Voice
  voiceButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F2FD',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 8,
  },
  voiceButtonPlaying: { backgroundColor: '#BBDEFB' },
  voiceButtonIcon: { fontSize: 18, marginRight: 8 },
  voiceButtonText: { fontSize: 13, color: '#1565C0', fontWeight: '600' },

  // Transcription
  transcriptionContainer: { backgroundColor: '#F3E5F5', borderRadius: 8, padding: 10, marginBottom: 8 },
  transcriptionLabel: { fontSize: 11, color: '#7B1FA2', fontWeight: '600', marginBottom: 4 },
  transcriptionText: { fontSize: 12, color: '#4A148C', lineHeight: 18 },

  // AI Analysis
  aiAnalysisContainer: { backgroundColor: '#E8EAF6', borderRadius: 8, padding: 10, marginBottom: 8 },
  aiAnalysisLabel: { fontSize: 11, color: '#283593', fontWeight: '600', marginBottom: 4 },
  aiAnalysisText: { fontSize: 12, color: '#1A237E', lineHeight: 18 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center',
  },
  modalTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalBackBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
  },
  modalBackIcon: { fontSize: 28, color: '#fff', fontWeight: '700', marginRight: 8 },
  modalBackText: { fontSize: 17, color: '#fff', fontWeight: '600' },
  modalCloseBottomBtn: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  modalCloseBottomText: { fontSize: 16, color: '#fff', fontWeight: '700' },
  fullScreenImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },

  bottomSpacer: { height: 40 },
});
