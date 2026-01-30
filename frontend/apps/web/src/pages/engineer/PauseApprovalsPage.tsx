import { Card, Table, Tag, Button, Space, Typography, Alert, Popconfirm, message } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { specialistJobsApi, PauseLog, formatDateTime } from '@inspection/shared';

const PAUSE_STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  denied: 'red',
};

const REASON_CATEGORY_COLOR: Record<string, string> = {
  parts: 'blue',
  duty_finish: 'purple',
  tools: 'cyan',
  manpower: 'geekblue',
  oem: 'magenta',
  other: 'default',
};

export default function PauseApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pending-pauses'],
    queryFn: () => specialistJobsApi.getPendingPauses().then((r) => r.data),
  });

  const pauses: PauseLog[] = (data?.data as PauseLog[] | undefined) ?? [];

  const approveMutation = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.approvePause(pauseId),
    onSuccess: () => {
      message.success(t('common.success', 'Pause approved'));
      queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const denyMutation = useMutation({
    mutationFn: (pauseId: number) => specialistJobsApi.denyPause(pauseId),
    onSuccess: () => {
      message.success(t('common.success', 'Pause denied'));
      queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const columns: ColumnsType<PauseLog> = [
    {
      title: t('common.id', 'Job ID'),
      key: 'job_ref',
      render: (_: unknown, record: PauseLog) =>
        `${record.job_type} #${record.job_id}`,
    },
    {
      title: t('common.reason_category', 'Reason Category'),
      dataIndex: 'reason_category',
      key: 'reason_category',
      render: (cat: string) => (
        <Tag color={REASON_CATEGORY_COLOR[cat] ?? 'default'}>
          {t(`pause.${cat}`, cat.replace(/_/g, ' '))}
        </Tag>
      ),
    },
    {
      title: t('common.details', 'Details'),
      dataIndex: 'reason_details',
      key: 'reason_details',
      ellipsis: true,
      render: (text: string | null) => text || '-',
    },
    {
      title: t('common.requested_at', 'Requested At'),
      dataIndex: 'requested_at',
      key: 'requested_at',
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={PAUSE_STATUS_COLOR[status] ?? 'default'}>
          {t(`status.${status}`, status)}
        </Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: PauseLog) => {
        if (record.status !== 'pending') return null;
        return (
          <Space>
            <Popconfirm
              title={t('common.confirm_approve', 'Approve this pause request?')}
              onConfirm={() => approveMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={approveMutation.isPending}
                size="small"
              >
                {t('common.approve', 'Approve')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('common.confirm_deny', 'Deny this pause request?')}
              onConfirm={() => denyMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              <Button
                danger
                icon={<CloseOutlined />}
                loading={denyMutation.isPending}
                size="small"
              >
                {t('common.deny', 'Deny')}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  if (error) {
    return <Alert type="error" message={t('common.error', 'An error occurred')} showIcon />;
  }

  return (
    <div>
      <Typography.Title level={4}>
        {t('nav.pause_approvals', 'Pause Approvals')}
      </Typography.Title>

      <Card>
        <Table<PauseLog>
          rowKey="id"
          columns={columns}
          dataSource={pauses}
          loading={isLoading}
          locale={{ emptyText: t('common.noData', 'No pending pause requests') }}
          pagination={false}
        />
      </Card>
    </div>
  );
}
