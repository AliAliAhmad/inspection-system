import { Row, Col, Skeleton } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  AlertOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatCard } from '../shared/StatCard';
import { qualityReviewsApi } from '@inspection/shared';

interface QCStatsHeaderProps {
  period?: 'week' | 'month' | 'year';
  compact?: boolean;
}

export function QCStatsHeader({ period = 'week', compact = false }: QCStatsHeaderProps) {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['qc-stats', period],
    queryFn: () => qualityReviewsApi.getStats?.({ period }).then((r) => r.data?.data),
    enabled: !!qualityReviewsApi.getStats,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Col key={i} xs={12} sm={8} md={4}>
            <Skeleton.Button active block style={{ height: 100 }} />
          </Col>
        ))}
      </Row>
    );
  }

  // Mock data if API not available
  const mockStats = {
    total_reviews: 45,
    approved: 38,
    rejected: 5,
    pending: 2,
    approval_rate: 88,
    avg_review_time_hours: 2.5,
    sla_compliance_rate: 92,
    trend: {
      reviews_change: 8,
      approval_rate_change: 3,
    },
  };

  const s = stats || mockStats;
  const cardSize = compact ? 'small' : 'default';

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.total_reviews', 'Total Reviews')}
          value={s.total_reviews}
          icon={<SafetyCertificateOutlined />}
          trend={s.trend?.reviews_change}
          trendLabel={t('common.vs_last_period', 'vs last period')}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.approved', 'Approved')}
          value={s.approved}
          icon={<CheckCircleOutlined />}
          progress={(s.approved / Math.max(s.total_reviews, 1)) * 100}
          progressColor="#52c41a"
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.rejected', 'Rejected')}
          value={s.rejected}
          icon={<CloseCircleOutlined />}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.pending', 'Pending')}
          value={s.pending}
          icon={<ClockCircleOutlined />}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.approval_rate', 'Approval Rate')}
          value={s.approval_rate}
          suffix="%"
          icon={<CheckCircleOutlined />}
          trend={s.trend?.approval_rate_change}
          progress={s.approval_rate}
          progressColor={s.approval_rate >= 80 ? '#52c41a' : s.approval_rate >= 60 ? '#faad14' : '#ff4d4f'}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('qc.sla_compliance', 'SLA Compliance')}
          value={s.sla_compliance_rate}
          suffix="%"
          icon={<FieldTimeOutlined />}
          progress={s.sla_compliance_rate}
          progressColor={s.sla_compliance_rate >= 90 ? '#52c41a' : s.sla_compliance_rate >= 70 ? '#faad14' : '#ff4d4f'}
          tooltip={t('qc.sla_tooltip', 'Percentage of reviews completed within SLA')}
          size={cardSize}
        />
      </Col>
    </Row>
  );
}

export default QCStatsHeader;
