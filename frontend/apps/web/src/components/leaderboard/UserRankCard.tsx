import { Card, Typography, Space, Avatar, Statistic, Row, Col, Divider } from 'antd';
import { TrophyOutlined, FireOutlined, StarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import TierBadge from './TierBadge';
import RankChangeBadge from './RankChangeBadge';
import StreakBadge from './StreakBadge';
import LevelProgress from './LevelProgress';
import type { LeaderboardEntry, UserStats, Tier } from '@inspection/shared';

const { Text, Title } = Typography;

export interface UserRankCardProps {
  entry: LeaderboardEntry;
  stats?: UserStats;
  totalUsers: number;
  loading?: boolean;
}

export function UserRankCard({ entry, stats, totalUsers, loading }: UserRankCardProps) {
  const { t } = useTranslation();

  const pointsToNextRank = stats?.total_points
    ? Math.ceil(stats.total_points * 0.1)
    : undefined;

  return (
    <Card
      loading={loading}
      style={{
        background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
        borderRadius: 12,
        marginBottom: 16,
      }}
      styles={{ body: { padding: 20 } }}
    >
      <Row gutter={[24, 16]} align="middle">
        <Col xs={24} sm={8}>
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <Avatar
              size={72}
              style={{
                backgroundColor: '#fff',
                color: '#1677ff',
                fontSize: 28,
                fontWeight: 700,
                border: '3px solid rgba(255,255,255,0.3)',
              }}
            >
              {entry.full_name.charAt(0)}
            </Avatar>
            <Text
              strong
              style={{ color: '#fff', fontSize: 18, textAlign: 'center', display: 'block' }}
            >
              {entry.full_name}
            </Text>
            <TierBadge tier={entry.tier} size="default" />
          </Space>
        </Col>

        <Col xs={24} sm={16}>
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <TrophyOutlined style={{ fontSize: 24, color: '#ffd700', marginBottom: 4 }} />
                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                  #{entry.rank}
                </Title>
                <Space size={4}>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                    {t('leaderboard.of', 'of')} {totalUsers}
                  </Text>
                  {entry.rank_change !== undefined && entry.rank_change !== 0 && (
                    <RankChangeBadge change={entry.rank_change} size="small" />
                  )}
                </Space>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <StarOutlined style={{ fontSize: 24, color: '#fadb14', marginBottom: 4 }} />
                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                  {entry.total_points.toLocaleString()}
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {t('leaderboard.points', 'Points')}
                </Text>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <FireOutlined style={{ fontSize: 24, color: '#fa541c', marginBottom: 4 }} />
                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                  {entry.current_streak}
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  {t('leaderboard.streak', 'Streak')}
                </Text>
              </div>
            </Col>
          </Row>

          {stats && (
            <>
              <Divider style={{ margin: '16px 0', borderColor: 'rgba(255,255,255,0.2)' }} />
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12 }}>
                <LevelProgress
                  level={stats.level}
                  currentXp={stats.current_xp}
                  xpToNext={stats.xp_to_next}
                  tier={entry.tier}
                  showTier={false}
                  compact
                />
              </div>
            </>
          )}

          {pointsToNextRank && (
            <Text
              style={{
                color: 'rgba(255,255,255,0.8)',
                fontSize: 12,
                display: 'block',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              {t('leaderboard.points_to_next', { points: pointsToNextRank })}
            </Text>
          )}
        </Col>
      </Row>
    </Card>
  );
}

export default UserRankCard;
