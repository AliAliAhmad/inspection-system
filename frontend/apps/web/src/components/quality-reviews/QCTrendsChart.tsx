import { useState } from 'react';
import { Card, Typography, Spin, Row, Col, Empty, Segmented, Statistic, Space, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi } from '@inspection/shared';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
} from 'recharts';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface QCTrendsChartProps {
  period?: 'week' | 'month' | 'year';
  compact?: boolean;
}

type ChartView = 'trends' | 'approval_rate' | 'combined';

export function QCTrendsChart({ period = 'month', compact = false }: QCTrendsChartProps) {
  const { t } = useTranslation();
  const [chartView, setChartView] = useState<ChartView>('trends');

  const { data: trends, isLoading } = useQuery({
    queryKey: ['qc-trends', period],
    queryFn: () => qualityReviewsApi.getTrends?.(period).then((r) => r.data?.data),
    enabled: !!qualityReviewsApi.getTrends,
    staleTime: 60000,
  });

  // Mock data if API not available
  const mockTrends = {
    daily_reviews: [
      { date: '2026-02-01', approved: 5, rejected: 1 },
      { date: '2026-02-02', approved: 6, rejected: 0 },
      { date: '2026-02-03', approved: 4, rejected: 2 },
      { date: '2026-02-04', approved: 7, rejected: 1 },
      { date: '2026-02-05', approved: 5, rejected: 0 },
      { date: '2026-02-06', approved: 8, rejected: 1 },
      { date: '2026-02-07', approved: 6, rejected: 0 },
      { date: '2026-02-08', approved: 7, rejected: 2 },
      { date: '2026-02-09', approved: 5, rejected: 1 },
      { date: '2026-02-10', approved: 9, rejected: 0 },
    ],
    common_rejection_reasons: [
      { reason: 'Incomplete documentation', count: 8 },
      { reason: 'Quality below standard', count: 5 },
      { reason: 'Missing photos', count: 3 },
      { reason: 'Incorrect parts used', count: 2 },
    ],
  };

  const data = trends || mockTrends;

  // Calculate approval rate for each day
  const dataWithApprovalRate = data.daily_reviews.map((day) => {
    const total = day.approved + day.rejected;
    const approvalRate = total > 0 ? (day.approved / total) * 100 : 100;
    return {
      ...day,
      total,
      approvalRate: Math.round(approvalRate * 10) / 10,
    };
  });

  // Calculate overall stats
  const totalApproved = data.daily_reviews.reduce((sum, d) => sum + d.approved, 0);
  const totalRejected = data.daily_reviews.reduce((sum, d) => sum + d.rejected, 0);
  const totalReviews = totalApproved + totalRejected;
  const overallApprovalRate = totalReviews > 0 ? (totalApproved / totalReviews) * 100 : 0;

  // Calculate trend (compare first half to second half)
  const midPoint = Math.floor(dataWithApprovalRate.length / 2);
  const firstHalfRate = dataWithApprovalRate.slice(0, midPoint).reduce((sum, d) => sum + d.approvalRate, 0) / midPoint || 0;
  const secondHalfRate = dataWithApprovalRate.slice(midPoint).reduce((sum, d) => sum + d.approvalRate, 0) / (dataWithApprovalRate.length - midPoint) || 0;
  const rateTrend = secondHalfRate - firstHalfRate;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: compact ? 24 : 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data || data.daily_reviews.length === 0) {
    return (
      <Card>
        <Empty description={t('common.noData', 'No data available')} />
      </Card>
    );
  }

  const renderTrendsChart = () => (
    <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
      <AreaChart data={dataWithApprovalRate}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
        />
        <Legend />
        <Area
          type="monotone"
          dataKey="approved"
          stackId="1"
          stroke="#52c41a"
          fill="#52c41a"
          fillOpacity={0.6}
          name={t('qc.approved', 'Approved')}
        />
        <Area
          type="monotone"
          dataKey="rejected"
          stackId="1"
          stroke="#f5222d"
          fill="#f5222d"
          fillOpacity={0.6}
          name={t('qc.rejected', 'Rejected')}
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  const renderApprovalRateChart = () => (
    <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
      <LineChart data={dataWithApprovalRate}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        />
        <YAxis domain={[0, 100]} unit="%" />
        <Tooltip
          labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
          formatter={(value) => [`${(value as number).toFixed(1)}%`, t('qc.approval_rate', 'Approval Rate')]}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="approvalRate"
          stroke="#1890ff"
          strokeWidth={2}
          dot={{ fill: '#1890ff' }}
          name={t('qc.approval_rate', 'Approval Rate')}
        />
        {/* Reference line for target */}
        <Line
          type="monotone"
          dataKey={() => 90}
          stroke="#52c41a"
          strokeDasharray="5 5"
          name={t('qc.target', 'Target (90%)')}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderCombinedChart = () => (
    <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
      <ComposedChart data={dataWithApprovalRate}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
        <Tooltip
          labelFormatter={(label) => new Date(label as string).toLocaleDateString()}
        />
        <Legend />
        <Bar
          yAxisId="left"
          dataKey="approved"
          fill="#52c41a"
          name={t('qc.approved', 'Approved')}
        />
        <Bar
          yAxisId="left"
          dataKey="rejected"
          fill="#f5222d"
          name={t('qc.rejected', 'Rejected')}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="approvalRate"
          stroke="#1890ff"
          strokeWidth={2}
          name={t('qc.approval_rate', 'Approval Rate')}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>
          {t('qc.review_trends', 'Review Trends')}
        </Title>
        {!compact && (
          <Segmented
            value={chartView}
            onChange={(value) => setChartView(value as ChartView)}
            options={[
              { label: t('qc.volume', 'Volume'), value: 'trends' },
              { label: t('qc.approval_rate', 'Approval Rate'), value: 'approval_rate' },
              { label: t('qc.combined', 'Combined'), value: 'combined' },
            ]}
          />
        )}
      </div>

      {chartView === 'trends' && renderTrendsChart()}
      {chartView === 'approval_rate' && renderApprovalRateChart()}
      {chartView === 'combined' && renderCombinedChart()}

      {/* Summary Stats */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={6}>
          <Statistic
            title={t('qc.total_reviews', 'Total Reviews')}
            value={totalReviews}
            valueStyle={{ fontSize: compact ? 18 : 24 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('qc.approved', 'Approved')}
            value={totalApproved}
            valueStyle={{ color: '#52c41a', fontSize: compact ? 18 : 24 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('qc.rejected', 'Rejected')}
            value={totalRejected}
            valueStyle={{ color: '#f5222d', fontSize: compact ? 18 : 24 }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('qc.approval_rate', 'Approval Rate')}
            value={overallApprovalRate.toFixed(1)}
            suffix="%"
            prefix={
              rateTrend > 0 ? (
                <RiseOutlined style={{ color: '#52c41a', fontSize: 14 }} />
              ) : rateTrend < 0 ? (
                <FallOutlined style={{ color: '#f5222d', fontSize: 14 }} />
              ) : null
            }
            valueStyle={{
              color: overallApprovalRate >= 90 ? '#52c41a' : overallApprovalRate >= 70 ? '#faad14' : '#f5222d',
              fontSize: compact ? 18 : 24,
            }}
          />
        </Col>
      </Row>

      {/* Top Rejection Reasons - only show in non-compact mode */}
      {!compact && data.common_rejection_reasons && data.common_rejection_reasons.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Title level={5}>{t('qc.top_rejection_reasons', 'Top Rejection Reasons')}</Title>
          <Space wrap>
            {data.common_rejection_reasons.slice(0, 4).map((reason, index) => (
              <Tag
                key={reason.reason}
                color={index === 0 ? 'red' : index === 1 ? 'orange' : index === 2 ? 'gold' : 'default'}
              >
                {reason.reason} ({reason.count})
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </Card>
  );
}

export default QCTrendsChart;
