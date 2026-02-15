import React from 'react';
import { Card, List, Tag, Typography, Spin, Empty, Space, Badge } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { ScheduleAIInsight } from '@inspection/shared';
import {
  BulbOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const getInsightIcon = (category: ScheduleAIInsight['category']) => {
  switch (category) {
    case 'risk':
      return <WarningOutlined style={{ color: '#faad14' }} />;
    case 'efficiency':
      return <ThunderboltOutlined style={{ color: '#1890ff' }} />;
    case 'quality':
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    case 'capacity':
      return <DashboardOutlined style={{ color: '#722ed1' }} />;
    case 'optimization':
      return <BulbOutlined style={{ color: '#13c2c2' }} />;
    default:
      return <RobotOutlined style={{ color: '#8c8c8c' }} />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'red';
    case 'medium':
      return 'orange';
    case 'low':
      return 'blue';
    default:
      return 'default';
  }
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'risk':
      return 'Risk';
    case 'efficiency':
      return 'Efficiency';
    case 'quality':
      return 'Quality';
    case 'capacity':
      return 'Capacity';
    case 'optimization':
      return 'Optimization';
    default:
      return category;
  }
};

export const AIScheduleInsights: React.FC = () => {
  const {
    data: insights,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'insights'],
    queryFn: () => scheduleAIApi.getInsights(),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <RobotOutlined />
            <span>AI Schedule Insights</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Analyzing scheduling patterns...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={
          <Space>
            <RobotOutlined />
            <span>AI Schedule Insights</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load AI insights"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const insightsList: ScheduleAIInsight[] = insights || [];

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          <span>AI Schedule Insights</span>
          <Badge
            count={insightsList.length}
            style={{ backgroundColor: '#1890ff' }}
          />
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          Powered by AI Analysis
        </Text>
      }
    >
      {insightsList.length === 0 ? (
        <Empty
          description="No insights available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={insightsList}
          renderItem={(insight: ScheduleAIInsight, index: number) => (
            <List.Item key={index}>
              <List.Item.Meta
                avatar={getInsightIcon(insight.category)}
                title={
                  <Space>
                    <Text strong>{insight.title}</Text>
                    <Tag color={getPriorityColor(insight.priority)}>
                      {insight.priority.toUpperCase()}
                    </Tag>
                    <Tag>{getCategoryLabel(insight.category)}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">{insight.description}</Text>
                    {insight.actionable_recommendations.length > 0 && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Recommendations:
                        </Text>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          {insight.actionable_recommendations.slice(0, 2).map((rec, idx) => (
                            <li key={idx}>
                              <Text type="secondary" style={{ fontSize: 12 }}>{rec}</Text>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {insight.impact_estimate && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Impact: {insight.impact_estimate}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};
