import React from 'react';
import { Card, Row, Col, Statistic, Progress, Spin, Empty, Alert, Select, Tooltip } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from './api';
import type { TeamPerformance } from './types';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StarOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';

const { Option } = Select;

const COLORS = ['#52c41a', '#1890ff', '#faad14', '#ff4d4f', '#722ed1'];

export const TeamPerformanceDashboard: React.FC = () => {
  const [timeRange, setTimeRange] = React.useState<'week' | 'month' | 'quarter'>('week');

  const { data: performance, isLoading, error } = useQuery({
    queryKey: ['schedule-ai', 'team-performance', timeRange],
    queryFn: () => scheduleAIApi.getTeamPerformance(timeRange),
  });

  if (error) {
    return (
      <Card title="Team Performance Dashboard">
        <Alert
          message="Failed to load team performance data"
          description="Please try refreshing the page."
          type="error"
          showIcon
        />
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card title="Team Performance Dashboard">
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!performance) {
    return (
      <Card title="Team Performance Dashboard">
        <Empty description="No performance data available" />
      </Card>
    );
  }

  const completionTrendData = performance.completion_trend || [];
  const qualityTrendData = performance.quality_trend || [];
  const categoryDistribution = performance.category_distribution || [];
  const inspectorComparison = performance.inspector_comparison || [];

  return (
    <Card
      title={
        <span>
          <TeamOutlined style={{ marginRight: 8 }} />
          Team Performance Dashboard
        </span>
      }
      extra={
        <Select value={timeRange} onChange={setTimeRange} style={{ width: 120 }}>
          <Option value="week">This Week</Option>
          <Option value="month">This Month</Option>
          <Option value="quarter">This Quarter</Option>
        </Select>
      }
    >
      {/* Key Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Total Inspections"
              value={performance.total_inspections}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Completion Rate"
              value={performance.completion_rate}
              suffix="%"
              prefix={
                performance.completion_rate_change >= 0 ? (
                  <RiseOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <FallOutlined style={{ color: '#ff4d4f' }} />
                )
              }
            />
            <Progress
              percent={performance.completion_rate}
              showInfo={false}
              status={performance.completion_rate >= 80 ? 'success' : 'normal'}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Avg Quality Score"
              value={performance.avg_quality_score}
              suffix="/100"
              prefix={<StarOutlined style={{ color: '#faad14' }} />}
            />
            <Progress
              percent={performance.avg_quality_score}
              showInfo={false}
              status={performance.avg_quality_score >= 80 ? 'success' : 'normal'}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title="Avg Completion Time"
              value={performance.avg_completion_time}
              suffix="hrs"
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
            />
            <Tooltip title={`Target: ${performance.target_completion_time || 4} hours`}>
              <Progress
                percent={Math.min(100, (performance.avg_completion_time / (performance.target_completion_time || 4)) * 100)}
                showInfo={false}
                status={performance.avg_completion_time <= (performance.target_completion_time || 4) ? 'success' : 'exception'}
                size="small"
              />
            </Tooltip>
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]}>
        {/* Completion Trend */}
        <Col xs={24} lg={12}>
          <Card size="small" title="Completion Trend">
            {completionTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={completionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stackId="1"
                    stroke="#52c41a"
                    fill="#52c41a"
                    fillOpacity={0.6}
                    name="Completed"
                  />
                  <Area
                    type="monotone"
                    dataKey="pending"
                    stackId="1"
                    stroke="#faad14"
                    fill="#faad14"
                    fillOpacity={0.6}
                    name="Pending"
                  />
                  <Area
                    type="monotone"
                    dataKey="overdue"
                    stackId="1"
                    stroke="#ff4d4f"
                    fill="#ff4d4f"
                    fillOpacity={0.6}
                    name="Overdue"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No trend data available" />
            )}
          </Card>
        </Col>

        {/* Quality Score Trend */}
        <Col xs={24} lg={12}>
          <Card size="small" title="Quality Score Trend">
            {qualityTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={qualityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#1890ff"
                    strokeWidth={2}
                    dot={{ fill: '#1890ff' }}
                    name="Quality Score"
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#52c41a"
                    strokeDasharray="5 5"
                    name="Target"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No quality data available" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Category Distribution */}
        <Col xs={24} lg={12}>
          <Card size="small" title="Inspection Categories">
            {categoryDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No category data available" />
            )}
          </Card>
        </Col>

        {/* Inspector Comparison */}
        <Col xs={24} lg={12}>
          <Card size="small" title="Inspector Comparison">
            {inspectorComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={inspectorComparison} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="quality" fill="#1890ff" name="Quality" />
                  <Bar dataKey="completion" fill="#52c41a" name="Completion" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No inspector data available" />
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
};
