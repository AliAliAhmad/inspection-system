import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Row,
  Col,
  Spin,
  Empty,
  Tag,
  Statistic,
  Segmented,
  List,
  Alert,
} from 'antd';
import {
  DashboardOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BulbOutlined,
  WarningOutlined,
  PercentageOutlined,
  TeamOutlined,
  ToolOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsAIApi, type ExecutiveSummary } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface ExecutiveSummaryCardProps {
  compact?: boolean;
}

type Period = 'daily' | 'weekly' | 'monthly';

const TREND_CONFIG = {
  up: { color: '#52c41a', icon: <RiseOutlined />, label: 'Improving' },
  down: { color: '#ff4d4f', icon: <FallOutlined />, label: 'Declining' },
  stable: { color: '#1677ff', icon: <MinusOutlined />, label: 'Stable' },
};

export function ExecutiveSummaryCard({ compact = false }: ExecutiveSummaryCardProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('weekly');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports-ai', 'executive-summary', period],
    queryFn: () => reportsAIApi.getExecutiveSummary(period),
  });

  const summary: ExecutiveSummary | null = data || null;

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
      <Alert
        type="error"
        message={t('reports.ai.error', 'Failed to load executive summary')}
        showIcon
      />
    );
  }

  if (!summary) {
    return (
      <Card
        title={
          <Space>
            <DashboardOutlined style={{ color: '#1677ff' }} />
            {t('reports.ai.executiveSummary', 'Executive Summary')}
          </Space>
        }
      >
        <Empty description={t('reports.ai.noData', 'No summary data available')} />
      </Card>
    );
  }

  if (compact) {
    return (
      <Card size="small">
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Statistic
              title={t('reports.ai.passRate', 'Pass Rate')}
              value={summary.kpis.inspections.pass_rate}
              suffix="%"
              valueStyle={{
                color: summary.kpis.inspections.pass_rate >= 90 ? '#52c41a' : '#faad14',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('reports.ai.openDefects', 'Open Defects')}
              value={summary.kpis.defects.open}
              valueStyle={{
                color: summary.kpis.defects.critical > 0 ? '#ff4d4f' : undefined,
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('reports.ai.slaBreaches', 'SLA Breaches')}
              value={summary.kpis.sla.breached_count}
              valueStyle={{
                color: summary.kpis.sla.breached_count > 0 ? '#ff4d4f' : '#52c41a',
              }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title={t('reports.ai.utilization', 'Utilization')}
              value={summary.kpis.workforce.utilization}
              suffix="%"
            />
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <DashboardOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('reports.ai.executiveSummary', 'Executive Summary')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {summary.period_start} - {summary.period_end}
          </Text>
          <Segmented
            value={period}
            onChange={(val) => setPeriod(val as Period)}
            options={[
              { label: t('reports.ai.daily', 'Daily'), value: 'daily' },
              { label: t('reports.ai.weekly', 'Weekly'), value: 'weekly' },
              { label: t('reports.ai.monthly', 'Monthly'), value: 'monthly' },
            ]}
            size="small"
          />
        </Space>
      }
    >
      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Inspections */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}
          >
            <Statistic
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  {t('reports.ai.inspections', 'Inspections')}
                </Space>
              }
              value={summary.kpis.inspections.total}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({summary.kpis.inspections.pass_rate}% pass)
                </Text>
              }
            />
          </Card>
        </Col>

        {/* Defects */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{
              backgroundColor: summary.kpis.defects.critical > 0 ? '#fff2f0' : '#fffbe6',
              borderColor: summary.kpis.defects.critical > 0 ? '#ffccc7' : '#ffe58f',
            }}
          >
            <Statistic
              title={
                <Space>
                  <ExclamationCircleOutlined
                    style={{ color: summary.kpis.defects.critical > 0 ? '#ff4d4f' : '#faad14' }}
                  />
                  {t('reports.ai.defects', 'Defects')}
                </Space>
              }
              value={summary.kpis.defects.open}
              valueStyle={{
                color: summary.kpis.defects.critical > 0 ? '#ff4d4f' : undefined,
              }}
              suffix={
                summary.kpis.defects.critical > 0 && (
                  <Tag color="error" style={{ marginLeft: 8 }}>
                    {summary.kpis.defects.critical} Critical
                  </Tag>
                )
              }
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {summary.kpis.defects.resolution_rate}% resolution rate
              </Text>
            </div>
          </Card>
        </Col>

        {/* Jobs Completed */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ backgroundColor: '#e6f7ff', borderColor: '#91d5ff' }}
          >
            <Statistic
              title={
                <Space>
                  <ToolOutlined style={{ color: '#1677ff' }} />
                  {t('reports.ai.jobsCompleted', 'Jobs Completed')}
                </Space>
              }
              value={summary.kpis.jobs.total_completed}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Specialists: {summary.kpis.jobs.specialist_completed} | Engineers:{' '}
                {summary.kpis.jobs.engineer_completed}
              </Text>
            </div>
          </Card>
        </Col>

        {/* Workforce */}
        <Col xs={24} sm={12} md={6}>
          <Card
            size="small"
            style={{ backgroundColor: '#f9f0ff', borderColor: '#d3adf7' }}
          >
            <Statistic
              title={
                <Space>
                  <TeamOutlined style={{ color: '#722ed1' }} />
                  {t('reports.ai.workforce', 'Workforce')}
                </Space>
              }
              value={summary.kpis.workforce.active}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  active ({summary.kpis.workforce.utilization}%)
                </Text>
              }
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {summary.kpis.workforce.on_leave} on leave
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* SLA and Trends Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* SLA Breaches */}
        <Col xs={24} md={8}>
          <Card
            size="small"
            style={{
              backgroundColor: summary.kpis.sla.breached_count > 0 ? '#fff2f0' : '#f6ffed',
              borderColor: summary.kpis.sla.breached_count > 0 ? '#ffccc7' : '#b7eb8f',
            }}
          >
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined
                    style={{ color: summary.kpis.sla.breached_count > 0 ? '#ff4d4f' : '#52c41a' }}
                  />
                  {t('reports.ai.slaBreaches', 'SLA Breaches')}
                </Space>
              }
              value={summary.kpis.sla.breached_count}
              valueStyle={{
                color: summary.kpis.sla.breached_count > 0 ? '#ff4d4f' : '#52c41a',
              }}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({summary.kpis.sla.breach_rate}% rate)
                </Text>
              }
            />
          </Card>
        </Col>

        {/* Trends */}
        <Col xs={24} md={16}>
          <Card size="small" title={t('reports.ai.trends', 'Trends')}>
            <Space wrap>
              {summary.trends.map((trend, index) => {
                const config = TREND_CONFIG[trend.direction] || {
                  color: '#1677ff',
                  icon: <MinusOutlined />,
                  label: trend.direction,
                };
                return (
                  <Tag
                    key={index}
                    icon={config.icon}
                    color={
                      trend.direction === 'up'
                        ? 'success'
                        : trend.direction === 'down'
                        ? 'error'
                        : 'processing'
                    }
                    style={{ padding: '4px 12px' }}
                  >
                    {trend.metric}: {trend.change_percentage >= 0 ? '+' : ''}
                    {trend.change_percentage}%
                  </Tag>
                );
              })}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Highlights and Concerns */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Highlights */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f', height: '100%' }}
          >
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              <CheckCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />
              {t('reports.ai.highlights', 'Highlights')}
            </Text>
            <List
              size="small"
              dataSource={summary.highlights}
              renderItem={(item) => (
                <List.Item style={{ padding: '8px 0', border: 'none' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text style={{ fontSize: 13 }}>{item}</Text>
                  </Space>
                </List.Item>
              )}
              locale={{ emptyText: t('reports.ai.noHighlights', 'No highlights') }}
            />
          </Card>
        </Col>

        {/* Concerns */}
        <Col xs={24} md={12}>
          <Card
            size="small"
            style={{
              backgroundColor: summary.concerns.length > 0 ? '#fff2f0' : '#fafafa',
              borderColor: summary.concerns.length > 0 ? '#ffccc7' : '#f0f0f0',
              height: '100%',
            }}
          >
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              <WarningOutlined
                style={{
                  marginRight: 8,
                  color: summary.concerns.length > 0 ? '#ff4d4f' : '#8c8c8c',
                }}
              />
              {t('reports.ai.concerns', 'Concerns')}
            </Text>
            <List
              size="small"
              dataSource={summary.concerns}
              renderItem={(item) => (
                <List.Item style={{ padding: '8px 0', border: 'none' }}>
                  <Space>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                    <Text style={{ fontSize: 13 }}>{item}</Text>
                  </Space>
                </List.Item>
              )}
              locale={{ emptyText: t('reports.ai.noConcerns', 'No concerns') }}
            />
          </Card>
        </Col>
      </Row>

      {/* Recommendations */}
      {summary.recommendations.length > 0 && (
        <Card
          size="small"
          style={{ backgroundColor: '#e6f7ff', borderColor: '#91d5ff' }}
        >
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            <BulbOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            {t('reports.ai.recommendations', 'Recommendations')}
          </Text>
          <List
            size="small"
            dataSource={summary.recommendations}
            renderItem={(item, index) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Space align="start">
                  <Tag color="blue" style={{ marginTop: 2 }}>
                    {index + 1}
                  </Tag>
                  <Text style={{ fontSize: 13 }}>{item}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Generated At */}
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('reports.ai.generatedAt', 'Generated at')}: {summary.generated_at}
        </Text>
      </div>
    </Card>
  );
}

export default ExecutiveSummaryCard;
