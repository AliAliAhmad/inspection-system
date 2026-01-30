import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Row, Col, Statistic, Typography, Spin, Alert } from 'antd';
import { CheckCircleOutlined, WarningOutlined, ToolOutlined, PercentageOutlined, TeamOutlined, AppstoreOutlined, CalendarOutlined, } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi } from '@inspection/shared';
export default function DashboardPage() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const isAdmin = user?.role === 'admin';
    const { data: dashData, isLoading: dashLoading, error: dashError } = useQuery({
        queryKey: ['dashboard'],
        queryFn: () => reportsApi.getDashboard().then(r => r.data.data),
        enabled: !isAdmin,
    });
    const { data: adminData, isLoading: adminLoading, error: adminError } = useQuery({
        queryKey: ['admin-dashboard'],
        queryFn: () => reportsApi.getAdminDashboard().then(r => r.data.data),
        enabled: isAdmin,
    });
    const loading = isAdmin ? adminLoading : dashLoading;
    const error = isAdmin ? adminError : dashError;
    if (loading) {
        return _jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, { size: "large" }) });
    }
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsxs(Typography.Title, { level: 4, children: [t('common.welcome'), ", ", user?.full_name] }), isAdmin && adminData ? (_jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.users'), value: adminData.users_count, prefix: _jsx(TeamOutlined, {}) }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.equipment'), value: adminData.equipment_count, prefix: _jsx(AppstoreOutlined, {}) }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.inspections'), value: adminData.inspections_today, prefix: _jsx(CheckCircleOutlined, {}) }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.defects'), value: adminData.open_defects, prefix: _jsx(WarningOutlined, {}), valueStyle: { color: adminData.open_defects > 0 ? '#cf1322' : undefined } }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.leaves'), value: adminData.active_leaves, prefix: _jsx(CalendarOutlined, {}) }) }) })] })) : dashData ? (_jsxs(Row, { gutter: [16, 16], children: [_jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.inspections'), value: dashData.total_inspections, prefix: _jsx(CheckCircleOutlined, {}) }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: t('nav.defects'), value: dashData.pending_defects, prefix: _jsx(WarningOutlined, {}), valueStyle: { color: dashData.pending_defects > 0 ? '#cf1322' : undefined } }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "Active Jobs", value: dashData.active_jobs, prefix: _jsx(ToolOutlined, {}) }) }) }), _jsx(Col, { xs: 24, sm: 12, lg: 6, children: _jsx(Card, { children: _jsx(Statistic, { title: "Completion Rate", value: dashData.completion_rate, suffix: "%", prefix: _jsx(PercentageOutlined, {}), valueStyle: { color: '#3f8600' } }) }) })] })) : null] }));
}
//# sourceMappingURL=DashboardPage.js.map