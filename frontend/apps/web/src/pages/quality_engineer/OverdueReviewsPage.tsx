import { Card, Table, Tag, Button, Badge, Typography, Alert, Space } from 'antd';
import { EyeOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { qualityReviewsApi, QualityReview, formatDateTime } from '@inspection/shared';

export default function OverdueReviewsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['overdue-reviews'],
    queryFn: () => qualityReviewsApi.getOverdue().then((r) => r.data),
  });

  const reviews: QualityReview[] = (data?.data as QualityReview[] | undefined) ?? [];

  const getOverdueHours = (deadline: string | null): number => {
    if (!deadline) return 0;
    const diff = Date.now() - new Date(deadline).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
  };

  const columns: ColumnsType<QualityReview> = [
    {
      title: t('common.urgency', 'Urgency'),
      key: 'urgency',
      width: 100,
      render: (_: unknown, record: QualityReview) => {
        const hours = getOverdueHours(record.sla_deadline);
        if (hours >= 24) {
          return <Badge status="error" text={<Tag color="red">{t('status.critical', 'Critical')}</Tag>} />;
        }
        if (hours >= 8) {
          return <Badge status="warning" text={<Tag color="orange">{t('status.high', 'High')}</Tag>} />;
        }
        return <Badge status="processing" text={<Tag color="gold">{t('status.overdue', 'Overdue')}</Tag>} />;
      },
    },
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
        return (
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
              {formatDateTime(deadline)}
            </span>
          </Space>
        );
      },
    },
    {
      title: t('common.overdue_by', 'Overdue By'),
      key: 'overdue_by',
      render: (_: unknown, record: QualityReview) => {
        const hours = getOverdueHours(record.sla_deadline);
        if (hours >= 24) {
          const days = Math.floor(hours / 24);
          return (
            <Tag color="red" icon={<ClockCircleOutlined />}>
              {days}d {hours % 24}h
            </Tag>
          );
        }
        return (
          <Tag color="orange" icon={<ClockCircleOutlined />}>
            {hours}h
          </Tag>
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
          danger
          icon={<EyeOutlined />}
          onClick={() => navigate(`/quality/reviews/${record.id}`)}
        >
          {t('common.review', 'Review Now')}
        </Button>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message={t('common.error', 'An error occurred')} showIcon />;
  }

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.overdue_reviews', 'Overdue Reviews')}
        </Typography.Title>
        {reviews.length > 0 && (
          <Badge count={reviews.length} overflowCount={99}>
            <Tag color="red" style={{ fontSize: 14, padding: '4px 12px' }}>
              {t('common.requires_attention', 'Requires Attention')}
            </Tag>
          </Badge>
        )}
      </Space>

      <Card>
        <Table<QualityReview>
          rowKey="id"
          columns={columns}
          dataSource={reviews}
          loading={isLoading}
          locale={{ emptyText: t('common.noData', 'No overdue reviews') }}
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
