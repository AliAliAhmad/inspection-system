/**
 * TrendIndicator - Reusable trend direction indicator
 */

import { Space, Tooltip, Typography } from 'antd';
import { RiseOutlined, FallOutlined, MinusOutlined } from '@ant-design/icons';
import type { TrendDirection } from '@inspection/shared/src/types/ai-base.types';

const { Text } = Typography;

interface TrendIndicatorProps {
  direction: TrendDirection;
  changePercentage: number;
  label?: string;
  showValue?: boolean;
  showArrow?: boolean;
  size?: 'small' | 'default' | 'large';
  invertColors?: boolean; // For metrics where decrease is good (e.g., defects)
  style?: React.CSSProperties;
}

const TREND_CONFIG: Record<TrendDirection, { icon: React.ReactNode; color: string; negColor: string }> = {
  up: {
    icon: <RiseOutlined />,
    color: '#52c41a',
    negColor: '#ff4d4f',
  },
  down: {
    icon: <FallOutlined />,
    color: '#ff4d4f',
    negColor: '#52c41a',
  },
  flat: {
    icon: <MinusOutlined />,
    color: '#8c8c8c',
    negColor: '#8c8c8c',
  },
};

export function TrendIndicator({
  direction,
  changePercentage,
  label,
  showValue = true,
  showArrow = true,
  size = 'default',
  invertColors = false,
  style,
}: TrendIndicatorProps) {
  const config = TREND_CONFIG[direction];
  const color = invertColors ? config.negColor : config.color;
  const fontSize = size === 'small' ? 12 : size === 'large' ? 16 : 14;

  const tooltipText = label
    ? `${label}: ${changePercentage > 0 ? '+' : ''}${changePercentage.toFixed(1)}%`
    : `${changePercentage > 0 ? '+' : ''}${changePercentage.toFixed(1)}%`;

  return (
    <Tooltip title={tooltipText}>
      <Space size={4} style={{ color, fontSize, ...style }}>
        {showArrow && <span>{config.icon}</span>}
        {showValue && (
          <Text style={{ color, fontSize }}>
            {changePercentage > 0 ? '+' : ''}{Math.abs(changePercentage).toFixed(1)}%
          </Text>
        )}
        {label && <Text style={{ color, fontSize }}>{label}</Text>}
      </Space>
    </Tooltip>
  );
}

export default TrendIndicator;
