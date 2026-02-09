/**
 * Daily Review Screen (Engineer/Admin)
 * Approve jobs, rate workers, handle pauses, manage carry-overs.
 * Full functionality on mobile per user requirement.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlanTrackingApi } from '@inspection/shared';
import type {
  WorkPlanDailyReview, WorkPlanJobRating, ShiftType,
} from '@inspection/shared';

type FilterTab = 'all' | 'completed' | 'incomplete' | 'not_reviewed';

export default function DailyReviewScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [shift, setShift] = useState<ShiftType>('day');
  const [dateStr] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [qcRating, setQcRating] = useState<number>(0);
  const [qcReason, setQcReason] = useState('');
  const [cleaningRating, setCleaningRating] = useState<number>(0);

  // Fetch daily review
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['daily-review', dateStr, shift],
    queryFn: () => workPlanTrackingApi.getDailyReview({ date: dateStr, shift }),
  });

  const review = data?.data?.review;
  const jobs = data?.data?.jobs || [];

  // Filter jobs
  const filteredJobs = jobs.filter((job: any) => {
    if (activeTab === 'all') return true;
    const status = job.tracking?.status;
    if (activeTab === 'completed') return status === 'completed';
    if (activeTab === 'incomplete') return status === 'incomplete' || status === 'not_started';
    if (activeTab === 'not_reviewed') return !job.ratings || job.ratings.length === 0;
    return true;
  });

  // Mutations
  const rateMutation = useMutation({
    mutationFn: (payload: any) => workPlanTrackingApi.rateJob(review!.id, payload),
    onSuccess: () => {
      setShowRatingModal(false);
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      Alert.alert('Saved', 'Rating saved successfully');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to save rating'),
  });

  const approvePauseMutation = useMutation({
    mutationFn: (requestId: number) => workPlanTrackingApi.approvePause(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-review'] }),
  });

  const rejectPauseMutation = useMutation({
    mutationFn: (requestId: number) => workPlanTrackingApi.rejectPause(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-review'] }),
  });

  const carryOverMutation = useMutation({
    mutationFn: (jobId: number) => workPlanTrackingApi.createCarryOver(review!.id, {
      original_job_id: jobId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      Alert.alert('Done', 'Job carried over to next day');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed'),
  });

  const submitMutation = useMutation({
    mutationFn: () => workPlanTrackingApi.submitReview(review!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-review'] });
      Alert.alert('Success', 'Daily review submitted!');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Cannot submit'),
  });

  const consumeMaterialsMutation = useMutation({
    mutationFn: (payload: any) => workPlanTrackingApi.consumeMaterials(review!.id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-review'] }),
  });

  const handleOpenRating = (job: any, worker: any) => {
    setSelectedJob(job);
    setSelectedWorker(worker);
    // Pre-fill existing ratings if any
    const existing = job.ratings?.find((r: any) => r.user_id === worker.id);
    setQcRating(existing?.qc_rating || 0);
    setQcReason(existing?.qc_reason || '');
    setCleaningRating(existing?.cleaning_rating ?? 0);
    setShowRatingModal(true);
  };

  const handleSubmitRating = () => {
    if (qcRating > 0 && (qcRating < 3 || qcRating > 4) && !qcReason.trim()) {
      Alert.alert('Required', 'QC reason is required for ratings below 3 or above 4');
      return;
    }
    rateMutation.mutate({
      job_id: selectedJob.id,
      user_id: selectedWorker.id,
      qc_rating: qcRating || undefined,
      qc_reason: qcReason || undefined,
      cleaning_rating: cleaningRating,
    });
  };

  const handleCarryOver = (jobId: number) => {
    Alert.alert(
      'Carry Over',
      'Carry this job to the next day?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Carry Over', onPress: () => carryOverMutation.mutate(jobId) },
      ]
    );
  };

  const handleSubmitReview = () => {
    if (review?.has_unresolved_pauses) {
      Alert.alert('Cannot Submit', 'Please resolve all pending pause requests first.');
      return;
    }
    Alert.alert(
      'Submit Review',
      'Are you sure you want to submit the daily review?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => submitMutation.mutate() },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'in_progress': return '#FF9800';
      case 'incomplete': return '#F44336';
      case 'paused': return '#9C27B0';
      default: return '#9E9E9E';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Daily Review</Text>
        <Text style={styles.headerDate}>{dateStr}</Text>
      </View>

      {/* Shift toggle */}
      <View style={styles.shiftToggle}>
        <TouchableOpacity
          style={[styles.shiftBtn, shift === 'day' && styles.shiftBtnActive]}
          onPress={() => setShift('day')}
        >
          <Text style={[styles.shiftText, shift === 'day' && styles.shiftTextActive]}>Day Shift</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.shiftBtn, shift === 'night' && styles.shiftBtnActive]}
          onPress={() => setShift('night')}
        >
          <Text style={[styles.shiftText, shift === 'night' && styles.shiftTextActive]}>Night Shift</Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats */}
      {review && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, { backgroundColor: '#E8F5E9' }]}>
              <Text style={styles.summaryValue}>{review.approved_jobs}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: '#FFF3E0' }]}>
              <Text style={styles.summaryValue}>{review.incomplete_jobs}</Text>
              <Text style={styles.summaryLabel}>Incomplete</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: '#ECEFF1' }]}>
              <Text style={styles.summaryValue}>{review.not_started_jobs}</Text>
              <Text style={styles.summaryLabel}>Not Started</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: '#E3F2FD' }]}>
              <Text style={styles.summaryValue}>{review.completion_rate}%</Text>
              <Text style={styles.summaryLabel}>Rate</Text>
            </View>
          </View>
          {review.has_unresolved_pauses && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                {review.total_pause_requests - review.resolved_pause_requests} unresolved pause request(s)
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {(['all', 'completed', 'incomplete', 'not_reviewed'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, activeTab === tab && styles.filterTabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.filterText, activeTab === tab && styles.filterTextActive]}>
              {tab.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Job cards */}
      {filteredJobs.map((job: any) => {
        const tracking = job.tracking;
        const status = tracking?.status || 'pending';
        const statusColor = getStatusColor(status);
        const assignments = job.assignments || [];
        const pauseRequests = (job.pause_requests || []).filter((pr: any) => pr.status === 'pending');

        return (
          <View key={job.id} style={styles.jobCard}>
            {/* Job header */}
            <View style={styles.jobHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobType}>{job.job_type?.toUpperCase()}</Text>
                <Text style={styles.equipmentName}>{job.equipment?.name || 'Unknown'}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]}>
                <Text style={styles.statusDotText}>{status.replace('_', ' ')}</Text>
              </View>
            </View>

            {/* Time info */}
            {tracking && (
              <View style={styles.timeInfo}>
                <Text style={styles.timeText}>
                  Est: {job.estimated_hours}h | Actual: {tracking.actual_hours || '--'}h
                </Text>
              </View>
            )}

            {/* Pending pause requests */}
            {pauseRequests.length > 0 && (
              <View style={styles.pauseSection}>
                {pauseRequests.map((pr: any) => (
                  <View key={pr.id} style={styles.pauseRequest}>
                    <Text style={styles.pauseInfo}>
                      {pr.requester?.full_name}: {pr.reason_category.replace(/_/g, ' ')}
                    </Text>
                    <View style={styles.pauseActions}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => approvePauseMutation.mutate(pr.id)}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => rejectPauseMutation.mutate(pr.id)}
                      >
                        <Text style={styles.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Workers to rate */}
            {status === 'completed' && assignments.length > 0 && (
              <View style={styles.workersSection}>
                <Text style={styles.workersSectionTitle}>Rate Workers:</Text>
                {assignments.map((a: any) => {
                  const existing = job.ratings?.find((r: any) => r.user_id === a.user?.id);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.workerRow}
                      onPress={() => handleOpenRating(job, a.user)}
                    >
                      <Text style={styles.workerName}>
                        {a.user?.full_name} {a.is_lead ? '(Lead)' : ''}
                      </Text>
                      {existing ? (
                        <Text style={styles.ratedBadge}>
                          {existing.time_rating ? `★${existing.time_rating}` : 'Rated'}
                        </Text>
                      ) : (
                        <Text style={styles.rateLink}>Rate</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Carry-over button for incomplete/not-started */}
            {(status === 'incomplete' || status === 'not_started') && (
              <TouchableOpacity
                style={styles.carryOverBtn}
                onPress={() => handleCarryOver(job.id)}
              >
                <Text style={styles.carryOverText}>Carry Over to Next Day</Text>
              </TouchableOpacity>
            )}

            {/* Materials checkbox */}
            {job.materials && job.materials.length > 0 && (
              <TouchableOpacity
                style={styles.materialBtn}
                onPress={() => {
                  const payload = {
                    materials: job.materials.map((m: any) => ({
                      material_id: m.id,
                      job_id: job.id,
                      consumed: true,
                    })),
                  };
                  consumeMaterialsMutation.mutate(payload);
                }}
              >
                <Text style={styles.materialBtnText}>
                  Mark Materials Consumed ({job.materials.length})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Submit button */}
      {review && review.status !== 'submitted' && (
        <TouchableOpacity
          style={[styles.submitBtn, !review.can_submit && styles.submitBtnDisabled]}
          onPress={handleSubmitReview}
          disabled={!review.can_submit || submitMutation.isPending}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {review.can_submit ? 'Submit Review' : 'Resolve Pauses First'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {review?.status === 'submitted' && (
        <View style={styles.submittedBanner}>
          <Text style={styles.submittedText}>Review Submitted</Text>
        </View>
      )}

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Rate: {selectedWorker?.full_name}
            </Text>

            {/* QC Rating */}
            <Text style={styles.ratingLabel}>QC Rating (1-5):</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setQcRating(n)}>
                  <Text style={[styles.star, n <= qcRating && styles.starActive]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>

            {qcRating > 0 && (qcRating < 3 || qcRating > 4) && (
              <TextInput
                style={styles.textInput}
                placeholder="QC reason (required for < 3 or > 4)..."
                value={qcReason}
                onChangeText={setQcReason}
                multiline
              />
            )}

            {/* Cleaning Rating */}
            <Text style={styles.ratingLabel}>Cleaning Rating (0-2):</Text>
            <View style={styles.starRow}>
              {[0, 1, 2].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.cleaningBtn, cleaningRating === n && styles.cleaningBtnActive]}
                  onPress={() => setCleaningRating(n)}
                >
                  <Text style={[styles.cleaningText, cleaningRating === n && styles.cleaningTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleSubmitRating}
                disabled={rateMutation.isPending}
              >
                {rateMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save Rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#1976D2', padding: 16, paddingTop: 8 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerDate: { fontSize: 14, color: '#B3D4FC', marginTop: 2 },
  shiftToggle: { flexDirection: 'row', margin: 16, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' },
  shiftBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  shiftBtnActive: { backgroundColor: '#1976D2' },
  shiftText: { fontSize: 14, color: '#666' },
  shiftTextActive: { color: '#fff', fontWeight: 'bold' },
  summaryContainer: { marginHorizontal: 16 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryBox: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  summaryLabel: { fontSize: 10, color: '#666', marginTop: 2 },
  warningBanner: { backgroundColor: '#FFF3E0', padding: 8, borderRadius: 6, marginTop: 8 },
  warningText: { color: '#E65100', fontWeight: '600', textAlign: 'center', fontSize: 13 },
  filterContainer: { marginTop: 12, paddingHorizontal: 12 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 4, borderRadius: 20, backgroundColor: '#fff' },
  filterTabActive: { backgroundColor: '#1976D2' },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  jobCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 8, padding: 12 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobType: { fontSize: 11, fontWeight: 'bold', color: '#1976D2' },
  equipmentName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  statusDot: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDotText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  timeInfo: { marginTop: 6 },
  timeText: { fontSize: 13, color: '#666' },
  pauseSection: { marginTop: 8, backgroundColor: '#FFF8E1', borderRadius: 6, padding: 8 },
  pauseRequest: { marginBottom: 6 },
  pauseInfo: { fontSize: 13, color: '#5D4037', marginBottom: 4 },
  pauseActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  approveBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  rejectBtn: { backgroundColor: '#F44336', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  rejectBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  workersSection: { marginTop: 8, borderTopWidth: 0.5, borderTopColor: '#E0E0E0', paddingTop: 8 },
  workersSectionTitle: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4 },
  workerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  workerName: { fontSize: 14, color: '#333' },
  ratedBadge: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  rateLink: { fontSize: 13, color: '#1976D2', fontWeight: '600' },
  carryOverBtn: { marginTop: 8, backgroundColor: '#FF9800', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  carryOverText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  materialBtn: { marginTop: 8, backgroundColor: '#E3F2FD', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  materialBtnText: { color: '#1976D2', fontWeight: '600', fontSize: 13 },
  submitBtn: { backgroundColor: '#4CAF50', marginHorizontal: 16, marginTop: 20, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#BDBDBD' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  submittedBanner: { backgroundColor: '#E8F5E9', margin: 16, padding: 12, borderRadius: 8, alignItems: 'center' },
  submittedText: { color: '#4CAF50', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  ratingLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6 },
  starRow: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 32, color: '#E0E0E0' },
  starActive: { color: '#FF9800' },
  cleaningBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  cleaningBtnActive: { backgroundColor: '#1976D2' },
  cleaningText: { fontSize: 18, fontWeight: 'bold', color: '#666' },
  cleaningTextActive: { color: '#fff' },
  textInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 10, marginTop: 8, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  modalCancelText: { color: '#666', fontSize: 15 },
  modalConfirm: { backgroundColor: '#1976D2', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 },
  modalConfirmText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
