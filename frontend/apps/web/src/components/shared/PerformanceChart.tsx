import { Card, Typography, Space, Select, Empty, Spin } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const { Text } = Typography;

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
}

interface PerformanceChartProps {
  title?: string;
  data: ChartDataPoint[];
  series?: ChartSeries[];
  type?: 'line' | 'bar' | 'area' | 'pie';
  height?: number;
  loading?: boolean;
  showTimeFilter?: boolean;
  timeFilter?: 'week' | 'month' | 'quarter' | 'year';
  onTimeFilterChange?: (filter: 'week' | 'month' | 'quarter' | 'year') => void;
  colors?: string[];
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  emptyText?: string;
}

const DEFAULT_COLORS = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
  '#a0d911',
];

export function PerformanceChart({
  title,
  data,
  series,
  type = 'line',
  height = 300,
  loading = false,
  showTimeFilter = false,
  timeFilter = 'month',
  onTimeFilterChange,
  colors = DEFAULT_COLORS,
  stacked = false,
  showLegend = true,
  showGrid = true,
  emptyText,
}: PerformanceChartProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card>
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card title={title}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyText || t('common.noData', 'No data available')}
          style={{ height: height - 50, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
        />
      </Card>
    );
  }

  const renderChart = () => {
    // For single value series (legacy support)
    const singleSeries = !series || series.length === 0;
    const chartSeries = singleSeries
      ? [{ key: 'value', name: 'Value', color: colors[0] }]
      : series;

    switch (type) {
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              {showLegend && <Legend />}
            </PieChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {showLegend && <Legend />}
              {chartSeries.map((s, index) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color || colors[index % colors.length]}
                  stackId={stacked ? 'stack' : undefined}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {showLegend && <Legend />}
              {chartSeries.map((s, index) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color || colors[index % colors.length]}
                  fill={`${s.color || colors[index % colors.length]}30`}
                  stackId={stacked ? 'stack' : undefined}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'line':
      default:
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {showLegend && <Legend />}
              {chartSeries.map((s, index) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color || colors[index % colors.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <Card
      title={title}
      extra={
        showTimeFilter && (
          <Select
            value={timeFilter}
            onChange={onTimeFilterChange}
            size="small"
            style={{ width: 100 }}
          >
            <Select.Option value="week">{t('common.week', 'Week')}</Select.Option>
            <Select.Option value="month">{t('common.month', 'Month')}</Select.Option>
            <Select.Option value="quarter">{t('common.quarter', 'Quarter')}</Select.Option>
            <Select.Option value="year">{t('common.year', 'Year')}</Select.Option>
          </Select>
        )
      }
    >
      {renderChart()}
    </Card>
  );
}

export default PerformanceChart;
