import { Card, Typography, Space, Tag, Progress, Tooltip, Spin, Empty } from 'antd';
import {
  TeamOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';

const { Text, Title } = Typography;

export interface ComparisonMetric {
  name: string;
  key: string;
  user_value: number;
  average_value: number;
  percentile: number;
  trend: 'up' | 'down' | 'stable';
  unit?: string;
}

export interface PeerComparisonData {
  user_id: number;
  rank: number;
  total_users: number;
  percentile: number;
  metrics: ComparisonMetric[];
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
}

export interface PeerComparisonCardProps {
  userId?: number;
  compact?: boolean;
}

const performanceApi = {
  getPeerComparison: (userId?: number) =>
    apiClient.get('/api/performance/peer-comparison', { params: { user_id: userId } }),
};

const TIER_CONFIG = {
  bronze: { color: '#cd7f32', label: 'Bronze', minPercentile: 0 },
  silver: { color: '#c0c0c0', label: 'Silver', minPercentile: 25 },
  gold: { color: '#ffd700', label: 'Gold', minPercentile: 50 },
  platinum: { color: '#e5e4e2', label: 'Platinum', minPercentile: 75 },
  diamond: { color: '#b9f2ff', label: 'Diamond', minPercentile: 90 },
};

const METRIC_ICONS: Record<string, React.ReactNode> = {
  jobs_completed: <ThunderboltOutlined />,
  quality_score: <StarOutlined />,
  on_time_rate: <ClockCircleOutlined />,
  points_earned: <TrophyOutlined />,
  efficiency: <RiseOutlined />,
};

export function PeerComparisonCard({ userId, compact = false }: PeerComparisonCardProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'peer-comparison', userId],
    queryFn: () => performanceApi.getPeerComparison(userId).then((r) => r.data),
  });

  const comparisonData: PeerComparisonData | null = data?.data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!comparisonData) {
    return (
      <Card
        title={
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            {t('performance.peer_comparison', 'Peer Comparison')}
          </Space>
        }
      >
        <Empty description={t('performance.no_comparison_data', 'No comparison data available')} />
      </Card>
    );
  }

  const tierConfig = TIER_CONFIG[comparisonData.tier];
  const isTopPerformer = comparisonData.percentile >= 75;
  const isTopTen = comparisonData.rank <= 10;

  if (compact) {
    return (
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Rank Badge */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${tierConfig.color}40, ${tierConfig.color}20)`,
              border: `3px solid ${tierConfig.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <Text strong style={{ fontSize: 18, lineHeight: 1 }}>
              #{comparisonData.rank}
            </Text>
            <Text type="secondary" style={{ fontSize: 10 }}>
              of {comparisonData.total_users}
            </Text>
          </div>

          {/* Quick Stats */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text strong>{t('performance.your_ranking', 'Your Ranking')}</Text>
              <Tag color={tierConfig.color}>{tierConfig.label}</Tag>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('performance.top_percentile', 'Top {{percentile}}%', {
                  percentile: 100 - comparisonData.percentile,
                })}
              </Text>
              {isTopPerformer && (
                <TrophyOutlined style={{ color: '#faad14' }} />
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <TeamOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('performance.peer_comparison', 'Peer Comparison')}
          </Title>
        </Space>
      }
      extra={
        <Tag
          color={tierConfig.color}
          style={{ fontSize: 13, padding: '4px 12px' }}
          icon={<TrophyOutlined />}
        >
          {tierConfig.label} Tier
        </Tag>
      }
    >
      {/* Rank Display */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: 20,
          background: `linear-gradient(135deg, ${tierConfig.color}15, ${tierConfig.color}05)`,
          borderRadius: 12,
          marginBottom: 20,
          border: `1px solid ${tierConfig.color}30`,
        }}
      >
        {/* Rank Circle */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${tierConfig.color}, ${tierConfig.color}80)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#fff',
            boxShadow: `0 4px 12px ${tierConfig.color}40`,
          }}
        >
          <TrophyOutlined style={{ fontSize: 20, marginBottom: 4 }} />
          <Text strong style={{ fontSize: 28, color: '#fff', lineHeight: 1 }}>
            #{comparisonData.rank}
          </Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>
            of {comparisonData.total_users}
          </Text>
        </div>

        {/* Percentile & Badges */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('performance.percentile_rank', 'Percentile Rank')}
            </Text>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Title level={2} style={{ margin: 0 }}>
                {comparisonData.percentile}%
              </Title>
              <Text type="secondary">
                {t('performance.top_of_peers', 'Top {{percent}}% of peers', {
                  percent: 100 - comparisonData.percentile,
                })}
              </Text>
            </div>
          </div>

          {/* Achievement Badges */}
          <Space wrap>
            {isTopTen && (
              <Tag color="gold" icon={<TrophyOutlined />}>
                Top 10
              </Tag>
            )}
            {isTopPerformer && (
              <Tag color="green" icon={<StarOutlined />}>
                Top Performer
              </Tag>
            )}
            {comparisonData.percentile >= 90 && (
              <Tag color="purple" icon={<ThunderboltOutlined />}>
                Elite
              </Tag>
            )}
          </Space>
        </div>
      </div>

      {/* Comparison Metrics */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 12 }}>
          {t('performance.comparison_metrics', 'Comparison Metrics')}
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comparisonData.metrics.map((metric) => {
            const vsAverage = metric.user_value - metric.average_value;
            const isAboveAverage = vsAverage > 0;
            const percentOfAverage = Math.round((metric.user_value / metric.average_value) * 100);

            return (
              <div
                key={metric.key}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#fafafa',
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Space>
                    <span style={{ color: '#1677ff' }}>
                      {METRIC_ICONS[metric.key] || <CheckCircleOutlined />}
                    </span>
                    <Text strong>{metric.name}</Text>
                    {metric.trend !== 'stable' && (
                      <Tooltip
                        title={
                          metric.trend === 'up'
                            ? t('performance.improving', 'Improving')
                            : t('performance.declining', 'Declining')
                        }
                      >
                        {metric.trend === 'up' ? (
                          <RiseOutlined style={{ color: '#52c41a' }} />
                        ) : (
                          <FallOutlined style={{ color: '#ff4d4f' }} />
                        )}
                      </Tooltip>
                    )}
                  </Space>
                  <Space>
                    <Text strong style={{ fontSize: 16 }}>
                      {metric.user_value}
                      {metric.unit}
                    </Text>
                    <Text
                      type={isAboveAverage ? 'success' : 'danger'}
                      style={{ fontSize: 12 }}
                    >
                      ({isAboveAverage ? '+' : ''}
                      {vsAverage.toFixed(1)}{metric.unit} vs avg)
                    </Text>
                  </Space>
                </div>

                {/* Visual Comparison Bar */}
                <div style={{ position: 'relative' }}>
                  <Progress
                    percent={Math.min(percentOfAverage, 150)}
                    showInfo={false}
                    strokeColor={isAboveAverage ? '#52c41a' : '#ff4d4f'}
                    trailColor="#e8e8e8"
                    size="small"
                  />
                  {/* Average marker */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '66.67%', // 100/150 = 66.67% position for "average"
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: '#8c8c8c',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 'calc(66.67% + 4px)',
                      top: -2,
                      fontSize: 10,
                      color: '#8c8c8c',
                    }}
                  >
                    Avg: {metric.average_value}{metric.unit}
                  </div>
                </div>

                {/* Percentile badge */}
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Tag
                    color={
                      metric.percentile >= 75
                        ? 'success'
                        : metric.percentile >= 50
                        ? 'processing'
                        : metric.percentile >= 25
                        ? 'warning'
                        : 'error'
                    }
                    style={{ fontSize: 10 }}
                  >
                    Top {100 - metric.percentile}%
                  </Tag>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default PeerComparisonCard;
