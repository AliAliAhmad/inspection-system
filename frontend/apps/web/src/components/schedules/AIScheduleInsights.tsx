import { Card, Typography, Space, Spin, Empty, List, Tag, Collapse, Badge, Button } from 'antd';
import {
  BulbOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  RocketOutlined,
  SafetyOutlined,
  BarChartOutlined,
  TeamOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi, type ScheduleAIInsight } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

export interface AIScheduleInsightsProps {
  compact?: boolean;
}

const CATEGORY_CONFIG = {
  risk: {
    color: '#ff4d4f',
    icon: <ThunderboltOutlined />,
    label: 'Risk',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
  },
  efficiency: {
    color: '#1677ff',
    icon: <RocketOutlined />,
    label: 'Efficiency',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
  },
  quality: {
    color: '#52c41a',
    icon: <SafetyOutlined />,
    label: 'Quality',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
  },
  capacity: {
    color: '#fa8c16',
    icon: <TeamOutlined />,
    label: 'Capacity',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
  },
  optimization: {
    color: '#722ed1',
    icon: <SettingOutlined />,
    label: 'Optimization',
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
  },
};

const PRIORITY_CONFIG = {
  high: {
    color: '#ff4d4f',
    icon: <ExclamationCircleOutlined />,
    tagColor: 'error',
  },
  medium: {
    color: '#faad14',
    icon: <InfoCircleOutlined />,
    tagColor: 'warning',
  },
  low: {
    color: '#1677ff',
    icon: <InfoCircleOutlined />,
    tagColor: 'processing',
  },
};

export function AIScheduleInsights({ compact = false }: AIScheduleInsightsProps) {
  const { t } = useTranslation();

  const { data: insights, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'insights'],
    queryFn: () => scheduleAIApi.getInsights(),
  });

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
      <Card>
        <Empty description={t('schedules.ai.insightsError', 'Failed to load AI insights')} />
      </Card>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <Card
        title={
          <Space>
            <BulbOutlined style={{ color: '#1677ff' }} />
            {t('schedules.ai.insights', 'AI Insights')}
          </Space>
        }
      >
        <Empty description={t('schedules.ai.noInsights', 'No insights available')} />
      </Card>
    );
  }

  // Group insights by category
  const groupedInsights = insights.reduce<Record<string, ScheduleAIInsight[]>>(
    (acc, insight) => {
      if (!acc[insight.category]) {
        acc[insight.category] = [];
      }
      acc[insight.category].push(insight);
      return acc;
    },
    {}
  );

  // Sort by priority within each category
  Object.keys(groupedInsights).forEach((category) => {
    groupedInsights[category].sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  });

  const categoryOrder = ['risk', 'efficiency', 'quality', 'capacity', 'optimization'];
  const sortedCategories = categoryOrder.filter((c) => groupedInsights[c]?.length > 0);

  // Compact view: show only high priority insights
  if (compact) {
    const highPriorityInsights = insights
      .filter((i) => i.priority === 'high')
      .slice(0, 3);

    if (highPriorityInsights.length === 0) {
      return null;
    }

    return (
      <Card
        size="small"
        title={
          <Space>
            <BulbOutlined style={{ color: '#1677ff' }} />
            <Text strong>{t('schedules.ai.insights', 'AI Insights')}</Text>
            <Badge count={highPriorityInsights.length} />
          </Space>
        }
      >
        <List
          size="small"
          dataSource={highPriorityInsights}
          renderItem={(insight) => {
            const categoryConfig = CATEGORY_CONFIG[insight.category as keyof typeof CATEGORY_CONFIG];
            return (
              <List.Item>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Tag color={categoryConfig.color} icon={categoryConfig.icon}>
                      {categoryConfig.label}
                    </Tag>
                    <Text strong>{insight.title}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {insight.description}
                  </Text>
                </Space>
              </List.Item>
            );
          }}
        />
      </Card>
    );
  }

  // Full view
  return (
    <Card
      title={
        <Space>
          <BulbOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('schedules.ai.insights', 'AI Insights')}
          </Title>
          <Badge count={insights.length} />
        </Space>
      }
    >
      <Collapse
        defaultActiveKey={sortedCategories.slice(0, 3)}
        style={{ backgroundColor: 'transparent' }}
      >
        {sortedCategories.map((category) => {
          const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
          const categoryInsights = groupedInsights[category];

          return (
            <Panel
              key={category}
              header={
                <Space>
                  <span style={{ color: config.color }}>{config.icon}</span>
                  <Text strong>{config.label}</Text>
                  <Badge count={categoryInsights.length} style={{ backgroundColor: config.color }} />
                </Space>
              }
              style={{
                marginBottom: 8,
                backgroundColor: config.bgColor,
                borderColor: config.borderColor,
                borderRadius: 8,
              }}
            >
              <List
                dataSource={categoryInsights}
                renderItem={(insight) => {
                  const priorityConfig = PRIORITY_CONFIG[insight.priority];
                  return (
                    <List.Item
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        borderRadius: 8,
                        marginBottom: 8,
                        border: `1px solid ${config.borderColor}`,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <Space>
                            <Tag color={priorityConfig.tagColor} icon={priorityConfig.icon}>
                              {insight.priority.toUpperCase()}
                            </Tag>
                            <Text strong>{insight.title}</Text>
                          </Space>
                        </div>

                        <Paragraph
                          style={{ marginBottom: 12, fontSize: 13 }}
                          type="secondary"
                        >
                          {insight.description}
                        </Paragraph>

                        {insight.impact_estimate && (
                          <div style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 12 }}>
                              <BarChartOutlined style={{ marginRight: 4, color: '#1677ff' }} />
                              <strong>{t('schedules.ai.impact', 'Impact')}:</strong>{' '}
                              {insight.impact_estimate}
                            </Text>
                          </div>
                        )}

                        {insight.actionable_recommendations &&
                          insight.actionable_recommendations.length > 0 && (
                            <div>
                              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                {t('schedules.ai.recommendations', 'Recommendations')}:
                              </Text>
                              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                                {insight.actionable_recommendations.map((rec, idx) => (
                                  <li key={idx} style={{ marginBottom: 4 }}>
                                    {rec}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    </List.Item>
                  );
                }}
              />
            </Panel>
          );
        })}
      </Collapse>
    </Card>
  );
}

export default AIScheduleInsights;
