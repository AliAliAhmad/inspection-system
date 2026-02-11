import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Spin,
  Empty,
  Tag,
  List,
  Alert,
  Collapse,
  Badge,
  Button,
  Segmented,
  Tooltip,
} from 'antd';
import {
  BulbOutlined,
  RiseOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  TeamOutlined,
  ToolOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  RightOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsAIApi, type ReportInsight } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

export interface InsightsFeedProps {
  compact?: boolean;
  limit?: number;
}

const TYPE_CONFIG = {
  trend: {
    icon: <LineChartOutlined />,
    color: '#1677ff',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    label: 'Trend',
  },
  anomaly: {
    icon: <WarningOutlined />,
    color: '#faad14',
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    label: 'Anomaly',
  },
  recommendation: {
    icon: <BulbOutlined />,
    color: '#52c41a',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    label: 'Recommendation',
  },
  prediction: {
    icon: <ThunderboltOutlined />,
    color: '#722ed1',
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
    label: 'Prediction',
  },
  kpi: {
    icon: <RiseOutlined />,
    color: '#13c2c2',
    bgColor: '#e6fffb',
    borderColor: '#87e8de',
    label: 'KPI',
  },
};

const CATEGORY_CONFIG = {
  operational: {
    icon: <SettingOutlined />,
    color: '#1677ff',
    label: 'Operational',
  },
  workforce: {
    icon: <TeamOutlined />,
    color: '#722ed1',
    label: 'Workforce',
  },
  maintenance: {
    icon: <ToolOutlined />,
    color: '#fa8c16',
    label: 'Maintenance',
  },
  management: {
    icon: <BulbOutlined />,
    color: '#52c41a',
    label: 'Management',
  },
};

const SEVERITY_CONFIG = {
  info: { color: '#1677ff', bgColor: '#e6f7ff' },
  warning: { color: '#faad14', bgColor: '#fffbe6' },
  critical: { color: '#ff4d4f', bgColor: '#fff2f0' },
};

type FilterType = 'all' | 'trend' | 'anomaly' | 'recommendation' | 'prediction' | 'kpi';

