import React from 'react';
import { Tag, Tooltip, Progress, Space, Typography } from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface RiskIndicatorProps {
  riskScore?: number;
  level?: 'critical' | 'high' | 'medium' | 'low';
  showLabel?: boolean;
  showProgress?: boolean;
  size?: 'small' | 'default' | 'large';
  showIcon?: boolean;
  tooltipText?: string;
}

type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

const getRiskLevel = (score: number): RiskLevel => {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

const getRiskConfig = (level: RiskLevel) => {
  switch (level) {
    case 'critical':
      return {
        color: '#cf1322',
        tagColor: 'red',
        label: 'Critical Risk',
        icon: <ExclamationCircleOutlined />,
      };
    case 'high':
      return {
        color: '#fa541c',
        tagColor: 'volcano',
        label: 'High Risk',
        icon: <WarningOutlined />,
      };
    case 'medium':
      return {
        color: '#faad14',
        tagColor: 'orange',
        label: 'Medium Risk',
        icon: <InfoCircleOutlined />,
      };
    case 'low':
      return {
        color: '#52c41a',
        tagColor: 'green',
        label: 'Low Risk',
        icon: <CheckCircleOutlined />,
      };
    default:
      return {
        color: '#8c8c8c',
        tagColor: 'default',
        label: 'Unknown',
        icon: <InfoCircleOutlined />,
      };
  }
};

export const RiskIndicator: React.FC<RiskIndicatorProps> = ({
  riskScore,
  level: levelProp,
  showLabel = true,
  showProgress = false,
  size = 'default',
  showIcon = true,
  tooltipText,
}) => {
  const level = levelProp || getRiskLevel(riskScore ?? 0);
  const config = getRiskConfig(level);

  const progressWidth = size === 'small' ? 40 : size === 'large' ? 80 : 60;
  const fontSize = size === 'small' ? 10 : size === 'large' ? 14 : 12;

  const content = showProgress ? (
    <Space direction="vertical" align="center" size={4}>
      <Progress
        type="circle"
        percent={riskScore}
        width={progressWidth}
        strokeColor={config.color}
        format={(percent) => (
          <span style={{ fontSize, color: config.color, fontWeight: 'bold' }}>
            {percent}
          </span>
        )}
      />
      {showLabel && (
        <Text style={{ fontSize: fontSize - 2, color: config.color }}>
          {config.label}
        </Text>
      )}
    </Space>
  ) : (
    <Tag
      color={config.tagColor}
      icon={showIcon ? config.icon : undefined}
      style={{
        fontSize: size === 'small' ? 10 : size === 'large' ? 14 : 12,
        padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
      }}
    >
      {showLabel ? config.label : riskScore}
    </Tag>
  );

  if (tooltipText) {
    return <Tooltip title={tooltipText}>{content}</Tooltip>;
  }

  return content;
};

// Compact version for use in tables
export const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  return <RiskIndicator riskScore={score} showLabel={false} size="small" />;
};

// Detailed version for cards/panels
export const RiskGauge: React.FC<{
  score: number;
  label?: string;
  description?: string;
}> = ({ score, label, description }) => {
  const level = getRiskLevel(score);
  const config = getRiskConfig(level);

  return (
    <Space direction="vertical" align="center" style={{ width: '100%' }}>
      <Progress
        type="dashboard"
        percent={score}
        strokeColor={config.color}
        format={(percent) => (
          <Space direction="vertical" align="center" size={0}>
            <span style={{ fontSize: 24, fontWeight: 'bold', color: config.color }}>
              {percent}
            </span>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>Risk Score</span>
          </Space>
        )}
      />
      {label && <Text strong>{label}</Text>}
      {description && <Text type="secondary">{description}</Text>}
    </Space>
  );
};
