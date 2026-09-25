import { useState } from 'react';
import { Card, Typography, Space, Row, Col, Spin, Empty, Tag, Statistic, Progress, Carousel, Button } from 'antd';
import {
  DashboardOutlined,
  TrophyOutlined,
  RiseOutlined,
  StarOutlined,
  BulbOutlined,
  LeftOutlined,
  RightOutlined,
  ThunderboltOutlined,
  FireOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';
import { GoalsManager } from './GoalsManager';
import { PeerComparisonCard } from './PeerComparisonCard';
import { TrajectoryChart } from './TrajectoryChart';

const { Title, Text, Paragraph } = Typography;

export interface Achievement {
  id: number;
  name: string;
  description: string;
  icon: string;
  earned_at: string;
  points_reward: number;
}

export interface CoachingTip {
  id: number;
  title: string;
  content: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  action_url?: string;
}

/**
 * Every optional field is something GET /api/performance/summary/<user_id> does
 * not provide (or provides only with enough history); its tile is hidden rather
 * than shown with an invented number.
 */
export interface PerformanceSummary {
  user_id: number;
  user_name: string;
  current_score?: number;
  score_trend?: 'up' | 'down' | 'stable';
  /** Average points gained per month. */
  score_change?: number;
  rank?: number;
  total_users?: number;
  percentile?: number;
  tier?: string;
  active_goals_count: number;
  completed_goals_count?: number;
  recent_achievements: Achievement[];
  coaching_tips: CoachingTip[];
  stats: {
    jobs_completed?: number;
    jobs_this_month?: number;
    quality_score?: number;
    on_time_rate?: number;
    points_earned?: number;
    current_streak?: number;
  };
}

/** What GET /api/performance/summary/<user_id> actually returns. */
interface SummaryResponse {
  user_id?: number;
  trajectory?: {
    has_sufficient_data?: boolean;
    user_name?: string;
    current_rank?: number | null;
    current_points?: number;
    trend?: 'improving' | 'declining' | 'stable';
    avg_monthly_growth?: number;
  };
  burnout_risk?: { user_name?: string };
  goals?: unknown[];
  coaching_tips?: { category: string; tip: string; priority: CoachingTip['priority']; related_skill?: string | null }[];
}

const TREND_FROM_TRAJECTORY = { improving: 'up', declining: 'down', stable: 'stable' } as const;

function toPerformanceSummary(raw: SummaryResponse | undefined): PerformanceSummary | null {
  if (!raw || raw.user_id == null) return null;
  const trajectory = raw.trajectory ?? {};
  // The service answers "not enough history" without points, trend or growth.
  const hasTrajectory = trajectory.has_sufficient_data !== false && trajectory.trend != null;
  return {
    user_id: raw.user_id,
    user_name: trajectory.user_name ?? raw.burnout_risk?.user_name ?? '',
    rank: trajectory.current_rank ?? undefined,
    score_trend: hasTrajectory ? TREND_FROM_TRAJECTORY[trajectory.trend!] : undefined,
    score_change: hasTrajectory ? trajectory.avg_monthly_growth : undefined,
    active_goals_count: raw.goals?.length ?? 0,
    recent_achievements: [],
    coaching_tips: (raw.coaching_tips ?? []).map((tip, i) => ({
      id: i + 1,
      title: tip.related_skill || tip.category.replace(/_/g, ' '),
      content: tip.tip,
      category: tip.category.replace(/_/g, ' '),
      priority: tip.priority,
    })),
    stats: { points_earned: hasTrajectory ? trajectory.current_points : undefined },
  };
}

export interface PerformanceDashboardProps {
  userId?: number;
  showFullDashboard?: boolean;
  compact?: boolean;
}

const performanceApi = {
  getSummary: (userId: number) => apiClient.get(`/api/performance/summary/${userId}`),
};

const TREND_ICON = {
  up: <RiseOutlined style={{ color: '#52c41a' }} />,
  down: <RiseOutlined style={{ color: '#ff4d4f', transform: 'rotate(180deg)' }} />,
  stable: <span style={{ color: '#faad14' }}>-</span>,
};

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
};

