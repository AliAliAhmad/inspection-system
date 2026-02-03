import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Image,
  Linking,
} from 'react-native';
import VoiceTextInput from '../../components/VoiceTextInput';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  specialistJobsApi,
  SpecialistJob,
  PauseLog,
  PauseCategory,
  getApiClient,
} from '@inspection/shared';
import { tokenStorage } from '../../storage/token-storage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'SpecialistJobDetail'>;

const STATUS_COLORS: Record<string, string> = {
  assigned: '#2196F3',
  in_progress: '#FF9800',
  paused: '#9C27B0',
  completed: '#4CAF50',
  incomplete: '#F44336',
  qc_approved: '#00897B',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  major: { bg: '#FFEBEE', text: '#D32F2F' },
  minor: { bg: '#FFF3E0', text: '#E65100' },
};

const PAUSE_STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  denied: '#F44336',
};

const PAUSE_CATEGORIES: PauseCategory[] = [
  'parts',
  'duty_finish',
  'tools',
  'manpower',
  'oem',
  'error_record',
  'other',
];

function formatTimer(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleString();
}

function renderStars(rating: number | null | undefined): string {
  if (rating == null) return '--';
  const filled = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) => (i < filled ? '\u2605' : '\u2606')).join('');
}

export default function SpecialistJobDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const queryClient = useQueryClient();
  const { id } = route.params;

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [workNotesInput, setWorkNotesInput] = useState('');
  const [incompleteReasonInput, setIncompleteReasonInput] = useState('');

  // Pause modal state
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseCategory, setPauseCategory] = useState<PauseCategory>('parts');
  const [pauseDetails, setPauseDetails] = useState('');

  // Complete modal state
  const [completeModalVisible, setCompleteModalVisible] = useState(false);

  // Incomplete modal state
  const [incompleteModalVisible, setIncompleteModalVisible] = useState(false);

  // Fetch job
  const {
    data: job,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['specialistJob', id],
    queryFn: () => specialistJobsApi.get(id),
    select: (res) => (res.data as any).data ?? res.data,
  });

  // Fetch pause history
  const { data: pauseHistory } = useQuery({
    queryKey: ['specialistJobPauses', id],
    queryFn: () => specialistJobsApi.getPauseHistory(id),
    select: (res) => {
      const payload = (res.data as any).data ?? res.data;
      return Array.isArray(payload) ? payload : [];
    },
  });

  const jobData = job as SpecialistJob | undefined;
  const pauses = (pauseHistory ?? []) as PauseLog[];

  // Get the inspection answer from the defect
  const inspectionAnswer = (jobData as any)?.defect?.inspection_answer;

  // Build the photo URL if there's a photo
  const getPhotoUrl = useCallback((photoPath: string | null | undefined) => {
    if (!photoPath) return null;
    // Handle both full URLs and relative paths
    if (photoPath.startsWith('http')) return photoPath;
    const baseUrl = getApiClient().defaults.baseURL || '';
    return `${baseUrl}${photoPath.startsWith('/') ? '' : '/'}${photoPath}`;
  }, []);

  // Play voice note
  const playVoiceNote = useCallback(async (voiceNoteId: number) => {
    try {
      const token = await tokenStorage.getAccessToken();
      const baseUrl = getApiClient().defaults.baseURL || '';
      const streamUrl = `${baseUrl}/api/files/${voiceNoteId}/stream?token=${token}`;
      await Linking.openURL(streamUrl);
    } catch (error) {
      Alert.alert(t('common.error'), 'Could not play voice note');
    }
  }, [t]);

  // Timer effect
  useEffect(() => {
    if (jobData?.is_running && jobData.started_at) {
      const startTime = new Date(jobData.started_at).getTime();

      const updateTimer = () => {
        const now = Date.now();
        const diff = Math.floor((now - startTime) / 1000);
        setElapsedSeconds(Math.max(0, diff));
      };

      updateTimer();
      intervalRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setElapsedSeconds(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [jobData?.is_running, jobData?.started_at]);

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => specialistJobsApi.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialistJob', id] });
      queryClient.invalidateQueries({ queryKey: ['specialistJobs'] });
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const completeMutation = useMutation({
    mutationFn: (notes: string) =>
      specialistJobsApi.complete(id, {
        work_notes: notes || undefined,
        completion_status: 'pass',
      }),
    onSuccess: () => {
      setCompleteModalVisible(false);
      setWorkNotesInput('');
      queryClient.invalidateQueries({ queryKey: ['specialistJob', id] });
      queryClient.invalidateQueries({ queryKey: ['specialistJobs'] });
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const incompleteMutation = useMutation({
    mutationFn: (reason: string) => specialistJobsApi.markIncomplete(id, reason),
    onSuccess: () => {
      setIncompleteModalVisible(false);
      setIncompleteReasonInput('');
      queryClient.invalidateQueries({ queryKey: ['specialistJob', id] });
      queryClient.invalidateQueries({ queryKey: ['specialistJobs'] });
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: PauseCategory; reason_details?: string }) =>
      specialistJobsApi.requestPause(id, payload),
    onSuccess: () => {
      setPauseModalVisible(false);
      setPauseCategory('parts');
      setPauseDetails('');
      queryClient.invalidateQueries({ queryKey: ['specialistJob', id] });
      queryClient.invalidateQueries({ queryKey: ['specialistJobPauses', id] });
      queryClient.invalidateQueries({ queryKey: ['specialistJobs'] });
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const cleaningMutation = useMutation({
    mutationFn: () => specialistJobsApi.uploadCleaning(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialistJob', id] });
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const handleStart = useCallback(() => {
    Alert.alert(t('common.confirm'), t('jobs.start') + '?', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => startMutation.mutate() },
    ]);
  }, [t, startMutation]);

  const handlePauseSubmit = useCallback(() => {
    pauseMutation.mutate({
      reason_category: pauseCategory,
      reason_details: pauseDetails || undefined,
    });
  }, [pauseMutation, pauseCategory, pauseDetails]);

  const handleCompleteSubmit = useCallback(() => {
    completeMutation.mutate(workNotesInput);
  }, [completeMutation, workNotesInput]);

  const handleIncompleteSubmit = useCallback(() => {
    if (!incompleteReasonInput.trim()) return;
    incompleteMutation.mutate(incompleteReasonInput.trim());
  }, [incompleteMutation, incompleteReasonInput]);

  const handleCleaning = useCallback(() => {
    Alert.alert(t('common.confirm'), t('common.confirm') + '?', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => cleaningMutation.mutate() },
    ]);
  }, [t, cleaningMutation]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  // Error state
  if (isError || !jobData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[jobData.status] ?? '#9E9E9E';
  const categoryStyle = jobData.category ? CATEGORY_COLORS[jobData.category] : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
      }
    >
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{jobData.job_id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>
              {jobData.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
        {categoryStyle && (
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: categoryStyle.bg },
            ]}
          >
            <Text style={[styles.categoryBadgeText, { color: categoryStyle.text }]}>
              {jobData.category}
            </Text>
          </View>
        )}
      </View>

      {/* Info Section */}
      <View style={styles.infoCard}>
        <Text style={styles.sectionTitle}>{t('common.details')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('jobs.planned_time')}:</Text>
          <Text style={styles.infoValue}>
            {jobData.planned_time_hours != null
              ? `${jobData.planned_time_hours}h`
              : '--'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('jobs.actual_time')}:</Text>
          <Text style={styles.infoValue}>
            {jobData.actual_time_hours != null
              ? `${jobData.actual_time_hours}h`
              : '--'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.status')}:</Text>
          <Text style={[styles.infoValue, { color: statusColor, fontWeight: '600' }]}>
            {jobData.status.replace(/_/g, ' ')}
          </Text>
        </View>
        {jobData.started_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Started:</Text>
            <Text style={styles.infoValue}>{formatDate(jobData.started_at)}</Text>
          </View>
        )}
        {jobData.completed_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Completed:</Text>
            <Text style={styles.infoValue}>{formatDate(jobData.completed_at)}</Text>
          </View>
        )}
      </View>

      {/* Inspector's Finding Section */}
      {inspectionAnswer && (
        <View style={styles.findingCard}>
          <Text style={styles.sectionTitle}>{t('jobs.inspectorFinding', "Inspector's Finding")}</Text>

          {/* Question text */}
          {inspectionAnswer.checklist_item?.question_text && (
            <View style={styles.findingQuestion}>
              <Text style={styles.findingQuestionLabel}>{t('inspection.question', 'Question')}:</Text>
              <Text style={styles.findingQuestionText}>
                {inspectionAnswer.checklist_item.question_text}
              </Text>
            </View>
          )}

          {/* Answer value */}
          <View style={styles.findingRow}>
            <Text style={styles.findingLabel}>{t('inspection.answer', 'Answer')}:</Text>
            <View style={[
              styles.findingAnswerBadge,
              { backgroundColor: inspectionAnswer.answer_value === 'fail' || inspectionAnswer.answer_value === 'no' ? '#FFEBEE' : '#E8F5E9' }
            ]}>
              <Text style={[
                styles.findingAnswerText,
                { color: inspectionAnswer.answer_value === 'fail' || inspectionAnswer.answer_value === 'no' ? '#C62828' : '#2E7D32' }
              ]}>
                {inspectionAnswer.answer_value?.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Comment */}
          {inspectionAnswer.comment && (
            <View style={styles.findingCommentBox}>
              <Text style={styles.findingCommentLabel}>{t('inspection.comment', 'Comment')}:</Text>
              <Text style={styles.findingCommentText}>{inspectionAnswer.comment}</Text>
            </View>
          )}

          {/* Photo */}
          {inspectionAnswer.photo_path && (
            <View style={styles.findingMediaSection}>
              <Text style={styles.findingMediaLabel}>{t('inspection.photo', 'Photo')}:</Text>
              <Image
                source={{ uri: getPhotoUrl(inspectionAnswer.photo_path) || '' }}
                style={styles.findingPhoto}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Voice Note */}
          {inspectionAnswer.voice_note_id && (
            <TouchableOpacity
              style={styles.voiceNoteButton}
              onPress={() => playVoiceNote(inspectionAnswer.voice_note_id)}
            >
              <Text style={styles.voiceNoteIcon}>🔊</Text>
              <Text style={styles.voiceNoteText}>{t('inspection.playVoiceNote', 'Play Voice Note')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Timer Section */}
      {jobData.is_running && (
        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>Elapsed Time</Text>
          <Text style={styles.timerDisplay}>{formatTimer(elapsedSeconds)}</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>{t('common.actions')}</Text>

        {/* Assigned with planned time: Start */}
        {jobData.status === 'assigned' && jobData.has_planned_time && (
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton, startMutation.isPending && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>{t('jobs.start')}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* In progress — waiting for pause approval */}
        {jobData.status === 'in_progress' && jobData.has_pending_pause && (
          <View style={styles.pausedInfoBox}>
            <Text style={styles.pausedInfoText}>
              {t('jobs.waiting_approval', 'Waiting for Pause Approval')}
            </Text>
            <Text style={{ color: '#616161', fontSize: 13, marginTop: 4 }}>
              {t('jobs.waiting_approval_desc', 'Your pause request has been submitted. Timer is stopped until an admin or engineer reviews your request.')}
            </Text>
          </View>
        )}

        {/* In progress actions */}
        {jobData.status === 'in_progress' && !jobData.has_pending_pause && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.pauseButton]}
              onPress={() => setPauseModalVisible(true)}
            >
              <Text style={styles.actionButtonText}>{t('jobs.pause')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={() => {
                setWorkNotesInput('');
                setCompleteModalVisible(true);
              }}
            >
              <Text style={styles.actionButtonText}>{t('jobs.complete')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.incompleteButton]}
              onPress={() => {
                setIncompleteReasonInput('');
                setIncompleteModalVisible(true);
              }}
            >
              <Text style={styles.actionButtonText}>{t('jobs.mark_incomplete')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Paused: show info */}
        {jobData.status === 'paused' && (
          <View style={styles.pausedInfoBox}>
            <Text style={styles.pausedInfoText}>
              {t('status.paused')} - {t('status.pending')}
            </Text>
          </View>
        )}

        {/* Completed: read-only ratings */}
        {(jobData.status === 'completed' || jobData.status === 'qc_approved') && (
          <View style={styles.ratingsSection}>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t('jobs.time_rating')}:</Text>
              <Text style={styles.ratingStars}>{renderStars(jobData.time_rating)}</Text>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t('jobs.qc_rating')}:</Text>
              <Text style={styles.ratingStars}>{renderStars(jobData.qc_rating)}</Text>
            </View>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t('jobs.cleaning_rating')}:</Text>
              <Text style={styles.ratingStars}>{renderStars(jobData.cleaning_rating)}</Text>
            </View>
            {jobData.admin_bonus != null && jobData.admin_bonus > 0 && (
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>{t('jobs.admin_bonus')}:</Text>
                <Text style={styles.bonusText}>+{jobData.admin_bonus}</Text>
              </View>
            )}
            {jobData.work_notes ? (
              <View style={styles.workNotesBox}>
                <Text style={styles.workNotesLabel}>{t('jobs.work_notes')}:</Text>
                <Text style={styles.workNotesText}>{jobData.work_notes}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Incomplete: show reason */}
        {jobData.status === 'incomplete' && jobData.incomplete_reason && (
          <View style={styles.incompleteReasonBox}>
            <Text style={styles.incompleteReasonLabel}>{t('jobs.incomplete_reason')}:</Text>
            <Text style={styles.incompleteReasonText}>{jobData.incomplete_reason}</Text>
          </View>
        )}

        {/* Cleaning button - available for in_progress / completed */}
        {(jobData.status === 'in_progress' || jobData.status === 'completed') && (
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.cleaningButton,
              cleaningMutation.isPending && styles.buttonDisabled,
            ]}
            onPress={handleCleaning}
            disabled={cleaningMutation.isPending}
          >
            {cleaningMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>Cleaning Done</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Pause History */}
      {pauses.length > 0 && (
        <View style={styles.pauseHistoryCard}>
          <Text style={styles.sectionTitle}>Pause History</Text>
          {pauses.map((pause) => {
            const pauseStatusColor = PAUSE_STATUS_COLORS[pause.status] ?? '#9E9E9E';
            return (
              <View key={pause.id} style={styles.pauseItem}>
                <View style={styles.pauseItemHeader}>
                  <Text style={styles.pauseCategoryText}>
                    {pause.reason_category.replace(/_/g, ' ')}
                  </Text>
                  <View style={[styles.pauseStatusBadge, { backgroundColor: pauseStatusColor }]}>
                    <Text style={styles.pauseStatusText}>{pause.status}</Text>
                  </View>
                </View>
                {pause.reason_details && (
                  <Text style={styles.pauseDetailsText}>{pause.reason_details}</Text>
                )}
                <Text style={styles.pauseTimestamp}>
                  {formatDate(pause.requested_at)}
                </Text>
                {pause.duration_minutes != null && (
                  <Text style={styles.pauseDuration}>
                    {pause.duration_minutes} min
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.bottomSpacer} />

      {/* Pause Modal */}
      <Modal
        visible={pauseModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPauseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.pause')}</Text>

            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.categoryPicker}>
              {PAUSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryOption,
                    pauseCategory === cat && styles.categoryOptionActive,
                  ]}
                  onPress={() => setPauseCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      pauseCategory === cat && styles.categoryOptionTextActive,
                    ]}
                  >
                    {cat.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Details</Text>
            <VoiceTextInput
              style={styles.modalTextInput}
              value={pauseDetails}
              onChangeText={setPauseDetails}
              placeholder="Optional details..."
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setPauseModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  pauseMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handlePauseSubmit}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal
        visible={completeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.complete')}</Text>

            <Text style={styles.modalLabel}>{t('jobs.work_notes')}</Text>
            <VoiceTextInput
              style={styles.modalTextInput}
              value={workNotesInput}
              onChangeText={setWorkNotesInput}
              placeholder="Work notes..."
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setCompleteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  completeMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleCompleteSubmit}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Incomplete Modal */}
      <Modal
        visible={incompleteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIncompleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.mark_incomplete')}</Text>

            <Text style={styles.modalLabel}>{t('jobs.incomplete_reason')}</Text>
            <VoiceTextInput
              style={styles.modalTextInput}
              value={incompleteReasonInput}
              onChangeText={setIncompleteReasonInput}
              placeholder="Reason..."
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIncompleteModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  styles.incompleteSubmitButton,
                  incompleteMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleIncompleteSubmit}
                disabled={incompleteMutation.isPending}
              >
                {incompleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },

  // Header
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Info
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#757575',
  },
  infoValue: {
    fontSize: 14,
    color: '#212121',
  },

  // Inspector's Finding
  findingCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  findingQuestion: {
    marginBottom: 12,
  },
  findingQuestionLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
  },
  findingQuestionText: {
    fontSize: 14,
    color: '#212121',
    fontWeight: '500',
  },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  findingLabel: {
    fontSize: 14,
    color: '#757575',
    marginRight: 8,
  },
  findingAnswerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  findingAnswerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  findingCommentBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  findingCommentLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 4,
    fontWeight: '500',
  },
  findingCommentText: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  findingMediaSection: {
    marginBottom: 12,
  },
  findingMediaLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 8,
    fontWeight: '500',
  },
  findingPhoto: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  voiceNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  voiceNoteIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  voiceNoteText: {
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },

  // Timer
  timerCard: {
    backgroundColor: '#1A237E',
    borderRadius: 10,
    padding: 24,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  timerLabel: {
    fontSize: 14,
    color: '#B0BEC5',
    marginBottom: 8,
    fontWeight: '500',
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: 4,
  },

  // Actions
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  pauseButton: {
    backgroundColor: '#9C27B0',
  },
  completeButton: {
    backgroundColor: '#1976D2',
  },
  incompleteButton: {
    backgroundColor: '#F44336',
  },
  cleaningButton: {
    backgroundColor: '#00897B',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Paused info
  pausedInfoBox: {
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  pausedInfoText: {
    fontSize: 15,
    color: '#7B1FA2',
    fontWeight: '600',
  },

  // Ratings
  ratingsSection: {
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ratingLabel: {
    fontSize: 14,
    color: '#757575',
  },
  ratingStars: {
    fontSize: 20,
    color: '#FFC107',
  },
  bonusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  workNotesBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  workNotesLabel: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 4,
    fontWeight: '600',
  },
  workNotesText: {
    fontSize: 14,
    color: '#212121',
  },

  // Incomplete reason
  incompleteReasonBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  incompleteReasonLabel: {
    fontSize: 13,
    color: '#C62828',
    fontWeight: '600',
    marginBottom: 4,
  },
  incompleteReasonText: {
    fontSize: 14,
    color: '#212121',
  },

  // Pause history
  pauseHistoryCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  pauseItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
  },
  pauseItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pauseCategoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    textTransform: 'capitalize',
  },
  pauseStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pauseStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  pauseDetailsText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4,
  },
  pauseTimestamp: {
    fontSize: 12,
    color: '#9E9E9E',
  },
  pauseDuration: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '500',
    marginTop: 2,
  },

  bottomSpacer: {
    height: 40,
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#212121',
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  incompleteSubmitButton: {
    backgroundColor: '#F44336',
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // Category picker
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e8e8e8',
  },
  categoryOptionActive: {
    backgroundColor: '#1976D2',
  },
  categoryOptionText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  categoryOptionTextActive: {
    color: '#fff',
  },

  // Error / Retry
  errorText: {
    fontSize: 16,
    color: '#E53935',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
