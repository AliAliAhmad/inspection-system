import { Card, Row, Col, Statistic, Typography, Spin, Alert } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  ToolOutlined,
  PercentageOutlined,
  TeamOutlined,
  AppstoreOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData } from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'admin';

  const { data: dashData, isLoading: dashLoading, error: dashError } = useOfflineQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard().then(r => r.data.data),
    enabled: !isAdmin,
    cacheKey: CACHE_KEYS.dashboard,
    cacheTtlMs: 15 * 60 * 1000, // 15 minutes
  });

  const { data: adminData, isLoading: adminLoading, error: adminError } = useOfflineQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard().then(r => r.data.data),
    enabled: isAdmin,
    cacheKey: 'admin-dashboard',
    cacheTtlMs: 15 * 60 * 1000, // 15 minutes
  });

  const loading = isAdmin ? adminLoading : dashLoading;
  const error = isAdmin ? adminError : dashError;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;
  }

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  return (
    <div>
      <Typography.Title level={4}>
        {t('common.welcome')}, {user?.full_name}
      </Typography.Title>

      {isAdmin && adminData ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.users')} value={adminData.users_count} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.equipment')} value={adminData.equipment_count} prefix={<AppstoreOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.inspections')} value={adminData.inspections_today} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.defects')} value={adminData.open_defects} prefix={<WarningOutlined />} valueStyle={{ color: adminData.open_defects > 0 ? '#cf1322' : undefined }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.leaves')} value={adminData.active_leaves} prefix={<CalendarOutlined />} />
            </Card>
          </Col>
        </Row>
      ) : dashData ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.inspections')} value={dashData.total_inspections} prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('nav.defects')} value={dashData.pending_defects} prefix={<WarningOutlined />} valueStyle={{ color: dashData.pending_defects > 0 ? '#cf1322' : undefined }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Active Jobs" value={dashData.active_jobs} prefix={<ToolOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Completion Rate" value={dashData.completion_rate} suffix="%" prefix={<PercentageOutlined />} valueStyle={{ color: '#3f8600' }} />
            </Card>
          </Col>
        </Row>
      ) : null}
    </div>
  );
}
