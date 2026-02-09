import { Typography, Tooltip } from 'antd';
import { CaretUpOutlined, CaretDownOutlined, MinusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface RankChangeBadgeProps {
  change: number;
  showTooltip?: boolean;
  size?: 'small' | 'default' | 'large';
}

export function RankChangeBadge({ change, showTooltip = true, size = 'default' }: RankChangeBadgeProps) {
  const { t } = useTranslation();

  const fontSize = size === 'small' ? 11 : size === 'large' ? 16 : 13;
  const iconSize = size === 'small' ? 10 : size === 'large' ? 14 : 12;

  if (change === 0) {
    return (
      <Text type="secondary" style={{ fontSize, display: 'inline-flex', alignItems: 'center' }}>
        <MinusOutlined style={{ fontSize: iconSize }} />
      </Text>
    );
  }

  const isUp = change > 0;
  const color = isUp ? '#52c41a' : '#f5222d';
  const Icon = isUp ? CaretUpOutlined : CaretDownOutlined;
  const tooltipText = isUp
    ? t('leaderboard.rank_up', { count: change })
    : t('leaderboard.rank_down', { count: Math.abs(change) });

  const content = (
    <Text
      style={{
        color,
        fontSize,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <Icon style={{ fontSize: iconSize }} />
      <span>{Math.abs(change)}</span>
    </Text>
  );

  if (showTooltip) {
    return <Tooltip title={tooltipText}>{content}</Tooltip>;
  }

  return content;
}

export default RankChangeBadge;
