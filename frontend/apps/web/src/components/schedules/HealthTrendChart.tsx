import { Card, Typography, Space, Spin, Empty, Tag, Row, Col } from 'antd';
import {
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi, type HealthTrend } from '@inspection/shared';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const { Title, Text } = Typography;

const TREND_CONFIG = {
  improving: {
    color: '#52c41a',
    icon: <RiseOutlined />,
    label: 'Improving',
    tagColor: 'success',
  },
  stable: {
    color: '#1677ff',
    icon: <MinusOutlined />,
    label: 'Stable',
    tagColor: 'processing',
  },
  degrading: {
    color: '#ff4d4f',
    icon: <FallOutlined />,
    label: 'Degrading',
    tagColor: 'error',
  },
};

export function HealthTrendChart() {
  const { t } = useTranslation();

  const { data: trends, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'health-trends'],
    queryFn: () => scheduleAIApi.getHealthTrends(),
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
        <Empty description={t('schedules.ai.healthTrendsError', 'Failed to load health trends')} />
      </Card>
    );
  }

  if (!trends || trends.length === 0) {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#1677ff' }} />
            {t('schedules.ai.healthTrends', 'Equipment Health Trends')}
          </Space>
        }
      >
        <Empty
          description={t('schedules.ai.noHealthTrends', 'No health trend data available')}
        />
      </Card>
    );
  }

  // Prepare chart data (simplified - showing trend scores)
  const chartData = trends.slice(0, 10).map((trend, idx) => ({
    name: trend.equipment_name.length > 15
      ? trend.equipment_name.substring(0, 12) + '...'
      : trend.equipment_name,
    score: trend.trend_score * 100,
    defects: trend.recent_defects,
    confidence: trend.confidence * 100,
  }));

  // Group trends by direction
  const groupedTrends = trends.reduce<Record<string, HealthTrend[]>>(
    (acc, trend) => {
      if (!acc[trend.trend_direction]) {
        acc[trend.trend_direction] = [];
      }
      acc[trend.trend_direction].push(trend);
      return acc;
    },
    {}
  );

  return (
    <Card
      title={
        <Space>
          <LineChartOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('schedules.ai.healthTrends', 'Equipment Health Trends')}
          </Title>
        </Space>
      }
    >
      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {Object.entries(groupedTrends).map(([direction, items]) => {
          const config = TREND_CONFIG[direction as keyof typeof TREND_CONFIG];
          return (
            <Col xs={8} key={direction}>
              <Card
                size="small"
                style={{
                  backgroundColor:
                    direction === 'improving'
                      ? '#f6ffed'
                      : direction === 'degrading'
                      ? '#fff2f0'
                      : '#f0f0f0',
                  borderColor:
                    direction === 'improving'
                      ? '#b7eb8f'
                      : direction === 'degrading'
                      ? '#ffccc7'
                      : '#d9d9d9',
                }}
              >
                <Space>
                  <span style={{ color: config.color }}>{config.icon}</span>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: config.color }}>
                      {items.length}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {config.label}
                    </Text>
                  </div>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Chart */}
      <div style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              style={{ fontSize: 11 }}
            />
            <YAxis
              label={{ value: 'Health Score', angle: -90, position: 'insideLeft' }}
              style={{ fontSize: 11 }}
            />
            <RechartsTooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#1677ff"
              strokeWidth={2}
              name="Health Score"
              dot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="confidence"
              stroke="#52c41a"
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Confidence %"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trend Details */}
      <div>
        <Text strong style={{ display: 'block', marginBottom: 12 }}>
          {t('schedules.ai.trendDetails', 'Trend Details')}:
        </Text>
        <Row gutter={[16, 8]}>
          {trends.slice(0, 6).map((trend) => {
            const config = TREND_CONFIG[trend.trend_direction];
            return (
              <Col xs={24} md={12} key={trend.equipment_id}>
                <div
                  style={{
                    padding: 12,
                    backgroundColor: '#fafafa',
                    borderRadius: 8,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {trend.equipment_name}
                    </Text>
                    <Tag color={config.tagColor} icon={config.icon} style={{ fontSize: 11 }}>
                      {config.label}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    <div>
                      Score: <strong>{(trend.trend_score * 100).toFixed(0)}%</strong> |
                      Defects: <strong>{trend.recent_defects}</strong> |
                      Confidence: <strong>{(trend.confidence * 100).toFixed(0)}%</strong>
                    </div>
                    <div style={{ marginTop: 4, fontStyle: 'italic' }}>
                      {trend.prediction}
                    </div>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      </div>
    </Card>
  );
}

export default HealthTrendChart;
