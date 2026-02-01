import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout } from '@ant-design/pro-layout';
import { DashboardOutlined, UserOutlined, ToolOutlined, CheckCircleOutlined, ScheduleOutlined, FileTextOutlined, BellOutlined, TrophyOutlined, CalendarOutlined, TeamOutlined, SafetyCertificateOutlined, AuditOutlined, StarOutlined, BarChartOutlined, SettingOutlined, AppstoreOutlined, ExperimentOutlined, PauseCircleOutlined, AlertOutlined, BugOutlined, SyncOutlined, WarningOutlined, } from '@ant-design/icons';
import { Badge, Dropdown, Avatar, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import { useLanguage } from '../providers/LanguageProvider';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '@inspection/shared';
import { useNotificationAlerts } from '../hooks/useNotificationAlerts';
function getMenuItems(role, t) {
    const shared = [
        { path: '/', name: t('nav.dashboard'), icon: _jsx(DashboardOutlined, {}) },
        { path: '/notifications', name: t('nav.notifications'), icon: _jsx(BellOutlined, {}) },
        { path: '/leaderboard', name: t('nav.leaderboard'), icon: _jsx(TrophyOutlined, {}) },
        { path: '/leaves', name: t('nav.leaves'), icon: _jsx(CalendarOutlined, {}) },
        { path: '/profile', name: t('nav.profile'), icon: _jsx(UserOutlined, {}) },
    ];
    const adminItems = [
        { path: '/admin/roster', name: t('nav.roster'), icon: _jsx(TeamOutlined, {}) },
        { path: '/admin/users', name: t('nav.users'), icon: _jsx(TeamOutlined, {}) },
        { path: '/admin/equipment', name: t('nav.equipment'), icon: _jsx(ToolOutlined, {}) },
        { path: '/admin/checklists', name: t('nav.checklists'), icon: _jsx(CheckCircleOutlined, {}) },
        { path: '/admin/schedules', name: t('nav.inspectionSchedule'), icon: _jsx(ScheduleOutlined, {}) },
        { path: '/admin/assignments', name: t('nav.inspection_assignments'), icon: _jsx(AppstoreOutlined, {}) },
        { path: '/admin/inspections', name: t('nav.all_inspections'), icon: _jsx(FileTextOutlined, {}) },
        { path: '/admin/specialist-jobs', name: t('nav.specialist_jobs'), icon: _jsx(ExperimentOutlined, {}) },
        { path: '/admin/engineer-jobs', name: t('nav.engineer_jobs'), icon: _jsx(SettingOutlined, {}) },
        { path: '/admin/quality-reviews', name: t('nav.quality_reviews'), icon: _jsx(AuditOutlined, {}) },
        { path: '/admin/leave-approvals', name: t('nav.leave_approvals'), icon: _jsx(SafetyCertificateOutlined, {}) },
        { path: '/admin/bonus-approvals', name: t('nav.bonus_approvals'), icon: _jsx(StarOutlined, {}) },
        { path: '/admin/pause-approvals', name: t('nav.pause_approvals'), icon: _jsx(PauseCircleOutlined, {}) },
        { path: '/admin/routines', name: t('nav.routines'), icon: _jsx(SyncOutlined, {}) },
        { path: '/admin/defects', name: t('nav.defects'), icon: _jsx(BugOutlined, {}) },
        { path: '/admin/backlog', name: t('nav.backlog'), icon: _jsx(WarningOutlined, {}) },
        { path: '/admin/reports', name: t('nav.reports'), icon: _jsx(BarChartOutlined, {}) },
    ];
    const inspectorItems = [
        { path: '/inspector/assignments', name: t('nav.my_assignments'), icon: _jsx(FileTextOutlined, {}) },
    ];
    const specialistItems = [
        { path: '/specialist/jobs', name: t('nav.my_jobs'), icon: _jsx(ToolOutlined, {}) },
    ];
    const engineerItems = [
        { path: '/engineer/jobs', name: t('nav.my_jobs'), icon: _jsx(ToolOutlined, {}) },
        { path: '/engineer/jobs/create', name: t('nav.create_job'), icon: _jsx(AppstoreOutlined, {}) },
        { path: '/engineer/team-assignment', name: t('nav.team_assignment'), icon: _jsx(TeamOutlined, {}) },
        { path: '/engineer/pause-approvals', name: t('nav.pause_approvals'), icon: _jsx(PauseCircleOutlined, {}) },
    ];
    const qeItems = [
        { path: '/quality/reviews', name: t('nav.pending_reviews'), icon: _jsx(AuditOutlined, {}) },
        { path: '/quality/overdue', name: t('nav.overdue_reviews'), icon: _jsx(AlertOutlined, {}) },
        { path: '/quality/bonus-requests', name: t('nav.bonus_requests'), icon: _jsx(StarOutlined, {}) },
    ];
    const roleMenus = {
        admin: adminItems,
        inspector: inspectorItems,
        specialist: specialistItems,
        engineer: engineerItems,
        quality_engineer: qeItems,
    };
    return [...shared, ...(roleMenus[role] || [])];
}
export default function MainLayout() {
    const { user, logout } = useAuth();
    const { language, setLanguage } = useLanguage();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    useNotificationAlerts({ user, navigate });
    const { data: unreadData } = useQuery({
        queryKey: ['notifications', 'unread-count'],
        queryFn: () => notificationsApi.list({ unread_only: true, per_page: 1 }),
        refetchInterval: 30000,
        enabled: !!user,
    });
    const unreadCount = unreadData?.data?.pagination?.total ?? 0;
    if (!user)
        return null;
    const menuItems = getMenuItems(user.role, t);
    const userMenuItems = [
        { key: 'profile', label: t('nav.profile') },
        { key: 'lang', label: language === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' : 'English' },
        { type: 'divider' },
        { key: 'logout', label: t('auth.logout'), danger: true },
    ];
    return (_jsx(ProLayout, { title: t('common.app_title'), layout: "mix", fixSiderbar: true, collapsed: collapsed, onCollapse: setCollapsed, location: { pathname: location.pathname }, menuDataRender: () => menuItems, menuItemRender: (item, dom) => (_jsx("div", { onClick: () => item.path && navigate(item.path), children: dom })), actionsRender: () => [
            _jsx("div", { onClick: () => navigate('/notifications'), style: { cursor: 'pointer', padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }, children: _jsx(Badge, { count: unreadCount, size: "small", children: _jsx(BellOutlined, { style: { fontSize: 20 } }) }) }, "notifications"),
            _jsx(Dropdown, { menu: {
                    items: userMenuItems,
                    onClick: ({ key }) => {
                        if (key === 'logout')
                            logout();
                        else if (key === 'profile')
                            navigate('/profile');
                        else if (key === 'lang')
                            setLanguage(language === 'en' ? 'ar' : 'en');
                    },
                }, children: _jsxs(Space, { style: { cursor: 'pointer' }, children: [_jsx(Avatar, { size: "small", icon: _jsx(UserOutlined, {}) }), _jsx("span", { children: user.full_name })] }) }, "user"),
        ], children: _jsx(Outlet, {}) }));
}
//# sourceMappingURL=MainLayout.js.map