import React from 'react';
import { Card, Typography, Tooltip, Space, Tag, Progress } from 'antd';
import {
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface RiskFactor {
  name: string;
  value: number;
  weight: number;
  description?: string;
}

export interface RiskScoreGaugeProps {
  score: number;
  factors?: RiskFactor[];
  showFactors?: boolean;
  size?: 'small' | 'default' | 'large';
  className?: string;
}

const getRiskLevel = (score: number): { level: string; color: string; bgColor: string } => {
  if (score >= 80) return { level: 'Critical', color: '#cf1322', bgColor: '#fff1f0' };
  if (score >= 60) return { level: 'High', color: '#ff4d4f', bgColor: '#fff2e8' };
  if (score >= 40) return { level: 'Medium', color: '#fa8c16', bgColor: '#fffbe6' };
  if (score >= 20) return { level: 'Low', color: '#faad14', bgColor: '#f6ffed' };
  return { level: 'Minimal', color: '#52c41a', bgColor: '#f6ffed' };
};

const getRiskIcon = (score: number) => {
  if (score >= 80) return <ExclamationCircleOutlined style={{ color: '#cf1322' }} />;
  if (score >= 60) return <WarningOutlined style={{ color: '#ff4d4f' }} />;
  if (score >= 40) return <WarningOutlined style={{ color: '#fa8c16' }} />;
  if (score >= 20) return <InfoCircleOutlined style={{ color: '#faad14' }} />;
  return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
};

export function RiskScoreGauge({
  score,
  factors = [],
  showFactors = true,
  size = 'default',
  className,
}: RiskScoreGaugeProps) {
  const { t } = useTranslation();
  const riskLevel = getRiskLevel(score);

  const gaugeSize = size === 'small' ? 80 : size === 'large' ? 150 : 120;
  const strokeWidth = size === 'small' ? 8 : size === 'large' ? 12 : 10;

  // Calculate circumference for SVG gauge
  const radius = (gaugeSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  // Gradient colors based on score position
  const getGradientColors = () => {
    return [
      { offset: '0%', color: '#52c41a' },
      { offset: '25%', color: '#faad14' },
      { offset: '50%', color: '#fa8c16' },
      { offset: '75%', color: '#ff4d4f' },
      { offset: '100%', color: '#cf1322' },
    ];
  };

  return (
    <div className={`flex flex-col items-center ${className || ''}`}>
      {/* Circular Gauge */}
      <div className="relative" style={{ width: gaugeSize, height: gaugeSize }}>
        <svg
          width={gaugeSize}
          height={gaugeSize}
          className="transform -rotate-90"
        >
          <defs>
            <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              {getGradientColors().map((stop, idx) => (
                <stop key={idx} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            cx={gaugeSize / 2}
            cy={gaugeSize / 2}
            r={radius}
            fill="none"
            stroke="#f0f0f0"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={gaugeSize / 2}
            cy={gaugeSize / 2}
            r={radius}
            fill="none"
            stroke={riskLevel.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out',
            }}
          />
        </svg>

        {/* Center content */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'transparent' }}
        >
          <Text
            strong
            style={{
              fontSize: size === 'small' ? 18 : size === 'large' ? 32 : 24,
              color: riskLevel.color,
              lineHeight: 1,
            }}
          >
            {Math.round(score)}
          </Text>
          <Text
            type="secondary"
            style={{
              fontSize: size === 'small' ? 10 : size === 'large' ? 14 : 12,
            }}
          >
            /100
          </Text>
        </div>
      </div>

      {/* Risk Level Label */}
      <div className="mt-2 flex items-center gap-1">
        {getRiskIcon(score)}
        <Tag
          color={riskLevel.color}
          style={{ margin: 0 }}
        >
          {t(`defects.risk.${riskLevel.level.toLowerCase()}`, riskLevel.level)}
        </Tag>
      </div>

      {/* Risk Factors */}
      {showFactors && factors.length > 0 && (
        <Card
          size="small"
          className="mt-3 w-full"
          style={{ backgroundColor: '#fafafa' }}
          bodyStyle={{ padding: '8px 12px' }}
        >
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {t('defects.risk.factors', 'Contributing Factors')}
          </Text>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {factors.map((factor, idx) => (
              <Tooltip key={idx} title={factor.description}>
                <div className="flex items-center justify-between">
                  <Text style={{ fontSize: 11 }}>
                    {factor.name}
                    <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
                      ({Math.round(factor.weight * 100)}%)
                    </Text>
                  </Text>
                  <Progress
                    percent={factor.value}
                    size="small"
                    showInfo={false}
                    style={{ width: 60, margin: 0 }}
                    strokeColor={getRiskLevel(factor.value).color}
                  />
                </div>
              </Tooltip>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
}

export default RiskScoreGauge;
