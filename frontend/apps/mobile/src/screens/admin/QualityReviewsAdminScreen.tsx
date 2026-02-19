import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi, type QualityReview, type ReviewStatus, type ValidatePayload } from '@inspection/shared';

const STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#E53935',
};

interface FilterOption {
  label: string;
  value: string | null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.toUpperCase()}</Text>
    </View>
  );
}

function ReviewCard({
  review,
  onValidate,
}: {
  review: QualityReview;
  onValidate: (r: QualityReview) => void;
}) {
  const statusColor = STATUS_COLORS[review.status] ?? '#757575';
  const needsValidation =
    !review.admin_validation && (review.status === 'approved' || review.status === 'rejected');

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardId}>Review #{review.id}</Text>
        <Badge label={review.status} color={statusColor} />
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Job Type: </Text>
        <Badge label={review.job_type} color="#1976D2" />
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Job ID: </Text>
        <Text style={styles.cardValue}>#{review.job_id}</Text>
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>QE: </Text>
        <Text style={styles.cardValue}>
          {review.quality_engineer?.full_name || `#${review.qe_id}`}
        </Text>
      </View>

      {review.rejection_category && (
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardLabel}>Rejection: </Text>
          <Badge
            label={review.rejection_category.replace(/_/g, ' ')}
            color="#FF9800"
          />
        </View>
      )}

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>SLA Met: </Text>
        <Text style={[styles.cardValue, { color: review.sla_met ? '#4CAF50' : '#E53935' }]}>
          {review.sla_met === null ? '-' : review.sla_met ? 'Yes' : 'No'}
        </Text>
      </View>

      {review.admin_validation && (
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardLabel}>Admin Validation: </Text>
          <Badge
            label={review.admin_validation}
            color={review.admin_validation === 'valid' ? '#4CAF50' : '#E53935'}
          />
        </View>
      )}

      {review.reviewed_at && (
        <Text style={styles.dateText}>
          Reviewed: {new Date(review.reviewed_at).toLocaleString()}
        </Text>
      )}

      {needsValidation && (
        <TouchableOpacity
          style={styles.validateButton}
          onPress={() => onValidate(review)}
        >
          <Text style={styles.validateButtonText}>Validate Review</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function QualityReviewsAdminScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState<QualityReview | null>(null);
  const [validationResult, setValidationResult] = useState<'valid' | 'wrong' | null>(null);
  const [validationNotes, setValidationNotes] = useState('');

  const filters: FilterOption[] = [
    { label: t('common.all', 'All'), value: null },
    { label: t('qualityReviews.pending', 'Pending'), value: 'pending' },
    { label: t('qualityReviews.approved', 'Approved'), value: 'approved' },
    { label: t('qualityReviews.rejected', 'Rejected'), value: 'rejected' },
  ];

  const reviewsQuery = useQuery({
    queryKey: ['quality-reviews-admin', activeFilter, page],
    queryFn: () =>
      qualityReviewsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter as ReviewStatus } : {}),
      }),
  });

  const validateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ValidatePayload }) =>
      qualityReviewsApi.validate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality-reviews-admin'] });
      setValidateModalVisible(false);
      setSelectedReview(null);
      setValidationResult(null);
      setValidationNotes('');
      Alert.alert(
        t('common.success', 'Success'),
        t('qualityReviews.validateSuccess', 'Review validated')
      );
    },
    onError: () => {
      Alert.alert(
        t('common.error', 'Error'),
        t('qualityReviews.validateError', 'Failed to validate review')
      );
    },
  });

  const responseData = reviewsQuery.data?.data as any;
  const reviews: QualityReview[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleFilterChange = useCallback((value: string | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    reviewsQuery.refetch();
  }, [reviewsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !reviewsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, reviewsQuery.isFetching]);

  const handleValidatePress = (review: QualityReview) => {
    setSelectedReview(review);
    setValidationResult(null);
    setValidationNotes('');
    setValidateModalVisible(true);
  };

  const handleSubmitValidation = () => {
    if (!selectedReview || !validationResult) return;
    validateMutation.mutate({
      id: selectedReview.id,
      payload: {
        admin_validation: validationResult,
        admin_validation_notes: validationNotes || undefined,
      },
    });
  };

  if (reviewsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.qualityReviews', 'Quality Reviews')}</Text>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : styles.filterChipInactive,
              ]}
              onPress={() => handleFilterChange(filter.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Reviews List */}
      <FlatList
        data={reviews}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ReviewCard review={item} onValidate={handleValidatePress} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={reviewsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          reviewsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('qualityReviews.empty', 'No quality reviews found.')}
            </Text>
          </View>
        }
      />

      {/* Validate Modal */}
      <Modal visible={validateModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setValidateModalVisible(false);
                setSelectedReview(null);
              }}
            >
              <Text style={styles.modalCancel}>{t('common.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {t('qualityReviews.validateReview', 'Validate Review')}
            </Text>
            <TouchableOpacity
              onPress={handleSubmitValidation}
              disabled={!validationResult || validateMutation.isPending}
            >
              <Text
                style={[
                  styles.modalSave,
                  (!validationResult || validateMutation.isPending) && styles.modalSaveDisabled,
                ]}
              >
                {t('common.submit', 'Submit')}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedReview && (
              <Text style={styles.descriptionText}>
                Validating review #{selectedReview.id} for {selectedReview.job_type} job #
                {selectedReview.job_id}
              </Text>
            )}

            <Text style={styles.fieldLabel}>{t('qualityReviews.validation', 'Validation')}</Text>
            <View style={styles.validationRow}>
              <TouchableOpacity
                style={[
                  styles.validationButton,
                  validationResult === 'valid' && styles.validationButtonActiveValid,
                ]}
                onPress={() => setValidationResult('valid')}
              >
                <Text
                  style={[
                    styles.validationButtonText,
                    validationResult === 'valid' && styles.validationButtonTextActive,
                  ]}
                >
                  {t('qualityReviews.valid', 'Valid')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.validationButton,
                  validationResult === 'wrong' && styles.validationButtonActiveWrong,
                ]}
                onPress={() => setValidationResult('wrong')}
              >
                <Text
                  style={[
                    styles.validationButtonText,
                    validationResult === 'wrong' && styles.validationButtonTextActive,
                  ]}
                >
                  {t('qualityReviews.wrong', 'Wrong')}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>
              {t('qualityReviews.validationNotes', 'Notes')}
            </Text>
            <TextInput
              style={styles.textInput}
              value={validationNotes}
              onChangeText={setValidationNotes}
              placeholder={t('qualityReviews.notesPlaceholder', 'Add notes (optional)')}
              multiline
              numberOfLines={4}
            />

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  filterScroll: { maxHeight: 48, paddingBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  filterChipInactive: { backgroundColor: '#fff', borderColor: '#BDBDBD' },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  filterChipTextInactive: { color: '#616161' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardId: { fontSize: 14, fontWeight: '600', color: '#757575' },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  dateText: { fontSize: 12, color: '#757575', marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  validateButton: {
    marginTop: 12,
    backgroundColor: '#1976D2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  validateButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCancel: { fontSize: 16, color: '#757575' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalSave: { fontSize: 16, color: '#1976D2', fontWeight: '600' },
  modalSaveDisabled: { color: '#BDBDBD' },
  modalContent: { padding: 16 },
  descriptionText: { fontSize: 14, color: '#616161', marginBottom: 16, lineHeight: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 12 },
  validationRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  validationButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  validationButtonActiveValid: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  validationButtonActiveWrong: { backgroundColor: '#E53935', borderColor: '#E53935' },
  validationButtonText: { fontSize: 14, fontWeight: '600', color: '#616161' },
  validationButtonTextActive: { color: '#fff' },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#212121',
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
