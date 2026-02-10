import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  Tabs,
  Empty,
  Spin,
  Alert,
  message,
  Typography,
  Modal,
  Form,
  Input,
} from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  leavesApi,
  specialistJobsApi,
  bonusStarsApi,
  approvalsApi,
  type Leave,
  type PauseLog,
  type BonusStar,
  type UnifiedApproval,
} from '@inspection/shared';
import {
  ApprovalCard,
  ApprovalFilters,
  ApprovalStats,
  BulkApprovalBar,
  type ApprovalItem,
  type ApprovalType,
  type ApprovalFilter,
  type ApprovalCounts,
} from '../../components/approvals';
import VoiceTextArea from '../../components/VoiceTextArea';

const { Title } = Typography;

// Transform API data to unified ApprovalItem format
function transformLeaveToApproval(leave: Leave): ApprovalItem {
  return {
    id: leave.id,
    type: 'leave',
    status: leave.status,
    requestedAt: leave.created_at,
    requestedBy: {
      id: leave.user_id,
      name: leave.user?.full_name || `User #${leave.user_id}`,
      role: leave.user?.role,
    },
    details: {
      leaveType: leave.leave_type,
      dateFrom: leave.date_from,
      dateTo: leave.date_to,
      totalDays: leave.total_days,
      reason: leave.reason || undefined,
    },
  };
}

function transformPauseToApproval(pause: PauseLog): ApprovalItem {
  return {
    id: pause.id,
    type: 'pause',
    status: pause.status,
    requestedAt: pause.requested_at,
    requestedBy: {
      id: pause.requested_by,
      name: `User #${pause.requested_by}`,
    },
    details: {
      pauseCategory: pause.reason_category,
      pauseDetails: pause.reason_details || undefined,
      jobType: pause.job_type,
      jobId: pause.job_id,
    },
  };
}

function transformBonusToApproval(bonus: BonusStar): ApprovalItem {
  return {
    id: bonus.id,
    type: 'bonus',
    status: bonus.request_status || 'pending',
    requestedAt: bonus.awarded_at,
    requestedBy: {
      id: bonus.awarded_by || 0,
      name: `User #${bonus.awarded_by || 'Unknown'}`,
    },
    details: {
      amount: bonus.amount,
      targetUser: { id: bonus.user_id, name: `User #${bonus.user_id}` },
      reason: bonus.reason,
      jobType: bonus.related_job_type || undefined,
      jobId: bonus.related_job_id || undefined,
    },
  };
}

