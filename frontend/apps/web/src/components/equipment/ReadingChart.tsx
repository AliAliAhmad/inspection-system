import { Card, Tag, Space, Typography } from 'antd';
import { RiseOutlined, FallOutlined, MinusOutlined } from '@ant-design/icons';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { ReadingGroup } from '@inspection/shared';

const { Text } = Typography;

interface ReadingChartProps {
  group: ReadingGroup;
  language: string;
  height?: number;
}

export default function ReadingChart({ group, language, height = 220 }: ReadingChartProps) {
  const label = language === 'ar' && group.label_ar ? group.label_ar : group.label;
  const { stats, thresholds } = group;

  const trendIcon = stats.trend === 'increasing' ? <RiseOutlined style={{ color: '#ff4d4f' }} />
    : stats.trend === 'decreasing' ? <FallOutlined style={{ color: '#52c41a' }} />
    : <MinusOutlined style={{ color: '#8c8c8c' }} />;

  const sourceColor = group.source === 'equipment_reading' ? 'blue'
    : group.source === 'running_hours' ? 'cyan' : 'purple';

  const chartData = group.readings
    .filter(r => !r.is_faulty)
    .map(r => ({
      date: r.date,
      value: r.value,
      by: r.recorded_by || '',
    }));

  if (chartData.length === 0) return null;

  return (
    <Card
      size="small"
      title={<Space><span>{label}</span>{group.unit && <Text type="secondary">({group.unit})</Text>}</Space>}
      extra={
        <Space size={12}>
          <Tag color={sourceColor}>{group.source.replace('_', ' ')}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {stats.count} readings | Avg: {stats.avg} | Latest: {stats.latest} {trendIcon}
          </Text>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(value: any) => [value, label]}
            labelFormatter={(d) => `Date: ${d}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#1890ff"
            strokeWidth={2}
            dot={{ r: 3, fill: '#1890ff' }}
            activeDot={{ r: 5 }}
          />

          {/* Threshold lines */}
          {thresholds.max_value != null && (
            <ReferenceLine
              y={thresholds.max_value}
              stroke="#ff4d4f"
              strokeDasharray="5 5"
              label={{ value: `Max: ${thresholds.max_value}`, fill: '#ff4d4f', fontSize: 10, position: 'right' }}
            />
          )}
          {thresholds.min_value != null && (
            <ReferenceLine
              y={thresholds.min_value}
              stroke="#faad14"
              strokeDasharray="5 5"
              label={{ value: `Min: ${thresholds.min_value}`, fill: '#faad14', fontSize: 10, position: 'right' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
