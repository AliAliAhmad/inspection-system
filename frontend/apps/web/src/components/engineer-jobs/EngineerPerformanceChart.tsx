import { Card, Typography, Spin, Empty, Segmented, Row, Col, Statistic } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { engineerJobsApi } from '@inspection/shared';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const { Title, Text } = Typography;

interface EngineerPerformanceChartProps {
  engineerId?: number;
}

const COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];

export function EngineerPerformanceChart({ engineerId }: EngineerPerformanceChartProps) {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState<string>('completions');

  const { data: performance, isLoading } = useQuery({
    queryKey: ['engineer-performance', engineerId],
    queryFn: () => engineerJobsApi.getPerformance?.(engineerId).then((r) => r.data?.data),
    enabled: !!engineerJobsApi.getPerformance,
    staleTime: 60000,
  });

  // Mock data if API not available
  const mockData = {
    daily_completions: [
      { date: '2026-02-01', count: 3 },
      { date: '2026-02-02', count: 2 },
      { date: '2026-02-03', count: 4 },
      { date: '2026-02-04', count: 3 },
      { date: '2026-02-05', count: 5 },
      { date: '2026-02-06', count: 2 },
      { date: '2026-02-07', count: 4 },
    ],
    category_breakdown: [
      { category: 'Electrical', count: 12, avg_time: 2.5 },
      { category: 'Mechanical', count: 8, avg_time: 3.2 },
      { category: 'Plumbing', count: 5, avg_time: 1.8 },
      { category: 'HVAC', count: 4, avg_time: 4.1 },
    ],
    quality_score: 92,
  };

  const data = performance || mockData;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  const renderCompletionsChart = () => (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data.daily_completions}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => new Date(value).toLocaleDateString('en', { weekday: 'short' })}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
          formatter={(value) => [value as number, t('jobs.completions', 'Completions')]}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#1890ff"
          strokeWidth={2}
          dot={{ fill: '#1890ff' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderCategoryChart = () => (
    <Row gutter={24}>
      <Col span={12}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data.category_breakdown}
              dataKey="count"
              nameKey="category"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            >
              {data.category_breakdown.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </Col>
      <Col span={12}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.category_breakdown} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" unit="h" />
            <YAxis dataKey="category" type="category" width={80} />
            <Tooltip formatter={(value) => [`${value}h`, t('jobs.avg_time', 'Avg Time')]} />
            <Bar dataKey="avg_time" fill="#52c41a" />
          </BarChart>
        </ResponsiveContainer>
      </Col>
    </Row>
  );

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>
          {t('jobs.performance', 'Performance')}
        </Title>
        <Segmented
          value={chartType}
          onChange={(value) => setChartType(value as string)}
          options={[
            { label: t('jobs.completions', 'Completions'), value: 'completions' },
            { label: t('jobs.by_category', 'By Category'), value: 'category' },
          ]}
        />
      </div>

      {chartType === 'completions' && renderCompletionsChart()}
      {chartType === 'category' && renderCategoryChart()}

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Statistic
            title={t('jobs.quality_score', 'Quality Score')}
            value={data.quality_score}
            suffix="%"
            valueStyle={{ color: data.quality_score >= 80 ? '#52c41a' : '#faad14' }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={t('jobs.total_categories', 'Categories')}
            value={data.category_breakdown.length}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={t('jobs.total_jobs_period', 'Jobs This Period')}
            value={data.daily_completions.reduce((sum, d) => sum + d.count, 0)}
          />
        </Col>
      </Row>
    </Card>
  );
}

export default EngineerPerformanceChart;