export default function UnifiedApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [filters, setFilters] = useState<ApprovalFilter>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState<ApprovalItem | null>(null);
  const [rejectForm] = Form.useForm();

  // Get active tab from URL
  const activeTab = (searchParams.get('tab') as ApprovalType | 'all') || 'all';

  // Fetch all approval data
  const {
    data: leavesData,
    isLoading: leavesLoading,
    error: leavesError,
  } = useQuery({
    queryKey: ['leaves', 'pending'],
    queryFn: () => leavesApi.getPending({ per_page: 100 }),
  });

  const {
    data: pausesData,
    isLoading: pausesLoading,
    error: pausesError,
  } = useQuery({
    queryKey: ['pending-pauses'],
    queryFn: () => specialistJobsApi.getPendingPauses(),
  });

  const {
    data: bonusData,
    isLoading: bonusLoading,
    error: bonusError,
  } = useQuery({
    queryKey: ['bonus-stars'],
    queryFn: () => bonusStarsApi.list(),
  });

  // Fetch pending takeovers
  const {
    data: takeoversData,
    isLoading: takeoversLoading,
    error: takeoversError,
  } = useQuery({
    queryKey: ['pending-takeovers'],
    queryFn: () => approvalsApi.listPendingTakeovers(),
  });

  // Transform takeover from API format to ApprovalItem
  const transformUnifiedTakeoverToApproval = (takeover: UnifiedApproval): ApprovalItem => ({
    id: takeover.id,
    type: 'takeover',
    status: takeover.status,
    requestedAt: takeover.requested_at,
    requestedBy: {
      id: takeover.requested_by.id,
      name: takeover.requested_by.name,
      role: takeover.requested_by.role,
    },
    details: {
      jobType: takeover.details.job_type,
      jobId: takeover.details.job_id,
      queuePosition: takeover.details.queue_position,
      takeoverReason: takeover.details.takeover_reason,
    },
  });

  // Transform and combine all data
  const allApprovals = useMemo(() => {
    const leaves = (leavesData?.data?.data || []).map(transformLeaveToApproval);
    const pauses = ((pausesData?.data?.data as PauseLog[] | undefined) || []).map(transformPauseToApproval);
    const bonuses = (bonusData?.data?.data || [])
      .filter((b: BonusStar) => b.is_qe_request && b.request_status === 'pending')
      .map(transformBonusToApproval);
    const takeovers = ((takeoversData?.data?.data as UnifiedApproval[] | undefined) || []).map(transformUnifiedTakeoverToApproval);

    return [...leaves, ...pauses, ...bonuses, ...takeovers].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );
  }, [leavesData, pausesData, bonusData, takeoversData]);

  // Calculate counts
  const counts: ApprovalCounts = useMemo(() => {
    const pending = allApprovals.filter((a) => a.status === 'pending');
    return {
      leave: pending.filter((a) => a.type === 'leave').length,
      pause: pending.filter((a) => a.type === 'pause').length,
      bonus: pending.filter((a) => a.type === 'bonus').length,
      takeover: pending.filter((a) => a.type === 'takeover').length,
      total: pending.length,
    };
  }, [allApprovals]);

  // Filter approvals based on active tab and filters
  const filteredApprovals = useMemo(() => {
    let result = allApprovals;

    // Filter by tab
    if (activeTab !== 'all') {
      result = result.filter((a) => a.type === activeTab);
    }

    // Filter by type
    if (filters.types && filters.types.length > 0) {
      result = result.filter((a) => filters.types!.includes(a.type));
    }

    // Filter by status
    if (filters.status) {
      result = result.filter((a) => a.status === filters.status);
    }

    // Filter by date
    if (filters.dateFrom) {
      result = result.filter((a) => new Date(a.requestedAt) >= new Date(filters.dateFrom!));
    }
    if (filters.dateTo) {
      result = result.filter((a) => new Date(a.requestedAt) <= new Date(filters.dateTo!));
    }

    return result;
  }, [allApprovals, activeTab, filters]);

  // Selected items
  const selectedItems = useMemo(
    () => filteredApprovals.filter((a) => selectedIds.has(a.id)),
    [filteredApprovals, selectedIds]
  );

  // Mutations
  const approveLeave = useMutation({
    mutationFn: (id: number) => leavesApi.approve(id),
    onSuccess: () => {
      message.success(t('approvals.leaveApproved', 'Leave approved'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: () => message.error(t('approvals.approveError', 'Failed to approve')),
  });

  const rejectLeave = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      leavesApi.reject(id, reason ? { rejection_reason: reason } : undefined),
    onSuccess: () => {
      message.success(t('approvals.leaveRejected', 'Leave rejected'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: () => message.error(t('approvals.rejectError', 'Failed to reject')),
  });

  const approvePause = useMutation({
    mutationFn: (id: number) => specialistJobsApi.approvePause(id),
    onSuccess: () => {
      message.success(t('approvals.pauseApproved', 'Pause approved'));
      queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
    },
    onError: () => message.error(t('approvals.approveError', 'Failed to approve')),
  });

  const rejectPause = useMutation({
    mutationFn: (id: number) => specialistJobsApi.denyPause(id),
    onSuccess: () => {
      message.success(t('approvals.pauseRejected', 'Pause rejected'));
      queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
    },
    onError: () => message.error(t('approvals.rejectError', 'Failed to reject')),
  });

  const approveBonus = useMutation({
    mutationFn: (id: number) => bonusStarsApi.approveRequest(id),
    onSuccess: () => {
      message.success(t('approvals.bonusApproved', 'Bonus approved'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
    },
    onError: () => message.error(t('approvals.approveError', 'Failed to approve')),
  });

  const rejectBonus = useMutation({
    mutationFn: (id: number) => bonusStarsApi.denyRequest(id),
    onSuccess: () => {
      message.success(t('approvals.bonusRejected', 'Bonus rejected'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
    },
    onError: () => message.error(t('approvals.rejectError', 'Failed to reject')),
  });

  const approveTakeover = useMutation({
    mutationFn: (id: number) => approvalsApi.approveTakeover(id),
    onSuccess: () => {
      message.success(t('approvals.takeoverApproved', 'Takeover approved'));
      queryClient.invalidateQueries({ queryKey: ['pending-takeovers'] });
    },
    onError: () => message.error(t('approvals.approveError', 'Failed to approve')),
  });

  const rejectTakeover = useMutation({
    mutationFn: (id: number) => approvalsApi.denyTakeover(id),
    onSuccess: () => {
      message.success(t('approvals.takeoverRejected', 'Takeover rejected'));
      queryClient.invalidateQueries({ queryKey: ['pending-takeovers'] });
    },
    onError: () => message.error(t('approvals.rejectError', 'Failed to reject')),
  });

  // Bulk leave action
  const bulkLeaveAction = useMutation({
    mutationFn: async ({ ids, action }: { ids: number[]; action: 'approve' | 'reject' }) => {
      return leavesApi.bulkAction({ leave_ids: ids, action });
    },
    onSuccess: (_, { action }) => {
      message.success(
        action === 'approve'
          ? t('approvals.bulkApproveSuccess', 'Items approved')
          : t('approvals.bulkRejectSuccess', 'Items rejected')
      );
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: () => message.error(t('approvals.bulkActionError', 'Bulk action failed')),
  });

  // Handlers
  const handleApprove = useCallback(
    async (item: ApprovalItem) => {
      switch (item.type) {
        case 'leave':
          await approveLeave.mutateAsync(item.id);
          break;
        case 'pause':
          await approvePause.mutateAsync(item.id);
          break;
        case 'bonus':
          await approveBonus.mutateAsync(item.id);
          break;
        case 'takeover':
          await approveTakeover.mutateAsync(item.id);
          break;
      }
    },
    [approveLeave, approvePause, approveBonus, approveTakeover]
  );

  const handleReject = useCallback((item: ApprovalItem) => {
    if (item.type === 'leave') {
      setItemToReject(item);
      setRejectModalOpen(true);
    } else {
      // Direct reject for other types
      switch (item.type) {
        case 'pause':
          rejectPause.mutate(item.id);
          break;
        case 'bonus':
          rejectBonus.mutate(item.id);
          break;
        case 'takeover':
          rejectTakeover.mutate(item.id);
          break;
      }
    }
  }, [rejectPause, rejectBonus, rejectTakeover]);

  const handleConfirmReject = async (values: { reason?: string }) => {
    if (!itemToReject) return;

    if (itemToReject.type === 'leave') {
      await rejectLeave.mutateAsync({ id: itemToReject.id, reason: values.reason });
    }

    setRejectModalOpen(false);
    setItemToReject(null);
    rejectForm.resetFields();
  };

  const handleBulkApprove = useCallback(
    async (items: ApprovalItem[]) => {
      // Group by type
      const leaveIds = items.filter((i) => i.type === 'leave').map((i) => i.id);
      const pauseIds = items.filter((i) => i.type === 'pause').map((i) => i.id);
      const bonusIds = items.filter((i) => i.type === 'bonus').map((i) => i.id);
      const takeoverIds = items.filter((i) => i.type === 'takeover').map((i) => i.id);

      const promises: Promise<unknown>[] = [];

      if (leaveIds.length > 0) {
        promises.push(bulkLeaveAction.mutateAsync({ ids: leaveIds, action: 'approve' }));
      }

      // For pauses, bonuses, and takeovers, we need to approve one by one
      pauseIds.forEach((id) => promises.push(approvePause.mutateAsync(id)));
      bonusIds.forEach((id) => promises.push(approveBonus.mutateAsync(id)));
      takeoverIds.forEach((id) => promises.push(approveTakeover.mutateAsync(id)));

      await Promise.all(promises);
      setSelectedIds(new Set());
    },
    [bulkLeaveAction, approvePause, approveBonus, approveTakeover]
  );

  const handleBulkReject = useCallback(
    async (items: ApprovalItem[]) => {
      const leaveIds = items.filter((i) => i.type === 'leave').map((i) => i.id);
      const pauseIds = items.filter((i) => i.type === 'pause').map((i) => i.id);
      const bonusIds = items.filter((i) => i.type === 'bonus').map((i) => i.id);
      const takeoverIds = items.filter((i) => i.type === 'takeover').map((i) => i.id);

      const promises: Promise<unknown>[] = [];

      if (leaveIds.length > 0) {
        promises.push(bulkLeaveAction.mutateAsync({ ids: leaveIds, action: 'reject' }));
      }

      pauseIds.forEach((id) => promises.push(rejectPause.mutateAsync(id)));
      bonusIds.forEach((id) => promises.push(rejectBonus.mutateAsync(id)));
      takeoverIds.forEach((id) => promises.push(rejectTakeover.mutateAsync(id)));

      await Promise.all(promises);
      setSelectedIds(new Set());
    },
    [bulkLeaveAction, rejectPause, rejectBonus, rejectTakeover]
  );

  const handleSelect = (id: number, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredApprovals.map((a) => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key });
    setSelectedIds(new Set());
  };

  const handleTypeClick = (type: ApprovalType | 'all') => {
    handleTabChange(type);
  };

  const isLoading = leavesLoading || pausesLoading || bonusLoading || takeoversLoading;
  const hasError = leavesError || pausesError || bonusError || takeoversError;

  const tabItems = [
    { key: 'all', label: `${t('approvals.all', 'All')} (${counts.total})` },
    { key: 'leave', label: `${t('approvals.type.leave', 'Leave')} (${counts.leave})` },
    { key: 'pause', label: `${t('approvals.type.pause', 'Pause')} (${counts.pause})` },
    { key: 'bonus', label: `${t('approvals.type.bonus', 'Bonus')} (${counts.bonus})` },
    { key: 'takeover', label: `${t('approvals.type.takeover', 'Takeover')} (${counts.takeover})` },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <SafetyCertificateOutlined style={{ marginRight: 8 }} />
        {t('nav.unified_approvals', 'Approval Center')}
      </Title>

      {/* Stats */}
      <ApprovalStats
        counts={counts}
        loading={isLoading}
        onTypeClick={handleTypeClick}
        activeType={activeTab}
      />

      {/* Filters */}
      <ApprovalFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClear={() => setFilters({})}
        collapsible
        defaultCollapsed
      />

      {/* Tabs and Content */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          size="large"
        />

        {hasError && (
          <Alert
            type="error"
            message={t('common.error', 'Error loading data')}
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : filteredApprovals.length === 0 ? (
          <Empty
            description={t('approvals.noItems', 'No approval requests')}
            style={{ padding: 48 }}
          />
        ) : (
          <div style={{ paddingBottom: selectedItems.length > 0 ? 80 : 0 }}>
            {filteredApprovals.map((item) => (
              <ApprovalCard
                key={`${item.type}-${item.id}`}
                item={item}
                selected={selectedIds.has(item.id)}
                onSelect={handleSelect}
                onApprove={handleApprove}
                onReject={handleReject}
                approving={
                  (item.type === 'leave' && approveLeave.isPending) ||
                  (item.type === 'pause' && approvePause.isPending) ||
                  (item.type === 'bonus' && approveBonus.isPending) ||
                  (item.type === 'takeover' && approveTakeover.isPending)
                }
                rejecting={
                  (item.type === 'leave' && rejectLeave.isPending) ||
                  (item.type === 'pause' && rejectPause.isPending) ||
                  (item.type === 'bonus' && rejectBonus.isPending) ||
                  (item.type === 'takeover' && rejectTakeover.isPending)
                }
              />
            ))}
          </div>
        )}
      </Card>

      {/* Bulk Action Bar */}
      <BulkApprovalBar
        selectedItems={selectedItems}
        totalItems={filteredApprovals.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        approving={bulkLeaveAction.isPending || approvePause.isPending || approveBonus.isPending}
        rejecting={bulkLeaveAction.isPending || rejectPause.isPending || rejectBonus.isPending}
      />

      {/* Reject Modal */}
      <Modal
        title={t('approvals.rejectRequest', 'Reject Request')}
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          setItemToReject(null);
          rejectForm.resetFields();
        }}
        onOk={() => rejectForm.submit()}
        confirmLoading={rejectLeave.isPending}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical" onFinish={handleConfirmReject}>
          <Form.Item
            name="reason"
            label={t('approvals.rejectionReason', 'Rejection Reason (optional)')}
          >
            <VoiceTextArea rows={3} placeholder={t('approvals.enterReason', 'Enter reason...')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
