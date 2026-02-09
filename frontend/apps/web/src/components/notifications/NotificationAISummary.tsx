import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Tag,
  Button,
  List,
  Progress,
  Skeleton,
  Tooltip,
  Collapse,
  Badge,
} from 'antd';
import {
  RobotOutlined,
  BulbOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { notificationsApi, AISummary, NotificationPriority } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface NotificationAISummaryProps {
  onActionClick?: (actionId: number, actionType: string) => void;
  onViewPrediction?: (prediction: AISummary['predictions'][0]) => void;
  compact?: boolean;
  showPredictions?: boolean;
  showTips?: boolean;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

export function NotificationAISummary({
  onActionClick,
  onViewPrediction,
  compact = false,
  showPredictions = true,
  showTips = true,
}: NotificationAISummaryProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!compact);

  const {
    data: summaryData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['notifications', 'ai-summary'],
    queryFn: () => notificationsApi.getAISummary().then((r) => r.data),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const summary: AISummary | null = summaryData?.data || null;

  if (isLoading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const getTimeOfDay = () => {
    const hour = dayjs().hour();
    if (hour < 12) return t('common.morning', 'morning');
    if (hour < 17) return t('common.afternoon', 'afternoon');
    return t('common.evening', 'evening');
  };

  const pendingCritical = summary.pending_actions.filter(
    (a) => a.priority === 'critical' || a.priority === 'urgent'
  ).length;

  if (compact && !expanded) {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(true)}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
            <div>
              <Text strong style={{ color: '#fff' }}>
                {summary.greeting || `Good ${getTimeOfDay()}!`}
              </Text>
              {pendingCritical > 0 && (
                <Badge
                  count={pendingCritical}
                  style={{ backgroundColor: '#ff4d4f', marginLeft: 8 }}
                />
              )}
            </div>
          </Space>
          <RightOutlined style={{ color: '#fff' }} />
        </Space>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
      }}
      styles={{
        body: { color: '#fff' },
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <Space>
          <RobotOutlined style={{ fontSize: 24 }} />
          <div>
            <Title level={4} style={{ color: '#fff', margin: 0 }}>
              {summary.greeting || `Good ${getTimeOfDay()}!`}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
              {t('notifications.aiSummaryGenerated', 'AI Summary')} -{' '}
              {dayjs(summary.generated_at).format('h:mm A')}
            </Text>
          </div>
        </Space>
        <Tooltip title={t('notifications.refreshSummary', 'Refresh Summary')}>
          <Button
            type="text"
            icon={<SyncOutlined spin={isFetching} />}
            onClick={() => refetch()}
            style={{ color: '#fff' }}
          />
        </Tooltip>
      </div>

      {/* Summary Text */}
      <Paragraph style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 16 }}>
        {summary.summary}
      </Paragraph>

      {/* Pending Actions */}
      {summary.pending_actions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ color: '#fff', display: 'block', marginBottom: 8 }}>
            <ExclamationCircleOutlined /> {t('notifications.pendingActions', 'Pending Actions')} (
            {summary.pending_actions.length})
          </Text>
          <List
            size="small"
            dataSource={summary.pending_actions.slice(0, 5)}
            renderItem={(action) => (
              <List.Item
                style={{
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  marginBottom: 4,
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => onActionClick?.(action.id, action.action_type)}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: PRIORITY_COLORS[action.priority],
                      }}
                    />
                    <Text style={{ color: '#fff' }} ellipsis>
                      {action.title}
                    </Text>
                  </Space>
                  <Tag
                    color={PRIORITY_COLORS[action.priority]}
                    style={{ marginRight: 0, opacity: 0.9 }}
                  >
                    {action.priority}
                  </Tag>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Predictions */}
      {showPredictions && summary.predictions.length > 0 && (
        <Collapse
          ghost
          style={{ marginBottom: 8 }}
          items={[
            {
              key: 'predictions',
              label: (
                <Text style={{ color: '#fff' }}>
                  <ThunderboltOutlined /> {t('notifications.predictions', 'Predictions')} (
                  {summary.predictions.length})
                </Text>
              ),
              children: (
                <List
                  size="small"
                  dataSource={summary.predictions}
                  renderItem={(prediction) => (
                    <List.Item
                      style={{
                        padding: '8px 0',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onClick={() => onViewPrediction?.(prediction)}
                    >
                      <Space direction="vertical" style={{ width: '100%' }} size={4}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
                            {prediction.description}
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                            <ClockCircleOutlined />{' '}
                            {dayjs(prediction.likely_time).format('h:mm A')}
                          </Text>
                        </Space>
                        <Progress
                          percent={Math.round(prediction.probability * 100)}
                          size="small"
                          strokeColor="rgba(255,255,255,0.8)"
                          trailColor="rgba(255,255,255,0.2)"
                          format={(percent) => (
                            <span style={{ color: 'rgba(255,255,255,0.8)' }}>{percent}%</span>
                          )}
                        />
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}

      {/* Tips */}
      {showTips && summary.tips.length > 0 && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12 }}>
            <BulbOutlined /> {summary.tips[0]}
          </Text>
        </div>
      )}

      {compact && (
        <Button
          type="text"
          size="small"
          onClick={() => setExpanded(false)}
          style={{ color: 'rgba(255,255,255,0.8)', marginTop: 8 }}
        >
          {t('common.collapse', 'Collapse')}
        </Button>
      )}
    </Card>
  );
}

export default NotificationAISummary;
