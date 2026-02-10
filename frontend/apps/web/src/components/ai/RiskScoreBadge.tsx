/**
 * RiskScoreBadge - Reusable risk score display component
 * Displays a risk score with color-coded badge and optional progress bar
 */

import { Progress, Tag, Tooltip, Space } from 'antd';
import { AlertOutlined } from '@ant-design/icons';
import type { RiskLevel } from '@inspection/shared/src/types/ai-base.types';

interface RiskScoreBadgeProps {
  score: number;
  level: RiskLevel;
  showScore?: boolean;
  showLabel?: boolean;
  showProgress?: boolean;
  size?: 'small' | 'default' | 'large';
  style?: React.CSSProperties;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#ff7a45',
  critical: '#ff4d4f',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};

export function RiskScoreBadge({
  score,
  level,
  showScore = true,
  showLabel = true,
  showProgress = false,
  size = 'default',
  style,
}: RiskScoreBadgeProps) {
  const color = RISK_COLORS[level];
  const label = RISK_LABELS[level];

  if (showProgress) {
    return (
      <Tooltip title={`${label}: ${score}/100`}>
        <Space direction="vertical" size={4} style={{ width: '100%', ...style }}>
          <Space>
            <AlertOutlined style={{ color }} />
            {showLabel && <span style={{ color }}>{label}</span>}
            {showScore && <span style={{ color, fontWeight: 'bold' }}>{score}/100</span>}
          </Space>
          <Progress
            percent={score}
            size={size === 'large' ? 'default' : size}
            strokeColor={color}
            showInfo={false}
            status={score >= 75 ? 'exception' : score >= 50 ? 'normal' : 'success'}
          />
        </Space>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`Risk Score: ${score}/100`}>
      <Tag
        color={color}
        style={{
          fontSize: size === 'small' ? 11 : size === 'large' ? 14 : 12,
          padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
          ...style,
        }}
      >
        <AlertOutlined style={{ marginRight: 4 }} />
        {showScore && `${score} `}
        {showLabel && `(${level})`}
      </Tag>
    </Tooltip>
  );
}

export default RiskScoreBadge;
