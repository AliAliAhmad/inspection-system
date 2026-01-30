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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { bonusStarsApi } from '@inspection/shared';
import type { BonusStar } from '@inspection/shared';

export default function BonusRequestsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['bonusStars'],
    queryFn: () => bonusStarsApi.list(),
  });

  const bonuses: BonusStar[] = (data?.data as any)?.data ?? (data?.data as any) ?? [];

  const requestMutation = useMutation({
    mutationFn: () =>
      bonusStarsApi.requestBonus({
        user_id: user!.id,
        amount,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setAmount(1);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['bonusStars'] });
      Alert.alert(
        t('common.success', 'Success'),
        t('common.bonus_requested', 'Bonus request submitted successfully.')
      );
    },
    onError: () => {
      Alert.alert(
        t('common.error', 'Error'),
        t('common.bonus_request_error', 'Failed to submit bonus request.')
      );
    },
  });

  const handleSubmit = () => {
    if (!reason.trim()) {
      Alert.alert(t('common.error', 'Error'), t('common.enter_reason', 'Please enter a reason.'));
      return;
    }
    if (amount < 1 || amount > 5) {
      Alert.alert(t('common.error', 'Error'), t('common.invalid_amount', 'Amount must be between 1 and 5.'));
      return;
    }
    requestMutation.mutate();
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'approved': return '#4CAF50';
      case 'denied': return '#F44336';
      default: return '#757575';
    }
  };

  const renderStars = (count: number) => {
    return Array.from({ length: 5 }, (_, i) => (i < count ? '\u2605' : '\u2606')).join('');
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const renderBonus = useCallback(({ item }: { item: BonusStar }) => (
    <View style={styles.bonusCard}>
      <View style={styles.bonusHeader}>
        <Text style={styles.bonusStars}>{renderStars(item.amount)}</Text>
        {item.request_status && (
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.request_status) }]}>
            <Text style={styles.statusBadgeText}>
              {t(`status.${item.request_status}`, item.request_status)}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.bonusReason} numberOfLines={2}>{item.reason}</Text>
      <View style={styles.bonusFooter}>
        <Text style={styles.bonusDate}>{formatDate(item.awarded_at)}</Text>
        {item.related_job_type && (
          <Text style={styles.bonusJobRef}>
            {item.related_job_type} #{item.related_job_id}
          </Text>
        )}
      </View>
    </View>
  ), [t]);

  const ListHeader = () => (
    <View style={styles.formSection}>
      <Text style={styles.formTitle}>{t('common.request_bonus', 'Request Bonus')}</Text>

      {/* Amount Selector */}
      <Text style={styles.inputLabel}>{t('common.amount', 'Amount')}</Text>
      <View style={styles.starSelector}>
        {[1, 2, 3, 4, 5].map((val) => (
          <TouchableOpacity
            key={val}
            style={[styles.starButton, amount >= val && styles.starButtonActive]}
            onPress={() => setAmount(val)}
          >
            <Text style={[styles.starButtonText, amount >= val && styles.starButtonTextActive]}>
              {'\u2605'}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.amountLabel}>{amount}/5</Text>
      </View>

      {/* Reason */}
      <Text style={styles.inputLabel}>{t('common.reason', 'Reason')}</Text>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={3}
        value={reason}
        onChangeText={setReason}
        placeholder={t('common.enter_reason', 'Enter reason for bonus request...')}
        placeholderTextColor="#9E9E9E"
      />

      {/* Submit */}
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={requestMutation.isPending}
      >
        {requestMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>{t('common.submit', 'Submit Request')}</Text>
        )}
      </TouchableOpacity>

      {/* List Header */}
      <Text style={styles.listTitle}>{t('common.past_requests', 'Past Requests')}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={bonuses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderBonus}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('common.no_bonus_requests', 'No Bonus Requests')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('common.no_bonus_requests_message', 'Submit your first bonus request above.')}
            </Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  listContent: { paddingBottom: 32 },
  formSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 8,
  },
  formTitle: { fontSize: 22, fontWeight: 'bold', color: '#212121', marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 8, marginTop: 8 },
  starSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  starButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starButtonActive: { borderColor: '#FFC107', backgroundColor: '#FFF8E1' },
  starButtonText: { fontSize: 22, color: '#E0E0E0' },
  starButtonTextActive: { color: '#FFC107' },
  amountLabel: { fontSize: 16, fontWeight: '600', color: '#424242', marginLeft: 8 },
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
  submitButton: {
    backgroundColor: '#1976D2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  listTitle: { fontSize: 18, fontWeight: '600', color: '#212121', marginBottom: 4 },
  bonusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bonusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bonusStars: { fontSize: 20, color: '#FFC107' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  bonusReason: { fontSize: 14, color: '#424242', lineHeight: 20, marginBottom: 8 },
  bonusFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bonusDate: { fontSize: 13, color: '#757575' },
  bonusJobRef: { fontSize: 13, color: '#1976D2' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
});
