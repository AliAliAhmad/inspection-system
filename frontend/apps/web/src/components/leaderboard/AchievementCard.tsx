import { Card, Progress, Typography, Space, Tag, Tooltip } from 'antd';
import { LockOutlined, CheckCircleOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { LeaderboardAchievement } from '@inspection/shared';

const { Text, Paragraph } = Typography;

export interface AchievementCardProps {
  achievement: LeaderboardAchievement;
  onClick?: () => void;
  compact?: boolean;
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
};

const CATEGORY_ICONS: Record<string, string> = {
  inspection: '\ud83d\udd0d',
  streak: '\ud83d\udd25',
  quality: '\u2b50',
  speed: '\u26a1',
  teamwork: '\ud83e\udd1d',
  milestone: '\ud83c\udfc6',
  special: '\ud83c\udf1f',
};

export function AchievementCard({ achievement, onClick, compact = false }: AchievementCardProps) {
  const { t, i18n } = useTranslation();

  const isEarned = !!achievement.earned_at;
  const hasProgress = achievement.progress !== undefined && achievement.target !== undefined;
  const progressPercent = hasProgress
    ? Math.min(100, Math.round((achievement.progress! / achievement.target!) * 100))
    : 0;

  const tierColor = TIER_COLORS[achievement.tier] || '#1677ff';
  const categoryIcon = CATEGORY_ICONS[achievement.category] || '\ud83c\udfc5';

  const displayName = i18n.language === 'ar' && achievement.name_ar
    ? achievement.name_ar
    : achievement.name;

  if (compact) {
    return (
      <Tooltip title={achievement.description}>
        <div
          onClick={onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${isEarned ? tierColor : '#d9d9d9'}`,
            background: isEarned ? `${tierColor}10` : '#f5f5f5',
            cursor: onClick ? 'pointer' : 'default',
            opacity: isEarned ? 1 : 0.6,
            filter: isEarned ? 'none' : 'grayscale(50%)',
          }}
        >
          <span style={{ fontSize: 20 }}>
            {isEarned ? achievement.icon || categoryIcon : '\ud83d\udd12'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong ellipsis style={{ display: 'block' }}>
              {displayName}
            </Text>
            {hasProgress && !isEarned && (
              <Progress
                percent={progressPercent}
                size="small"
                showInfo={false}
                strokeColor={tierColor}
              />
            )}
          </div>
          {isEarned && (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{
        borderColor: isEarned ? tierColor : '#d9d9d9',
        opacity: isEarned ? 1 : 0.8,
        filter: isEarned ? 'none' : 'grayscale(30%)',
      }}
      styles={{
        body: { padding: 16 },
      }}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: isEarned
              ? `linear-gradient(135deg, ${tierColor}30, ${tierColor}10)`
              : '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            position: 'relative',
          }}
        >
          {isEarned ? (
            achievement.icon || categoryIcon
          ) : achievement.is_hidden ? (
            '?'
          ) : (
            <LockOutlined style={{ color: '#8c8c8c', fontSize: 24 }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space style={{ marginBottom: 4 }}>
            <Text strong style={{ fontSize: 15 }}>
              {achievement.is_hidden && !isEarned ? '???' : displayName}
            </Text>
            <Tag
              style={{
                backgroundColor: `${tierColor}20`,
                borderColor: tierColor,
                color: tierColor,
                textTransform: 'capitalize',
              }}
            >
              {achievement.tier}
            </Tag>
          </Space>

          <Paragraph
            type="secondary"
            ellipsis={{ rows: 2 }}
            style={{ marginBottom: 8, fontSize: 12 }}
          >
            {achievement.is_hidden && !isEarned
              ? t('leaderboard.hidden_achievement', 'Complete hidden criteria to unlock')
              : achievement.description}
          </Paragraph>

          {/* Progress or Earned Date */}
          {isEarned ? (
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t('leaderboard.earned', 'Earned')}{' '}
                {dayjs(achievement.earned_at).format('MMM D, YYYY')}
              </Text>
            </Space>
          ) : hasProgress ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('leaderboard.progress', 'Progress')}
                </Text>
                <Text style={{ fontSize: 11 }}>
                  {achievement.progress} / {achievement.target}
                </Text>
              </div>
              <Progress
                percent={progressPercent}
                size="small"
                strokeColor={tierColor}
              />
            </div>
          ) : null}

          {/* Points reward */}
          <div style={{ marginTop: 8 }}>
            <Tag icon={<TrophyOutlined />} color="gold">
              +{achievement.points_reward} pts
            </Tag>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default AchievementCard;
