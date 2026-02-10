import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  Popconfirm,
  message,
  Spin,
  Empty,
  Typography,
  Avatar,
  Tooltip,
} from 'antd';
import {
  DollarOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  UserOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { leavesApi, LeaveEncashment, EncashmentListParams } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

const { Text, Title } = Typography;

interface EncashmentListProps {
  userId?: number;
  showAllUsers?: boolean;
  compact?: boolean;
}

type EncashmentStatus = 'pending' | 'approved' | 'paid' | 'rejected';

const STATUS_CONFIG: Record<
  EncashmentStatus,
  { color: string; label: string; icon: React.ReactNode }
> = {
  pending: { color: 'orange', label: 'Pending', icon: <ClockCircleOutlined /> },
  approved: { color: 'blue', label: 'Approved', icon: <CheckOutlined /> },
  paid: { color: 'green', label: 'Paid', icon: <BankOutlined /> },
  rejected: { color: 'red', label: 'Rejected', icon: <CloseOutlined /> },
};

export function EncashmentList({
  userId,
  showAllUsers = false,
  compact = false,
}: EncashmentListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<EncashmentStatus | undefined>();
  const [page, setPage] = useState(1);

  const isAdmin = user?.role === 'admin';

  // Fetch encashments
  const { data, isLoading } = useQuery({
    queryKey: ['encashments', statusFilter, page, userId, showAllUsers],
    queryFn: () => {
      const params: EncashmentListParams = {
        page,
        per_page: 15,
        status: statusFilter,
        user_id: showAllUsers ? undefined : userId,
      };
      return leavesApi.listEncashments(params).then((r) => r.data);
    },
  });

  const encashments: LeaveEncashment[] = data?.data?.encashments || [];
  const pagination = data?.data?.pagination;

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id: number) => leavesApi.approveEncashment(id),
    onSuccess: () => {
      message.success(t('leaves.encashmentApproved', 'Encashment request approved'));
      queryClient.invalidateQueries({ queryKey: ['encashments'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => leavesApi.rejectEncashment(id),
    onSuccess: () => {
      message.success(t('leaves.encashmentRejected', 'Encashment request rejected'));
      queryClient.invalidateQueries({ queryKey: ['encashments'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => leavesApi.markEncashmentPaid(id),
    onSuccess: () => {
      message.success(t('leaves.encashmentMarkedPaid', 'Encashment marked as paid'));
      queryClient.invalidateQueries({ queryKey: ['encashments'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-SA', {
      style: 'currency',
      currency: 'SAR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const columns = [
    ...(showAllUsers
      ? [
          {
            title: t('leaves.employee', 'Employee'),
            key: 'user',
            render: (_: any, record: LeaveEncashment) =>
              record.user ? (
                <Space>
                  <Avatar size="small" icon={<UserOutlined />} />
                  <Text>{record.user.full_name}</Text>
                </Space>
              ) : (
                '-'
              ),
          },
        ]
      : []),
    {
      title: t('leaves.leaveType', 'Leave Type'),
      key: 'leave_type',
      render: (_: any, record: LeaveEncashment) =>
        record.leave_type ? (
          <Tag color={record.leave_type.color || 'default'}>{record.leave_type.name}</Tag>
        ) : (
          <Tag>Annual</Tag>
        ),
    },
    {
      title: t('leaves.daysEncashed', 'Days'),
      dataIndex: 'days_encashed',
      key: 'days_encashed',
      width: 100,
      render: (days: number) => (
        <Text strong>
          {days} {t('leaves.days', 'days')}
        </Text>
      ),
    },
    {
      title: t('leaves.amountPerDay', 'Rate/Day'),
      dataIndex: 'amount_per_day',
      key: 'amount_per_day',
      width: 120,
      render: (amount: number) => (
        <Text type="secondary">{formatCurrency(amount)}</Text>
      ),
    },
    {
      title: t('leaves.totalAmount', 'Total Amount'),
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 130,
      render: (amount: number) => (
        <Text strong style={{ color: '#52c41a' }}>
          {formatCurrency(amount)}
        </Text>
      ),
    },
    {
      title: t('leaves.requestedAt', 'Requested'),
      dataIndex: 'requested_at',
      key: 'requested_at',
      width: 120,
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(date).format('MMM D, YYYY')}
        </Text>
      ),
    },
    {
      title: t('leaves.status', 'Status'),
      key: 'status',
      width: 120,
      render: (_: any, record: LeaveEncashment) => {
        const config = STATUS_CONFIG[record.status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {t(`leaves.status.${record.status}`, config.label)}
          </Tag>
        );
      },
    },
    ...(record => record.paid_at ? [{
      title: t('leaves.paidAt', 'Paid On'),
      dataIndex: 'paid_at',
      key: 'paid_at',
      width: 120,
      render: (date: string) =>
        date ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(date).format('MMM D, YYYY')}
          </Text>
        ) : (
          '-'
        ),
    }] : []),
    ...(isAdmin && showAllUsers
      ? [
          {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 150,
            render: (_: any, record: LeaveEncashment) => {
              if (record.status === 'pending') {
                return (
                  <Space>
                    <Popconfirm
                      title={t('leaves.confirmApproveEncashment', 'Approve this encashment request?')}
                      onConfirm={() => approveMutation.mutate(record.id)}
                      okText={t('common.yes', 'Yes')}
                      cancelText={t('common.no', 'No')}
                    >
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckOutlined />}
                        loading={approveMutation.isPending}
                      >
                        {t('common.approve', 'Approve')}
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title={t('leaves.confirmRejectEncashment', 'Reject this encashment request?')}
                      onConfirm={() => rejectMutation.mutate(record.id)}
                      okText={t('common.yes', 'Yes')}
                      cancelText={t('common.no', 'No')}
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        danger
                        size="small"
                        icon={<CloseOutlined />}
                        loading={rejectMutation.isPending}
                      />
                    </Popconfirm>
                  </Space>
                );
              }

              if (record.status === 'approved') {
                return (
                  <Popconfirm
                    title={t('leaves.confirmMarkPaid', 'Mark this encashment as paid?')}
                    description={t(
                      'leaves.markPaidDescription',
                      'This confirms that payment has been processed.'
                    )}
                    onConfirm={() => markPaidMutation.mutate(record.id)}
                    okText={t('common.yes', 'Yes')}
                    cancelText={t('common.no', 'No')}
                  >
                    <Button
                      type="primary"
                      size="small"
                      icon={<BankOutlined />}
                      loading={markPaidMutation.isPending}
                      style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    >
                      {t('leaves.markPaid', 'Mark Paid')}
                    </Button>
                  </Popconfirm>
                );
              }

              return null;
            },
          },
        ]
      : []),
  ].filter(Boolean);

  if (isLoading) {
    return (
      <Card size={compact ? 'small' : 'default'}>
        <div style={{ textAlign: 'center', padding: compact ? 30 : 60 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  // Summary stats for admin
  const summaryStats = showAllUsers && encashments.length > 0 && (
    <div
      style={{
        display: 'flex',
        gap: 24,
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
      }}
    >
      <div>
        <Text type="secondary">{t('leaves.pendingRequests', 'Pending')}</Text>
        <Title level={4} style={{ margin: 0, color: '#faad14' }}>
          {encashments.filter((e) => e.status === 'pending').length}
        </Title>
      </div>
      <div>
        <Text type="secondary">{t('leaves.approvedAwaitingPayment', 'Awaiting Payment')}</Text>
        <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
          {encashments.filter((e) => e.status === 'approved').length}
        </Title>
      </div>
      <div>
        <Text type="secondary">{t('leaves.totalPendingAmount', 'Pending Amount')}</Text>
        <Title level={4} style={{ margin: 0, color: '#52c41a' }}>
          {formatCurrency(
            encashments
              .filter((e) => e.status === 'approved')
              .reduce((sum, e) => sum + (e.total_amount || 0), 0)
          )}
        </Title>
      </div>
    </div>
  );

  return (
    <Card
      size={compact ? 'small' : 'default'}
      title={
        <Space>
          <DollarOutlined style={{ color: '#52c41a' }} />
          {t('leaves.leaveEncashment', 'Leave Encashment')}
        </Space>
      }
      extra={
        <Select
          placeholder={t('leaves.filterByStatus', 'Filter by status')}
          allowClear
          style={{ width: 150 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={Object.entries(STATUS_CONFIG).map(([key, config]) => ({
            value: key,
            label: t(`leaves.status.${key}`, config.label),
          }))}
        />
      }
    >
      {summaryStats}

      {encashments.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('leaves.noEncashments', 'No encashment requests')}
        />
      ) : (
        <Table
          dataSource={encashments}
          columns={columns as any}
          rowKey="id"
          size={compact ? 'small' : 'middle'}
          pagination={
            pagination
              ? {
                  current: pagination.page,
                  total: pagination.total,
                  pageSize: pagination.per_page,
                  onChange: setPage,
                  showSizeChanger: false,
                }
              : false
          }
        />
      )}
    </Card>
  );
}

export default EncashmentList;
