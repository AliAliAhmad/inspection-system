/**
 * PriorityBadge - Reusable priority display component
 */

import { Tag, Tooltip } from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { Priority } from '@inspection/shared/src/types/ai-base.types';

interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'default' | 'large';
  style?: React.CSSProperties;
}

const PRIORITY_CONFIG: Record<Priority, { color: string; icon: React.ReactNode; label: string }> = {
  info: {
    color: 'blue',
    icon: <InfoCircleOutlined />,
    label: 'Info',
  },
  low: {
    color: 'green',
    icon: <CheckCircleOutlined />,
    label: 'Low',
  },
  medium: {
    color: 'gold',
    icon: <ClockCircleOutlined />,
    label: 'Medium',
  },
  high: {
    color: 'orange',
    icon: <ExclamationCircleOutlined />,
    label: 'High',
  },
  critical: {
    color: 'red',
    icon: <WarningOutlined />,
    label: 'Critical',
  },
};

export function PriorityBadge({
  priority,
  showLabel = true,
  showIcon = true,
  size = 'default',
  style,
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];

  return (
    <Tooltip title={`Priority: ${config.label}`}>
      <Tag
        color={config.color}
        style={{
          fontSize: size === 'small' ? 11 : size === 'large' ? 14 : 12,
          padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
          ...style,
        }}
      >
        {showIcon && <span style={{ marginRight: showLabel ? 4 : 0 }}>{config.icon}</span>}
        {showLabel && config.label}
      </Tag>
    </Tooltip>
  );
}

export default PriorityBadge;
