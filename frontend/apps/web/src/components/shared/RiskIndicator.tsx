import { Tag, Tooltip } from 'antd';
import { WarningOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskIndicatorProps {
  level: RiskLevel;
  score?: number; // 0-100 risk score
  showScore?: boolean;
  showIcon?: boolean;
  size?: 'small' | 'default';
}

export function RiskIndicator({
  level,
  score,
  showScore = false,
  showIcon = true,
  size = 'default',
}: RiskIndicatorProps) {
  const { t } = useTranslation();

  const config: Record<RiskLevel, { color: string; icon: React.ReactNode; label: string }> = {
    low: {
      color: 'green',
      icon: <CheckCircleOutlined />,
      label: t('equipmentAI.lowRisk', 'Low Risk'),
    },
    medium: {
      color: 'orange',
      icon: <ExclamationCircleOutlined />,
      label: t('equipmentAI.mediumRisk', 'Medium Risk'),
    },
    high: {
      color: 'volcano',
      icon: <WarningOutlined />,
      label: t('equipmentAI.highRisk', 'High Risk'),
    },
    critical: {
      color: 'red',
      icon: <WarningOutlined />,
      label: t('equipmentAI.criticalRisk', 'Critical Risk'),
    },
  };

  const { color, icon, label } = config[level];

  const displayText = showScore && score !== undefined ? `${score}` : label;
  const tooltipText = showScore && score !== undefined ? `${label} (${score}/100)` : label;

  return (
    <Tooltip title={tooltipText}>
      <Tag
        color={color}
        icon={showIcon ? icon : undefined}
        style={{
          fontSize: size === 'small' ? 11 : 13,
          margin: 0,
          padding: size === 'small' ? '0 4px' : '2px 8px',
        }}
      >
        {displayText}
      </Tag>
    </Tooltip>
  );
}

// Helper function to convert score to risk level
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}
