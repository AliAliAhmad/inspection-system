import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Form,
  Select,
  InputNumber,
  Input,
  message,
} from 'antd';
import { StarOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  bonusStarsApi,
  usersApi,
  BonusStar,
  User,
  formatDateTime,
} from '@inspection/shared';

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  denied: 'red',
};

export default function BonusRequestsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [showForm, setShowForm] = useState(false);

  const { data: bonusData, isLoading: bonusLoading } = useQuery({
    queryKey: ['bonus-stars'],
    queryFn: () => bonusStarsApi.list().then((r) => r.data),
  });

  const bonuses: BonusStar[] = (bonusData?.data as BonusStar[] | undefined) ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => usersApi.list({ per_page: 200 }).then((r) => r.data),
  });

  const users: User[] = usersData?.data ?? [];

  const requestMutation = useMutation({
    mutationFn: (payload: {
      user_id: number;
      amount: number;
      reason: string;
      related_job_type?: string;
      related_job_id?: number;
    }) => bonusStarsApi.requestBonus(payload),
    onSuccess: () => {
      message.success(t('common.success', 'Bonus request submitted'));
      queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
      form.resetFields();
      setShowForm(false);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const handleSubmit = (values: any) => {
    requestMutation.mutate({
      user_id: values.user_id,
      amount: values.amount,
      reason: values.reason,
      related_job_type: values.related_job_type || undefined,
      related_job_id: values.related_job_id || undefined,
    });
  };

  const getUserName = (userId: number): string => {
    const user = users.find((u) => u.id === userId);
    return user?.full_name ?? `User #${userId}`;
  };

  const columns: ColumnsType<BonusStar> = [
    {
      title: t('common.user', 'User'),
      dataIndex: 'user_id',
      key: 'user_id',
      render: (userId: number) => getUserName(userId),
    },
    {
      title: t('common.amount', 'Amount'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Space>
          <StarOutlined style={{ color: '#faad14' }} />
          <span style={{ fontWeight: 'bold' }}>{amount}</span>
        </Space>
      ),
    },
    {
      title: t('common.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: t('common.related_job', 'Related Job'),
      key: 'related_job',
      render: (_: unknown, record: BonusStar) => {
        if (!record.related_job_type || !record.related_job_id) return '-';
        return `${record.related_job_type} #${record.related_job_id}`;
      },
    },
    {
      title: t('common.status', 'Status'),
      key: 'status',
      render: (_: unknown, record: BonusStar) => {
        if (record.request_status) {
          return (
            <Tag color={STATUS_COLOR[record.request_status] ?? 'default'}>
              {t(`status.${record.request_status}`, record.request_status)}
            </Tag>
          );
        }
        return (
          <Tag color="green">{t('status.awarded', 'Awarded')}</Tag>
        );
      },
    },
    {
      title: t('common.date', 'Date'),
      dataIndex: 'awarded_at',
      key: 'awarded_at',
      render: (val: string) => formatDateTime(val),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.bonus_requests', 'Bonus Requests')}
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm
            ? t('common.cancel', 'Cancel')
            : t('common.request_bonus', 'Request Bonus')}
        </Button>
      </Space>

      {/* Request Form */}
      {showForm && (
        <Card
          title={t('common.request_bonus', 'Request Bonus')}
          style={{ marginBottom: 16 }}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            style={{ maxWidth: 500 }}
          >
            <Form.Item
              name="user_id"
              label={t('common.user', 'User')}
              rules={[{ required: true, message: t('common.required', 'Required') }]}
            >
              <Select
                showSearch
                placeholder={t('common.select', 'Select user...')}
                optionFilterProp="label"
                options={users.map((u) => ({
                  value: u.id,
                  label: `${u.full_name} (${u.role})`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="amount"
              label={t('common.amount', 'Amount')}
              rules={[{ required: true, message: t('common.required', 'Required') }]}
            >
              <InputNumber min={1} max={10} style={{ width: '100%' }} placeholder="1-10" />
            </Form.Item>

            <Form.Item
              name="reason"
              label={t('common.reason', 'Reason')}
              rules={[{ required: true, message: t('common.required', 'Required') }]}
            >
              <Input.TextArea rows={3} placeholder={t('common.reason', 'Reason for bonus...')} />
            </Form.Item>

            <Form.Item
              name="related_job_type"
              label={t('common.related_job_type', 'Related Job Type (optional)')}
            >
              <Select
                allowClear
                placeholder={t('common.select', 'Select...')}
                options={[
                  { value: 'specialist', label: t('common.specialist', 'Specialist') },
                  { value: 'engineer', label: t('common.engineer', 'Engineer') },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="related_job_id"
              label={t('common.related_job_id', 'Related Job ID (optional)')}
            >
              <InputNumber style={{ width: '100%' }} placeholder="Job ID" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={requestMutation.isPending}
                block
              >
                {t('common.submit', 'Submit Request')}
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* Bonus List */}
      <Card>
        <Table<BonusStar>
          rowKey="id"
          columns={columns}
          dataSource={bonuses}
          loading={bonusLoading}
          locale={{ emptyText: t('common.noData', 'No bonus requests') }}
          pagination={{ pageSize: 15 }}
        />
      </Card>
    </div>
  );
}
