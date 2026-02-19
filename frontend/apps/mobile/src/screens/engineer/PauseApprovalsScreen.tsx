import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { specialistJobsApi } from '@inspection/shared';
import type { PauseLog } from '@inspection/shared';

const REASON_COLORS: Record<string, string> = {
  parts: '#2196F3',
  duty_finish: '#9C27B0',
  tools: '#FF9800',
  manpower: '#00BCD4',
  oem: '#795548',
  other: '#607D8B',
};

export default function PauseApprovalsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pendingPauses'],
    queryFn: () => specialistJobsApi.getPendingPauses(),
  });

  const pauses: PauseLog[] = (data?.data as any)?.data ?? (data?.data as any) ?? [];

  const approveMutation = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.approvePause(pauseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPauses'] });
    },
  });

  const denyMutation = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.denyPause(pauseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingPauses'] });
    },
  });

  const handleApprove = (pauseId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('common.confirm_approve_pause', 'Are you sure you want to approve this pause request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.approve', 'Approve'), onPress: () => approveMutation.mutate(pauseId) },
      ]
    );
  };

  const handleDeny = (pauseId: number) => {
    Alert.alert(
      t('common.confirm', 'Confirm'),
      t('common.confirm_deny_pause', 'Are you sure you want to deny this pause request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.deny', 'Deny'),
          style: 'destructive',
          onPress: () => denyMutation.mutate(pauseId),
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getReasonLabel = (category: string) => {
    return t(`common.pause_${category}`, category.replace('_', ' '));
  };

  const renderPause = useCallback(({ item }: { item: PauseLog }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.jobLabel}>
          {t('common.job', 'Job')} #{item.job_id}
        </Text>
        <View style={[styles.reasonBadge, { backgroundColor: REASON_COLORS[item.reason_category] || '#607D8B' }]}>
          <Text style={styles.reasonBadgeText}>{getReasonLabel(item.reason_category)}</Text>
        </View>
      </View>

      {item.reason_details && (
        <Text style={styles.details} numberOfLines={3}>{item.reason_details}</Text>
      )}

      <Text style={styles.requestedAt}>
        {t('common.requested', 'Requested')}: {formatDate(item.requested_at)}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          onPress={() => handleApprove(item.id)}
          disabled={approveMutation.isPending || denyMutation.isPending}
        >
          {approveMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.approveText}>{t('common.approve', 'Approve')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.denyButton]}
          onPress={() => handleDeny(item.id)}
          disabled={approveMutation.isPending || denyMutation.isPending}
        >
          {denyMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.denyText}>{t('common.deny', 'Deny')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  ), [t, approveMutation.isPending, denyMutation.isPending]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.pause_approvals', 'Pause Approvals')}</Text>
      <FlatList
        data={pauses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPause}
        contentContainerStyle={pauses.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('common.no_pending_pauses', 'No Pending Pauses')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('common.no_pending_pauses_message', 'There are no pause requests waiting for approval.')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  jobLabel: { fontSize: 16, fontWeight: '600', color: '#212121' },
  reasonBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  reasonBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  details: { fontSize: 14, color: '#424242', lineHeight: 20, marginBottom: 10 },
  requestedAt: { fontSize: 13, color: '#757575', marginBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  approveButton: { backgroundColor: '#4CAF50' },
  approveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  denyButton: { backgroundColor: '#F44336' },
  denyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
});
