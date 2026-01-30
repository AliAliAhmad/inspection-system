import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  Popconfirm,
  message,
  Typography,
  Divider,
  Empty,
  Spin,
} from 'antd';
import { CheckOutlined, CloseOutlined, GiftOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  bonusStarsApi,
  usersApi,
  type BonusStar,
  type AwardBonusPayload,
} from '@inspection/shared';
import dayjs from 'dayjs';

export default function BonusApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [awardOpen, setAwardOpen] = useState(false);
  const [awardForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bonus-stars'],
    queryFn: () => bonusStarsApi.list(),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'all-active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }),
    enabled: awardOpen,
  });

  const approveMutation = useMutation({
    mutationFn: (bonusId: number) => bonusStarsApi.approveRequest(bonusId),
    onSuccess: () => {
      message.success(t('bonus.approveSuccess', 'Bonus request approved'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
    },
    onError: () => message.error(t('bonus.approveError', 'Failed to approve request')),
  });

  const denyMutation = useMutation({
    mutationFn: (bonusId: number) => bonusStarsApi.denyRequest(bonusId),
    onSuccess: () => {
      message.success(t('bonus.denySuccess', 'Bonus request denied'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
    },
    onError: () => message.error(t('bonus.denyError', 'Failed to deny request')),
  });

  const awardMutation = useMutation({
    mutationFn: (payload: AwardBonusPayload) => bonusStarsApi.award(payload),
    onSuccess: () => {
      message.success(t('bonus.awardSuccess', 'Bonus awarded successfully'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
      setAwardOpen(false);
      awardForm.resetFields();
    },
    onError: () => message.error(t('bonus.awardError', 'Failed to award bonus')),
  });

  const allBonuses: BonusStar[] = data?.data?.data || [];
  const pendingRequests = allBonuses.filter(
    (b) => b.is_qe_request && b.request_status === 'pending'
  );
  const allUsers = usersData?.data?.data || [];

  const requestStatusColor: Record<string, string> = {
    pending: 'processing',
    approved: 'success',
    denied: 'error',
  };

  const pendingColumns: ColumnsType<BonusStar> = [
    { title: t('bonus.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('bonus.userId', 'User ID'),
      dataIndex: 'user_id',
      key: 'user_id',
      render: (v: number) => `#${v}`,
    },
    {
      title: t('bonus.amount', 'Amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => <Tag color="gold">{v}</Tag>,
    },
    {
      title: t('bonus.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: t('bonus.relatedJob', 'Related Job'),
      key: 'related',
      render: (_: unknown, r: BonusStar) =>
        r.related_job_type ? `${r.related_job_type} #${r.related_job_id}` : '-',
    },
    {
      title: t('bonus.awardedAt', 'Requested At'),
      dataIndex: 'awarded_at',
      key: 'awarded_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: BonusStar) => (
        <Space>
          <Popconfirm
            title={t('bonus.approveConfirm', 'Approve this bonus request?')}
            onConfirm={() => approveMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" icon={<CheckOutlined />}>
              {t('bonus.approve', 'Approve')}
            </Button>
          </Popconfirm>
          <Popconfirm
            title={t('bonus.denyConfirm', 'Deny this bonus request?')}
            onConfirm={() => denyMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" danger icon={<CloseOutlined />}>
              {t('bonus.deny', 'Deny')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns: ColumnsType<BonusStar> = [
    { title: t('bonus.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('bonus.userId', 'User ID'),
      dataIndex: 'user_id',
      key: 'user_id',
      render: (v: number) => `#${v}`,
    },
    {
      title: t('bonus.awardedBy', 'Awarded By'),
      dataIndex: 'awarded_by',
      key: 'awarded_by',
      render: (v: number | null) => v ? `#${v}` : '-',
    },
    {
      title: t('bonus.amount', 'Amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => <Tag color="gold">{v}</Tag>,
    },
    {
      title: t('bonus.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: t('bonus.relatedJob', 'Related Job'),
      key: 'related',
      render: (_: unknown, r: BonusStar) =>
        r.related_job_type ? `${r.related_job_type} #${r.related_job_id}` : '-',
    },
    {
      title: t('bonus.qeRequest', 'QE Request'),
      dataIndex: 'is_qe_request',
      key: 'is_qe_request',
      render: (v: boolean) => v ? <Tag color="purple">{t('common.yes', 'Yes')}</Tag> : '-',
    },
    {
      title: t('bonus.requestStatus', 'Status'),
      dataIndex: 'request_status',
      key: 'request_status',
      render: (v: string | null) =>
        v ? <Tag color={requestStatusColor[v] || 'default'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('bonus.awardedAt', 'Awarded At'),
      dataIndex: 'awarded_at',
      key: 'awarded_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      {/* Pending QE Requests */}
      <Card
        title={<Typography.Title level={4}>{t('bonus.pendingRequests', 'Pending Bonus Requests')}</Typography.Title>}
        style={{ marginBottom: 24 }}
      >
        {pendingRequests.length === 0 ? (
          <Empty description={t('bonus.noPending', 'No pending bonus requests')} />
        ) : (
          <Table
            rowKey="id"
            columns={pendingColumns}
            dataSource={pendingRequests}
            loading={isLoading}
            pagination={false}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      {/* Award Bonus + History */}
      <Card
        title={<Typography.Title level={4}>{t('bonus.history', 'Bonus History')}</Typography.Title>}
        extra={
          <Button type="primary" icon={<GiftOutlined />} onClick={() => setAwardOpen(true)}>
            {t('bonus.awardBonus', 'Award Bonus')}
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={historyColumns}
          dataSource={allBonuses}
          loading={isLoading}
          locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Award Bonus Modal */}
      <Modal
        title={t('bonus.awardBonus', 'Award Bonus')}
        open={awardOpen}
        onCancel={() => { setAwardOpen(false); awardForm.resetFields(); }}
        onOk={() => awardForm.submit()}
        confirmLoading={awardMutation.isPending}
        destroyOnClose
      >
        <Spin spinning={usersLoading}>
          <Form
            form={awardForm}
            layout="vertical"
            onFinish={(v: AwardBonusPayload) => awardMutation.mutate(v)}
          >
            <Form.Item name="user_id" label={t('bonus.user', 'User')} rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="children"
                placeholder={t('bonus.selectUser', 'Select a user')}
              >
                {allUsers.map((u) => (
                  <Select.Option key={u.id} value={u.id}>
                    {u.full_name} ({u.employee_id}) - {u.role}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="amount" label={t('bonus.amount', 'Amount')} rules={[{ required: true }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="reason" label={t('bonus.reason', 'Reason')} rules={[{ required: true }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Divider>{t('bonus.optionalFields', 'Optional - Related Job')}</Divider>
            <Form.Item name="related_job_type" label={t('bonus.relatedJobType', 'Related Job Type')}>
              <Select allowClear>
                <Select.Option value="specialist">Specialist</Select.Option>
                <Select.Option value="engineer">Engineer</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="related_job_id" label={t('bonus.relatedJobId', 'Related Job ID')}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
}
