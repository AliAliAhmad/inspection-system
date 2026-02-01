import React, { useState } from 'react';
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { qualityReviewsApi } from '@inspection/shared';
import type { QualityReview, RejectionCategory } from '@inspection/shared';

const REJECTION_CATEGORIES: RejectionCategory[] = [
  'incomplete_work',
  'wrong_parts',
  'safety_issue',
  'poor_workmanship',
  'did_not_follow_procedure',
  'equipment_still_faulty',
  'other',
];

export default function ReviewDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'ReviewDetail'>>();
  const navigation = useNavigation();
  const { id } = route.params;
  const queryClient = useQueryClient();

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionCategory, setRejectionCategory] = useState<RejectionCategory | null>(null);
  const [evidenceNotes, setEvidenceNotes] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['qualityReview', id],
    queryFn: () => qualityReviewsApi.get(id),
  });

  const review: QualityReview | undefined = (data?.data as any)?.data ?? (data?.data as any);

  const approveMutation = useMutation({
    mutationFn: (notes?: string) => qualityReviewsApi.approve(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qualityReview', id] });
      queryClient.invalidateQueries({ queryKey: ['pendingReviews'] });
      navigation.goBack();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      qualityReviewsApi.reject(id, {
        rejection_reason: rejectionReason,
        rejection_category: rejectionCategory!,
        evidence_notes: evidenceNotes || undefined,
      }),
    onSuccess: () => {
      setRejectModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['qualityReview', id] });
      queryClient.invalidateQueries({ queryKey: ['pendingReviews'] });
      navigation.goBack();
    },
  });

  const handleApprove = () => {
    Alert.alert(
      t('quality.approve', 'Approve'),
      t('common.confirm_approve', 'Approve this review? You can optionally add notes.'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('quality.approve', 'Approve'),
          onPress: () => approveMutation.mutate(undefined),
        },
      ]
    );
  };

  const handleRejectSubmit = () => {
    if (!rejectionReason.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.enter_rejection_reason', 'Please enter a rejection reason.'));
      return;
    }
    if (!rejectionCategory) {
      Alert.alert(t('common.error', 'Error'), t('common.select_category', 'Please select a rejection category.'));
      return;
    }
    rejectMutation.mutate();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#757575';
    }
  };

  const getCategoryLabel = (cat: RejectionCategory) => {
    return t(`quality.category_${cat}`, cat.replace(/_/g, ' '));
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline).getTime() < Date.now();
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!review) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.not_found', 'Review not found')}</Text>
      </View>
    );
  }

  const overdue = isOverdue(review.sla_deadline);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <View style={[styles.typeBadge, { backgroundColor: review.job_type === 'engineer' ? '#1976D2' : '#FF9800' }]}>
            <Text style={styles.typeBadgeText}>
              {t(`common.${review.job_type}`, review.job_type)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(review.status) }]}>
            <Text style={styles.statusBadgeText}>{t(`status.${review.status}`, review.status)}</Text>
          </View>
        </View>
        <Text style={styles.jobIdTitle}>
          {t('common.job', 'Job')} #{review.job_id}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('common.details', 'Details')}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.job_type', 'Job Type')}</Text>
          <Text style={styles.infoValue}>{t(`common.${review.job_type}`, review.job_type)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.job_id', 'Job ID')}</Text>
          <Text style={styles.infoValue}>#{review.job_id}</Text>
        </View>

        {review.quality_engineer && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.quality_engineer', 'Quality Engineer')}</Text>
            <Text style={styles.infoValue}>
              {(review.quality_engineer as any).full_name || (review.quality_engineer as any).username || '-'}
            </Text>
          </View>
        )}

        {review.sla_deadline && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('quality.sla_deadline', 'SLA Deadline')}</Text>
            <Text style={[styles.infoValue, overdue && styles.overdueText]}>
              {formatDateTime(review.sla_deadline)}
              {overdue ? ` (${t('common.overdue', 'OVERDUE')})` : ''}
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('common.created', 'Created')}</Text>
          <Text style={styles.infoValue}>{formatDateTime(review.created_at)}</Text>
        </View>

        {review.reviewed_at && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.reviewed_at', 'Reviewed At')}</Text>
            <Text style={styles.infoValue}>{formatDateTime(review.reviewed_at)}</Text>
          </View>
        )}

        {review.sla_met != null && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('common.sla_met', 'SLA Met')}</Text>
            <Text style={[styles.infoValue, { color: review.sla_met ? '#4CAF50' : '#F44336' }]}>
              {review.sla_met ? t('common.yes', 'Yes') : t('common.no', 'No')}
            </Text>
          </View>
        )}
      </View>

      {/* Decision details for reviewed */}
      {review.status !== 'pending' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('common.decision', 'Decision')}</Text>

          {review.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>{t('common.notes', 'Notes')}</Text>
              <Text style={styles.notesText}>{review.notes}</Text>
            </View>
          )}

          {review.status === 'rejected' && (
            <>
              {review.rejection_category && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('quality.rejection_category', 'Category')}</Text>
                  <View style={[styles.categoryBadge, { backgroundColor: '#FFEBEE' }]}>
                    <Text style={[styles.categoryBadgeText, { color: '#F44336' }]}>
                      {getCategoryLabel(review.rejection_category)}
                    </Text>
                  </View>
                </View>
              )}
              {review.rejection_reason && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>{t('quality.rejection_reason', 'Rejection Reason')}</Text>
                  <Text style={styles.notesText}>{review.rejection_reason}</Text>
                </View>
              )}
              {review.evidence_notes && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>{t('quality.evidence', 'Evidence Notes')}</Text>
                  <Text style={styles.notesText}>{review.evidence_notes}</Text>
                </View>
              )}
            </>
          )}

          {review.admin_validation && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('common.admin_validation', 'Admin Validation')}</Text>
              <Text style={[styles.infoValue, { color: review.admin_validation === 'valid' ? '#4CAF50' : '#F44336' }]}>
                {t(`common.${review.admin_validation}`, review.admin_validation)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Actions for pending */}
      {review.status === 'pending' && (
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={handleApprove}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionButtonText}>{t('quality.approve', 'Approve')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => setRejectModalVisible(true)}
          >
            <Text style={styles.actionButtonText}>{t('quality.reject', 'Reject')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reject Modal */}
      <Modal visible={rejectModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{t('quality.reject', 'Reject Review')}</Text>

            <Text style={styles.inputLabel}>{t('quality.rejection_category', 'Rejection Category')}</Text>
            <View style={styles.categoryGrid}>
              {REJECTION_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, rejectionCategory === cat && styles.categoryChipActive]}
                  onPress={() => setRejectionCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, rejectionCategory === cat && styles.categoryChipTextActive]}>
                    {getCategoryLabel(cat)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>{t('quality.rejection_reason', 'Rejection Reason')}</Text>
            <VoiceTextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder={t('common.enter_reason', 'Enter rejection reason...')}
              placeholderTextColor="#9E9E9E"
            />

            <Text style={styles.inputLabel}>{t('quality.evidence', 'Evidence Notes')} ({t('common.optional', 'optional')})</Text>
            <VoiceTextInput
              style={styles.textArea}
              multiline
              numberOfLines={3}
              value={evidenceNotes}
              onChangeText={setEvidenceNotes}
              placeholder={t('common.enter_evidence', 'Enter evidence notes...')}
              placeholderTextColor="#9E9E9E"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setRejectModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalRejectButton]}
                onPress={handleRejectSubmit}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalRejectText}>{t('quality.reject', 'Reject')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  headerRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  typeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  statusBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  jobIdTitle: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#212121', marginBottom: 16 },
  infoRow: { marginBottom: 14 },
  infoLabel: { fontSize: 13, color: '#757575', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#212121' },
  overdueText: { color: '#F44336', fontWeight: '700' },
  notesBox: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  notesLabel: { fontSize: 13, color: '#757575', marginBottom: 4 },
  notesText: { fontSize: 14, color: '#424242', lineHeight: 20 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  categoryBadgeText: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  actionsSection: {
    padding: 20,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveButton: { backgroundColor: '#4CAF50' },
  rejectButton: { backgroundColor: '#F44336' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalContent: {
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#212121', marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#424242', marginBottom: 8, marginTop: 4 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
  },
  categoryChipActive: { borderColor: '#F44336', backgroundColor: '#FFEBEE' },
  categoryChipText: { fontSize: 13, color: '#616161', textTransform: 'capitalize' },
  categoryChipTextActive: { color: '#F44336', fontWeight: '600' },
  textArea: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    minHeight: 80,
    marginBottom: 16,
    color: '#212121',
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalCancelButton: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#BDBDBD' },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: '#616161' },
  modalRejectButton: { backgroundColor: '#F44336' },
  modalRejectText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
