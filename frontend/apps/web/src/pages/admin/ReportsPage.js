import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Row, Col, Statistic, Progress, Typography, Spin, Alert, Divider, Table, Tag, } from 'antd';
import { TeamOutlined, ToolOutlined, ExclamationCircleOutlined, ClockCircleOutlined, UserOutlined, CheckCircleOutlined, } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi, } from '@inspection/shared';
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
    const dashboard = dashboardData?.data?.data;
    const defects = defectData?.data?.data;
    const pauses = pauseData?.data?.data;
    const capacity = capacityData?.data?.data;
    const isLoading = dashboardLoading || defectLoading || pauseLoading || capacityLoading;
    const hasError = dashboardError || defectError || pauseError || capacityError;
    if (hasError) {
        return (_jsx(Alert, { type: "error", message: t('reports.error', 'Failed to load reports data'), description: t('reports.errorDescription', 'Please try again later.'), showIcon: true }));
    }
    return (_jsxs(Spin, { spinning: isLoading, children: [_jsx(Typography.Title, { level: 4, style: { marginBottom: 24 }, children: t('nav.reports', 'Reports & Analytics') }), dashboard && (_jsxs(Row, { gutter: [16, 16], style: { marginBottom: 24 }, children: [_jsx(Col, { xs: 12, sm: 8, md: 4, children: _jsx(Card, { children: _jsx(Statistic, { title: t('reports.usersCount', 'Total Users'), value: dashboard.users_count, prefix: _jsx(TeamOutlined, {}) }) }) }), _jsx(Col, { xs: 12, sm: 8, md: 4, children: _jsx(Card, { children: _jsx(Statistic, { title: t('reports.equipmentCount', 'Equipment'), value: dashboard.equipment_count, prefix: _jsx(ToolOutlined, {}) }) }) }), _jsx(Col, { xs: 12, sm: 8, md: 4, children: _jsx(Card, { children: _jsx(Statistic, { title: t('reports.inspectionsToday', 'Inspections Today'), value: dashboard.inspections_today, prefix: _jsx(CheckCircleOutlined, {}) }) }) }), _jsx(Col, { xs: 12, sm: 8, md: 4, children: _jsx(Card, { children: _jsx(Statistic, { title: t('reports.openDefects', 'Open Defects'), value: dashboard.open_defects, prefix: _jsx(ExclamationCircleOutlined, {}), valueStyle: { color: dashboard.open_defects > 0 ? '#cf1322' : undefined } }) }) }), _jsx(Col, { xs: 12, sm: 8, md: 4, children: _jsx(Card, { children: _jsx(Statistic, { title: t('reports.activeLeaves', 'Active Leaves'), value: dashboard.active_leaves, prefix: _jsx(UserOutlined, {}) }) }) })] })), capacity && (_jsx(Card, { title: t('reports.capacity', 'Staff Capacity'), style: { marginBottom: 24 }, children: _jsxs(Row, { gutter: [24, 16], children: [_jsx(Col, { xs: 12, sm: 6, children: _jsx(Statistic, { title: t('reports.totalStaff', 'Total Staff'), value: capacity.total_staff }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsx(Statistic, { title: t('reports.available', 'Available'), value: capacity.available, valueStyle: { color: '#3f8600' } }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsx(Statistic, { title: t('reports.onLeave', 'On Leave'), value: capacity.on_leave, valueStyle: { color: '#cf1322' } }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsxs("div", { children: [_jsx(Typography.Text, { type: "secondary", children: t('reports.utilizationRate', 'Utilization Rate') }), _jsx(Progress, { percent: Math.round(capacity.utilization_rate * 100), status: capacity.utilization_rate > 0.8 ? 'success' : capacity.utilization_rate > 0.5 ? 'normal' : 'exception', style: { marginTop: 8 } })] }) })] }) })), _jsxs(Row, { gutter: [16, 16], children: [defects && (_jsx(Col, { xs: 24, lg: 12, children: _jsxs(Card, { title: t('reports.defectAnalytics', 'Defect Analytics'), style: { marginBottom: 24 }, children: [_jsx(Statistic, { title: t('reports.totalDefects', 'Total Defects'), value: defects.total_defects, style: { marginBottom: 24 } }), _jsx(Divider, { orientation: "left", children: t('reports.bySeverity', 'By Severity') }), _jsx(Table, { rowKey: "key", dataSource: Object.entries(defects.by_severity).map(([key, value]) => ({
                                        key,
                                        severity: key,
                                        count: value,
                                    })), columns: [
                                        {
                                            title: t('reports.severity', 'Severity'),
                                            dataIndex: 'severity',
                                            key: 'severity',
                                            render: (v) => {
                                                const colors = { critical: 'red', high: 'orange', medium: 'gold', low: 'green' };
                                                return _jsx(Tag, { color: colors[v.toLowerCase()] || 'default', children: v.toUpperCase() });
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
                                            render: (_, record) => {
                                                const pct = defects.total_defects > 0 ? Math.round((record.count / defects.total_defects) * 100) : 0;
                                                return _jsx(Progress, { percent: pct, size: "small" });
                                            },
                                        },
                                    ], pagination: false, size: "small" }), _jsx(Divider, { orientation: "left", children: t('reports.byStatus', 'By Status') }), _jsx(Table, { rowKey: "key", dataSource: Object.entries(defects.by_status).map(([key, value]) => ({
                                        key,
                                        status: key,
                                        count: value,
                                    })), columns: [
                                        {
                                            title: t('reports.status', 'Status'),
                                            dataIndex: 'status',
                                            key: 'status',
                                            render: (v) => {
                                                const colors = { open: 'red', in_progress: 'processing', resolved: 'green', closed: 'default' };
                                                return _jsx(Tag, { color: colors[v.toLowerCase()] || 'blue', children: v.replace(/_/g, ' ').toUpperCase() });
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
                                            render: (_, record) => {
                                                const pct = defects.total_defects > 0 ? Math.round((record.count / defects.total_defects) * 100) : 0;
                                                return _jsx(Progress, { percent: pct, size: "small" });
                                            },
                                        },
                                    ], pagination: false, size: "small" })] }) })), pauses && (_jsx(Col, { xs: 24, lg: 12, children: _jsxs(Card, { title: t('reports.pauseAnalytics', 'Pause Analytics'), style: { marginBottom: 24 }, children: [_jsxs(Row, { gutter: [16, 16], style: { marginBottom: 24 }, children: [_jsx(Col, { span: 12, children: _jsx(Statistic, { title: t('reports.totalPauses', 'Total Pauses'), value: pauses.total_pauses, prefix: _jsx(ClockCircleOutlined, {}) }) }), _jsx(Col, { span: 12, children: _jsx(Statistic, { title: t('reports.avgDuration', 'Average Duration'), value: pauses.average_duration_minutes, suffix: t('reports.minutes', 'min'), precision: 1 }) })] }), _jsx(Divider, { orientation: "left", children: t('reports.byCategory', 'By Category') }), _jsx(Table, { rowKey: "key", dataSource: Object.entries(pauses.by_category).map(([key, value]) => ({
                                        key,
                                        category: key,
                                        count: value,
                                    })), columns: [
                                        {
                                            title: t('reports.category', 'Category'),
                                            dataIndex: 'category',
                                            key: 'category',
                                            render: (v) => {
                                                const colors = {
                                                    parts: 'blue', duty_finish: 'gold', tools: 'orange',
                                                    manpower: 'purple', oem: 'cyan', other: 'default',
                                                };
                                                return _jsx(Tag, { color: colors[v.toLowerCase()] || 'default', children: v.replace(/_/g, ' ').toUpperCase() });
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
                                            render: (_, record) => {
                                                const pct = pauses.total_pauses > 0 ? Math.round((record.count / pauses.total_pauses) * 100) : 0;
                                                return _jsx(Progress, { percent: pct, size: "small" });
                                            },
                                        },
                                    ], pagination: false, size: "small" })] }) }))] })] }));
}
//# sourceMappingURL=ReportsPage.js.map