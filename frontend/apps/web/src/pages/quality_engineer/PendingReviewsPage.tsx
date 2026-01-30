import { Card, Table, Tag, Button, Typography, Alert, Space } from 'antd';
import { EyeOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { qualityReviewsApi, QualityReview, formatDateTime } from '@inspection/shared';

export default function PendingReviewsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pending-reviews'],
    queryFn: () => qualityReviewsApi.getPending().then((r) => r.data),
  });

  const reviews: QualityReview[] = (data?.data as QualityReview[] | undefined) ?? [];

  const isOverdue = (slaDeadline: string | null): boolean => {
    if (!slaDeadline) return false;
    return new Date(slaDeadline).getTime() < Date.now();
  };

  const columns: ColumnsType<QualityReview> = [
    {
      title: t('common.type', 'Job Type'),
      dataIndex: 'job_type',
      key: 'job_type',
      render: (type: string) => (
        <Tag color={type === 'specialist' ? 'blue' : 'purple'}>
          {t(`common.${type}`, type)}
        </Tag>
      ),
    },
    {
      title: t('common.id', 'Job ID'),
      dataIndex: 'job_id',
      key: 'job_id',
    },
    {
      title: t('quality.sla_deadline', 'SLA Deadline'),
      dataIndex: 'sla_deadline',
      key: 'sla_deadline',
      render: (deadline: string | null) => {
        if (!deadline) return '-';
        const overdue = isOverdue(deadline);
        return (
          <Space>
            <span style={{ color: overdue ? '#ff4d4f' : undefined }}>
              {formatDateTime(deadline)}
            </span>
            {overdue && (
              <Tag color="red" icon={<WarningOutlined />}>
                {t('status.overdue', 'Overdue')}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.created_at', 'Created At'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, record: QualityReview) => (
        <Button
          type="primary"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/quality/reviews/${record.id}`)}
        >
          {t('common.review', 'Review')}
        </Button>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message={t('common.error', 'An error occurred')} showIcon />;
  }

  return (
    <div>
      <Typography.Title level={4}>
        {t('nav.pending_reviews', 'Pending Reviews')}
      </Typography.Title>

      <Card>
        <Table<QualityReview>
          rowKey="id"
          columns={columns}
          dataSource={reviews}
          loading={isLoading}
          locale={{ emptyText: t('common.noData', 'No pending reviews') }}
          onRow={(record) => ({
            onClick: () => navigate(`/quality/reviews/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={false}
        />
      </Card>
    </div>
  );
}