export function PerformanceDashboard({
  userId,
  showFullDashboard = true,
  compact = false,
}: PerformanceDashboardProps) {
  const { t } = useTranslation();
  const [carouselRef, setCarouselRef] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'summary', userId],
    queryFn: () => performanceApi.getSummary(userId!).then((r) => r.data),
    enabled: userId != null,
  });

  const summary = toPerformanceSummary(data?.data);

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card
        title={
          <Space>
            <DashboardOutlined style={{ color: '#1677ff' }} />
            {t('performance.dashboard', 'Performance Dashboard')}
          </Space>
        }
      >
        <Empty description={t('performance.no_data', 'No performance data available')} />
      </Card>
    );
  }

  const tierColor = (summary.tier && TIER_COLORS[summary.tier]) || '#1677ff';
  const hasScore = summary.current_score != null;

  if (compact) {
    return (
      <Card size="small">
        <Row gutter={16} align="middle">
          {/* Score */}
          <Col span={8}>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="circle"
                percent={summary.current_score}
                size={80}
                strokeColor={tierColor}
                format={(percent) => (
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{percent}</div>
                    <div style={{ fontSize: 10, color: '#8c8c8c' }}>Score</div>
                  </div>
                )}
              />
            </div>
          </Col>

          {/* Rank */}
          <Col span={8}>
            <Statistic
              title={t('performance.rank', 'Rank')}
              value={summary.rank}
              prefix="#"
              suffix={
                summary.total_users != null && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    /{summary.total_users}
                  </Text>
                )
              }
            />
          </Col>

          {/* Trend */}
          <Col span={8}>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {t('performance.trend', 'Trend')}
              </Text>
              <Space>
                {summary.score_trend && TREND_ICON[summary.score_trend]}
                <Text
                  strong
                  style={{
                    color:
                      summary.score_trend === 'up'
                        ? '#52c41a'
                        : summary.score_trend === 'down'
                        ? '#ff4d4f'
                        : '#faad14',
                  }}
                >
                  {summary.score_change == null
                    ? '-'
                    : `${summary.score_change >= 0 ? '+' : ''}${summary.score_change} pts/mo`}
                </Text>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <div>
      {/* Header Card - Score Overview */}
      <Card
        style={{
          background: `linear-gradient(135deg, ${tierColor}20, ${tierColor}05)`,
          borderColor: `${tierColor}40`,
          marginBottom: 16,
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          {/* Score Circle */}
          {hasScore && (
            <Col xs={24} sm={8} md={6}>
              <div style={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={summary.current_score}
                  size={140}
                  strokeColor={{
                    '0%': tierColor,
                    '100%': `${tierColor}80`,
                  }}
                  format={(percent) => (
                    <div>
                      <div style={{ fontSize: 36, fontWeight: 700, color: tierColor }}>{percent}</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>Performance Score</div>
                    </div>
                  )}
                />
                <Tag
                  color={tierColor}
                  style={{
                    marginTop: 8,
                    fontSize: 14,
                    padding: '4px 16px',
                    textTransform: 'capitalize',
                  }}
                >
                  {summary.tier} Tier
                </Tag>
              </div>
            </Col>
          )}

          {/* Stats Grid */}
          <Col xs={24} sm={hasScore ? 16 : 24} md={hasScore ? 18 : 24}>
            <Row gutter={[16, 16]}>
              {/* Rank */}
              {summary.rank != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <TrophyOutlined style={{ color: '#faad14' }} />
                          {t('performance.rank', 'Rank')}
                        </Space>
                      }
                      value={summary.rank}
                      prefix="#"
                      suffix={
                        summary.total_users != null && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            of {summary.total_users}
                          </Text>
                        )
                      }
                    />
                  </Card>
                </Col>
              )}

              {/* Trend */}
              {summary.score_change != null && summary.score_trend && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          {TREND_ICON[summary.score_trend]}
                          {t('performance.trend', 'Trend')}
                        </Space>
                      }
                      value={summary.score_change}
                      prefix={summary.score_change >= 0 ? '+' : ''}
                      suffix=" pts/mo"
                      valueStyle={{
                        color:
                          summary.score_trend === 'up'
                            ? '#52c41a'
                            : summary.score_trend === 'down'
                            ? '#ff4d4f'
                            : '#faad14',
                      }}
                    />
                  </Card>
                </Col>
              )}

              {/* Jobs */}
              {summary.stats.jobs_this_month != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <ThunderboltOutlined style={{ color: '#1677ff' }} />
                          {t('performance.jobs', 'Jobs')}
                        </Space>
                      }
                      value={summary.stats.jobs_this_month}
                      suffix={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          this month
                        </Text>
                      }
                    />
                  </Card>
                </Col>
              )}

              {/* Streak */}
              {summary.stats.current_streak != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <FireOutlined style={{ color: '#fa541c' }} />
                          {t('performance.streak', 'Streak')}
                        </Space>
                      }
                      value={summary.stats.current_streak}
                      suffix="days"
                    />
                  </Card>
                </Col>
              )}

              {/* Quality Score */}
              {summary.stats.quality_score != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <StarOutlined style={{ color: '#faad14' }} />
                          {t('performance.quality', 'Quality')}
                        </Space>
                      }
                      value={summary.stats.quality_score}
                      suffix="%"
                      valueStyle={{
                        color: summary.stats.quality_score >= 90 ? '#52c41a' : '#faad14',
                      }}
                    />
                  </Card>
                </Col>
              )}

              {/* On-Time Rate */}
              {summary.stats.on_time_rate != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          {t('performance.on_time', 'On-Time')}
                        </Space>
                      }
                      value={summary.stats.on_time_rate}
                      suffix="%"
                      valueStyle={{
                        color: summary.stats.on_time_rate >= 90 ? '#52c41a' : '#faad14',
                      }}
                    />
                  </Card>
                </Col>
              )}

              {/* Points */}
              {summary.stats.points_earned != null && (
                <Col xs={12} md={6}>
                  <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                    <Statistic
                      title={
                        <Space>
                          <TrophyOutlined style={{ color: '#722ed1' }} />
                          {t('performance.points', 'Points')}
                        </Space>
                      }
                      value={summary.stats.points_earned}
                    />
                  </Card>
                </Col>
              )}

              {/* Goals */}
              <Col xs={12} md={6}>
                <Card size="small" style={{ backgroundColor: 'rgba(255,255,255,0.8)' }}>
                  <Statistic
                    title={
                      <Space>
                        <RiseOutlined style={{ color: '#13c2c2' }} />
                        {t('performance.goals', 'Goals')}
                      </Space>
                    }
                    value={summary.active_goals_count}
                    suffix={
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        active
                      </Text>
                    }
                  />
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {showFullDashboard && (
        <Row gutter={[16, 16]}>
          {/* Left Column */}
          <Col xs={24} lg={16}>
            {/* Performance Trajectory */}
            <div style={{ marginBottom: 16 }}>
              <TrajectoryChart userId={userId} />
            </div>

            {/* Goals Manager */}
            <GoalsManager userId={userId} compact />
          </Col>

          {/* Right Column */}
          <Col xs={24} lg={8}>
            {/* Peer Comparison */}
            <div style={{ marginBottom: 16 }}>
              <PeerComparisonCard userId={userId} compact />
            </div>

            {/* Recent Achievements */}
            {summary.recent_achievements.length > 0 && (
              <Card
                title={
                  <Space>
                    <TrophyOutlined style={{ color: '#faad14' }} />
                    {t('performance.recent_achievements', 'Recent Achievements')}
                  </Space>
                }
                size="small"
                style={{ marginBottom: 16 }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {summary.recent_achievements.slice(0, 3).map((achievement) => (
                    <div
                      key={achievement.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        backgroundColor: '#fffbe6',
                        borderRadius: 8,
                        border: '1px solid #ffe58f',
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{achievement.icon}</span>
                      <div style={{ flex: 1 }}>
                        <Text strong>{achievement.name}</Text>
                        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                          {achievement.description}
                        </Text>
                      </div>
                      <Tag color="gold">+{achievement.points_reward}</Tag>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Coaching Tips Carousel */}
            {summary.coaching_tips.length > 0 && (
              <Card
                title={
                  <Space>
                    <BulbOutlined style={{ color: '#52c41a' }} />
                    {t('performance.coaching_tips', 'Coaching Tips')}
                  </Space>
                }
                size="small"
                extra={
                  <Space>
                    <Button
                      type="text"
                      size="small"
                      icon={<LeftOutlined />}
                      onClick={() => carouselRef?.prev()}
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<RightOutlined />}
                      onClick={() => carouselRef?.next()}
                    />
                  </Space>
                }
              >
                <Carousel
                  ref={(ref) => setCarouselRef(ref)}
                  autoplay
                  autoplaySpeed={5000}
                  dots={{ className: 'coaching-dots' }}
                >
                  {summary.coaching_tips.map((tip) => (
                    <div key={tip.id}>
                      <div
                        style={{
                          padding: 16,
                          backgroundColor: '#f6ffed',
                          borderRadius: 8,
                          border: '1px solid #b7eb8f',
                          minHeight: 120,
                        }}
                      >
                        <Tag
                          color={
                            tip.priority === 'high'
                              ? 'error'
                              : tip.priority === 'medium'
                              ? 'warning'
                              : 'default'
                          }
                          style={{ marginBottom: 8 }}
                        >
                          {tip.category}
                        </Tag>
                        <Title level={5} style={{ margin: '8px 0' }}>
                          {tip.title}
                        </Title>
                        <Paragraph style={{ margin: 0, fontSize: 13, color: '#595959' }}>
                          {tip.content}
                        </Paragraph>
                        {tip.action_url && (
                          <Button type="link" size="small" style={{ padding: 0, marginTop: 8 }}>
                            {t('performance.learn_more', 'Learn More')} <RightOutlined />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </Carousel>
              </Card>
            )}
          </Col>
        </Row>
      )}

      <style>{`
        .coaching-dots {
          bottom: 0 !important;
        }
        .coaching-dots li button {
          background: #52c41a !important;
        }
        .coaching-dots li.slick-active button {
          background: #237804 !important;
        }
      `}</style>
    </div>
  );
}

export default PerformanceDashboard;
