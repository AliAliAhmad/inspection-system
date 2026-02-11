import { Row, Col, Card, Statistic, Button, Space, Spin, Tooltip, Progress } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  AlertOutlined,
  FileSearchOutlined,
  BugOutlined,
  AuditOutlined,
  ReloadOutlined,
  CalendarOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

interface OverdueSummary {
  inspections: {
    count: number;
    oldest_days: number;
  };
  defects: {
    count: number;
    oldest_days: number;
  };
  reviews: {
    count: number;
    oldest_days: number;
  };
  total: number;
}

interface DashboardProps {
  onViewCalendar?: () => void;
  onViewPatterns?: () => void;
  onBulkReschedule?: () => void;
  summary?: OverdueSummary;
  isLoading?: boolean;
}

export function OverdueDashboard({
  onViewCalendar,
  onViewPatterns,
  onBulkReschedule,
  summary,
  isLoading = false,
}: DashboardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Use provided summary or fetch from API
  const { data: overdueData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'summary'],
    queryFn: async () => {
      // This would call the overdue API endpoint
      // For now, return mock data structure
      return {
        inspections: { count: 12, oldest_days: 15 },
        defects: { count: 8, oldest_days: 22 },
        reviews: { count: 5, oldest_days: 7 },
        total: 25,
      } as OverdueSummary;
    },
    enabled: !summary,
  });

  const loading = isLoading || dataLoading;
  const data = summary || overdueData;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['overdue'] });
  };

  const getSeverityColor = (days: number) => {
    if (days >= 30) return '#ff4d4f';
    if (days >= 14) return '#fa8c16';
    if (days >= 7) return '#faad14';
    return '#52c41a';
  };

  const getSeverityLabel = (days: number) => {
    if (days >= 30) return t('overdue.critical', 'Critical');
    if (days >= 14) return t('overdue.high', 'High');
    if (days >= 7) return t('overdue.medium', 'Medium');
    return t('overdue.low', 'Low');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  const inspections = data?.inspections || { count: 0, oldest_days: 0 };
  const defects = data?.defects || { count: 0, oldest_days: 0 };
  const reviews = data?.reviews || { count: 0, oldest_days: 0 };
  const totalOverdue = data?.total || 0;

  // Calculate overall severity based on oldest item
  const maxOldest = Math.max(inspections.oldest_days, defects.oldest_days, reviews.oldest_days);
  const overallHealth = totalOverdue === 0 ? 100 : Math.max(0, 100 - (maxOldest * 2));

  return (
    <div style={{ marginBottom: 24 }}>
      <Row gutter={[16, 16]}>
        {/* Overdue Inspections */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            style={{
              background: inspections.count > 0 ? '#fff2f0' : '#f6ffed',
              borderLeft: `4px solid ${inspections.count > 0 ? getSeverityColor(inspections.oldest_days) : '#52c41a'}`,
            }}
          >
            <Statistic
              title={
                <span style={{ color: inspections.count > 0 ? '#ff4d4f' : '#52c41a' }}>
                  <FileSearchOutlined /> {t('overdue.inspections', 'Overdue Inspections')}
                </span>
              }
              value={inspections.count}
              valueStyle={{ color: inspections.count > 0 ? '#ff4d4f' : '#52c41a' }}
              suffix={
                inspections.count > 0 && (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    ({inspections.oldest_days}d {t('overdue.oldest', 'oldest')})
                  </span>
                )
              }
            />
          </Card>
        </Col>

        {/* Overdue Defects */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            style={{
              background: defects.count > 0 ? '#fff7e6' : '#f6ffed',
              borderLeft: `4px solid ${defects.count > 0 ? getSeverityColor(defects.oldest_days) : '#52c41a'}`,
            }}
          >
            <Statistic
              title={
                <span style={{ color: defects.count > 0 ? '#fa8c16' : '#52c41a' }}>
                  <BugOutlined /> {t('overdue.defects', 'Overdue Defects')}
                </span>
              }
              value={defects.count}
              valueStyle={{ color: defects.count > 0 ? '#fa8c16' : '#52c41a' }}
              suffix={
                defects.count > 0 && (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    ({defects.oldest_days}d {t('overdue.oldest', 'oldest')})
                  </span>
                )
              }
            />
          </Card>
        </Col>

        {/* Overdue Reviews */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            style={{
              background: reviews.count > 0 ? '#fffbe6' : '#f6ffed',
              borderLeft: `4px solid ${reviews.count > 0 ? getSeverityColor(reviews.oldest_days) : '#52c41a'}`,
            }}
          >
            <Statistic
              title={
                <span style={{ color: reviews.count > 0 ? '#faad14' : '#52c41a' }}>
                  <AuditOutlined /> {t('overdue.reviews', 'Overdue Reviews')}
                </span>
              }
              value={reviews.count}
              valueStyle={{ color: reviews.count > 0 ? '#faad14' : '#52c41a' }}
              suffix={
                reviews.count > 0 && (
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    ({reviews.oldest_days}d {t('overdue.oldest', 'oldest')})
                  </span>
                )
              }
            />
          </Card>
        </Col>

        {/* Total Overdue */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            style={{
              background: totalOverdue > 0 ? '#f0f0f0' : '#f6ffed',
              borderLeft: `4px solid ${totalOverdue > 0 ? '#ff4d4f' : '#52c41a'}`,
            }}
          >
            <Statistic
              title={
                <span style={{ color: totalOverdue > 0 ? '#262626' : '#52c41a' }}>
                  <AlertOutlined /> {t('overdue.total', 'Total Overdue')}
                </span>
              }
              value={totalOverdue}
              valueStyle={{ color: totalOverdue > 0 ? '#ff4d4f' : '#52c41a', fontSize: 32 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Health Gauge & Quick Actions */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={
              <Space>
                <ClockCircleOutlined />
                {t('overdue.health_status', 'Overdue Health Status')}
              </Space>
            }
            extra={
              <Tooltip title={t('common.refresh', 'Refresh')}>
                <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} />
              </Tooltip>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <Progress
                type="dashboard"
                percent={overallHealth}
                strokeColor={getSeverityColor(maxOldest)}
                format={() => (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 600, color: getSeverityColor(maxOldest) }}>
                      {totalOverdue}
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {t('overdue.items', 'items')}
                    </div>
                  </div>
                )}
              />
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: getSeverityColor(maxOldest), fontWeight: 600 }}>
                    {getSeverityLabel(maxOldest)}
                  </span>
                  <span style={{ color: '#8c8c8c' }}> {t('overdue.priority_level', 'priority level')}</span>
                </div>
                {maxOldest > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
                    <span style={{ color: '#8c8c8c' }}>
                      {t('overdue.oldest_item', 'Oldest item is')} <strong>{maxOldest}</strong> {t('overdue.days_overdue', 'days overdue')}
                    </span>
                  </div>
                )}
                {totalOverdue === 0 && (
                  <div>
                    <span style={{ color: '#52c41a' }}>
                      {t('overdue.all_clear', 'All items are up to date!')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title={t('overdue.quick_actions', 'Quick Actions')}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Row gutter={16}>
                <Col span={8}>
                  <Button
                    icon={<CalendarOutlined />}
                    onClick={onViewCalendar}
                    block
                    size="large"
                  >
                    {t('overdue.calendar', 'Calendar')}
                  </Button>
                </Col>
                <Col span={8}>
                  <Button
                    icon={<RobotOutlined />}
                    onClick={onViewPatterns}
                    block
                    size="large"
                    style={{ borderColor: '#722ed1', color: '#722ed1' }}
                  >
                    {t('overdue.patterns', 'AI Patterns')}
                  </Button>
                </Col>
                <Col span={8}>
                  <Button
                    type="primary"
                    icon={<ClockCircleOutlined />}
                    onClick={onBulkReschedule}
                    block
                    size="large"
                    disabled={totalOverdue === 0}
                  >
                    {t('overdue.bulk_reschedule', 'Reschedule')}
                  </Button>
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default OverdueDashboard;
