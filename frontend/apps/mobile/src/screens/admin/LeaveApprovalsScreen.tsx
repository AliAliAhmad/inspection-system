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
import { leavesApi } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#E53935',
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick: '#E53935',
  annual: '#1976D2',
  emergency: '#FF9800',
  training: '#7B1FA2',
  other: '#757575',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

interface LeaveRequest {
  id: number;
  user_id: number;
  user?: { full_name: string; role: string };
  leave_type: string;
  date_from: string;
  date_to: string;
  total_days: number;
  reason?: string;
  status: string;
  coverage_user_id?: number;
  coverage_user?: { full_name: string };
  scope?: string;
  created_at?: string;
}

function LeaveCard({
  request,
  onApprove,
  onReject,
  isActioning,
}: {
  request: LeaveRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isActioning: boolean;
}) {
  const statusColor = STATUS_COLORS[request.status] ?? '#757575';
  const typeColor = LEAVE_TYPE_COLORS[request.leave_type] ?? '#757575';
  const isPending = request.status === 'pending';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{request.user?.full_name || `User #${request.user_id}`}</Text>
          <Text style={styles.userRole}>{request.user?.role || ''}</Text>
        </View>
        <View style={styles.badgeRow}>
          <Badge label={request.leave_type} color={typeColor} />
          <Badge label={request.status} color={statusColor} />
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateLabel}>Period: </Text>
        <Text style={styles.dateValue}>
          {new Date(request.date_from).toLocaleDateString()} - {new Date(request.date_to).toLocaleDateString()}
        </Text>
        <Text style={styles.daysText}>({request.total_days} days)</Text>
      </View>

      {request.reason && (
        <Text style={styles.reasonText} numberOfLines={2}>
          Reason: {request.reason}
        </Text>
      )}

      {request.coverage_user && (
        <Text style={styles.coverageText}>
          Coverage: {request.coverage_user.full_name}
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

export default function LeaveApprovalsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const leavesQuery = useQuery({
    queryKey: ['leave-approvals', page],
    queryFn: () =>
      leavesApi.list({ page, per_page: 20, status: 'pending' }).then((r) => {
        const data = (r.data as any).data ?? r.data;
        return data;
      }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => leavesApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-approvals'] });
      Alert.alert(t('common.success', 'Success'), t('leaves.approveSuccess', 'Leave approved'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('leaves.approveError', 'Failed to approve leave'));
    },
    onSettled: () => setActioningId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => leavesApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-approvals'] });
      Alert.alert(t('common.success', 'Success'), t('leaves.rejectSuccess', 'Leave rejected'));
    },
    onError: () => {
      Alert.alert(t('common.error', 'Error'), t('leaves.rejectError', 'Failed to reject leave'));
    },
    onSettled: () => setActioningId(null),
  });

  const responseData = leavesQuery.data;
  const requests: LeaveRequest[] = responseData?.data ?? responseData ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleRefresh = useCallback(() => {
    setPage(1);
    leavesQuery.refetch();
  }, [leavesQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !leavesQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, leavesQuery.isFetching]);

  const handleApprove = (id: number) => {
    Alert.alert(
      t('leaves.confirmApprove', 'Approve Leave'),
      t('leaves.confirmApproveMessage', 'Are you sure you want to approve this leave request?'),
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
      t('leaves.confirmReject', 'Reject Leave'),
      t('leaves.confirmRejectMessage', 'Are you sure you want to reject this leave request?'),
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

  if (leavesQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.leaveApprovals', 'Leave Approvals')}</Text>

      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <LeaveCard
            request={item}
            onApprove={handleApprove}
            onReject={handleReject}
            isActioning={actioningId === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={leavesQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          leavesQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('leaves.noPending', 'No pending leave requests.')}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  userName: { fontSize: 16, fontWeight: 'bold', color: '#212121' },
  userRole: { fontSize: 12, color: '#757575', textTransform: 'capitalize' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dateLabel: { fontSize: 13, color: '#757575' },
  dateValue: { fontSize: 13, color: '#424242', fontWeight: '500' },
  daysText: { fontSize: 12, color: '#757575', marginLeft: 6 },
  reasonText: { fontSize: 13, color: '#616161', marginBottom: 6 },
  coverageText: { fontSize: 12, color: '#1976D2', marginBottom: 8 },
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
