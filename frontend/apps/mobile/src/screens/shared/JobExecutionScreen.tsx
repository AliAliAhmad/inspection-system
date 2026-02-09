/**
 * Job Execution Screen
 * Worker's primary screen for executing work plan jobs.
 * Start/Pause/Resume/Complete/Mark Incomplete with timers and voice handover.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import { workPlanTrackingApi } from '@inspection/shared';
import type {
  WorkPlanJobTracking, TrackingStatus, PauseReasonCategory,
  IncompleteReasonCategory, PAUSE_REASON_LABELS, INCOMPLETE_REASON_LABELS,
} from '@inspection/shared';

const STATUS_COLORS: Record<TrackingStatus, string> = {
  pending: '#9E9E9E',
  in_progress: '#FF9800',
  paused: '#9C27B0',
  completed: '#4CAF50',
  incomplete: '#F44336',
  not_started: '#607D8B',
};

const PAUSE_REASONS: { key: PauseReasonCategory; label: string }[] = [
  { key: 'break', label: 'Break' },
  { key: 'waiting_for_materials', label: 'Waiting for Materials' },
  { key: 'urgent_task', label: 'Called to Urgent Task' },
  { key: 'waiting_for_access', label: 'Waiting for Access' },
  { key: 'other', label: 'Other' },
];

const INCOMPLETE_REASONS: { key: IncompleteReasonCategory; label: string }[] = [
  { key: 'missing_parts', label: 'Missing Parts' },
  { key: 'equipment_not_accessible', label: 'Equipment Not Accessible' },
  { key: 'time_ran_out', label: 'Time Ran Out' },
  { key: 'safety_concern', label: 'Safety Concern' },
  { key: 'other', label: 'Other' },
];

export default function JobExecutionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const { jobId } = route.params || {};

  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [workNotes, setWorkNotes] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch tracking data
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['job-tracking', jobId],
    queryFn: () => workPlanTrackingApi.getJobTracking(jobId),
    enabled: !!jobId,
  });

  const tracking = data?.data?.tracking;
  const logs = data?.data?.logs || [];
  const carryOverFrom = data?.data?.carry_over_from;

  // Timer effect
  useEffect(() => {
    if (tracking?.is_running && tracking?.started_at) {
      const start = new Date(tracking.started_at).getTime();
      const pausedMs = (tracking.total_paused_minutes || 0) * 60 * 1000;

      const updateTimer = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - start - pausedMs) / 1000);
        setElapsedTime(Math.max(0, elapsed));
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else if (tracking?.is_paused && tracking?.started_at && tracking?.paused_at) {
      const start = new Date(tracking.started_at).getTime();
      const paused = new Date(tracking.paused_at).getTime();
      const pausedMs = (tracking.total_paused_minutes || 0) * 60 * 1000;
      const elapsed = Math.floor((paused - start - pausedMs) / 1000);
      setElapsedTime(Math.max(0, elapsed));
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tracking?.is_running, tracking?.is_paused, tracking?.started_at, tracking?.paused_at]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Mutations
  const startMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.startJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-tracking', jobId] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to start job'),
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: string; reason_details?: string }) =>
      workPlanTrackingApi.pauseJob(jobId, payload as any),
    onSuccess: () => {
      setShowPauseModal(false);
      setSelectedReason('');
      setReasonDetails('');
      queryClient.invalidateQueries({ queryKey: ['job-tracking', jobId] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to pause job'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.resumeJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-tracking', jobId] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to resume job'),
  });

  const completeMutation = useMutation({
    mutationFn: (payload: { work_notes?: string }) => workPlanTrackingApi.completeJob(jobId, payload),
    onSuccess: () => {
      setShowCompleteModal(false);
      queryClient.invalidateQueries({ queryKey: ['job-tracking', jobId] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      Alert.alert('Success', 'Job completed!');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to complete job'),
  });

  const incompleteMutation = useMutation({
    mutationFn: (payload: { reason_category: string; reason_details?: string }) =>
      workPlanTrackingApi.markIncomplete(jobId, payload as any),
    onSuccess: () => {
      setShowIncompleteModal(false);
      setSelectedReason('');
      setReasonDetails('');
      queryClient.invalidateQueries({ queryKey: ['job-tracking', jobId] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      Alert.alert('Job Incomplete', 'Job marked as incomplete. It will be carried over.');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const status = tracking?.status || 'pending';
  const statusColor = STATUS_COLORS[status as TrackingStatus] || '#9E9E9E';

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Carry-over banner */}
      {carryOverFrom && (
        <View style={styles.carryOverBanner}>
          <Text style={styles.carryOverText}>Carry-over from previous day</Text>
          {carryOverFrom.worker_transcription && (
            <Text style={styles.carryOverNote}>{carryOverFrom.worker_transcription}</Text>
          )}
          {carryOverFrom.engineer_transcription && (
            <Text style={styles.carryOverNote}>Engineer: {carryOverFrom.engineer_transcription}</Text>
          )}
        </View>
      )}

      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
        <Text style={styles.statusText}>{status.replace('_', ' ').toUpperCase()}</Text>
      </View>

      {/* Timer */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
        {tracking?.total_paused_minutes ? (
          <Text style={styles.pausedText}>Paused: {tracking.total_paused_minutes} min</Text>
        ) : null}
      </View>

      {/* Action buttons */}
      <View style={styles.actionContainer}>
        {(status === 'pending' || status === 'not_started') && (
          <TouchableOpacity
            style={[styles.actionButton, styles.startButton]}
            onPress={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>START JOB</Text>
            )}
          </TouchableOpacity>
        )}

        {status === 'in_progress' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.pauseButton]}
              onPress={() => setShowPauseModal(true)}
            >
              <Text style={styles.actionButtonText}>PAUSE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={() => setShowCompleteModal(true)}
            >
              <Text style={styles.actionButtonText}>COMPLETE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.incompleteButton]}
              onPress={() => setShowIncompleteModal(true)}
            >
              <Text style={styles.actionButtonText}>INCOMPLETE</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'paused' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.resumeButton]}
              onPress={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>RESUME</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.incompleteButton]}
              onPress={() => setShowIncompleteModal(true)}
            >
              <Text style={styles.actionButtonText}>MARK INCOMPLETE</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'completed' && (
          <View style={styles.completedInfo}>
            <Text style={styles.completedText}>Job Completed</Text>
            {tracking?.actual_hours && (
              <Text style={styles.hoursText}>Actual: {tracking.actual_hours}h</Text>
            )}
          </View>
        )}
      </View>

      {/* Event Log */}
      {logs.length > 0 && (
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          {logs.slice(0, 10).map((log: any) => (
            <View key={log.id} style={styles.logItem}>
              <Text style={styles.logEvent}>{log.event_type.replace(/_/g, ' ')}</Text>
              <Text style={styles.logUser}>{log.user?.full_name}</Text>
              <Text style={styles.logTime}>
                {new Date(log.created_at).toLocaleTimeString()}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Pause Modal */}
      <Modal visible={showPauseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pause Reason</Text>
            {PAUSE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.key}
                style={[
                  styles.reasonButton,
                  selectedReason === reason.key && styles.reasonButtonSelected,
                ]}
                onPress={() => setSelectedReason(reason.key)}
              >
                <Text style={[
                  styles.reasonButtonText,
                  selectedReason === reason.key && styles.reasonButtonTextSelected,
                ]}>
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}
            {selectedReason === 'other' && (
              <TextInput
                style={styles.textInput}
                placeholder="Describe reason..."
                value={reasonDetails}
                onChangeText={setReasonDetails}
                multiline
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowPauseModal(false); setSelectedReason(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !selectedReason && styles.modalConfirmDisabled]}
                onPress={() => {
                  if (selectedReason) {
                    pauseMutation.mutate({
                      reason_category: selectedReason,
                      reason_details: reasonDetails || undefined,
                    });
                  }
                }}
                disabled={!selectedReason || pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Pause</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal visible={showCompleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Job</Text>
            <TextInput
              style={[styles.textInput, { height: 80 }]}
              placeholder="Work notes (optional)..."
              value={workNotes}
              onChangeText={setWorkNotes}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowCompleteModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={() => completeMutation.mutate({ work_notes: workNotes || undefined })}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Incomplete Modal */}
      <Modal visible={showIncompleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark Incomplete</Text>
            <Text style={styles.modalSubtitle}>Select reason:</Text>
            {INCOMPLETE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.key}
                style={[
                  styles.reasonButton,
                  selectedReason === reason.key && styles.reasonButtonSelected,
                ]}
                onPress={() => setSelectedReason(reason.key)}
              >
                <Text style={[
                  styles.reasonButtonText,
                  selectedReason === reason.key && styles.reasonButtonTextSelected,
                ]}>
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.textInput, { height: 60 }]}
              placeholder="Additional details..."
              value={reasonDetails}
              onChangeText={setReasonDetails}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowIncompleteModal(false); setSelectedReason(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, styles.incompleteConfirm, !selectedReason && styles.modalConfirmDisabled]}
                onPress={() => {
                  if (selectedReason) {
                    incompleteMutation.mutate({
                      reason_category: selectedReason,
                      reason_details: reasonDetails || undefined,
                    });
                  }
                }}
                disabled={!selectedReason || incompleteMutation.isPending}
              >
                {incompleteMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Mark Incomplete</Text>
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  carryOverBanner: { backgroundColor: '#FFF3E0', padding: 12, margin: 16, marginBottom: 0, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#FF9800' },
  carryOverText: { fontWeight: 'bold', color: '#E65100', marginBottom: 4 },
  carryOverNote: { color: '#5D4037', fontSize: 13, marginTop: 2 },
  statusBadge: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginTop: 16 },
  statusText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  timerContainer: { alignItems: 'center', marginVertical: 24 },
  timerText: { fontSize: 48, fontWeight: '300', color: '#212121', fontVariant: ['tabular-nums'] },
  pausedText: { fontSize: 14, color: '#9C27B0', marginTop: 4 },
  actionContainer: { paddingHorizontal: 16, gap: 12 },
  actionButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  startButton: { backgroundColor: '#4CAF50' },
  pauseButton: { backgroundColor: '#FF9800' },
  resumeButton: { backgroundColor: '#2196F3' },
  completeButton: { backgroundColor: '#4CAF50' },
  incompleteButton: { backgroundColor: '#F44336' },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  completedInfo: { alignItems: 'center', padding: 20 },
  completedText: { fontSize: 20, fontWeight: 'bold', color: '#4CAF50' },
  hoursText: { fontSize: 16, color: '#666', marginTop: 4 },
  logSection: { margin: 16, backgroundColor: '#fff', borderRadius: 8, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0' },
  logEvent: { flex: 1, fontSize: 13, color: '#333', textTransform: 'capitalize' },
  logUser: { fontSize: 12, color: '#666', marginHorizontal: 8 },
  logTime: { fontSize: 12, color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 8 },
  reasonButton: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#F5F5F5', marginBottom: 8 },
  reasonButtonSelected: { backgroundColor: '#E3F2FD', borderWidth: 1, borderColor: '#1976D2' },
  reasonButtonText: { fontSize: 15, color: '#333' },
  reasonButtonTextSelected: { color: '#1976D2', fontWeight: '600' },
  textInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 15, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  modalCancelText: { color: '#666', fontSize: 15 },
  modalConfirm: { backgroundColor: '#1976D2', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  modalConfirmDisabled: { opacity: 0.5 },
  incompleteConfirm: { backgroundColor: '#F44336' },
  modalConfirmText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