export function InsightsFeed({ compact = false, limit = 10 }: InsightsFeedProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports-ai', 'insights', limit],
    queryFn: () => reportsAIApi.getInsights(limit),
  });

  const insights: ReportInsight[] = data || [];

  // Filter insights
  const filteredInsights = filter === 'all'
    ? insights
    : insights.filter((i) => i.type === filter);

  // Sort by priority
  const sortedInsights = [...filteredInsights].sort((a, b) => a.priority - b.priority);

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message={t('reports.ai.error', 'Failed to load insights')}
        showIcon
      />
    );
  }

  if (insights.length === 0) {
    return (
      <Card
        title={
          <Space>
            <BulbOutlined style={{ color: '#52c41a' }} />
            {t('reports.ai.insights', 'AI Insights')}
          </Space>
        }
      >
        <Empty description={t('reports.ai.noInsights', 'No insights available')} />
      </Card>
    );
  }

  if (compact) {
    const topInsights = sortedInsights.slice(0, 3);

    return (
      <Card
        size="small"
        title={
          <Space>
            <BulbOutlined style={{ color: '#52c41a' }} />
            {t('reports.ai.topInsights', 'Top Insights')}
          </Space>
        }
        extra={<Badge count={insights.length} style={{ backgroundColor: '#1677ff' }} />}
      >
        <List
          size="small"
          dataSource={topInsights}
          renderItem={(insight) => {
            const typeConfig = TYPE_CONFIG[insight.type];
            return (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Space align="start">
                  <span style={{ color: typeConfig.color }}>{typeConfig.icon}</span>
                  <div>
                    <Text strong style={{ fontSize: 13 }}>
                      {insight.title}
                    </Text>
                    {insight.severity && (
                      <Tag
                        color={
                          insight.severity === 'critical'
                            ? 'error'
                            : insight.severity === 'warning'
                            ? 'warning'
                            : 'processing'
                        }
                        style={{ marginLeft: 8, fontSize: 10 }}
                      >
                        {insight.severity.toUpperCase()}
                      </Tag>
                    )}
                  </div>
                </Space>
              </List.Item>
            );
          }}
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <BulbOutlined style={{ color: '#52c41a' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('reports.ai.insights', 'AI Insights')}
          </Title>
          <Badge count={insights.length} style={{ backgroundColor: '#1677ff' }} />
        </Space>
      }
      extra={
        <Space>
          <Segmented
            value={filter}
            onChange={(val) => setFilter(val as FilterType)}
            options={[
              { label: t('reports.ai.all', 'All'), value: 'all' },
              { label: TYPE_CONFIG.trend.label, value: 'trend' },
              { label: TYPE_CONFIG.anomaly.label, value: 'anomaly' },
              { label: TYPE_CONFIG.recommendation.label, value: 'recommendation' },
            ]}
            size="small"
          />
          <Tooltip title={t('reports.ai.refresh', 'Refresh')}>
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
            />
          </Tooltip>
        </Space>
      }
    >
      {/* Insights List */}
      <List
        dataSource={sortedInsights}
        renderItem={(insight) => {
          const typeConfig = TYPE_CONFIG[insight.type];
          const categoryConfig = CATEGORY_CONFIG[insight.category];
          const severityConfig = insight.severity ? SEVERITY_CONFIG[insight.severity] : null;

          return (
            <List.Item style={{ padding: 0, marginBottom: 12, border: 'none' }}>
              <Card
                size="small"
                style={{
                  width: '100%',
                  backgroundColor: severityConfig?.bgColor || typeConfig.bgColor,
                  borderColor: typeConfig.borderColor,
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <Space>
                    <span style={{ color: typeConfig.color, fontSize: 18 }}>
                      {typeConfig.icon}
                    </span>
                    <div>
                      <Text strong style={{ fontSize: 14 }}>
                        {insight.title}
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Space size={4}>
                          <Tag color={typeConfig.color} style={{ fontSize: 10 }}>
                            {typeConfig.label}
                          </Tag>
                          <Tag style={{ fontSize: 10 }}>
                            {categoryConfig.icon} {categoryConfig.label}
                          </Tag>
                          {insight.severity && (
                            <Tag
                              color={
                                insight.severity === 'critical'
                                  ? 'error'
                                  : insight.severity === 'warning'
                                  ? 'warning'
                                  : 'processing'
                              }
                              style={{ fontSize: 10 }}
                            >
                              {insight.severity.toUpperCase()}
                            </Tag>
                          )}
                        </Space>
                      </div>
                    </div>
                  </Space>

                  <Space>
                    {insight.value !== undefined && (
                      <div style={{ textAlign: 'right' }}>
                        <Text strong style={{ fontSize: 18, color: typeConfig.color }}>
                          {typeof insight.value === 'number'
                            ? insight.value.toLocaleString()
                            : insight.value}
                        </Text>
                        {insight.change_percentage !== undefined && (
                          <div>
                            <Text
                              style={{
                                fontSize: 12,
                                color:
                                  insight.change_percentage >= 0 ? '#52c41a' : '#ff4d4f',
                              }}
                            >
                              {insight.change_percentage >= 0 ? '+' : ''}
                              {insight.change_percentage.toFixed(1)}%
                            </Text>
                          </div>
                        )}
                      </div>
                    )}
                    <Tag style={{ fontSize: 10 }}>#{insight.priority}</Tag>
                  </Space>
                </div>

                {/* Description */}
                <Paragraph style={{ margin: '8px 0', fontSize: 13 }}>
                  {insight.description}
                </Paragraph>

                {/* Action Items */}
                {insight.action_items.length > 0 && (
                  <Collapse ghost size="small" style={{ backgroundColor: 'transparent' }}>
                    <Panel
                      header={
                        <Space>
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          <Text strong style={{ fontSize: 12 }}>
                            {t('reports.ai.actionItems', 'Action Items')} ({insight.action_items.length})
                          </Text>
                        </Space>
                      }
                      key="actions"
                    >
                      <List
                        size="small"
                        dataSource={insight.action_items}
                        renderItem={(item, index) => (
                          <List.Item
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'rgba(255,255,255,0.8)',
                              borderRadius: 6,
                              marginBottom: 4,
                              border: 'none',
                            }}
                          >
                            <Space>
                              <Tag color="green" style={{ margin: 0 }}>
                                {index + 1}
                              </Tag>
                              <Text style={{ fontSize: 12 }}>{item}</Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </Panel>
                  </Collapse>
                )}

                {/* Metadata */}
                {Object.keys(insight.metadata).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Space wrap size={4}>
                      {Object.entries(insight.metadata).map(([key, value]) => (
                        <Tag key={key} style={{ fontSize: 10 }}>
                          {key}: {String(value)}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                )}

                {/* Timestamp */}
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {insight.generated_at}
                  </Text>
                </div>
              </Card>
            </List.Item>
          );
        }}
        locale={{
          emptyText: (
            <Empty
              description={t('reports.ai.noMatchingInsights', 'No insights match the selected filter')}
            />
          ),
        }}
      />

      {/* Load More (if applicable) */}
      {filteredInsights.length >= limit && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link">
            {t('reports.ai.loadMore', 'Load More Insights')} <RightOutlined />
          </Button>
        </div>
      )}
    </Card>
  );
}

export default InsightsFeed;
