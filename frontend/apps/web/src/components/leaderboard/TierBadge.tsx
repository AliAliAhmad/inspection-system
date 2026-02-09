import { Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Tier } from '@inspection/shared';

const TIER_CONFIG: Record<Tier, { color: string; icon: string; bgColor: string }> = {
  bronze: { color: '#cd7f32', icon: '\ud83e\udd49', bgColor: '#fdf6e3' },
  silver: { color: '#c0c0c0', icon: '\ud83e\udd48', bgColor: '#f5f5f5' },
  gold: { color: '#ffd700', icon: '\ud83e\udd47', bgColor: '#fffbe6' },
  platinum: { color: '#e5e4e2', icon: '\ud83d\udc8e', bgColor: '#f0f5ff' },
  diamond: { color: '#b9f2ff', icon: '\ud83d\udca0', bgColor: '#e6fffb' },
};

export interface TierBadgeProps {
  tier: Tier;
  showLabel?: boolean;
  size?: 'small' | 'default' | 'large';
}

export function TierBadge({ tier, showLabel = true, size = 'default' }: TierBadgeProps) {
  const { t } = useTranslation();
  const config = TIER_CONFIG[tier];

  const fontSize = size === 'small' ? 12 : size === 'large' ? 18 : 14;
  const iconSize = size === 'small' ? 14 : size === 'large' ? 22 : 16;

  const label = t(`leaderboard.tiers.${tier}`, tier);

  const content = (
    <Tag
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.color,
        color: config.color,
        fontSize,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
      }}
    >
      <span style={{ fontSize: iconSize }}>{config.icon}</span>
      {showLabel && <span style={{ textTransform: 'capitalize' }}>{label}</span>}
    </Tag>
  );

  if (!showLabel) {
    return (
      <Tooltip title={label}>
        {content}
      </Tooltip>
    );
  }

  return content;
}

export default TierBadge;
