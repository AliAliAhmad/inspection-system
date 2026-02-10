import { Card, Typography, List, Tag, Space, Button, Empty, Spin } from 'antd';
import {
  RobotOutlined,
  BulbOutlined,
  WarningOutlined,
  TrophyOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { engineerJobsApi } from '@inspection/shared';

const { Title, Text } = Typography;

interface AIInsight {
  type: 'tip' | 'warning' | 'achievement';
  title: string;
  description: string;
  priority: number;
  action?: string;
  actionUrl?: string;
}

interface AIInsightsWidgetProps {
  engineerId?: number;
  compact?: boolean;
  maxItems?: number;
}

export function AIInsightsWidget({ engineerId, compact = false, maxItems = 5 }: AIInsightsWidgetProps) {
  const { t } = useTranslation();

  const { data: insights, isLoading, refetch } = useQuery({
    queryKey: ['engineer-ai-insights', engineerId],
    queryFn: () => engineerJobsApi.getAIInsights?.().then((r) => r.data?.data),
    enabled: !!engineerJobsApi.getAIInsights,
    staleTime: 300000, // 5 minutes
  });

  // Mock data if API not available
  const mockInsights: AIInsight[] = [
    {
      type: 'achievement',
      title: 'Streak Master!',
      description: 'You\'ve completed jobs for 5 consecutive days. Keep it up!',
      priority: 1,
    },
    {
      type: 'tip',
      title: 'Optimal Work Time',
      description: 'Your most productive hours are between 9 AM - 12 PM. Schedule complex tasks during this time.',
      priority: 2,
    },
    {
      type: 'warning',
      title: 'Overdue Alert',
      description: 'You have 2 jobs approaching their deadline. Consider prioritizing them.',
      priority: 1,
      action: 'View Jobs',
      actionUrl: '/engineer/jobs?filter=overdue',
    },
    {
      type: 'tip',
      title: 'Skill Opportunity',
      description: 'HVAC jobs take longer than average. Consider additional training in this area.',
      priority: 3,
    },
  ];

  const data = (insights || mockInsights).slice(0, maxItems);

  const getInsightIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'achievement':
        return <TrophyOutlined style={{ color: '#faad14' }} />;
      case 'warning':
        return <WarningOutlined style={{ color: '#f5222d' }} />;
      default:
        return <BulbOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const getInsightColor = (type: AIInsight['type']) => {
    switch (type) {
      case 'achievement':
        return 'gold';
      case 'warning':
        return 'red';
      default:
        return 'blue';
    }
  };

  if (isLoading) {
    return (
      <Card size={compact ? 'small' : 'default'}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card size={compact ? 'small' : 'default'}>
        <Empty description={t('jobs.no_insights', 'No insights available')} />
      </Card>
    );
  }

  return (
    <Card
      size={compact ? 'small' : 'default'}
      title={
        <Space>
          <RobotOutlined />
          <span>{t('jobs.ai_insights', 'AI Insights')}</span>
        </Space>
      }
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetch()}>
          {t('common.refresh', 'Refresh')}
        </Button>
      }
    >
      <List
        dataSource={data}
        renderItem={(insight) => (
          <List.Item
            actions={
              insight.action
                ? [
                    <Button
                      type="link"
                      size="small"
                      icon={<ArrowRightOutlined />}
                      href={insight.actionUrl}
                    >
                      {insight.action}
                    </Button>,
                  ]
                : undefined
            }
          >
            <List.Item.Meta
              avatar={getInsightIcon(insight.type)}
              title={
                <Space>
                  <Text strong>{insight.title}</Text>
                  <Tag color={getInsightColor(insight.type)}>{insight.type}</Tag>
                </Space>
              }
              description={insight.description}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}

export default AIInsightsWidget;
