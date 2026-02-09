import { Card, Progress, Typography, Space, Tag, Button, Tooltip } from 'antd';
import {
  CalendarOutlined,
  TeamOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  FireOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Challenge } from '@inspection/shared';

const { Text, Paragraph } = Typography;

export interface ChallengeCardProps {
  challenge: Challenge;
  onJoin?: () => void;
  onLeave?: () => void;
  onViewDetails?: () => void;
  loading?: boolean;
}

const TYPE_CONFIG = {
  weekly: { color: '#1677ff', icon: <CalendarOutlined />, label: 'Weekly' },
  monthly: { color: '#722ed1', icon: <FireOutlined />, label: 'Monthly' },
  special: { color: '#eb2f96', icon: <StarOutlined />, label: 'Special' },
};

export function ChallengeCard({
  challenge,
  onJoin,
  onLeave,
  onViewDetails,
  loading = false,
}: ChallengeCardProps) {
  const { t } = useTranslation();

  const typeConfig = TYPE_CONFIG[challenge.challenge_type];
  const progressPercent = challenge.my_progress !== undefined
    ? Math.min(100, Math.round((challenge.my_progress / challenge.target_value) * 100))
    : 0;
  const isCompleted = progressPercent >= 100;
  const isUrgent = challenge.days_remaining <= 2;

  return (
    <Card
      hoverable={!!onViewDetails}
      onClick={onViewDetails}
      style={{
        borderColor: isCompleted ? '#52c41a' : isUrgent ? '#faad14' : undefined,
        position: 'relative',
        overflow: 'hidden',
      }}
      styles={{
        body: { padding: 16 },
      }}
    >
      {/* Type badge */}
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <Tag
          color={typeConfig.color}
          icon={typeConfig.icon}
        >
          {t(`leaderboard.challenge_type.${challenge.challenge_type}`, typeConfig.label)}
        </Tag>
      </div>

      {/* Title and description */}
      <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 16, paddingRight: 80 }}>
          {challenge.name}
        </Text>
        <Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          style={{ marginBottom: 0, fontSize: 13 }}
        >
          {challenge.description}
        </Paragraph>
      </Space>

      {/* Progress */}
      {challenge.is_joined && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('leaderboard.progress', 'Progress')}
            </Text>
            <Text strong style={{ fontSize: 12 }}>
              {challenge.my_progress || 0} / {challenge.target_value}
            </Text>
          </div>
          <Progress
            percent={progressPercent}
            strokeColor={isCompleted ? '#52c41a' : typeConfig.color}
            showInfo={false}
          />
        </div>
      )}

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {/* Points reward */}
        <Tooltip title={t('leaderboard.points_reward', 'Points reward')}>
          <Tag icon={<TrophyOutlined />} color="gold">
            +{challenge.points_reward}
          </Tag>
        </Tooltip>

        {/* Days remaining */}
        <Tooltip title={t('leaderboard.days_remaining', 'Days remaining')}>
          <Tag
            icon={<ClockCircleOutlined />}
            color={isUrgent ? 'warning' : 'default'}
          >
            {challenge.days_remaining} {t('leaderboard.days', 'days')}
          </Tag>
        </Tooltip>

        {/* Participants */}
        <Tooltip title={t('leaderboard.participants', 'Participants')}>
          <Tag icon={<TeamOutlined />}>
            {challenge.participants_count}
          </Tag>
        </Tooltip>
      </div>

      {/* Action button */}
      <div onClick={(e) => e.stopPropagation()}>
        {challenge.is_joined ? (
          isCompleted ? (
            <Button
              type="primary"
              block
              disabled
              icon={<TrophyOutlined />}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              {t('leaderboard.completed', 'Completed!')}
            </Button>
          ) : (
            <Button
              block
              onClick={onLeave}
              loading={loading}
            >
              {t('leaderboard.leave_challenge', 'Leave Challenge')}
            </Button>
          )
        ) : (
          <Button
            type="primary"
            block
            icon={<ThunderboltOutlined />}
            onClick={onJoin}
            loading={loading}
          >
            {t('leaderboard.join_challenge', 'Join Challenge')}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default ChallengeCard;
