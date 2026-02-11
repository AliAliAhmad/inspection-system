import { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  List,
  Badge,
  Typography,
  Spin,
  Alert,
  Select,
  Space,
} from 'antd';
import {
  TeamOutlined,
  TrophyOutlined,
  WarningOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi } from '@inspection/shared';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const { Text, Title } = Typography;

interface TeamPerformanceDashboardProps {
  days?: number;
}

export function TeamPerformanceDashboard({ days = 30 }: TeamPerformanceDashboardProps) {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState(days);

  const { data: performance, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'team-performance', timeRange],
    queryFn: async () => {
      const response = await scheduleAIApi.getTeamPerformance(timeRange);
      return response;
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert
          type="error"
          message={t('common.error', 'Error')}
          description={t('scheduleAI.failedToLoadTeamPerformance', 'Failed to load team performance')}
        />
      </Card>
    );
  }

  const summary = performance?.team_summary;
  const topPerformers = performance?.top_performers || [];
  const needsAttention = performance?.needs_attention || [];
  const trends = performance?.team_trends || [];

  const chartData = trends.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    quality: item.avg_quality,
    completion: item.completion_rate,
  }));

  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <span>{t('scheduleAI.teamPerformance', 'Team Performance Dashboard')}</span>
        </Space>
      }
      extra={
        <Select
          value={timeRange}
          onChange={setTimeRange}
          style={{ width: 120 }}
          options={[
            { label: t('common.7days', '7 Days'), value: 7 },
            { label: t('common.30days', '30 Days'), value: 30 },
            { label: t('common.90days', '90 Days'), value: 90 },
          ]}
        />
      }
    >
      {/* Team Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('scheduleAI.totalInspectors', 'Total Inspectors')}
              value={summary?.total_inspectors || 0}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('scheduleAI.avgQualityScore', 'Avg Quality Score')}
              value={summary?.avg_quality_score || 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('scheduleAI.avgCompletionRate', 'Avg Completion')}
              value={summary?.avg_completion_rate || 0}
              suffix="%"
              precision={1}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('scheduleAI.totalInspections', 'Total Inspections')}
              value={summary?.total_inspections_completed || 0}
              prefix={<LineChartOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Top Performers */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                <Text strong>{t('scheduleAI.topPerformers', 'Top Performers')}</Text>
              </Space>
            }
          >
            {topPerformers.length > 0 ? (
              <List
                size="small"
                dataSource={topPerformers}
                renderItem={(inspector, index) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Badge count={index + 1} style={{ backgroundColor: '#faad14' }} />
                      }
                      title={inspector.inspector_name}
                      description={
                        <Space>
                          <Text type="secondary">
                            Quality: {inspector.quality_score.toFixed(1)}%
                          </Text>
                          <Text type="secondary">|</Text>
                          <Text type="secondary">
                            Completion: {inspector.completion_rate.toFixed(1)}%
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Text type="secondary">{t('common.noData', 'No data available')}</Text>
            )}
          </Card>
        </Col>

        {/* Needs Attention */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
                <Text strong>{t('scheduleAI.needsAttention', 'Needs Attention')}</Text>
              </Space>
            }
          >
            {needsAttention.length > 0 ? (
              <List
                size="small"
                dataSource={needsAttention}
                renderItem={(inspector) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<WarningOutlined style={{ color: '#ff4d4f' }} />}
                      title={inspector.inspector_name}
                      description={
                        <Space>
                          <Text type="secondary">
                            Quality: {inspector.quality_score.toFixed(1)}%
                          </Text>
                          <Text type="secondary">|</Text>
                          <Text type="secondary">
                            Completion: {inspector.completion_rate.toFixed(1)}%
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Alert
                type="success"
                message={t('scheduleAI.allInspectorsPerformingWell', 'All inspectors performing well')}
                showIcon
              />
            )}
          </Card>
        </Col>

        {/* Trend Chart */}
        <Col xs={24}>
          <Card
            size="small"
            title={
              <Space>
                <LineChartOutlined />
                <Text strong>{t('scheduleAI.trendChart', 'Performance Trends')}</Text>
              </Space>
            }
          >
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="quality"
                    stroke="#52c41a"
                    name={t('scheduleAI.avgQuality', 'Avg Quality')}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="completion"
                    stroke="#1890ff"
                    name={t('scheduleAI.completionRate', 'Completion Rate')}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Text type="secondary">{t('common.noData', 'No trend data available')}</Text>
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
