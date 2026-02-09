import { Progress, Typography, Space, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import TierBadge from './TierBadge';
import type { Tier } from '@inspection/shared';

const { Text } = Typography;

export interface LevelProgressProps {
  level: number;
  currentXp: number;
  xpToNext: number;
  tier: Tier;
  showTier?: boolean;
  compact?: boolean;
}

export function LevelProgress({
  level,
  currentXp,
  xpToNext,
  tier,
  showTier = true,
  compact = false,
}: LevelProgressProps) {
  const { t } = useTranslation();

  const progress = xpToNext > 0 ? Math.round((currentXp / (currentXp + xpToNext)) * 100) : 100;

  if (compact) {
    return (
      <Tooltip title={t('leaderboard.xp_to_level', { xp: xpToNext, level: level + 1 })}>
        <Space size={4}>
          <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
            Lv.{level}
          </Text>
          {showTier && <TierBadge tier={tier} showLabel={false} size="small" />}
          <Progress
            percent={progress}
            showInfo={false}
            size="small"
            style={{ width: 60, margin: 0 }}
            strokeColor="#1677ff"
          />
        </Space>
      </Tooltip>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space>
          <Text strong style={{ fontSize: 20, color: '#1677ff' }}>
            Level {level}
          </Text>
          {showTier && <TierBadge tier={tier} />}
        </Space>
        <Text type="secondary">
          {currentXp.toLocaleString()} / {(currentXp + xpToNext).toLocaleString()} XP
        </Text>
      </div>
      <Progress
        percent={progress}
        showInfo={false}
        strokeColor={{
          '0%': '#1677ff',
          '100%': '#52c41a',
        }}
        trailColor="#f0f0f0"
        style={{ marginBottom: 4 }}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('leaderboard.xp_to_level', { xp: xpToNext.toLocaleString(), level: level + 1 })}
      </Text>
    </div>
  );
}

export default LevelProgress;
