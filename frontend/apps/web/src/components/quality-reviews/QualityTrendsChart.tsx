import { Card, Typography, Spin, Row, Col, Empty, Table, Tag } from 'antd';
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
  BarChart,
  Bar,
} from 'recharts';

const { Title, Text } = Typography;

interface QualityTrendsChartProps {
  period?: 'week' | 'month' | 'year';
}

export function QualityTrendsChart({ period = 'month' }: QualityTrendsChartProps) {
  const { t } = useTranslation();

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
    ],
    common_rejection_reasons: [
      { reason: 'Incomplete documentation', count: 8 },
      { reason: 'Quality below standard', count: 5 },
      { reason: 'Missing photos', count: 3 },
      { reason: 'Incorrect parts used', count: 2 },
    ],
  };

  const data = trends || mockTrends;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <Empty description={t('common.noData', 'No data available')} />
      </Card>
    );
  }

  const rejectionColumns = [
    {
      title: t('qc.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
    },
    {
      title: t('common.count', 'Count'),
      dataIndex: 'count',
      key: 'count',
      width: 80,
      render: (count: number) => (
        <Tag color={count > 5 ? 'red' : count > 2 ? 'orange' : 'default'}>{count}</Tag>
      ),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card>
          <Title level={5}>{t('qc.review_trends', 'Review Trends')}</Title>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.daily_reviews}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
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
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card>
          <Title level={5}>{t('qc.rejection_reasons', 'Top Rejection Reasons')}</Title>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.common_rejection_reasons.slice(0, 4)} layout="vertical">
              <XAxis type="number" />
              <YAxis dataKey="reason" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f5222d" />
            </BarChart>
          </ResponsiveContainer>
          <Table
            dataSource={data.common_rejection_reasons}
            columns={rejectionColumns}
            pagination={false}
            size="small"
            rowKey="reason"
            style={{ marginTop: 16 }}
          />
        </Card>
      </Col>
    </Row>
  );
}

export default QualityTrendsChart;
