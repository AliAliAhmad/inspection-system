import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import VoiceTextInput from '../../components/VoiceTextInput';
import JobShowUpSection from '../../components/JobShowUpSection';
import { useAuth } from '../../providers/AuthProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { engineerJobsApi } from '@inspection/shared';
import type { EngineerJob, PauseCategory } from '@inspection/shared';

const PAUSE_CATEGORIES: PauseCategory[] = [
  'parts',
  'duty_finish',
  'tools',
  'manpower',
  'oem',
  'error_record',
  'other',
];

export default function EngineerJobDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'EngineerJobDetail'>>();
  const { jobId: id } = route.params;
  const queryClient = useQueryClient();
  const { user: authUser } = useAuth();

  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [workNotes, setWorkNotes] = useState('');
  const [completionStatus, setCompletionStatus] = useState<string>('pass');
  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [pauseCategory, setPauseCategory] = useState<PauseCategory>('parts');
  const [pauseDetails, setPauseDetails] = useState('');

  // Live timer state
  const [elapsed, setElapsed] = useState('00:00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['engineerJob', id],
    queryFn: () => engineerJobsApi.get(id),
  });

  const job: EngineerJob | undefined = (data?.data as any)?.data ?? (data?.data as any);

  // Live timer for in_progress jobs
  useEffect(() => {
    if (job?.status === 'in_progress' && job.started_at) {
      const updateTimer = () => {
        const start = new Date(job.started_at!).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - start) / 1000));
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        setElapsed(
          `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
        );
      };
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [job?.status, job?.started_at]);

  const enterTimeMutation = useMutation({
    mutationFn: (payload: { planned_time_days?: number; planned_time_hours?: number }) =>
      engineerJobsApi.enterPlannedTime(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engineerJob', id] });
      queryClient.invalidateQueries({ queryKey: ['engineerJobs'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => engineerJobsApi.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engineerJob', id] });
      queryClient.invalidateQueries({ queryKey: ['engineerJobs'] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (payload: { work_notes?: string; completion_status?: string }) =>
      engineerJobsApi.complete(id, payload),
    onSuccess: () => {
      setCompleteModalVisible(false);
      setWorkNotes('');
      queryClient.invalidateQueries({ queryKey: ['engineerJob', id] });
      queryClient.invalidateQueries({ queryKey: ['engineerJobs'] });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: PauseCategory; reason_details?: string }) =>
      engineerJobsApi.requestPause(id, payload),
    onSuccess: () => {
      setPauseModalVisible(false);
      setPauseCategory('parts');
      setPauseDetails('');
      queryClient.invalidateQueries({ queryKey: ['engineerJob', id] });
      queryClient.invalidateQueries({ queryKey: ['engineerJobs'] });
    },
  });

  const handleEnterTime = () => {
    Alert.prompt
      ? Alert.prompt(
          t('jobs.enter_planned_time', 'Enter Planned Time'),
          t('common.enter_days', 'Enter planned days (e.g. 2)'),
          (daysText) => {
            const days = parseInt(daysText, 10) || undefined;
            Alert.prompt(
              t('jobs.enter_planned_time', 'Enter Planned Time'),
              t('common.enter_hours', 'Enter planned hours (e.g. 4)'),
              (hoursText) => {
                const hours = parseInt(hoursText, 10) || undefined;
                if (days || hours) {
                  enterTimeMutation.mutate({ planned_time_days: days, planned_time_hours: hours });
                }
              },
              'plain-text',
              '',
              'numeric'
            );
          },
          'plain-text',
          '',
          'numeric'
        )
      : Alert.alert(
          t('jobs.enter_planned_time', 'Enter Planned Time'),
          t('common.enter_time_prompt', 'Use the web app to enter planned time for this job.'),
          [
            { text: t('common.cancel', 'Cancel'), style: 'cancel' },
            {
              text: t('common.ok', 'OK'),
              onPress: () => enterTimeMutation.mutate({ planned_time_days: 1, planned_time_hours: 0 }),
            },
          ]
        );
  };

  const handleStart = () => {
    Alert.alert(
      t('jobs.start', 'Start Job'),
      t('common.confirm_start', 'Are you sure you want to start this job?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('jobs.start', 'Start'), onPress: () => startMutation.mutate() },
      ]
    );
  };

  const handleComplete = () => {
    completeMutation.mutate({
      work_notes: workNotes || undefined,
      completion_status: completionStatus,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return '#FF9800';
      case 'in_progress': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'reviewed': return '#9C27B0';
      default: return '#757575';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'custom_project': return t('common.custom_project', 'Custom Project');
      case 'system_review': return t('common.system_review', 'System Review');
      case 'special_task': return t('common.special_task', 'Special Task');
      default: return type;
    }
  };

  const renderStars = (rating: number | null, label: string) => {
    if (rating == null) return null;
    const stars = Array.from({ length: 5 }, (_, i) => (i < rating ? '\u2605' : '\u2606')).join('');
    return (
      <View style={styles.ratingRow}>
        <Text style={styles.ratingLabel}>{label}</Text>
        <Text style={styles.ratingStars}>{stars}</Text>
        <Text style={styles.ratingValue}>{rating}/5</Text>
      </View>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.not_found', 'Job not found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.headerSection}>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.jobId}>{job.job_id}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: getStatusColor(job.status) }]}>
            <Text style={styles.badgeText}>{t(`status.${job.status}`, job.status)}</Text>
          </View>
          {job.category && (
            <View style={[styles.badge, { backgroundColor: job.category === 'major' ? '#F44336' : '#FF9800' }]}>
              <Text style={styles.badgeText}>{t(`common.${job.category}`, job.category)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Timer for in_progress (hidden when waiting for pause approval) */}
      {job.status === 'in_progress' && !job.has_pending_pause && (
        <View style={styles.timerSection}>
          <Text style={styles.timerLabel}>{t('common.elapsed_time', 'Elapsed Time')}</Text>
          <Text style={styles.timerValue}>{elapsed}</Text>
        </View>
      )}

      {/* Info Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('common.details', 'Details')}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.type', 'Type')}</Text>
          <Text style={styles.infoValue}>{getTypeLabel(job.job_type)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.description', 'Description')}</Text>
          <Text style={styles.infoValueFull}>{job.description || '-'}</Text>
        </View>

        {job.major_reason && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.major_reason', 'Major Reason')}</Text>
            <Text style={styles.infoValueFull}>{job.major_reason}</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('jobs.planned_time', 'Planned Time')}</Text>
          <Text style={styles.infoValue}>
            {job.planned_time_days ? `${job.planned_time_days} ${t('common.days', 'days')}` : ''}
            {job.planned_time_days && job.planned_time_hours ? ' ' : ''}
            {job.planned_time_hours ? `${job.planned_time_hours} ${t('common.hours', 'hours')}` : ''}
            {!job.planned_time_days && !job.planned_time_hours ? '-' : ''}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('jobs.actual_time', 'Actual Time')}</Text>
          <Text style={styles.infoValue}>
            {job.actual_time_hours != null ? `${job.actual_time_hours} ${t('common.hours', 'hours')}` : '-'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.created', 'Created')}</Text>
          <Text style={styles.infoValue}>{formatDate(job.created_at)}</Text>
        </View>

        {job.started_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.started', 'Started')}</Text>
            <Text style={styles.infoValue}>{formatDate(job.started_at)}</Text>
          </View>
        )}

        {job.completed_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.completed', 'Completed')}</Text>
            <Text style={styles.infoValue}>{formatDate(job.completed_at)}</Text>
          </View>
        )}
      </View>

      {/* Show Up & Challenges */}
      {authUser && (
        <JobShowUpSection
          jobType="engineer"
          jobId={id}
          jobOwnerId={job.engineer_id}
          jobStatus={job.status}
          userRole={authUser.role}
          userId={authUser.id}
        />
      )}

      {/* Ratings (completed/reviewed) */}
      {(job.status === 'completed' || job.status === 'reviewed') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('common.ratings', 'Ratings')}</Text>
          {renderStars(job.time_rating, t('jobs.time_rating', 'Time Rating'))}
          {renderStars(job.qc_rating, t('jobs.qc_rating', 'QC Rating'))}
          {job.admin_bonus > 0 && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>{t('jobs.admin_bonus', 'Admin Bonus')}</Text>
              <Text style={styles.bonusValue}>+{job.admin_bonus}</Text>
            </View>
          )}
          {job.work_notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>{t('jobs.work_notes', 'Work Notes')}</Text>
              <Text style={styles.notesText}>{job.work_notes}</Text>
            </View>
          )}
        </View>
      )}

      {/* Actions */}
      {job.status === 'assigned' && (
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleEnterTime}
            disabled={enterTimeMutation.isPending}
          >
            {enterTimeMutation.isPending ? (
              <ActivityIndicator color="#1976D2" />
            ) : (
              <Text style={styles.secondaryButtonText}>
                {t('jobs.enter_planned_time', 'Enter Planned Time')}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleStart}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('jobs.start', 'Start Job')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {job.status === 'in_progress' && job.has_pending_pause && (
        <View style={styles.actionsSection}>
          <View style={{ backgroundColor: '#E3F2FD', borderRadius: 10, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1565C0' }}>
              {t('jobs.waiting_approval', 'Waiting for Pause Approval')}
            </Text>
            <Text style={{ color: '#616161', fontSize: 13, marginTop: 4 }}>
              {t('jobs.waiting_approval_desc', 'Your pause request has been submitted. Timer is stopped until an admin or engineer reviews your request.')}
            </Text>
          </View>
        </View>
      )}

      {job.status === 'in_progress' && !job.has_pending_pause && (
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => setPauseModalVisible(true)}
          >
            <Text style={styles.secondaryButtonText}>{t('jobs.pause', 'Pause')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, { backgroundColor: '#4CAF50' }]}
            onPress={() => setCompleteModalVisible(true)}
          >
            <Text style={styles.primaryButtonText}>{t('jobs.complete', 'Complete Job')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pause Modal */}
      <Modal visible={pauseModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.pause', 'Request Pause')}</Text>

            <Text style={styles.inputLabel}>{t('jobs.pause_reason', 'Reason Category')}</Text>
            <View style={styles.categoryGrid}>
              {PAUSE_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    pauseCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setPauseCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      pauseCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>{t('common.details', 'Details')}</Text>
            <VoiceTextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              value={pauseDetails}
              onChangeText={setPauseDetails}
              placeholder={t('common.enter_details', 'Enter details...')}
              placeholderTextColor="#9E9E9E"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => {
                  setPauseModalVisible(false);
                  setPauseCategory('parts');
                  setPauseDetails('');
                }}
              >
                <Text style={styles.secondaryButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={() =>
                  pauseMutation.mutate({
                    reason_category: pauseCategory,
                    reason_details: pauseDetails || undefined,
                  })
                }
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('common.submit', 'Submit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal visible={completeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.complete', 'Complete Job')}</Text>

            <Text style={styles.inputLabel}>{t('jobs.work_notes', 'Work Notes')}</Text>
            <VoiceTextInput
              style={styles.textArea}
              multiline
              numberOfLines={4}
              value={workNotes}
              onChangeText={setWorkNotes}
              placeholder={t('common.enter_notes', 'Enter work notes...')}
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.inputLabel}>{t('common.completion_status', 'Completion Status')}</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, completionStatus === 'pass' && styles.toggleActive]}
                onPress={() => setCompletionStatus('pass')}
              >
                <Text style={[styles.toggleText, completionStatus === 'pass' && styles.toggleTextActive]}>
                  {t('common.pass', 'Pass')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, completionStatus === 'incomplete' && styles.toggleActiveRed]}
                onPress={() => setCompletionStatus('incomplete')}
              >
                <Text style={[styles.toggleText, completionStatus === 'incomplete' && styles.toggleTextActive]}>
                  {t('jobs.mark_incomplete', 'Incomplete')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.secondaryButton]}
                onPress={() => setCompleteModalVisible(false)}
              >
                <Text style={styles.secondaryButtonText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton, { backgroundColor: '#4CAF50' }]}
                onPress={handleComplete}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('common.submit', 'Submit')}</Text>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  errorText: { fontSize: 16, color: '#F44336' },
  headerSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', marginBottom: 4 },
  jobId: { fontSize: 14, color: '#757575', marginBottom: 12 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  timerSection: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    marginBottom: 8,
    alignItems: 'center',
  },
  timerLabel: { fontSize: 14, color: '#1565C0', marginBottom: 4 },
  timerValue: { fontSize: 36, fontWeight: 'bold', color: '#1976D2', fontVariant: ['tabular-nums'] },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#212121', marginBottom: 16 },
  infoRow: { marginBottom: 14 },
  infoLabel: { fontSize: 13, color: '#757575', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#212121' },
  infoValueFull: { fontSize: 15, color: '#212121', lineHeight: 22 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingLabel: { fontSize: 14, color: '#616161', flex: 1 },
  ratingStars: { fontSize: 18, color: '#FFC107', marginRight: 8 },
  ratingValue: { fontSize: 14, color: '#757575' },
  bonusValue: { fontSize: 16, fontWeight: '600', color: '#4CAF50' },
  notesBox: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  notesLabel: { fontSize: 13, color: '#757575', marginBottom: 4 },
  notesText: { fontSize: 14, color: '#424242', lineHeight: 20 },
  actionsSection: {
    padding: 20,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: { backgroundColor: '#1976D2' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1976D2' },
  secondaryButtonText: { color: '#1976D2', fontSize: 16, fontWeight: '600' },
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
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#212121', marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#424242', marginBottom: 8 },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    minHeight: 100,
    marginBottom: 16,
    color: '#212121',
  },
  toggleRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  toggleActive: { borderColor: '#4CAF50', backgroundColor: '#E8F5E9' },
  toggleActiveRed: { borderColor: '#F44336', backgroundColor: '#FFEBEE' },
  toggleText: { fontSize: 15, fontWeight: '500', color: '#616161' },
  toggleTextActive: { color: '#212121' },
  modalActions: { flexDirection: 'row', gap: 12 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  categoryChipActive: {
    borderColor: '#1976D2',
    backgroundColor: '#E3F2FD',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#616161',
    textTransform: 'capitalize',
  },
  categoryChipTextActive: {
    color: '#1976D2',
  },
});
