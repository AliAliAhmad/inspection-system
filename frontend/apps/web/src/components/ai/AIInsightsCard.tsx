/**
 * AIInsightsCard - Reusable AI insights display card
 * A wrapper component that provides consistent styling and behavior for AI features
 */

import { Card, Skeleton, Alert, Space, Typography, Badge, Tooltip, Avatar } from 'antd';
import {
  RobotOutlined,
  AlertOutlined,
  BulbOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AIInsight, RiskLevel, Severity } from '@inspection/shared/src/types/ai-base.types';

const { Text, Title } = Typography;

interface AIInsightsCardProps {
  title?: string;
  loading?: boolean;
  error?: string | null;
  insights?: AIInsight[];
  riskScore?: number;
  riskLevel?: RiskLevel;
  compact?: boolean;
  showHeader?: boolean;
  borderColor?: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

const INSIGHT_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  risk: { icon: <AlertOutlined />, color: '#ff4d4f' },
  anomaly: { icon: <WarningOutlined />, color: '#ff7a45' },
  prediction: { icon: <ThunderboltOutlined />, color: '#722ed1' },
  recommendation: { icon: <BulbOutlined />, color: '#52c41a' },
  trend: { icon: <LineChartOutlined />, color: '#1890ff' },
  info: { icon: <InfoCircleOutlined />, color: '#8c8c8c' },
  warning: { icon: <WarningOutlined />, color: '#faad14' },
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function AIInsightsCard({
  title = 'AI Insights',
  loading = false,
  error = null,
  insights = [],
  riskScore,
  riskLevel,
  compact = false,
  showHeader = true,
  borderColor = '#722ed1',
  extra,
  children,
  style,
}: AIInsightsCardProps) {
  const { t } = useTranslation();

  // Sort insights by severity (critical first)
  const sortedInsights = [...insights].sort((a, b) => {
    const aSeverity = a.severity || 'low';
    const bSeverity = b.severity || 'low';
    return (SEVERITY_ORDER[aSeverity] || 3) - (SEVERITY_ORDER[bSeverity] || 3);
  });

  // Count critical/high priority insights
  const criticalCount = insights.filter(
    (i) => i.severity === 'critical' || i.priority === 'critical'
  ).length;
  const highCount = insights.filter(
    (i) => i.severity === 'high' || i.priority === 'high'
  ).length;

  const renderInsightIcon = (type: string, size: 'small' | 'default' = 'default') => {
    const config = INSIGHT_TYPE_CONFIG[type] || INSIGHT_TYPE_CONFIG.info;
    return (
      <Avatar
        icon={config.icon}
        style={{ backgroundColor: config.color }}
        size={size === 'small' ? 24 : 32}
      />
    );
  };

  const cardTitle = showHeader ? (
    <Space>
      <RobotOutlined style={{ color: borderColor }} />
      <span>{title}</span>
      {criticalCount > 0 && (
        <Badge count={criticalCount} style={{ backgroundColor: '#ff4d4f' }} />
      )}
      {highCount > 0 && criticalCount === 0 && (
        <Badge count={highCount} style={{ backgroundColor: '#ff7a45' }} />
      )}
      {riskScore !== undefined && riskLevel && (
        <Tooltip title={`Risk Score: ${riskScore}/100`}>
          <Badge
            count={`${riskLevel.toUpperCase()}`}
            style={{
              backgroundColor:
                riskLevel === 'critical' ? '#ff4d4f' :
                riskLevel === 'high' ? '#ff7a45' :
                riskLevel === 'medium' ? '#faad14' : '#52c41a',
            }}
          />
        </Tooltip>
      )}
    </Space>
  ) : null;

  if (loading) {
    return (
      <Card
        title={cardTitle}
        size={compact ? 'small' : 'default'}
        style={{ borderLeft: `4px solid ${borderColor}`, ...style }}
      >
        <Skeleton active paragraph={{ rows: compact ? 2 : 4 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={cardTitle}
        size={compact ? 'small' : 'default'}
        style={{ borderLeft: `4px solid ${borderColor}`, ...style }}
      >
        <Alert
          message={t('common.error', 'Error')}
          description={error}
          type="warning"
          showIcon
          icon={<RobotOutlined />}
        />
      </Card>
    );
  }

  if (children) {
    return (
      <Card
        title={cardTitle}
        extra={extra}
        size={compact ? 'small' : 'default'}
        style={{ borderLeft: `4px solid ${borderColor}`, ...style }}
      >
        {children}
      </Card>
    );
  }

  if (sortedInsights.length === 0) {
    return (
      <Card
        title={cardTitle}
        size={compact ? 'small' : 'default'}
        style={{ borderLeft: `4px solid ${borderColor}`, ...style }}
      >
        <Text type="secondary">
          {t('ai.no_insights', 'No AI insights available at this time.')}
        </Text>
      </Card>
    );
  }

  return (
    <Card
      title={cardTitle}
      extra={extra}
      size={compact ? 'small' : 'default'}
      style={{ borderLeft: `4px solid ${borderColor}`, ...style }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={compact ? 'small' : 'middle'}>
        {sortedInsights.slice(0, compact ? 3 : undefined).map((insight, index) => (
          <div
            key={insight.id || index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: compact ? '4px 0' : '8px 0',
              borderBottom: index < sortedInsights.length - 1 ? '1px solid #f0f0f0' : undefined,
            }}
          >
            {renderInsightIcon(insight.type, compact ? 'small' : 'default')}
            <div style={{ flex: 1 }}>
              <Text strong style={{ fontSize: compact ? 13 : 14 }}>
                {insight.title}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: compact ? 12 : 13 }}>
                {insight.description}
              </Text>
              {insight.action && !compact && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Action: {insight.action.replace(/_/g, ' ')}
                  </Text>
                </div>
              )}
            </div>
          </div>
        ))}
        {compact && sortedInsights.length > 3 && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            +{sortedInsights.length - 3} more insights
          </Text>
        )}
      </Space>
    </Card>
  );
}

export default AIInsightsCard;
