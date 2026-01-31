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
} from '@ant-design/icons';
import { Badge, Dropdown, Avatar, Space, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import { useLanguage } from '../providers/LanguageProvider';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '@inspection/shared';

function getMenuItems(role: string, t: (key: string) => string): MenuDataItem[] {
  const shared: MenuDataItem[] = [
    { path: '/', name: t('nav.dashboard'), icon: <DashboardOutlined /> },
    { path: '/notifications', name: t('nav.notifications'), icon: <BellOutlined /> },
    { path: '/leaderboard', name: t('nav.leaderboard'), icon: <TrophyOutlined /> },
    { path: '/leaves', name: t('nav.leaves'), icon: <CalendarOutlined /> },
    { path: '/profile', name: t('nav.profile'), icon: <UserOutlined /> },
  ];

  const adminItems: MenuDataItem[] = [
    { path: '/admin/roster', name: t('nav.roster'), icon: <TeamOutlined /> },
    { path: '/admin/users', name: t('nav.users'), icon: <TeamOutlined /> },
    { path: '/admin/equipment', name: t('nav.equipment'), icon: <ToolOutlined /> },
    { path: '/admin/checklists', name: t('nav.checklists'), icon: <CheckCircleOutlined /> },
    { path: '/admin/schedules', name: t('nav.inspectionSchedule'), icon: <ScheduleOutlined /> },
    { path: '/admin/assignments', name: t('nav.inspection_assignments'), icon: <AppstoreOutlined /> },
    { path: '/admin/inspections', name: t('nav.all_inspections'), icon: <FileTextOutlined /> },
    { path: '/admin/specialist-jobs', name: t('nav.specialist_jobs'), icon: <ExperimentOutlined /> },
    { path: '/admin/engineer-jobs', name: t('nav.engineer_jobs'), icon: <SettingOutlined /> },
    { path: '/admin/quality-reviews', name: t('nav.quality_reviews'), icon: <AuditOutlined /> },
    { path: '/admin/leave-approvals', name: t('nav.leave_approvals'), icon: <SafetyCertificateOutlined /> },
    { path: '/admin/bonus-approvals', name: t('nav.bonus_approvals'), icon: <StarOutlined /> },
    { path: '/admin/routines', name: t('nav.routines'), icon: <SyncOutlined /> },
    { path: '/admin/defects', name: t('nav.defects'), icon: <BugOutlined /> },
    { path: '/admin/backlog', name: t('nav.backlog'), icon: <WarningOutlined /> },
    { path: '/admin/reports', name: t('nav.reports'), icon: <BarChartOutlined /> },
  ];

  const inspectorItems: MenuDataItem[] = [
    { path: '/inspector/assignments', name: t('nav.my_assignments'), icon: <FileTextOutlined /> },
  ];

  const specialistItems: MenuDataItem[] = [
    { path: '/specialist/jobs', name: t('nav.my_jobs'), icon: <ToolOutlined /> },
  ];

  const engineerItems: MenuDataItem[] = [
    { path: '/engineer/jobs', name: t('nav.my_jobs'), icon: <ToolOutlined /> },
    { path: '/engineer/jobs/create', name: t('nav.create_job'), icon: <AppstoreOutlined /> },
    { path: '/engineer/team-assignment', name: t('nav.team_assignment'), icon: <TeamOutlined /> },
    { path: '/engineer/pause-approvals', name: t('nav.pause_approvals'), icon: <PauseCircleOutlined /> },
  ];

  const qeItems: MenuDataItem[] = [
    { path: '/quality/reviews', name: t('nav.pending_reviews'), icon: <AuditOutlined /> },
    { path: '/quality/overdue', name: t('nav.overdue_reviews'), icon: <AlertOutlined /> },
    { path: '/quality/bonus-requests', name: t('nav.bonus_requests'), icon: <StarOutlined /> },
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.list({ unread_only: true, per_page: 1 }),
    refetchInterval: 30_000,
    enabled: !!user,
  });
  const unreadCount = (unreadData?.data as any)?.pagination?.total ?? 0;

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
        <Badge key="notifications" count={unreadCount} size="small">
          <BellOutlined style={{ fontSize: 18 }} onClick={() => navigate('/notifications')} />
        </Badge>,
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
    </ProLayout>
  );
}
