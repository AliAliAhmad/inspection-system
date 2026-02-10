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
  Tooltip,
  Avatar,
} from 'antd';
import {
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  UserOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { leavesApi, CompensatoryLeave, CompOffListParams } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

const { Text, Title } = Typography;

interface CompOffListProps {
  userId?: number;
  showAllUsers?: boolean;
  compact?: boolean;
}

type CompOffStatus = 'pending' | 'approved' | 'used' | 'expired';

const STATUS_CONFIG: Record<
  CompOffStatus,
  { color: string; label: string; icon: React.ReactNode }
> = {
  pending: { color: 'orange', label: 'Pending', icon: <ClockCircleOutlined /> },
  approved: { color: 'green', label: 'Approved', icon: <CheckOutlined /> },
  used: { color: 'blue', label: 'Used', icon: <SwapOutlined /> },
  expired: { color: 'red', label: 'Expired', icon: <WarningOutlined /> },
};

export function CompOffList({ userId, showAllUsers = false, compact = false }: CompOffListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<CompOffStatus | undefined>();
  const [page, setPage] = useState(1);

  const isAdmin = user?.role === 'admin';

  // Fetch comp-off requests
  const { data, isLoading } = useQuery({
    queryKey: ['comp-off', statusFilter, page, userId, showAllUsers],
    queryFn: () => {
      const params: CompOffListParams = {
        page,
        per_page: 15,
        status: statusFilter,
        user_id: showAllUsers ? undefined : userId,
      };
      return leavesApi.listCompOffs(params).then((r) => r.data);
    },
  });

  const compOffs: CompensatoryLeave[] = data?.data || [];
  const pagination = data?.pagination;

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (id: number) => leavesApi.approveCompOff(id),
    onSuccess: () => {
      message.success(t('leaves.compOffApproved', 'Comp-off request approved'));
      queryClient.invalidateQueries({ queryKey: ['comp-off'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => leavesApi.rejectCompOff(id),
    onSuccess: () => {
      message.success(t('leaves.compOffRejected', 'Comp-off request rejected'));
      queryClient.invalidateQueries({ queryKey: ['comp-off'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const isExpiringSoon = (compOff: CompensatoryLeave) => {
    if (!compOff.expires_at || compOff.status !== 'approved') return false;
    const daysUntilExpiry = dayjs(compOff.expires_at).diff(dayjs(), 'day');
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const columns = [
    ...(showAllUsers
      ? [
          {
            title: t('leaves.employee', 'Employee'),
            key: 'user',
            render: (_: any, record: CompensatoryLeave) =>
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
      title: t('leaves.workDate', 'Work Date'),
      dataIndex: 'work_date',
      key: 'work_date',
      render: (date: string) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: t('leaves.hoursWorked', 'Hours'),
      dataIndex: 'hours_worked',
      key: 'hours_worked',
      width: 100,
      render: (hours: number) => (
        <Tag color="blue">
          <ClockCircleOutlined /> {hours}h
        </Tag>
      ),
    },
    {
      title: t('leaves.daysEarned', 'Days Earned'),
      dataIndex: 'comp_days_earned',
      key: 'comp_days_earned',
      width: 120,
      render: (days: number) => (
        <Text strong style={{ color: '#13c2c2' }}>
          {days} {t('leaves.days', 'days')}
        </Text>
      ),
    },
    {
      title: t('leaves.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (reason: string) => reason || '-',
    },
    {
      title: t('leaves.status', 'Status'),
      key: 'status',
      width: 120,
      render: (_: any, record: CompensatoryLeave) => {
        const config = STATUS_CONFIG[record.status];
        return (
          <Space>
            <Tag color={config.color} icon={config.icon}>
              {t(`leaves.status.${record.status}`, config.label)}
            </Tag>
            {isExpiringSoon(record) && (
              <Tooltip
                title={t('leaves.expiringSoon', 'Expires in {{days}} days', {
                  days: dayjs(record.expires_at).diff(dayjs(), 'day'),
                })}
              >
                <WarningOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: t('leaves.expiryDate', 'Expiry'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 120,
      render: (date: string, record: CompensatoryLeave) =>
        date && record.status === 'approved' ? (
          <Text
            type={isExpiringSoon(record) ? 'warning' : 'secondary'}
            style={{ fontSize: 12 }}
          >
            {dayjs(date).format('MMM D, YYYY')}
          </Text>
        ) : (
          '-'
        ),
    },
    {
      title: t('leaves.usedIn', 'Used In'),
      key: 'used_in',
      width: 100,
      render: (_: any, record: CompensatoryLeave) =>
        record.used_in_leave_id ? (
          <Tooltip title={t('leaves.viewLinkedLeave', 'View linked leave request')}>
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              // onClick={() => navigate to leave details}
            >
              #{record.used_in_leave_id}
            </Button>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    ...(isAdmin && showAllUsers
      ? [
          {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 120,
            render: (_: any, record: CompensatoryLeave) =>
              record.status === 'pending' && (
                <Space>
                  <Popconfirm
                    title={t('leaves.confirmApproveCompOff', 'Approve this comp-off request?')}
                    onConfirm={() => approveMutation.mutate(record.id)}
                    okText={t('common.yes', 'Yes')}
                    cancelText={t('common.no', 'No')}
                  >
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      loading={approveMutation.isPending}
                    />
                  </Popconfirm>
                  <Popconfirm
                    title={t('leaves.confirmRejectCompOff', 'Reject this comp-off request?')}
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
              ),
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

  return (
    <Card
      size={compact ? 'small' : 'default'}
      title={
        <Space>
          <SwapOutlined style={{ color: '#13c2c2' }} />
          {t('leaves.compensatoryLeave', 'Compensatory Leave')}
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
      {compOffs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('leaves.noCompOffs', 'No compensatory leave requests')}
        />
      ) : (
        <Table
          dataSource={compOffs}
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

export default CompOffList;
