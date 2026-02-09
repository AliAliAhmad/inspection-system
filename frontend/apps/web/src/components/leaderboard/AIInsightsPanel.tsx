import { Card, Typography, Space, Tag, List, Empty, Spin, Collapse, Tooltip } from 'antd';
import {
  BulbOutlined,
  TrophyOutlined,
  WarningOutlined,
  RiseOutlined,
  AimOutlined,
  ThunderboltOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AIInsight, RankPrediction } from '@inspection/shared';

const { Text, Paragraph, Title } = Typography;

export interface AIInsightsPanelProps {
  insights: AIInsight[];
  tips?: string[];
  prediction?: RankPrediction;
  loading?: boolean;
}

const INSIGHT_CONFIG = {
  pattern: { icon: <BulbOutlined />, color: '#1677ff', label: 'Pattern' },
  improvement: { icon: <RiseOutlined />, color: '#52c41a', label: 'Improvement' },
  goal: { icon: <AimOutlined />, color: '#722ed1', label: 'Goal' },
  warning: { icon: <WarningOutlined />, color: '#faad14', label: 'Warning' },
};

export function AIInsightsPanel({
  insights,
  tips,
  prediction,
  loading = false,
}: AIInsightsPanelProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  const noData = insights.length === 0 && (!tips || tips.length === 0) && !prediction;

  if (noData) {
    return (
      <Card
        title={
          <Space>
            <RobotOutlined />
            {t('leaderboard.ai_insights', 'AI Insights')}
          </Space>
        }
      >
        <Empty description={t('leaderboard.no_insights', 'No insights available yet')} />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#1677ff' }} />
          {t('leaderboard.ai_insights', 'AI Insights')}
        </Space>
      }
      style={{
        background: 'linear-gradient(135deg, #f0f5ff 0%, #fff 100%)',
        borderColor: '#d6e4ff',
      }}
    >
      {/* Rank Prediction */}
      {prediction && (
        <div
          style={{
            padding: 16,
            marginBottom: 16,
            background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
            borderRadius: 8,
            color: '#fff',
          }}
        >
          <Space style={{ marginBottom: 8 }}>
            <TrophyOutlined />
            <Text strong style={{ color: '#fff' }}>
              {t('leaderboard.rank_prediction', 'Rank Prediction')}
            </Text>
          </Space>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Title level={2} style={{ color: '#fff', margin: 0 }}>
              #{prediction.predicted_rank}
            </Title>
            <Tooltip title={t('leaderboard.confidence', 'Confidence level')}>
              <Tag color="green" style={{ marginLeft: 8 }}>
                {Math.round(prediction.confidence * 100)}% {t('leaderboard.confidence', 'confident')}
              </Tag>
            </Tooltip>
          </div>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
            {prediction.reasoning}
          </Text>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('leaderboard.insights', 'Insights')}
          </Text>
          <List
            dataSource={insights}
            renderItem={(insight) => {
              const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.pattern;
              return (
                <List.Item style={{ padding: '8px 0', border: 'none' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      background: '#fff',
                      borderRadius: 8,
                      border: `1px solid ${config.color}20`,
                      width: '100%',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: `${config.color}10`,
                        color: config.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {config.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <Space style={{ marginBottom: 4 }}>
                        <Tag color={config.color} style={{ textTransform: 'capitalize' }}>
                          {t(`leaderboard.insight_type.${insight.type}`, config.label)}
                        </Tag>
                        {insight.priority && (
                          <Tag color={insight.priority === 'high' ? 'red' : 'default'}>
                            {insight.priority}
                          </Tag>
                        )}
                      </Space>
                      <Paragraph style={{ margin: 0, fontSize: 13 }}>
                        {insight.insight}
                      </Paragraph>
                    </div>
                  </div>
                </List.Item>
              );
            }}
          />
        </div>
      )}

      {/* Tips */}
      {tips && tips.length > 0 && (
        <Collapse
          ghost
          defaultActiveKey={['tips']}
          items={[
            {
              key: 'tips',
              label: (
                <Space>
                  <ThunderboltOutlined style={{ color: '#faad14' }} />
                  <Text strong>{t('leaderboard.tips', 'Tips for Improvement')}</Text>
                </Space>
              ),
              children: (
                <List
                  dataSource={tips}
                  renderItem={(tip, index) => (
                    <List.Item style={{ padding: '6px 0', border: 'none' }}>
                      <Space align="start">
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            backgroundColor: '#faad14',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </div>
                        <Text style={{ fontSize: 13 }}>{tip}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export default AIInsightsPanel;
