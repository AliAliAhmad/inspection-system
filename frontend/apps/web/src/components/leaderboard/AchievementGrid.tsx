import { Row, Col, Typography, Segmented, Empty, Spin, Modal, Space, Progress, Tag } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrophyOutlined, LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
import AchievementCard from './AchievementCard';
import type { LeaderboardAchievement } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface AchievementGridProps {
  achievements: LeaderboardAchievement[];
  loading?: boolean;
}

type FilterType = 'all' | 'earned' | 'in_progress' | 'locked';

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
};

export function AchievementGrid({ achievements, loading = false }: AchievementGridProps) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedAchievement, setSelectedAchievement] = useState<LeaderboardAchievement | null>(null);

  const earnedCount = achievements.filter((a) => a.earned_at).length;
  const inProgressCount = achievements.filter(
    (a) => !a.earned_at && a.progress !== undefined && a.progress > 0
  ).length;
  const lockedCount = achievements.filter(
    (a) => !a.earned_at && (!a.progress || a.progress === 0)
  ).length;

  const filteredAchievements = achievements.filter((achievement) => {
    switch (filter) {
      case 'earned':
        return !!achievement.earned_at;
      case 'in_progress':
        return !achievement.earned_at && achievement.progress !== undefined && achievement.progress > 0;
      case 'locked':
        return !achievement.earned_at && (!achievement.progress || achievement.progress === 0);
      default:
        return true;
    }
  });

  const filterOptions = [
    { label: `${t('leaderboard.all', 'All')} (${achievements.length})`, value: 'all' },
    { label: `${t('leaderboard.earned', 'Earned')} (${earnedCount})`, value: 'earned' },
    { label: `${t('leaderboard.in_progress', 'In Progress')} (${inProgressCount})`, value: 'in_progress' },
    { label: `${t('leaderboard.locked', 'Locked')} (${lockedCount})`, value: 'locked' },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <TrophyOutlined style={{ fontSize: 20, color: '#ffd700' }} />
          <Text strong style={{ fontSize: 16 }}>
            {earnedCount} / {achievements.length} {t('leaderboard.unlocked', 'Unlocked')}
          </Text>
        </Space>

        <Segmented
          value={filter}
          onChange={(val) => setFilter(val as FilterType)}
          options={filterOptions}
          size="small"
        />
      </div>

      {/* Progress bar */}
      <Progress
        percent={Math.round((earnedCount / achievements.length) * 100)}
        strokeColor="#ffd700"
        style={{ marginBottom: 24 }}
      />

      {/* Grid */}
      {filteredAchievements.length === 0 ? (
        <Empty description={t('leaderboard.no_achievements', 'No achievements found')} />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredAchievements.map((achievement) => (
            <Col xs={24} sm={12} lg={8} key={achievement.id}>
              <AchievementCard
                achievement={achievement}
                onClick={() => setSelectedAchievement(achievement)}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* Detail Modal */}
      <Modal
        open={!!selectedAchievement}
        onCancel={() => setSelectedAchievement(null)}
        footer={null}
        width={400}
        title={null}
      >
        {selectedAchievement && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                background: selectedAchievement.earned_at
                  ? `linear-gradient(135deg, ${TIER_COLORS[selectedAchievement.tier]}40, ${TIER_COLORS[selectedAchievement.tier]}10)`
                  : '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                margin: '0 auto 16px',
                filter: selectedAchievement.earned_at ? 'none' : 'grayscale(50%)',
              }}
            >
              {selectedAchievement.earned_at ? (
                selectedAchievement.icon || '\ud83c\udfc5'
              ) : (
                <LockOutlined style={{ color: '#8c8c8c', fontSize: 32 }} />
              )}
            </div>

            <Title level={4} style={{ marginBottom: 8 }}>
              {selectedAchievement.is_hidden && !selectedAchievement.earned_at
                ? '???'
                : i18n.language === 'ar' && selectedAchievement.name_ar
                ? selectedAchievement.name_ar
                : selectedAchievement.name}
            </Title>

            <Tag
              style={{
                backgroundColor: `${TIER_COLORS[selectedAchievement.tier]}20`,
                borderColor: TIER_COLORS[selectedAchievement.tier],
                color: TIER_COLORS[selectedAchievement.tier],
                textTransform: 'capitalize',
                marginBottom: 16,
              }}
            >
              {selectedAchievement.tier} Tier
            </Tag>

            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {selectedAchievement.is_hidden && !selectedAchievement.earned_at
                ? t('leaderboard.hidden_achievement', 'Complete hidden criteria to unlock')
                : selectedAchievement.description}
            </Paragraph>

            {selectedAchievement.earned_at ? (
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
                <Text type="success">
                  {t('leaderboard.earned_on', 'Earned on')}{' '}
                  {new Date(selectedAchievement.earned_at).toLocaleDateString()}
                </Text>
              </Space>
            ) : selectedAchievement.progress !== undefined && selectedAchievement.target !== undefined ? (
              <div>
                <Text type="secondary">
                  {t('leaderboard.progress', 'Progress')}: {selectedAchievement.progress} / {selectedAchievement.target}
                </Text>
                <Progress
                  percent={Math.round((selectedAchievement.progress / selectedAchievement.target) * 100)}
                  strokeColor={TIER_COLORS[selectedAchievement.tier]}
                  style={{ marginTop: 8 }}
                />
              </div>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <Tag icon={<TrophyOutlined />} color="gold" style={{ fontSize: 14, padding: '4px 12px' }}>
                +{selectedAchievement.points_reward} {t('leaderboard.points', 'Points')}
              </Tag>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AchievementGrid;
