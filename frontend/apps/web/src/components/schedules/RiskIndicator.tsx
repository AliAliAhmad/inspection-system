import { Tag, Tooltip } from 'antd';
import {
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

export interface RiskIndicatorProps {
  level: 'critical' | 'high' | 'medium' | 'low';
  factors?: {
    age_factor?: number;
    failure_history_factor?: number;
    criticality_factor?: number;
    maintenance_gap_factor?: number;
  };
  tooltip?: string;
  size?: 'small' | 'default';
}

const RISK_CONFIG = {
  critical: {
    color: '#ff4d4f',
    icon: <ThunderboltOutlined />,
    label: 'Critical',
  },
  high: {
    color: '#fa8c16',
    icon: <ExclamationCircleOutlined />,
    label: 'High',
  },
  medium: {
    color: '#faad14',
    icon: <WarningOutlined />,
    label: 'Medium',
  },
  low: {
    color: '#52c41a',
    icon: <InfoCircleOutlined />,
    label: 'Low',
  },
};

export function RiskIndicator({ level, factors, tooltip, size = 'default' }: RiskIndicatorProps) {
  const config = RISK_CONFIG[level];

  // Build tooltip content
  let tooltipContent = tooltip;
  if (!tooltipContent && factors) {
    const factorEntries = Object.entries(factors)
      .filter(([_, value]) => value !== undefined && value > 0)
      .map(([key, value]) => {
        const label = key
          .replace(/_/g, ' ')
          .replace(/factor/i, '')
          .trim();
        return `${label}: ${(value * 100).toFixed(0)}%`;
      });

    if (factorEntries.length > 0) {
      tooltipContent = (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Risk Factors:</div>
          {factorEntries.map((entry, idx) => (
            <div key={idx} style={{ fontSize: 12 }}>
              {entry}
            </div>
          ))}
        </div>
      );
    }
  }

  const tag = (
    <Tag
      color={
        level === 'critical'
          ? 'error'
          : level === 'high'
          ? 'warning'
          : level === 'medium'
          ? 'gold'
          : 'success'
      }
      icon={config.icon}
      style={{
        fontSize: size === 'small' ? 11 : 12,
        padding: size === 'small' ? '0 4px' : undefined,
      }}
    >
      {config.label}
    </Tag>
  );

  if (tooltipContent) {
    return <Tooltip title={tooltipContent}>{tag}</Tooltip>;
  }

  return tag;
}

export default RiskIndicator;
