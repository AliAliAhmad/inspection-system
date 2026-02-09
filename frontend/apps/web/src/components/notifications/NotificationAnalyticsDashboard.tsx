import { useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  DatePicker,
  Space,
  Typography,
  Spin,
  Tag,
  Progress,
  Select,
  List,
  Tooltip,
} from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
  BarChartOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { notificationsApi, NotificationAnalytics, NotificationPriority } from '@inspection/shared';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export interface NotificationAnalyticsDashboardProps {
  defaultDateRange?: [Dayjs, Dayjs];
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

const TYPE_COLORS = [
  '#1677ff',
  '#52c41a',
  '#fa8c16',
  '#eb2f96',
  '#722ed1',
  '#13c2c2',
  '#faad14',
  '#f5222d',
];

export function NotificationAnalyticsDashboard({
  defaultDateRange,
}: NotificationAnalyticsDashboardProps) {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(
    defaultDateRange || [dayjs().subtract(30, 'day'), dayjs()]
  );
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // Fetch analytics
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['notifications', 'analytics', dateRange[0].toISOString(), dateRange[1].toISOString(), groupBy],
    queryFn: () =>
      notificationsApi
        .getAnalytics({
          date_from: dateRange[0].toISOString(),
          date_to: dateRange[1].toISOString(),
          group_by: groupBy,
        })
        .then((r) => r.data),
  });

  const analytics: NotificationAnalytics | null = analyticsData?.data || null;

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <Text type="secondary">{t('notifications.noAnalyticsData', 'No analytics data available')}</Text>
      </Card>
    );
  }

  // Prepare chart data
  const priorityData = Object.entries(analytics.by_priority).map(([priority, count]) => ({
    name: priority,
    value: count,
    color: PRIORITY_COLORS[priority as NotificationPriority] || '#8c8c8c',
  }));

  const totalByPriority = priorityData.reduce((sum, item) => sum + item.value, 0);

  const typeData = Object.entries(analytics.by_type)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, count], index) => ({
      name: type.replace(/_/g, ' '),
      value: count,
      color: TYPE_COLORS[index % TYPE_COLORS.length],
    }));

  const totalByType = typeData.reduce((sum, item) => sum + item.value, 0);

  const hourlyData = analytics.hourly_distribution.map((item) => ({
    hour: `${item.hour}:00`,
    count: item.count,
  }));

  const maxHourlyCount = Math.max(...hourlyData.map((d) => d.count), 1);

  return (
    <div>
      {/* Header with filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              <BarChartOutlined /> {t('notifications.analyticsDashboard', 'Notification Analytics')}
            </Title>
          </Col>
          <Col>
            <Space>
              <Select
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { value: 'day', label: 'Daily' },
                  { value: 'week', label: 'Weekly' },
                  { value: 'month', label: 'Monthly' },
                ]}
                style={{ width: 100 }}
              />
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0], dates[1]]);
                  }
                }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('notifications.totalSent', 'Total Sent')}
              value={analytics.total_sent}
              prefix={<BellOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('notifications.totalRead', 'Total Read')}
              value={analytics.total_read}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('notifications.readRate', 'Read Rate')}
              value={analytics.read_rate}
              precision={1}
              suffix="%"
              prefix={
                analytics.read_rate >= 80 ? (
                  <RiseOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <FallOutlined style={{ color: '#f5222d' }} />
                )
              }
              valueStyle={{ color: analytics.read_rate >= 80 ? '#52c41a' : '#f5222d' }}
            />
            <Progress
              percent={analytics.read_rate}
              showInfo={false}
              strokeColor={analytics.read_rate >= 80 ? '#52c41a' : '#f5222d'}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('notifications.avgResponseTime', 'Avg Response Time')}
              value={analytics.avg_response_time}
              precision={0}
              suffix={t('common.minutes', 'min')}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row 1 - Priority and Type Distribution */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <PieChartOutlined />
                {t('notifications.byPriority', 'By Priority')}
              </Space>
            }
          >
            <List
              dataSource={priorityData}
              renderItem={(item) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Tag color={item.color}>{item.name.toUpperCase()}</Tag>
                      <Text>
                        {item.value} ({totalByPriority > 0 ? Math.round((item.value / totalByPriority) * 100) : 0}%)
                      </Text>
                    </div>
                    <Progress
                      percent={totalByPriority > 0 ? (item.value / totalByPriority) * 100 : 0}
                      showInfo={false}
                      strokeColor={item.color}
                      size="small"
                    />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                {t('notifications.byType', 'By Type (Top 8)')}
              </Space>
            }
          >
            <List
              size="small"
              dataSource={typeData}
              renderItem={(item, index) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text ellipsis style={{ maxWidth: 200 }}>{item.name}</Text>
                      <Text strong>{item.value}</Text>
                    </div>
                    <Progress
                      percent={totalByType > 0 ? (item.value / totalByType) * 100 : 0}
                      showInfo={false}
                      strokeColor={item.color}
                      size="small"
                    />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Hourly Distribution */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined />
                {t('notifications.hourlyDistribution', 'Hourly Distribution')}
              </Space>
            }
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 150, gap: 4 }}>
              {hourlyData.map((item) => (
                <Tooltip key={item.hour} title={`${item.hour}: ${item.count} notifications`}>
                  <div
                    style={{
                      flex: 1,
                      background: '#1677ff',
                      height: `${(item.count / maxHourlyCount) * 100}%`,
                      minHeight: 4,
                      borderRadius: '4px 4px 0 0',
                      opacity: 0.8,
                      transition: 'opacity 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
                  />
                </Tooltip>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>0:00</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>6:00</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>12:00</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>18:00</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>23:00</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Escalation Stats & Top Users */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined />
                {t('notifications.escalationStats', 'Escalation Stats')}
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Statistic
                title={t('notifications.totalEscalated', 'Total Escalated')}
                value={analytics.escalation_stats.total_escalated}
                valueStyle={{ fontSize: 24 }}
              />
              <div>
                <Text type="secondary">{t('notifications.avgEscalationTime', 'Avg Escalation Time')}</Text>
                <div>
                  <Text strong style={{ fontSize: 20 }}>
                    {analytics.escalation_stats.avg_escalation_time} min
                  </Text>
                </div>
              </div>
              <div>
                <Text type="secondary">{t('notifications.resolvedBeforeEscalation', 'Resolved Before Escalation')}</Text>
                <Progress
                  percent={
                    analytics.escalation_stats.total_escalated > 0
                      ? Math.round(
                          (analytics.escalation_stats.resolved_before_escalation /
                            (analytics.escalation_stats.total_escalated +
                              analytics.escalation_stats.resolved_before_escalation)) *
                            100
                        )
                      : 100
                  }
                  status={
                    analytics.escalation_stats.resolved_before_escalation >
                    analytics.escalation_stats.total_escalated
                      ? 'success'
                      : 'normal'
                  }
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <UserOutlined />
                {t('notifications.topUsers', 'Top Users by Notifications')}
              </Space>
            }
          >
            <Table
              dataSource={analytics.top_users.slice(0, 5)}
              rowKey="user_id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: t('common.rank', 'Rank'),
                  key: 'rank',
                  width: 60,
                  render: (_: unknown, __: unknown, index: number) => (
                    <Tag color={index < 3 ? ['gold', 'silver', '#cd7f32'][index] : 'default'}>
                      #{index + 1}
                    </Tag>
                  ),
                },
                {
                  title: t('common.user', 'User'),
                  dataIndex: 'user_name',
                  key: 'user_name',
                },
                {
                  title: t('notifications.count', 'Count'),
                  dataIndex: 'count',
                  key: 'count',
                  render: (count: number) => <Text strong>{count}</Text>,
                },
                {
                  title: t('common.share', 'Share'),
                  key: 'share',
                  render: (_: unknown, record: { count: number }) => (
                    <Progress
                      percent={Math.round((record.count / analytics.total_sent) * 100)}
                      size="small"
                      style={{ width: 100 }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default NotificationAnalyticsDashboard;
