/**
 * SeverityBadge - Reusable severity display component
 */

import { Tag, Tooltip } from 'antd';
import {
  WarningOutlined,
  AlertOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { Severity } from '@inspection/shared/src/types/ai-base.types';

interface SeverityBadgeProps {
  severity: Severity;
  showLabel?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'default' | 'large';
  style?: React.CSSProperties;
}

const SEVERITY_CONFIG: Record<Severity, { color: string; icon: React.ReactNode; label: string }> = {
  low: {
    color: 'green',
    icon: <InfoCircleOutlined />,
    label: 'Low',
  },
  medium: {
    color: 'gold',
    icon: <AlertOutlined />,
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

export function SeverityBadge({
  severity,
  showLabel = true,
  showIcon = true,
  size = 'default',
  style,
}: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];

  return (
    <Tooltip title={`Severity: ${config.label}`}>
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

export default SeverityBadge;
