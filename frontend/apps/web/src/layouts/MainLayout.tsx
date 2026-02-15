import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ProLayout, MenuDataItem } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  UserOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  FileTextOutlined,
  BellOutlined,
  TrophyOutlined,
  CalendarOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  StarOutlined,
  BarChartOutlined,
  SettingOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  PauseCircleOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  BugOutlined,
  SyncOutlined,
  WarningOutlined,
  ControlOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  RiseOutlined,
  BulbOutlined,
  BulbFilled,
} from '@ant-design/icons';
import { Dropdown, Avatar, Space, Tooltip, Switch } from 'antd';
import { useAuth } from '../providers/AuthProvider';
import { useLanguage } from '../providers/LanguageProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useNotificationAlerts } from '../hooks/useNotificationAlerts';
import { useNotificationDrawer } from '../hooks/useNotificationDrawer';
import NotificationBadge from '../components/notifications/NotificationBadge';
import NotificationDrawer from '../components/notifications/NotificationDrawer';
import NotificationPreferencesModal from '../components/notifications/NotificationPreferencesModal';

function getMenuItems(role: string, t: (key: string) => string): MenuDataItem[] {
  // Admin and engineer have Work Planning page, others get My Work Plan
  const hasWorkPlanning = role === 'admin' || role === 'engineer';

  const shared: MenuDataItem[] = [
    { path: '/', name: `\ud83d\udcca ${t('nav.dashboard')}`, icon: <DashboardOutlined /> },
    { path: '/equipment-dashboard', name: `\u2699\ufe0f ${t('nav.equipment_dashboard')}`, icon: <ControlOutlined /> },
    ...(!hasWorkPlanning ? [{ path: '/my-work-plan', name: `\ud83d\udccb ${t('nav.my_work_plan')}`, icon: <ClockCircleOutlined /> }] : []),
    { path: '/notifications', name: `\ud83d\udd14 ${t('nav.notifications')}`, icon: <BellOutlined /> },
    { path: '/leaderboard', name: `\ud83c\udfc6 ${t('nav.leaderboard')}`, icon: <TrophyOutlined /> },
    { path: '/leaves', name: `\ud83c\udfd6\ufe0f ${t('nav.leaves')}`, icon: <CalendarOutlined /> },
    { path: '/profile', name: `\ud83d\udc64 ${t('nav.profile')}`, icon: <UserOutlined /> },
  ];

  const adminItems: MenuDataItem[] = [
    { path: '/admin/work-planning', name: `\ud83d\udcc5 ${t('nav.work_planning')}`, icon: <ScheduleOutlined /> },
    { path: '/admin/materials', name: `\ud83d\udce6 ${t('nav.materials')}`, icon: <InboxOutlined /> },
    { path: '/admin/pm-templates', name: `\ud83d\udcdd ${t('nav.pm_templates')}`, icon: <UnorderedListOutlined /> },
    { path: '/admin/cycles', name: `\ud83d\udd04 ${t('nav.maintenance_cycles')}`, icon: <ClockCircleOutlined /> },
    { path: '/admin/roster', name: `\ud83d\udc65 ${t('nav.roster')}`, icon: <TeamOutlined /> },
    { path: '/admin/users', name: `\ud83d\udc68\u200d\ud83d\udcbc ${t('nav.users')}`, icon: <TeamOutlined /> },
    { path: '/admin/equipment', name: `\ud83d\udd27 ${t('nav.equipment')}`, icon: <ToolOutlined /> },
    { path: '/admin/running-hours', name: `\u23f1\ufe0f ${t('nav.running_hours')}`, icon: <DashboardOutlined /> },
    { path: '/admin/checklists', name: `\u2705 ${t('nav.checklists')}`, icon: <CheckCircleOutlined /> },
    { path: '/admin/schedules', name: `\ud83d\udcc6 ${t('nav.inspectionSchedule')}`, icon: <ScheduleOutlined /> },
    { path: '/admin/assignments', name: `\ud83d\udccc ${t('nav.inspection_assignments')}`, icon: <AppstoreOutlined /> },
    { path: '/admin/inspections', name: `\ud83d\udd0d ${t('nav.all_inspections')}`, icon: <FileTextOutlined /> },
    { path: '/admin/specialist-jobs', name: `\ud83e\udde0 ${t('nav.specialist_jobs')}`, icon: <ExperimentOutlined /> },
    { path: '/admin/engineer-jobs', name: `\ud83d\udee0\ufe0f ${t('nav.engineer_jobs')}`, icon: <SettingOutlined /> },
    { path: '/admin/quality-reviews', name: `\u2b50 ${t('nav.quality_reviews')}`, icon: <AuditOutlined /> },
    { path: '/admin/approvals', name: `\u2714\ufe0f ${t('nav.approvals')}`, icon: <SafetyCertificateOutlined /> },
    { path: '/admin/routines', name: `\ud83d\udd01 ${t('nav.routines')}`, icon: <SyncOutlined /> },
    { path: '/admin/defects', name: `\ud83d\udc1b ${t('nav.defects')}`, icon: <BugOutlined /> },
    { path: '/admin/backlog', name: `\u26a0\ufe0f ${t('nav.backlog')}`, icon: <WarningOutlined /> },
    { path: '/admin/reports', name: `\ud83d\udcca ${t('nav.reports')}`, icon: <BarChartOutlined /> },
    { path: '/admin/daily-review', name: '\ud83d\udcdd Daily Review', icon: <CheckCircleOutlined /> },
    { path: '/admin/overdue', name: `\u23f0 ${t('sidebar.overdue')}`, icon: <ClockCircleOutlined /> },
    { path: '/admin/performance', name: `\ud83d\udcc8 ${t('sidebar.performance')}`, icon: <RiseOutlined /> },
    { path: '/admin/notification-rules', name: `\u26a1 ${t('nav.notification_rules')}`, icon: <ThunderboltOutlined /> },
    { path: '/admin/notification-analytics', name: `\ud83d\udcc9 ${t('nav.notification_analytics')}`, icon: <LineChartOutlined /> },
    { path: '/admin/leave-settings', name: `\u2699\ufe0f ${t('nav.leave_settings')}`, icon: <SettingOutlined /> },
    { path: '/admin/work-plan-settings', name: `\u2699\ufe0f ${t('nav.work_plan_settings')}`, icon: <SettingOutlined /> },
    { path: '/admin/team-communication', name: '💬 Team Communication', icon: <TeamOutlined /> },
  ];

  const inspectorItems: MenuDataItem[] = [
    { path: '/inspector/assignments', name: `\ud83d\udccb ${t('nav.my_assignments')}`, icon: <FileTextOutlined /> },
  ];

  const specialistItems: MenuDataItem[] = [
    { path: '/specialist/jobs', name: `\ud83d\udd27 ${t('nav.my_jobs')}`, icon: <ToolOutlined /> },
  ];

  const engineerItems: MenuDataItem[] = [
    { path: '/admin/work-planning', name: `\ud83d\udcc5 ${t('nav.work_planning')}`, icon: <ScheduleOutlined /> },
    { path: '/admin/materials', name: `\ud83d\udce6 ${t('nav.materials')}`, icon: <InboxOutlined /> },
    { path: '/admin/pm-templates', name: `\ud83d\udcdd ${t('nav.pm_templates')}`, icon: <UnorderedListOutlined /> },
    { path: '/engineer/jobs', name: `\ud83d\udd27 ${t('nav.my_jobs')}`, icon: <ToolOutlined /> },
    { path: '/engineer/jobs/create', name: `\u2795 ${t('nav.create_job')}`, icon: <AppstoreOutlined /> },
    { path: '/engineer/team-assignment', name: `\ud83d\udc65 ${t('nav.team_assignment')}`, icon: <TeamOutlined /> },
    { path: '/engineer/pause-approvals', name: `\u23f8\ufe0f ${t('nav.pause_approvals')}`, icon: <PauseCircleOutlined /> },
    { path: '/admin/defects', name: `\ud83d\udc1b ${t('nav.defects')}`, icon: <BugOutlined /> },
    { path: '/admin/daily-review', name: '\ud83d\udcdd Daily Review', icon: <CheckCircleOutlined /> },
    { path: '/admin/overdue', name: `\u23f0 ${t('sidebar.overdue')}`, icon: <ClockCircleOutlined /> },
    { path: '/admin/performance', name: `\ud83d\udcc8 ${t('sidebar.performance')}`, icon: <RiseOutlined /> },
  ];

  const qeItems: MenuDataItem[] = [
    { path: '/quality/reviews', name: `\ud83d\udd0d ${t('nav.pending_reviews')}`, icon: <AuditOutlined /> },
    { path: '/quality/overdue', name: `\u23f0 ${t('nav.overdue_reviews')}`, icon: <AlertOutlined /> },
    { path: '/quality/bonus-requests', name: `\ud83c\udf1f ${t('nav.bonus_requests')}`, icon: <StarOutlined /> },
  ];

  const roleMenus: Record<string, MenuDataItem[]> = {
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
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useNotificationAlerts({ user, navigate });

  // Use the notification drawer hook
  const {
    isOpen: drawerOpen,
    open: openDrawer,
    close: closeDrawer,
    unreadCount,
    priorityCounts,
  } = useNotificationDrawer({
    userRole: user?.role,
    pollInterval: 30000,
  });

  if (!user) return null;

  const menuItems = getMenuItems(user.role, t);

  const userMenuItems = [
    { key: 'profile', label: t('nav.profile') },
    { key: 'lang', label: language === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' : 'English' },
    { type: 'divider' as const },
    { key: 'logout', label: t('auth.logout'), danger: true },
  ];

  return (
    <ProLayout
      title={t('common.app_title')}
      layout="mix"
      fixSiderbar
      collapsed={collapsed}
      onCollapse={setCollapsed}
      location={{ pathname: location.pathname }}
      menuDataRender={() => menuItems}
      menuItemRender={(item, dom) => (
        <div onClick={() => item.path && navigate(item.path)}>{dom}</div>
      )}
      actionsRender={() => [
        <Tooltip key="theme" title={isDark ? 'Light Mode' : 'Dark Mode'}>
          <Switch
            checked={isDark}
            onChange={toggleTheme}
            checkedChildren={<BulbFilled />}
            unCheckedChildren={<BulbOutlined />}
            style={{ marginRight: 8 }}
          />
        </Tooltip>,
        <NotificationBadge
          key="notifications"
          count={unreadCount}
          priorityCounts={priorityCounts as any}
          hasCritical={(priorityCounts?.critical || 0) > 0}
          onClick={openDrawer}
        >
          <BellOutlined style={{ fontSize: 20, color: isDark ? '#ccc' : '#666' }} />
        </NotificationBadge>,
        <Dropdown
          key="user"
          menu={{
            items: userMenuItems,
            onClick: ({ key }) => {
              if (key === 'logout') logout();
              else if (key === 'profile') navigate('/profile');
              else if (key === 'lang') setLanguage(language === 'en' ? 'ar' : 'en');
            },
          }}
        >
          <Space style={{ cursor: 'pointer' }}>
            <Avatar size="small" icon={<UserOutlined />} />
            <span>{user.full_name}</span>
          </Space>
        </Dropdown>,
      ]}
    >
      <Outlet />

      {/* Notification Drawer */}
      <NotificationDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        onOpenPreferences={() => setPreferencesOpen(true)}
        userRole={user?.role}
      />

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </ProLayout>
  );
}
