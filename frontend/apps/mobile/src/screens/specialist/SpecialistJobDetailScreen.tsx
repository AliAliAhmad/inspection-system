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
} from 'react-native';
import VoiceTextInput from '../../components/VoiceTextInput';
import InspectionFindingDisplay from '../../components/InspectionFindingDisplay';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineMutation } from '../../hooks/useOfflineMutation';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  specialistJobsApi,
  defectAssessmentsApi,
  SpecialistJob,
  PauseLog,
  PauseCategory,
  IncompleteReason,
  getApiClient,
} from '@inspection/shared';

const INCOMPLETE_REASONS: { key: IncompleteReason; label: string }[] = [
  { key: 'no_spare_parts', label: 'No Spare Parts' },
  { key: 'waiting_for_approval', label: 'Waiting for Approval' },
  { key: 'equipment_in_use', label: 'Equipment in Use' },
  { key: 'safety_concern', label: 'Safety Concern' },
  { key: 'need_assistance', label: 'Need Assistance' },
  { key: 'other', label: 'Other' },
];
import * as ImagePicker from 'expo-image-picker';

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
  const { jobId: id } = route.params;

  // Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [workNotesInput, setWorkNotesInput] = useState('');
  const [incompleteReason, setIncompleteReason] = useState<IncompleteReason>('no_spare_parts');
  const [incompleteNotes, setIncompleteNotes] = useState('');

  // Pause modal state
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseCategory, setPauseCategory] = useState<PauseCategory>('parts');
  const [pauseDetails, setPauseDetails] = useState('');

  // Complete modal state
  const [completeModalVisible, setCompleteModalVisible] = useState(false);

  // Incomplete modal state
  const [incompleteModalVisible, setIncompleteModalVisible] = useState(false);

  // Start job flow state (defect details -> confirm -> planned time)
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [startStep, setStartStep] = useState<'details' | 'time'>('details');
  const [plannedTimeInput, setPlannedTimeInput] = useState('');

  // Defect assessment state
  const [assessmentModalVisible, setAssessmentModalVisible] = useState(false);
  const [assessmentVerdict, setAssessmentVerdict] = useState<'confirm' | 'reject' | 'minor'>('confirm');
  const [technicalNotes, setTechnicalNotes] = useState('');

  // Cleaning photo state
  const [cleaningPhotoUri, setCleaningPhotoUri] = useState<string | null>(null);
  const [uploadingCleaning, setUploadingCleaning] = useState(false);

  // Fetch job with offline support
  const {
    data: job,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useOfflineQuery({
    queryKey: ['specialistJob', id],
    queryFn: () => specialistJobsApi.get(id).then((res) => (res.data as any).data ?? res.data),
    cacheKey: `specialistJob-${id}`,
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
  const defectDescription = (jobData as any)?.defect?.description;

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

  // Mutations with offline support
  const startMutation = useOfflineMutation({
    mutationFn: (plannedHours?: number) => specialistJobsApi.start(id, plannedHours),
    offlineConfig: {
      type: 'start-job',
      endpoint: `/api/specialist-jobs/${id}/start`,
      method: 'POST',
      toPayload: (plannedHours) => plannedHours ? { planned_hours: plannedHours } : {},
    },
    invalidateKeys: [['specialistJob', id], ['specialistJobs']],
    onSuccess: () => {
      setStartModalVisible(false);
      setStartStep('details');
      setPlannedTimeInput('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || t('common.error');
      Alert.alert(t('common.error'), msg);
    },
  });

  const completeMutation = useOfflineMutation({
    mutationFn: (notes: string) =>
      specialistJobsApi.complete(id, {
        work_notes: notes || undefined,
        completion_status: 'pass',
      }),
    offlineConfig: {
      type: 'complete-job',
      endpoint: `/api/specialist-jobs/${id}/complete`,
      method: 'POST',
      toPayload: (notes) => ({ work_notes: notes || undefined, completion_status: 'pass' }),
    },
    invalidateKeys: [['specialistJob', id], ['specialistJobs']],
    onSuccess: () => {
      setCompleteModalVisible(false);
      setWorkNotesInput('');
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const incompleteMutation = useOfflineMutation({
    mutationFn: (payload: { reason: IncompleteReason; notes?: string }) =>
      specialistJobsApi.markIncomplete(id, payload),
    offlineConfig: {
      type: 'mark-incomplete',
      endpoint: `/api/specialist-jobs/${id}/mark-incomplete`,
      method: 'POST',
    },
    invalidateKeys: [['specialistJob', id], ['specialistJobs']],
    onSuccess: () => {
      setIncompleteModalVisible(false);
      setIncompleteReason('no_spare_parts');
      setIncompleteNotes('');
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const pauseMutation = useOfflineMutation({
    mutationFn: (payload: { reason_category: PauseCategory; reason_details?: string }) =>
      specialistJobsApi.requestPause(id, payload),
    offlineConfig: {
      type: 'request-pause',
      endpoint: `/api/specialist-jobs/${id}/request-pause`,
      method: 'POST',
    },
    invalidateKeys: [['specialistJob', id], ['specialistJobPauses', id], ['specialistJobs']],
    onSuccess: () => {
      setPauseModalVisible(false);
      setPauseCategory('parts');
      setPauseDetails('');
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

  const defectAssessmentMutation = useOfflineMutation({
    mutationFn: (payload: { defect_id: number; verdict: 'confirm' | 'reject' | 'minor'; technical_notes: string }) =>
      defectAssessmentsApi.create(payload),
    offlineConfig: {
      type: 'assess-defect',
      endpoint: '/api/defect-assessments',
      method: 'POST',
    },
    invalidateKeys: [['specialistJob', id]],
    onSuccess: () => {
      setAssessmentModalVisible(false);
      setAssessmentVerdict('confirm');
      setTechnicalNotes('');
      Alert.alert(t('common.success', 'Success'), t('jobs.assessment_submitted', 'Assessment submitted'));
    },
    onError: () => Alert.alert(t('common.error'), t('common.error')),
  });

  const handleStart = useCallback(() => {
    // Open the start modal to show defect details first
    setStartStep('details');
    setPlannedTimeInput('');
    setStartModalVisible(true);
  }, []);

  const handleStartConfirm = useCallback(() => {
    // If job already has planned time, start directly
    if (jobData?.has_planned_time) {
      startMutation.mutate();
    } else {
      // Move to time input step
      setStartStep('time');
    }
  }, [jobData, startMutation]);

  const handleStartWithTime = useCallback(() => {
    const hours = parseFloat(plannedTimeInput);
    if (isNaN(hours) || hours <= 0) {
      Alert.alert(t('common.error'), 'Please enter a valid number of hours');
      return;
    }
    startMutation.mutate(hours);
  }, [plannedTimeInput, startMutation, t]);

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
    incompleteMutation.mutate({
      reason: incompleteReason,
      notes: incompleteNotes.trim() || undefined,
    });
  }, [incompleteMutation, incompleteReason, incompleteNotes]);

  const handleCleaning = useCallback(() => {
    Alert.alert(t('common.confirm'), t('common.confirm') + '?', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: () => cleaningMutation.mutate() },
    ]);
  }, [t, cleaningMutation]);

  const handleTakeCleaningPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Camera permission required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      await uploadCleaningPhoto(result.assets[0].uri);
    }
  }, [t]);

  const handlePickCleaningPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Gallery permission required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      await uploadCleaningPhoto(result.assets[0].uri);
    }
  }, [t]);

  const uploadCleaningPhoto = useCallback(async (uri: string) => {
    setUploadingCleaning(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: 'cleaning.jpg',
        type: 'image/jpeg',
      } as any);
      formData.append('entity_type', 'specialist_job');
      formData.append('entity_id', String(id));
      formData.append('file_category', 'cleaning');

      await getApiClient().post('/api/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setCleaningPhotoUri(uri);
      cleaningMutation.mutate();
    } catch (error) {
      console.error('Cleaning photo upload failed:', error);
      Alert.alert(t('common.error'), 'Failed to upload photo');
    } finally {
      setUploadingCleaning(false);
    }
  }, [id, cleaningMutation, t]);

  const handleDefectAssessmentSubmit = useCallback(() => {
    if (!technicalNotes.trim()) {
      Alert.alert(t('common.error'), 'Technical notes required');
      return;
    }
    const defectId = (jobData as any)?.defect_id;
    if (!defectId) return;
    defectAssessmentMutation.mutate({
      defect_id: defectId,
      verdict: assessmentVerdict,
      technical_notes: technicalNotes,
    });
  }, [jobData, assessmentVerdict, technicalNotes, defectAssessmentMutation, t]);

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
        <View>
          <Text style={styles.sectionTitle}>{t('jobs.inspectorFinding', "Inspector's Finding")}</Text>
          <InspectionFindingDisplay
            answer={inspectionAnswer}
            defectDescription={defectDescription}
          />
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

        {/* Assigned: Start (with or without planned time) */}
        {jobData.status === 'assigned' && (
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
                setIncompleteReason('no_spare_parts');
                setIncompleteNotes('');
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

        {/* Incomplete: show reason and acknowledgment status */}
        {jobData.status === 'incomplete' && jobData.incomplete_reason && (
          <View style={styles.incompleteReasonBox}>
            <Text style={styles.incompleteReasonLabel}>{t('jobs.incomplete_reason')}:</Text>
            <Text style={styles.incompleteReasonText}>
              {INCOMPLETE_REASONS.find(r => r.key === jobData.incomplete_reason)?.label || jobData.incomplete_reason}
            </Text>
            {jobData.incomplete_notes && (
              <>
                <Text style={[styles.incompleteReasonLabel, { marginTop: 8 }]}>{t('jobs.notes', 'Notes')}:</Text>
                <Text style={styles.incompleteReasonText}>{jobData.incomplete_notes}</Text>
              </>
            )}
            {jobData.incomplete_acknowledged_by ? (
              <View style={styles.acknowledgedBadge}>
                <Text style={styles.acknowledgedText}>
                  ✓ {t('jobs.acknowledged_by', 'Acknowledged by')} {jobData.incomplete_acknowledger_name || 'Admin'}
                </Text>
              </View>
            ) : (
              <View style={styles.pendingAckBadge}>
                <Text style={styles.pendingAckText}>
                  ⏳ {t('jobs.waiting_acknowledgment', 'Waiting for admin acknowledgment')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Cleaning section - available for in_progress / completed */}
        {(jobData.status === 'in_progress' || jobData.status === 'completed') && (
          <View style={styles.cleaningSection}>
            <Text style={styles.cleaningLabel}>Cleaning Evidence</Text>
            <View style={styles.cleaningButtons}>
              <TouchableOpacity
                style={[styles.cleaningPhotoBtn, uploadingCleaning && styles.buttonDisabled]}
                onPress={handleTakeCleaningPhoto}
                disabled={uploadingCleaning}
              >
                <Text style={styles.cleaningPhotoBtnText}>📷 Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cleaningPhotoBtn, uploadingCleaning && styles.buttonDisabled]}
                onPress={handlePickCleaningPhoto}
                disabled={uploadingCleaning}
              >
                <Text style={styles.cleaningPhotoBtnText}>🖼️ Gallery</Text>
              </TouchableOpacity>
            </View>
            {uploadingCleaning && (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color="#00897B" />
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}
            {cleaningPhotoUri && (
              <Text style={styles.cleaningSuccessText}>✓ Photo uploaded</Text>
            )}
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
                <Text style={styles.actionButtonText}>Mark Cleaning Done</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Defect Assessment - available when job has defect_id and not yet assessed */}
        {(jobData as any)?.defect_id && (jobData.status === 'in_progress' || jobData.status === 'completed') && (
          <TouchableOpacity
            style={[styles.actionButton, styles.assessmentButton]}
            onPress={() => setAssessmentModalVisible(true)}
          >
            <Text style={styles.actionButtonText}>Submit Defect Assessment</Text>
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
            <View style={styles.incompleteReasonPicker}>
              {INCOMPLETE_REASONS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.incompleteReasonOption,
                    incompleteReason === item.key && styles.incompleteReasonOptionActive,
                  ]}
                  onPress={() => setIncompleteReason(item.key)}
                >
                  <Text
                    style={[
                      styles.incompleteReasonOptionText,
                      incompleteReason === item.key && styles.incompleteReasonOptionTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>{t('jobs.notes', 'Additional Notes')} ({t('common.optional', 'Optional')})</Text>
            <VoiceTextInput
              style={styles.modalTextInput}
              value={incompleteNotes}
              onChangeText={setIncompleteNotes}
              placeholder="Additional details..."
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

      {/* Defect Assessment Modal */}
      <Modal
        visible={assessmentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssessmentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Defect Assessment</Text>

            <Text style={styles.modalLabel}>Verdict</Text>
            <View style={styles.verdictPicker}>
              {(['confirm', 'reject', 'minor'] as const).map((verdict) => (
                <TouchableOpacity
                  key={verdict}
                  style={[
                    styles.verdictOption,
                    assessmentVerdict === verdict && (
                      verdict === 'confirm' ? styles.verdictConfirm :
                      verdict === 'reject' ? styles.verdictReject :
                      styles.verdictMinor
                    ),
                  ]}
                  onPress={() => setAssessmentVerdict(verdict)}
                >
                  <Text
                    style={[
                      styles.verdictOptionText,
                      assessmentVerdict === verdict && styles.verdictOptionTextActive,
                    ]}
                  >
                    {verdict === 'confirm' ? 'Confirm' : verdict === 'reject' ? 'Reject' : 'Minor'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Technical Notes *</Text>
            <VoiceTextInput
              style={styles.modalTextInput}
              value={technicalNotes}
              onChangeText={setTechnicalNotes}
              placeholder="Technical notes..."
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setAssessmentModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  defectAssessmentMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleDefectAssessmentSubmit}
                disabled={defectAssessmentMutation.isPending}
              >
                {defectAssessmentMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Start Job Modal - Shows defect details first, then planned time input */}
      <Modal
        visible={startModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStartModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {startStep === 'details' ? (
              <>
                <Text style={styles.modalTitle}>{t('jobs.review_before_start', 'Review Before Starting')}</Text>

                {/* Defect Details Section */}
                <ScrollView style={styles.startModalScroll}>
                  {inspectionAnswer && (
                    <View style={styles.startModalDefectSection}>
                      <Text style={styles.startModalSectionTitle}>{t('jobs.inspectorFinding', "Inspector's Finding")}</Text>
                      <InspectionFindingDisplay
                        answer={inspectionAnswer}
                        defectDescription={defectDescription}
                      />
                    </View>
                  )}

                  {!inspectionAnswer && defectDescription && (
                    <View style={styles.startModalDefectSection}>
                      <Text style={styles.startModalSectionTitle}>{t('defects.description', 'Defect Description')}</Text>
                      <Text style={styles.startModalDefectText}>{defectDescription}</Text>
                    </View>
                  )}

                  {jobData?.equipment_name && (
                    <View style={styles.startModalInfoRow}>
                      <Text style={styles.startModalInfoLabel}>{t('common.equipment', 'Equipment')}:</Text>
                      <Text style={styles.startModalInfoValue}>{jobData.equipment_name}</Text>
                    </View>
                  )}

                  {jobData?.category && (
                    <View style={styles.startModalInfoRow}>
                      <Text style={styles.startModalInfoLabel}>{t('jobs.category', 'Category')}:</Text>
                      <Text style={[
                        styles.startModalInfoValue,
                        { color: jobData.category === 'major' ? '#D32F2F' : '#E65100', fontWeight: '600' }
                      ]}>{jobData.category.toUpperCase()}</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.startModalConfirmBox}>
                  <Text style={styles.startModalConfirmText}>
                    {t('jobs.confirm_understand', 'I have reviewed the defect details and understand the work required.')}
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setStartModalVisible(false)}
                  >
                    <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSubmitButton}
                    onPress={handleStartConfirm}
                  >
                    <Text style={styles.modalSubmitText}>
                      {jobData?.has_planned_time ? t('jobs.start') : t('common.next', 'Next')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{t('jobs.enter_planned_time', 'Enter Planned Time')}</Text>

                <Text style={styles.modalLabel}>{t('jobs.how_long', 'How many hours do you expect this job to take?')}</Text>

                <TextInput
                  style={styles.plannedTimeInput}
                  value={plannedTimeInput}
                  onChangeText={setPlannedTimeInput}
                  placeholder="e.g., 2.5"
                  keyboardType="decimal-pad"
                  autoFocus
                />

                <Text style={styles.plannedTimeHint}>
                  {t('jobs.planned_time_hint', 'Enter the estimated hours to complete this job. This helps track performance and plan resources.')}
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setStartStep('details')}
                  >
                    <Text style={styles.modalCancelText}>{t('common.back', 'Back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalSubmitButton,
                      styles.startSubmitButton,
                      startMutation.isPending && styles.buttonDisabled,
                    ]}
                    onPress={handleStartWithTime}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalSubmitText}>{t('jobs.start')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
    marginTop: 8,
  },
  assessmentButton: {
    backgroundColor: '#5E35B1',
    marginTop: 12,
  },
  cleaningSection: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#E0F2F1',
    borderRadius: 8,
  },
  cleaningLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00695C',
    marginBottom: 8,
  },
  cleaningButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cleaningPhotoBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00897B',
    alignItems: 'center',
  },
  cleaningPhotoBtnText: {
    color: '#00897B',
    fontWeight: '600',
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  uploadingText: {
    color: '#00897B',
    fontSize: 13,
  },
  cleaningSuccessText: {
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 8,
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
  incompleteReasonPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  incompleteReasonOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  incompleteReasonOptionActive: {
    backgroundColor: '#F44336',
    borderColor: '#F44336',
  },
  incompleteReasonOptionText: {
    fontSize: 13,
    color: '#C62828',
    fontWeight: '500',
  },
  incompleteReasonOptionTextActive: {
    color: '#fff',
  },
  acknowledgedBadge: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  acknowledgedText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
  },
  pendingAckBadge: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  pendingAckText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
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
  verdictPicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  verdictOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
  },
  verdictConfirm: {
    backgroundColor: '#4CAF50',
  },
  verdictReject: {
    backgroundColor: '#F44336',
  },
  verdictMinor: {
    backgroundColor: '#FF9800',
  },
  verdictOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  verdictOptionTextActive: {
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

  // Start modal styles
  startModalScroll: {
    maxHeight: 300,
    marginBottom: 16,
  },
  startModalDefectSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  startModalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  startModalDefectText: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
  },
  startModalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  startModalInfoLabel: {
    fontSize: 14,
    color: '#757575',
  },
  startModalInfoValue: {
    fontSize: 14,
    color: '#212121',
  },
  startModalConfirmBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  startModalConfirmText: {
    fontSize: 13,
    color: '#2E7D32',
    textAlign: 'center',
  },
  plannedTimeInput: {
    borderWidth: 1,
    borderColor: '#BDBDBD',
    borderRadius: 8,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    color: '#212121',
  },
  plannedTimeHint: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 16,
  },
  startSubmitButton: {
    backgroundColor: '#4CAF50',
  },
});
