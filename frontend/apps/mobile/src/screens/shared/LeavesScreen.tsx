import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { leavesApi } from '@inspection/shared';
import type { Leave, LeaveStatus } from '@inspection/shared';

// Leave type codes as strings
type LeaveTypeCode = 'sick' | 'annual' | 'emergency' | 'training' | 'other';

const LEAVE_STATUS_FILTERS: Array<LeaveStatus | 'all'> = ['all', 'pending', 'approved', 'rejected'];

const LEAVE_TYPES: LeaveTypeCode[] = ['sick', 'annual', 'emergency', 'training', 'other'];

const LEAVE_TYPE_COLORS: Record<LeaveTypeCode, string> = {
  sick: '#E53935',
  annual: '#1976D2',
  emergency: '#FF9800',
  training: '#7B1FA2',
  other: '#757575',
};

const STATUS_COLORS: Record<LeaveStatus, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#E53935',
};

const SCOPE_OPTIONS: Array<'major_only' | 'full'> = ['major_only', 'full'];

export default function LeavesScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState<LeaveStatus | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [formLeaveType, setFormLeaveType] = useState<LeaveTypeCode>('annual');
  const [formDateFrom, setFormDateFrom] = useState('');
  const [formDateTo, setFormDateTo] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formScope, setFormScope] = useState<'major_only' | 'full'>('full');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['leaves', activeFilter],
    queryFn: () =>
      leavesApi.list(activeFilter === 'all' ? undefined : { status: activeFilter }),
  });

  const leaves: Leave[] = (data?.data as any)?.items ?? (data?.data as any)?.data ?? (data?.data as any) ?? [];

  const requestMutation = useMutation({
    mutationFn: (payload: { leave_type: LeaveTypeCode; date_from: string; date_to: string; reason: string; scope?: 'major_only' | 'full'; coverage_user_id?: number }) =>
      leavesApi.request(payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setModalVisible(false);
      resetForm();
      Alert.alert(t('common.success', 'Success'), t('leaves.request_submitted', 'Leave request submitted successfully.'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('leaves.request_failed', 'Failed to submit leave request.'));
    },
  });

  const resetForm = () => {
    setFormLeaveType('annual');
    setFormDateFrom('');
    setFormDateTo('');
    setFormReason('');
    setFormScope('full');
  };

  const handleSubmit = () => {
    if (!formDateFrom || !formDateTo || !formReason.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.fill_all_fields', 'Please fill in all required fields.'));
      return;
    }
    requestMutation.mutate({
      leave_type: formLeaveType,
      date_from: formDateFrom,
      date_to: formDateTo,
      reason: formReason.trim(),
      scope: formScope,
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const renderFilterChips = () => (
    <View style={styles.filterRow}>
      {LEAVE_STATUS_FILTERS.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[styles.filterChip, activeFilter === filter && styles.filterChipActive]}
          onPress={() => setActiveFilter(filter)}
        >
          <Text style={[styles.filterChipText, activeFilter === filter && styles.filterChipTextActive]}>
            {filter === 'all' ? t('common.all', 'All') : t(`status.${filter}`, filter)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderLeaveCard = useCallback(({ item }: { item: Leave }) => {
    const typeColor = LEAVE_TYPE_COLORS[item.leave_type as LeaveTypeCode] ?? '#757575';
    const statusColor = STATUS_COLORS[item.status] ?? '#757575';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>
              {t(`leaves.type_${item.leave_type}`, item.leave_type)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>
              {t(`status.${item.status}`, item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.dateRange}>
            {formatDate(item.date_from)} {' \u2192 '} {formatDate(item.date_to)}
          </Text>
          <Text style={styles.totalDays}>
            {item.total_days} {t('leaves.days', 'days')}
          </Text>
          {item.reason ? (
            <Text style={styles.reasonText} numberOfLines={2}>
              {item.reason}
            </Text>
          ) : null}
          {item.scope ? (
            <Text style={styles.scopeText}>
              {t('leaves.scope', 'Scope')}: {t(`leaves.scope_${item.scope}`, item.scope)}
            </Text>
          ) : null}
        </View>

        {item.coverage_user ? (
          <View style={styles.coverageRow}>
            <Text style={styles.coverageLabel}>{t('leaves.coverage', 'Coverage')}:</Text>
            <Text style={styles.coverageName}>{item.coverage_user.full_name}</Text>
          </View>
        ) : null}

        {item.rejection_reason ? (
          <Text style={styles.rejectionText}>
            {t('leaves.rejection_reason', 'Rejection')}: {item.rejection_reason}
          </Text>
        ) : null}
      </View>
    );
  }, [t]);

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('leaves.no_leaves', 'No Leaves')}</Text>
        <Text style={styles.emptySubtitle}>
          {t('leaves.no_leaves_message', 'You have no leave records.')}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error', 'Error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.leaves', 'My Leaves')}</Text>

      {renderFilterChips()}

      <FlatList
        data={leaves}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderLeaveCard}
        contentContainerStyle={leaves.length === 0 ? styles.emptyListContainer : styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Request Leave Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {t('leaves.request_leave', 'Request Leave')}
              </Text>

              {/* Leave Type */}
              <Text style={styles.fieldLabel}>
                {t('leaves.leave_type', 'Leave Type')}
              </Text>
              <View style={styles.chipRow}>
                {LEAVE_TYPES.map((lt) => (
                  <TouchableOpacity
                    key={lt}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor:
                          formLeaveType === lt
                            ? LEAVE_TYPE_COLORS[lt]
                            : '#E0E0E0',
                      },
                    ]}
                    onPress={() => setFormLeaveType(lt)}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        formLeaveType === lt && styles.typeChipTextActive,
                      ]}
                    >
                      {t(`leaves.type_${lt}`, lt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date From */}
              <Text style={styles.fieldLabel}>
                {t('leaves.date_from', 'Date From')}
              </Text>
              <TextInput
                style={styles.input}
                value={formDateFrom}
                onChangeText={setFormDateFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
              />

              {/* Date To */}
              <Text style={styles.fieldLabel}>
                {t('leaves.date_to', 'Date To')}
              </Text>
              <TextInput
                style={styles.input}
                value={formDateTo}
                onChangeText={setFormDateTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
              />

              {/* Reason */}
              <Text style={styles.fieldLabel}>
                {t('leaves.reason', 'Reason')}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formReason}
                onChangeText={setFormReason}
                placeholder={t('leaves.reason_placeholder', 'Enter reason for leave...')}
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Scope */}
              <Text style={styles.fieldLabel}>
                {t('leaves.scope', 'Scope')}
              </Text>
              <View style={styles.chipRow}>
                {SCOPE_OPTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.scopeChip,
                      formScope === s && styles.scopeChipActive,
                    ]}
                    onPress={() => setFormScope(s)}
                  >
                    <Text
                      style={[
                        styles.scopeChipText,
                        formScope === s && styles.scopeChipTextActive,
                      ]}
                    >
                      {t(`leaves.scope_${s}`, s === 'major_only' ? 'Major Only' : 'Full')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Buttons */}
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>
                    {t('common.cancel', 'Cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, requestMutation.isPending && styles.disabledButton]}
                  onPress={handleSubmit}
                  disabled={requestMutation.isPending}
                >
                  {requestMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {t('common.submit', 'Submit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#1976D2' },
  filterChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardBody: { marginBottom: 6 },
  dateRange: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4 },
  totalDays: { fontSize: 13, color: '#1976D2', fontWeight: '500', marginBottom: 4 },
  reasonText: { fontSize: 13, color: '#616161', marginBottom: 4 },
  scopeText: { fontSize: 12, color: '#757575' },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
    marginTop: 4,
  },
  coverageLabel: { fontSize: 12, color: '#757575', marginRight: 6 },
  coverageName: { fontSize: 13, color: '#1976D2', fontWeight: '500' },
  rejectionText: { fontSize: 12, color: '#E53935', marginTop: 6 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', marginTop: -2 },
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
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#212121', marginBottom: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  typeChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  typeChipTextActive: { color: '#fff' },
  scopeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
  },
  scopeChipActive: { backgroundColor: '#1976D2' },
  scopeChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  scopeChipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#fafafa',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
  },
  cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#424242' },
  submitButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    minWidth: 80,
    alignItems: 'center',
  },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  disabledButton: { opacity: 0.6 },
});
