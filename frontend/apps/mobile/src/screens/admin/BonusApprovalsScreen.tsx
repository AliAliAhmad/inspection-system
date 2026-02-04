import React, { useState, useCallback } from 'react';
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
import { bonusStarsApi } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#E53935',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

interface BonusRequest {
  id: number;
  user_id: number;
  user?: { full_name: string; role: string };
  amount?: number;
  reason?: string;
  status: string;
  month?: string;
  year?: number;
  created_at?: string;
  approved_by_id?: number;
  approved_by?: { full_name: string };
}

function BonusCard({
  request,
  onApprove,
  onReject,
  isActioning,
}: {
  request: BonusRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isActioning: boolean;
}) {
  const statusColor = STATUS_COLORS[request.status] ?? '#757575';
  const isPending = request.status === 'pending';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{request.user?.full_name || `User #${request.user_id}`}</Text>
          <Text style={styles.userRole}>{request.user?.role || ''}</Text>
        </View>
        <Badge label={request.status} color={statusColor} />
      </View>

      {request.amount !== undefined && (
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Amount: </Text>
          <Text style={styles.amountValue}>${request.amount.toFixed(2)}</Text>
        </View>
      )}

      {request.month && request.year && (
        <Text style={styles.periodText}>Period: {request.month} {request.year}</Text>
      )}

      {request.reason && (
        <Text style={styles.reasonText} numberOfLines={3}>
          Reason: {request.reason}
        </Text>
      )}

      {request.created_at && (
        <Text style={styles.dateText}>
          Requested: {new Date(request.created_at).toLocaleDateString()}
        </Text>
      )}

      {isPending && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => onReject(request.id)}
            disabled={isActioning}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => onApprove(request.id)}
            disabled={isActioning}
          >
            <Text style={styles.approveButtonText}>Approve</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function BonusApprovalsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const bonusQuery = useQuery({
    queryKey: ['bonus-approvals', page],
    queryFn: () =>
      bonusStarsApi.list().then((r) => {
        const data = (r.data as any).data ?? r.data;
        // Filter pending requests
        const items = Array.isArray(data) ? data : data?.data ?? [];
        const pending = items.filter((item: any) => item.status === 'pending' || !item.approved_at);
        return { data: pending };
      }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => bonusStarsApi.approveRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonus-approvals'] });
      Alert.alert(t('common.success', 'Success'), t('bonus.approveSuccess', 'Bonus approved'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('bonus.approveError', 'Failed to approve bonus'));
    },
    onSettled: () => setActioningId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => bonusStarsApi.denyRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonus-approvals'] });
      Alert.alert(t('common.success', 'Success'), t('bonus.rejectSuccess', 'Bonus rejected'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('bonus.rejectError', 'Failed to reject bonus'));
    },
    onSettled: () => setActioningId(null),
  });

  const responseData = bonusQuery.data;
  const requests: BonusRequest[] = responseData?.data ?? [];
  // Bonus stars API doesn't have pagination, using infinite scroll is not needed
  const hasNextPage = false;

  const handleRefresh = useCallback(() => {
    setPage(1);
    bonusQuery.refetch();
  }, [bonusQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !bonusQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, bonusQuery.isFetching]);

  const handleApprove = (id: number) => {
    Alert.alert(
      t('bonus.confirmApprove', 'Approve Bonus'),
      t('bonus.confirmApproveMessage', 'Are you sure you want to approve this bonus request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.approve', 'Approve'),
          onPress: () => {
            setActioningId(id);
            approveMutation.mutate(id);
          },
        },
      ]
    );
  };

  const handleReject = (id: number) => {
    Alert.alert(
      t('bonus.confirmReject', 'Reject Bonus'),
      t('bonus.confirmRejectMessage', 'Are you sure you want to reject this bonus request?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.reject', 'Reject'),
          style: 'destructive',
          onPress: () => {
            setActioningId(id);
            rejectMutation.mutate(id);
          },
        },
      ]
    );
  };

  if (bonusQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.bonusApprovals', 'Bonus Approvals')}</Text>

      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <BonusCard
            request={item}
            onApprove={handleApprove}
            onReject={handleReject}
            isActioning={actioningId === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={bonusQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          bonusQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('bonus.noPending', 'No pending bonus requests.')}</Text>
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
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#212121' },
  userRole: { fontSize: 12, color: '#757575', textTransform: 'capitalize' },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  amountLabel: { fontSize: 13, color: '#757575' },
  amountValue: { fontSize: 18, fontWeight: 'bold', color: '#4CAF50' },
  periodText: { fontSize: 13, color: '#424242', marginBottom: 6 },
  reasonText: { fontSize: 13, color: '#616161', marginBottom: 6 },
  dateText: { fontSize: 12, color: '#9e9e9e' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  actionButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  approveButton: { backgroundColor: '#4CAF50' },
  approveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  rejectButton: { backgroundColor: '#ffebee' },
  rejectButtonText: { color: '#E53935', fontWeight: '600', fontSize: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
});
