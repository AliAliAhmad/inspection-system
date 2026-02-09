import { Typography, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface StreakBadgeProps {
  streak: number;
  showLabel?: boolean;
  size?: 'small' | 'default' | 'large';
  animated?: boolean;
}

export function StreakBadge({
  streak,
  showLabel = true,
  size = 'default',
  animated = true,
}: StreakBadgeProps) {
  const { t } = useTranslation();

  const fontSize = size === 'small' ? 12 : size === 'large' ? 18 : 14;
  const iconSize = size === 'small' ? 14 : size === 'large' ? 22 : 16;

  const isActive = streak > 0;

  const content = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        backgroundColor: isActive ? '#fff7e6' : '#f5f5f5',
        border: `1px solid ${isActive ? '#ffa940' : '#d9d9d9'}`,
      }}
    >
      <span
        style={{
          fontSize: iconSize,
          filter: isActive ? 'none' : 'grayscale(100%)',
          animation: animated && isActive ? 'pulse 2s infinite' : 'none',
        }}
      >
        {'\ud83d\udd25'}
      </span>
      <Text
        strong={isActive}
        style={{
          fontSize,
          color: isActive ? '#fa541c' : '#8c8c8c',
        }}
      >
        {streak}
        {showLabel && (
          <span style={{ fontWeight: 400, marginLeft: 4 }}>
            {t('leaderboard.days', 'days')}
          </span>
        )}
      </Text>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </span>
  );

  if (!showLabel) {
    return (
      <Tooltip title={t('leaderboard.days_streak', { days: streak })}>
        {content}
      </Tooltip>
    );
  }

  return content;
}

export default StreakBadge;
