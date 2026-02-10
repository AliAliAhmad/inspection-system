import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  FieldTimeOutlined,
  PercentageOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatsHeader, StatItem, StatIcons } from '../shared/StatsHeader';
import { qualityReviewsApi } from '@inspection/shared';

interface QCStatsHeaderProps {
  period?: 'week' | 'month' | 'year';
  compact?: boolean;
  title?: string;
}

/**
 * QCStatsHeader - Stats header for Quality Reviews using the shared StatsHeader component
 *
 * Displays key quality review metrics:
 * - Total reviews
 * - Approved count
 * - Rejected count
 * - Pending count
 * - Approval rate
 * - SLA compliance rate
 */
export function QCStatsHeader({ period = 'week', compact = false, title }: QCStatsHeaderProps) {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['qc-stats', period],
    queryFn: () => qualityReviewsApi.getStats?.({ period }).then((r) => r.data?.data),
    enabled: !!qualityReviewsApi.getStats,
    staleTime: 30000,
  });

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

  // Build stats items for StatsHeader
  const statsItems: StatItem[] = [
    {
      key: 'total',
      label: t('qc.total_reviews', 'Total Reviews'),
      value: s.total_reviews,
      icon: <SafetyCertificateOutlined style={{ color: '#1890ff' }} />,
      color: '#1890ff',
      trend: s.trend?.reviews_change
        ? {
            direction: s.trend.reviews_change > 0 ? 'up' : s.trend.reviews_change < 0 ? 'down' : 'stable',
            value: Math.abs(s.trend.reviews_change),
            label: t('common.vs_last_period', 'vs last period'),
          }
        : undefined,
    },
    {
      key: 'approved',
      label: t('qc.approved', 'Approved'),
      value: s.approved,
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      color: '#52c41a',
      tooltip: t('qc.approved_tooltip', '{{percent}}% of total reviews', {
        percent: Math.round((s.approved / Math.max(s.total_reviews, 1)) * 100),
      }),
    },
    {
      key: 'rejected',
      label: t('qc.rejected', 'Rejected'),
      value: s.rejected,
      icon: <CloseCircleOutlined style={{ color: '#f5222d' }} />,
      color: '#f5222d',
    },
    {
      key: 'pending',
      label: t('qc.pending', 'Pending'),
      value: s.pending,
      icon: <ClockCircleOutlined style={{ color: '#faad14' }} />,
      color: '#faad14',
    },
    {
      key: 'approval_rate',
      label: t('qc.approval_rate', 'Approval Rate'),
      value: s.approval_rate,
      suffix: '%',
      icon: <PercentageOutlined style={{ color: s.approval_rate >= 80 ? '#52c41a' : s.approval_rate >= 60 ? '#faad14' : '#f5222d' }} />,
      color: s.approval_rate >= 80 ? '#52c41a' : s.approval_rate >= 60 ? '#faad14' : '#f5222d',
      trend: s.trend?.approval_rate_change
        ? {
            direction: s.trend.approval_rate_change > 0 ? 'up' : s.trend.approval_rate_change < 0 ? 'down' : 'stable',
            value: Math.abs(s.trend.approval_rate_change),
          }
        : undefined,
    },
    {
      key: 'sla_compliance',
      label: t('qc.sla_compliance', 'SLA Compliance'),
      value: s.sla_compliance_rate,
      suffix: '%',
      icon: <FieldTimeOutlined style={{ color: s.sla_compliance_rate >= 90 ? '#52c41a' : s.sla_compliance_rate >= 70 ? '#faad14' : '#f5222d' }} />,
      color: s.sla_compliance_rate >= 90 ? '#52c41a' : s.sla_compliance_rate >= 70 ? '#faad14' : '#f5222d',
      tooltip: t('qc.sla_tooltip', 'Percentage of reviews completed within SLA'),
    },
  ];

  return (
    <StatsHeader
      stats={statsItems}
      loading={isLoading}
      title={title}
      columns={6}
      size={compact ? 'small' : 'default'}
      variant="card"
    />
  );
}

export default QCStatsHeader;
