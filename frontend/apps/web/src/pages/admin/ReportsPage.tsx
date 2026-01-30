import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Typography,
  Spin,
  Alert,
  Divider,
  Table,
  Tag,
} from 'antd';
import {
  TeamOutlined,
  ToolOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  reportsApi,
  type AdminDashboardData,
  type PauseAnalytics,
  type DefectAnalytics,
  type CapacityData,
} from '@inspection/shared';

export default function ReportsPage() {
  const { t } = useTranslation();

  const { data: dashboardData, isLoading: dashboardLoading, isError: dashboardError } = useQuery({
    queryKey: ['reports', 'admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard(),
  });

  const { data: defectData, isLoading: defectLoading, isError: defectError } = useQuery({
    queryKey: ['reports', 'defect-analytics'],
    queryFn: () => reportsApi.getDefectAnalytics(),
  });

  const { data: pauseData, isLoading: pauseLoading, isError: pauseError } = useQuery({
    queryKey: ['reports', 'pause-analytics'],
    queryFn: () => reportsApi.getPauseAnalytics(),
  });

  const { data: capacityData, isLoading: capacityLoading, isError: capacityError } = useQuery({
    queryKey: ['reports', 'capacity'],
    queryFn: () => reportsApi.getCapacity(),
  });

  const dashboard: AdminDashboardData | undefined = dashboardData?.data?.data;
  const defects: DefectAnalytics | undefined = defectData?.data?.data;
  const pauses: PauseAnalytics | undefined = pauseData?.data?.data;
  const capacity: CapacityData | undefined = capacityData?.data?.data;

  const isLoading = dashboardLoading || defectLoading || pauseLoading || capacityLoading;
  const hasError = dashboardError || defectError || pauseError || capacityError;

  if (hasError) {
    return (
      <Alert
        type="error"
        message={t('reports.error', 'Failed to load reports data')}
        description={t('reports.errorDescription', 'Please try again later.')}
        showIcon
      />
    );
  }

  return (
    <Spin spinning={isLoading}>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>
        {t('nav.reports', 'Reports & Analytics')}
      </Typography.Title>

      {/* Admin Dashboard Overview */}
      {dashboard && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={8} md={4}>
            <Card>
              <Statistic
                title={t('reports.usersCount', 'Total Users')}
                value={dashboard.users_count}
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card>
              <Statistic
                title={t('reports.equipmentCount', 'Equipment')}
                value={dashboard.equipment_count}
                prefix={<ToolOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card>
              <Statistic
                title={t('reports.inspectionsToday', 'Inspections Today')}
                value={dashboard.inspections_today}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card>
              <Statistic
                title={t('reports.openDefects', 'Open Defects')}
                value={dashboard.open_defects}
                prefix={<ExclamationCircleOutlined />}
                valueStyle={{ color: dashboard.open_defects > 0 ? '#cf1322' : undefined }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Card>
              <Statistic
                title={t('reports.activeLeaves', 'Active Leaves')}
                value={dashboard.active_leaves}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Capacity Section */}
      {capacity && (
        <Card
          title={t('reports.capacity', 'Staff Capacity')}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[24, 16]}>
            <Col xs={12} sm={6}>
              <Statistic title={t('reports.totalStaff', 'Total Staff')} value={capacity.total_staff} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title={t('reports.available', 'Available')}
                value={capacity.available}
                valueStyle={{ color: '#3f8600' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title={t('reports.onLeave', 'On Leave')}
                value={capacity.on_leave}
                valueStyle={{ color: '#cf1322' }}
              />
            </Col>
            <Col xs={12} sm={6}>
              <div>
                <Typography.Text type="secondary">
                  {t('reports.utilizationRate', 'Utilization Rate')}
                </Typography.Text>
                <Progress
                  percent={Math.round(capacity.utilization_rate * 100)}
                  status={capacity.utilization_rate > 0.8 ? 'success' : capacity.utilization_rate > 0.5 ? 'normal' : 'exception'}
                  style={{ marginTop: 8 }}
                />
              </div>
            </Col>
          </Row>
        </Card>
      )}

      <Row gutter={[16, 16]}>
        {/* Defect Analytics */}
        {defects && (
          <Col xs={24} lg={12}>
            <Card title={t('reports.defectAnalytics', 'Defect Analytics')} style={{ marginBottom: 24 }}>
              <Statistic
                title={t('reports.totalDefects', 'Total Defects')}
                value={defects.total_defects}
                style={{ marginBottom: 24 }}
              />

              <Divider orientation="left">
                {t('reports.bySeverity', 'By Severity')}
              </Divider>
              <Table
                rowKey="key"
                dataSource={Object.entries(defects.by_severity).map(([key, value]) => ({
                  key,
                  severity: key,
                  count: value,
                }))}
                columns={[
                  {
                    title: t('reports.severity', 'Severity'),
                    dataIndex: 'severity',
                    key: 'severity',
                    render: (v: string) => {
                      const colors: Record<string, string> = { critical: 'red', high: 'orange', medium: 'gold', low: 'green' };
                      return <Tag color={colors[v.toLowerCase()] || 'default'}>{v.toUpperCase()}</Tag>;
                    },
                  },
                  {
                    title: t('reports.count', 'Count'),
                    dataIndex: 'count',
                    key: 'count',
                  },
                  {
                    title: t('reports.percentage', 'Percentage'),
                    key: 'percentage',
                    render: (_: unknown, record: { count: number }) => {
                      const pct = defects.total_defects > 0 ? Math.round((record.count / defects.total_defects) * 100) : 0;
                      return <Progress percent={pct} size="small" />;
                    },
                  },
                ]}
                pagination={false}
                size="small"
              />

              <Divider orientation="left">
                {t('reports.byStatus', 'By Status')}
              </Divider>
              <Table
                rowKey="key"
                dataSource={Object.entries(defects.by_status).map(([key, value]) => ({
                  key,
                  status: key,
                  count: value,
                }))}
                columns={[
                  {
                    title: t('reports.status', 'Status'),
                    dataIndex: 'status',
                    key: 'status',
                    render: (v: string) => {
                      const colors: Record<string, string> = { open: 'red', in_progress: 'processing', resolved: 'green', closed: 'default' };
                      return <Tag color={colors[v.toLowerCase()] || 'blue'}>{v.replace(/_/g, ' ').toUpperCase()}</Tag>;
                    },
                  },
                  {
                    title: t('reports.count', 'Count'),
                    dataIndex: 'count',
                    key: 'count',
                  },
                  {
                    title: t('reports.percentage', 'Percentage'),
                    key: 'percentage',
                    render: (_: unknown, record: { count: number }) => {
                      const pct = defects.total_defects > 0 ? Math.round((record.count / defects.total_defects) * 100) : 0;
                      return <Progress percent={pct} size="small" />;
                    },
                  },
                ]}
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        )}

        {/* Pause Analytics */}
        {pauses && (
          <Col xs={24} lg={12}>
            <Card title={t('reports.pauseAnalytics', 'Pause Analytics')} style={{ marginBottom: 24 }}>
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col span={12}>
                  <Statistic
                    title={t('reports.totalPauses', 'Total Pauses')}
                    value={pauses.total_pauses}
                    prefix={<ClockCircleOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('reports.avgDuration', 'Average Duration')}
                    value={pauses.average_duration_minutes}
                    suffix={t('reports.minutes', 'min')}
                    precision={1}
                  />
                </Col>
              </Row>

              <Divider orientation="left">
                {t('reports.byCategory', 'By Category')}
              </Divider>
              <Table
                rowKey="key"
                dataSource={Object.entries(pauses.by_category).map(([key, value]) => ({
                  key,
                  category: key,
                  count: value,
                }))}
                columns={[
                  {
                    title: t('reports.category', 'Category'),
                    dataIndex: 'category',
                    key: 'category',
                    render: (v: string) => {
                      const colors: Record<string, string> = {
                        parts: 'blue', duty_finish: 'gold', tools: 'orange',
                        manpower: 'purple', oem: 'cyan', other: 'default',
                      };
                      return <Tag color={colors[v.toLowerCase()] || 'default'}>{v.replace(/_/g, ' ').toUpperCase()}</Tag>;
                    },
                  },
                  {
                    title: t('reports.count', 'Count'),
                    dataIndex: 'count',
                    key: 'count',
                  },
                  {
                    title: t('reports.percentage', 'Percentage'),
                    key: 'percentage',
                    render: (_: unknown, record: { count: number }) => {
                      const pct = pauses.total_pauses > 0 ? Math.round((record.count / pauses.total_pauses) * 100) : 0;
                      return <Progress percent={pct} size="small" />;
                    },
                  },
                ]}
                pagination={false}
                size="small"
              />
            </Card>
          </Col>
        )}
      </Row>
    </Spin>
  );
}
