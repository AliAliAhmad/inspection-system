import { Row, Col, Skeleton } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  FireOutlined,
  RiseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StatCard } from '../shared/StatCard';
import { engineerJobsApi } from '@inspection/shared';

interface EngineerStatsHeaderProps {
  engineerId?: number;
  period?: 'week' | 'month' | 'year';
  compact?: boolean;
}

export function EngineerStatsHeader({ engineerId, period = 'week', compact = false }: EngineerStatsHeaderProps) {
  const { t } = useTranslation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['engineer-job-stats', engineerId, period],
    queryFn: () => engineerJobsApi.getStats?.({ engineer_id: engineerId, period }).then((r) => r.data?.data),
    enabled: !!engineerJobsApi.getStats,
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

  // Use mock data if API not available yet
  const mockStats = {
    total_jobs: 24,
    completed_jobs: 18,
    in_progress_jobs: 4,
    paused_jobs: 2,
    on_time_rate: 85,
    efficiency_score: 92,
    streak_days: 5,
    points_earned: 1250,
    trend: {
      jobs_change: 12,
      efficiency_change: 5,
    },
  };

  const s = stats || mockStats;

  const cardSize = compact ? 'small' : 'default';

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.completed', 'Completed')}
          value={s.completed_jobs}
          suffix={`/ ${s.total_jobs}`}
          icon={<CheckCircleOutlined />}
          trend={s.trend?.jobs_change}
          trendLabel={t('common.vs_last_period', 'vs last period')}
          progress={(s.completed_jobs / Math.max(s.total_jobs, 1)) * 100}
          progressColor="#52c41a"
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.in_progress', 'In Progress')}
          value={s.in_progress_jobs}
          icon={<ClockCircleOutlined />}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.on_time_rate', 'On-Time Rate')}
          value={s.on_time_rate}
          suffix="%"
          icon={<RiseOutlined />}
          progress={s.on_time_rate}
          progressColor={s.on_time_rate >= 80 ? '#52c41a' : s.on_time_rate >= 60 ? '#faad14' : '#ff4d4f'}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.efficiency', 'Efficiency')}
          value={s.efficiency_score}
          suffix="%"
          icon={<ThunderboltOutlined />}
          trend={s.trend?.efficiency_change}
          progress={s.efficiency_score}
          progressColor="#1890ff"
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.streak', 'Streak')}
          value={s.streak_days}
          suffix={t('common.days', 'days')}
          icon={<FireOutlined />}
          size={cardSize}
        />
      </Col>
      <Col xs={12} sm={8} md={4}>
        <StatCard
          title={t('jobs.points', 'Points')}
          value={s.points_earned}
          icon={<TrophyOutlined />}
          size={cardSize}
        />
      </Col>
    </Row>
  );
}

export default EngineerStatsHeader;
