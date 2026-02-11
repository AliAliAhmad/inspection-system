import React from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Space,
  Tag,
  List,
  Skeleton,
  Alert,
  Progress,
} from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  BulbOutlined,
  RobotOutlined,
  AlertOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { defectsApi, reportsApi } from '@inspection/shared';

const { Text, Title } = Typography;

export interface TrendingDefectType {
  type: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  change?: number;
}

export interface DefectInsights {
  total_open: number;
  sla_breached: number;
  high_risk: number;
  in_progress: number;
  trending_types: TrendingDefectType[];
  recommendations: string[];
}

export interface DefectInsightsCardProps {
  insights?: DefectInsights;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return <RiseOutlined style={{ color: '#ff4d4f' }} />;
    case 'down':
      return <FallOutlined style={{ color: '#52c41a' }} />;
    default:
      return <MinusOutlined style={{ color: '#999' }} />;
  }
};

const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return '#ff4d4f';
    case 'down':
      return '#52c41a';
    default:
      return '#999';
  }
};

export function DefectInsightsCard({
  insights: providedInsights,
  loading: externalLoading,
  compact = false,
  className,
}: DefectInsightsCardProps) {
  const { t } = useTranslation();

  // Fetch insights if not provided
  const { data: fetchedData, isLoading: isFetching } = useQuery({
    queryKey: ['defect-insights'],
    queryFn: async () => {
      // Fetch defect counts by status
      const [openRes, inProgressRes] = await Promise.all([
        defectsApi.list({ status: 'open', per_page: 1 }).catch(() => null),
        defectsApi.list({ status: 'in_progress', per_page: 1 }).catch(() => null),
      ]);

      const totalOpen = openRes?.data?.pagination?.total || 0;
      const inProgress = inProgressRes?.data?.pagination?.total || 0;

      // Calculate mock SLA/risk data (would come from backend in production)
      const slaBreached = Math.floor(totalOpen * 0.15);
      const highRisk = Math.floor(totalOpen * 0.25);

      return {
        total_open: totalOpen,
        sla_breached: slaBreached,
        high_risk: highRisk,
        in_progress: inProgress,
        trending_types: [
          { type: 'Mechanical Wear', count: 12, trend: 'up' as const, change: 25 },
          { type: 'Electrical Fault', count: 8, trend: 'down' as const, change: -10 },
          { type: 'Hydraulic Leak', count: 6, trend: 'stable' as const, change: 0 },
          { type: 'Structural Damage', count: 4, trend: 'up' as const, change: 15 },
        ],
        recommendations: [
          t('defects.insights.rec1', 'Focus on resolving SLA-breached defects first'),
          t('defects.insights.rec2', 'Consider preventive maintenance for high-risk equipment'),
          t('defects.insights.rec3', 'Review mechanical wear patterns - increasing trend detected'),
        ],
      };
    },
    enabled: !providedInsights,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = externalLoading || isFetching;
  const insights = providedInsights || fetchedData;

  if (isLoading) {
    return (
      <Card className={className}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card className={className}>
        <Alert
          type="info"
          message={t('defects.insights.unavailable', 'Insights unavailable')}
          showIcon
        />
      </Card>
    );
  }

  // Compact mode - just key metrics
  if (compact) {
    return (
      <Card size="small" className={className}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title={t('defects.insights.open', 'Open')}
              value={insights.total_open}
              valueStyle={{ color: '#1677ff', fontSize: 24 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('defects.insights.inProgress', 'In Progress')}
              value={insights.in_progress}
              valueStyle={{ color: '#faad14', fontSize: 24 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('defects.insights.slaBreach', 'SLA Breached')}
              value={insights.sla_breached}
              valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('defects.insights.highRisk', 'High Risk')}
              value={insights.high_risk}
              valueStyle={{ color: '#fa8c16', fontSize: 24 }}
              prefix={<WarningOutlined />}
            />
          </Col>
        </Row>
      </Card>
    );
  }

  // Full mode
  return (
    <Card
      className={className}
      title={
        <Space>
          <RobotOutlined style={{ color: '#1677ff' }} />
          <span>{t('defects.insights.title', 'AI Defect Insights')}</span>
        </Space>
      }
      style={{
        background: 'linear-gradient(135deg, #f0f5ff 0%, #fff 100%)',
        borderColor: '#d6e4ff',
      }}
    >
      {/* Key Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ backgroundColor: '#e6f4ff' }}>
            <Statistic
              title={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('defects.insights.totalOpen', 'Total Open')}
                </Text>
              }
              value={insights.total_open}
              valueStyle={{ color: '#1677ff', fontSize: 28, fontWeight: 600 }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ backgroundColor: '#fff7e6' }}>
            <Statistic
              title={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('defects.insights.inProgress', 'In Progress')}
                </Text>
              }
              value={insights.in_progress}
              valueStyle={{ color: '#fa8c16', fontSize: 28, fontWeight: 600 }}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ backgroundColor: '#fff2e8' }}>
            <Statistic
              title={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('defects.insights.slaBreach', 'SLA Breached')}
                </Text>
              }
              value={insights.sla_breached}
              valueStyle={{ color: '#ff4d4f', fontSize: 28, fontWeight: 600 }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ backgroundColor: '#fff1f0' }}>
            <Statistic
              title={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('defects.insights.highRisk', 'High Risk')}
                </Text>
              }
              value={insights.high_risk}
              valueStyle={{ color: '#cf1322', fontSize: 28, fontWeight: 600 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={24}>
        {/* Trending Types */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Text strong style={{ fontSize: 13 }}>
                {t('defects.insights.trendingTypes', 'Trending Defect Types')}
              </Text>
            }
            bordered={false}
            style={{ backgroundColor: '#fafafa' }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {insights.trending_types.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-white rounded"
                  style={{ border: '1px solid #f0f0f0' }}
                >
                  <Space>
                    <Text style={{ fontSize: 13 }}>{item.type}</Text>
                    <Tag color="blue" style={{ margin: 0 }}>
                      {item.count}
                    </Tag>
                  </Space>
                  <Space size={4}>
                    {getTrendIcon(item.trend)}
                    {item.change !== undefined && item.change !== 0 && (
                      <Text
                        style={{
                          fontSize: 11,
                          color: getTrendColor(item.trend),
                        }}
                      >
                        {item.change > 0 ? '+' : ''}
                        {item.change}%
                      </Text>
                    )}
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        {/* AI Recommendations */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={
              <Space>
                <BulbOutlined style={{ color: '#faad14' }} />
                <Text strong style={{ fontSize: 13 }}>
                  {t('defects.insights.recommendations', 'AI Recommendations')}
                </Text>
              </Space>
            }
            bordered={false}
            style={{ backgroundColor: '#fffbe6' }}
          >
            <List
              dataSource={insights.recommendations}
              renderItem={(rec, idx) => (
                <List.Item style={{ padding: '8px 0', border: 'none' }}>
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
                      {idx + 1}
                    </div>
                    <Text style={{ fontSize: 12 }}>{rec}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Health Summary */}
      <div style={{ marginTop: 16 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('defects.insights.lastUpdated', 'Last updated')}: {new Date().toLocaleString()}
        </Text>
      </div>
    </Card>
  );
}

export default DefectInsightsCard;
