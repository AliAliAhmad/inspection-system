import React from 'react';
import { Card, Spin, Empty, Typography, Space, Select, Segmented } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { HealthTrend } from '@inspection/shared';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { LineChartOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface HealthTrendChartProps {
  equipmentIds?: number[];
  height?: number;
}

export const HealthTrendChart: React.FC<HealthTrendChartProps> = ({
  equipmentIds,
  height = 300,
}) => {
  const [chartType, setChartType] = React.useState<'line' | 'area'>('area');

  const {
    data: trendData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'health-trends', equipmentIds],
    queryFn: () => scheduleAIApi.getHealthTrends(equipmentIds),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined />
            <span>Equipment Health Trends</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Loading health trends...</Text>
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
            <LineChartOutlined />
            <span>Equipment Health Trends</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load health trends"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const trends: HealthTrend[] = trendData || [];

  // Transform data for chart - group by trend direction
  const chartData = trends.map((trend) => ({
    name: trend.equipment_name,
    score: trend.trend_score,
    defects: trend.recent_defects,
    direction: trend.trend_direction,
    confidence: Math.round(trend.confidence * 100),
  }));

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'improving':
        return '#52c41a';
      case 'stable':
        return '#1890ff';
      case 'degrading':
        return '#cf1322';
      default:
        return '#8c8c8c';
    }
  };

  const renderChart = () => {
    if (chartType === 'area') {
      return (
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 4,
            }}
            formatter={(value: number, name: string) => [
              name === 'score' ? `${value} (Trend Score)` : value,
              name === 'score' ? 'Health Score' : name === 'defects' ? 'Recent Defects' : name,
            ]}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="score"
            name="Health Score"
            stroke="#52c41a"
            fill="#52c41a"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="defects"
            name="Recent Defects"
            stroke="#cf1322"
            fill="#cf1322"
            fillOpacity={0.2}
          />
        </AreaChart>
      );
    }

    return (
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: 4,
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="score"
          name="Health Score"
          stroke="#52c41a"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="defects"
          name="Recent Defects"
          stroke="#cf1322"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="confidence"
          name="Confidence %"
          stroke="#1890ff"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    );
  };

  return (
    <Card
      title={
        <Space>
          <LineChartOutlined />
          <span>Equipment Health Trends</span>
        </Space>
      }
      extra={
        <Segmented
          size="small"
          value={chartType}
          onChange={(value) => setChartType(value as 'line' | 'area')}
          options={[
            { label: 'Area', value: 'area' },
            { label: 'Line', value: 'line' },
          ]}
        />
      }
    >
      {chartData.length === 0 ? (
        <Empty
          description="No trend data available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      )}
    </Card>
  );
};
