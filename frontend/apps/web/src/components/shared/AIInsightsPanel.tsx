import { Card, List, Tag, Typography, Space, Button, Tooltip, Collapse, Empty, Spin, Progress } from 'antd';
import {
  BulbOutlined,
  RocketOutlined,
  WarningOutlined,
  TrophyOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  StarOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';

const { Text, Paragraph } = Typography;

export interface AIInsight {
  id: string | number;
  type: 'tip' | 'warning' | 'achievement' | 'opportunity' | 'trend' | 'suggestion';
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionUrl?: string;
  onAction?: () => void;
  metadata?: {
    score?: number;
    trend?: 'up' | 'down' | 'stable';
    percentage?: number;
    category?: string;
  };
}

interface AIInsightsPanelProps {
  title?: string;
  insights: AIInsight[];
  loading?: boolean;
  onRefresh?: () => void;
  maxItems?: number;
  showRefreshButton?: boolean;
  compact?: boolean;
  emptyText?: string;
  collapsible?: boolean;
}

const insightConfig: Record<string, { icon: ReactNode; color: string; bgColor: string }> = {
  tip: { icon: <BulbOutlined />, color: '#1890ff', bgColor: '#e6f7ff' },
  warning: { icon: <WarningOutlined />, color: '#faad14', bgColor: '#fffbe6' },
  achievement: { icon: <TrophyOutlined />, color: '#52c41a', bgColor: '#f6ffed' },
  opportunity: { icon: <RocketOutlined />, color: '#722ed1', bgColor: '#f9f0ff' },
  trend: { icon: <LineChartOutlined />, color: '#13c2c2', bgColor: '#e6fffb' },
  suggestion: { icon: <StarOutlined />, color: '#eb2f96', bgColor: '#fff0f6' },
};

const priorityColors: Record<string, string> = {
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#8c8c8c',
};

function InsightItem({
  insight,
  compact,
}: {
  insight: AIInsight;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const config = insightConfig[insight.type] || insightConfig.tip;

  return (
    <div
      style={{
        padding: compact ? '8px 12px' : '12px 16px',
        borderRadius: 8,
        backgroundColor: config.bgColor,
        marginBottom: 8,
        border: `1px solid ${config.color}20`,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: compact ? 28 : 36,
            height: compact ? 28 : 36,
            borderRadius: '50%',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: config.color,
            fontSize: compact ? 14 : 18,
            flexShrink: 0,
            boxShadow: `0 2px 8px ${config.color}30`,
          }}
        >
          {config.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text strong style={{ fontSize: compact ? 12 : 14 }}>
              {insight.title}
            </Text>
            {insight.priority && (
              <Tag
                color={priorityColors[insight.priority]}
                style={{ fontSize: 10, marginLeft: 8 }}
              >
                {insight.priority}
              </Tag>
            )}
          </div>

          <Paragraph
            type="secondary"
            style={{ fontSize: compact ? 11 : 12, margin: '4px 0 0 0' }}
            ellipsis={compact ? { rows: 2 } : false}
          >
            {insight.description}
          </Paragraph>

          {insight.metadata && (
            <Space size={8} style={{ marginTop: 8 }}>
              {insight.metadata.score !== undefined && (
                <Tooltip title={t('ai.confidenceScore', 'AI Confidence')}>
                  <Tag icon={<ThunderboltOutlined />} color="blue">
                    {Math.round(insight.metadata.score * 100)}%
                  </Tag>
                </Tooltip>
              )}
              {insight.metadata.percentage !== undefined && (
                <Progress
                  percent={insight.metadata.percentage}
                  size="small"
                  style={{ width: 80 }}
                  strokeColor={config.color}
                />
              )}
              {insight.metadata.category && (
                <Tag>{insight.metadata.category}</Tag>
              )}
            </Space>
          )}

          {(insight.actionLabel || insight.onAction) && (
            <div style={{ marginTop: 8 }}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', color: config.color }}
                onClick={insight.onAction}
                href={insight.actionUrl}
              >
                {insight.actionLabel || t('common.takeAction', 'Take Action')}
                <ArrowRightOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AIInsightsPanel({
  title,
  insights,
  loading = false,
  onRefresh,
  maxItems,
  showRefreshButton = true,
  compact = false,
  emptyText,
  collapsible = false,
}: AIInsightsPanelProps) {
  const { t } = useTranslation();

  const displayInsights = maxItems ? insights.slice(0, maxItems) : insights;

  const content = (
    <>
      {loading ? (
        <div style={{ textAlign: 'center', padding: compact ? 20 : 40 }}>
          <Spin tip={t('ai.analyzing', 'AI is analyzing...')} />
        </div>
      ) : displayInsights.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyText || t('ai.noInsights', 'No AI insights available')}
        />
      ) : (
        displayInsights.map((insight) => (
          <InsightItem key={insight.id} insight={insight} compact={compact} />
        ))
      )}
    </>
  );

  const cardTitle = (
    <Space>
      <ThunderboltOutlined style={{ color: '#722ed1' }} />
      {title || t('ai.insights', 'AI Insights')}
    </Space>
  );

  const extra = showRefreshButton && onRefresh && (
    <Button
      type="text"
      icon={<ReloadOutlined spin={loading} />}
      onClick={onRefresh}
      size="small"
    />
  );

  if (collapsible) {
    return (
      <Collapse
        ghost
        items={[
          {
            key: 'insights',
            label: cardTitle,
            extra,
            children: content,
          },
        ]}
      />
    );
  }

  return (
    <Card
      title={cardTitle}
      extra={extra}
      size={compact ? 'small' : 'default'}
    >
      {content}
    </Card>
  );
}

export default AIInsightsPanel;
