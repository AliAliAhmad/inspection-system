import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Breadcrumb, Typography, Dropdown, Avatar, Space, Tooltip, Switch } from 'antd';
import {
  HomeOutlined,
  DashboardOutlined,
  UserOutlined,
  ToolOutlined,
  FileTextOutlined,
  BellOutlined,
  ScheduleOutlined,
  TeamOutlined,
  SettingOutlined,
  AppstoreOutlined,
  BulbOutlined,
  BulbFilled,
  SearchOutlined,
} from '@ant-design/icons';
import { useAuth } from '../providers/AuthProvider';
import { useLanguage } from '../providers/LanguageProvider';
import { useTheme } from '../providers/ThemeProvider';
import { useTranslation } from 'react-i18next';
import { useNotificationAlerts } from '../hooks/useNotificationAlerts';
import { useNotificationDrawer } from '../hooks/useNotificationDrawer';
import NotificationBadge from '../components/notifications/NotificationBadge';
import NotificationDrawer from '../components/notifications/NotificationDrawer';
import NotificationPreferencesModal from '../components/notifications/NotificationPreferencesModal';

// ─── Sidebar Categories ─────────────────────────────────────────

interface SidebarCategory {
  key: string;
  icon: React.ReactNode;
  labelKey: string;
  defaultPath: string | Record<string, string>;
  roles: string[];
  pathPrefixes: string[];
}

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    labelKey: 'nav.dashboard',
    defaultPath: '/',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    pathPrefixes: [],
  },
  {
    key: 'operations',
    icon: <ScheduleOutlined />,
    labelKey: 'sidebar.operations',
    defaultPath: {
      admin: '/admin/work-planning',
      engineer: '/admin/work-planning',
      inspector: '/inspector/assignments',
      specialist: '/specialist/jobs',
      quality_engineer: '/quality/reviews',
    },
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    pathPrefixes: [
      '/admin/work-planning', '/admin/work-plan/', '/admin/schedules',
      '/admin/assignments', '/admin/daily-review', '/admin/overdue',
      '/admin/approvals', '/my-work-plan', '/inspector/', '/specialist/',
      '/quality/',
    ],
  },
  {
    key: 'equipment',
    icon: <ToolOutlined />,
    labelKey: 'nav.equipment',
    defaultPath: '/equipment-dashboard',
    roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'],
    pathPrefixes: [
      '/admin/equipment', '/admin/running-hours', '/admin/defects',
      '/admin/backlog', '/admin/checklists', '/admin/routines',
      '/equipment-dashboard',
    ],
  },
  {
    key: 'inspections',
    icon: <FileTextOutlined />,
    labelKey: 'sidebar.inspections',
    defaultPath: {
      admin: '/admin/inspections',
      engineer: '/engineer/jobs',
      quality_engineer: '/quality/reviews',
    },
    roles: ['admin', 'engineer', 'quality_engineer'],
    pathPrefixes: [
      '/admin/inspections', '/admin/quality-reviews', '/admin/specialist-jobs',
      '/admin/engineer-jobs', '/engineer/jobs', '/engineer/team-assignment',
      '/engineer/pause-approvals',
    ],
  },
  {
    key: 'team',
    icon: <TeamOutlined />,
    labelKey: 'sidebar.team',
    defaultPath: { admin: '/admin/users', engineer: '/admin/roster' },
    roles: ['admin', 'engineer'],
    pathPrefixes: [
      '/admin/users', '/admin/roster', '/admin/performance',
      '/leaderboard', '/leaves',
    ],
  },
  {
    key: 'maintenance',
    icon: <AppstoreOutlined />,
    labelKey: 'sidebar.maintenance',
    defaultPath: '/admin/materials',
    roles: ['admin', 'engineer'],
    pathPrefixes: ['/admin/materials', '/admin/pm-templates', '/admin/cycles'],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    labelKey: 'sidebar.settings',
    defaultPath: '/admin/leave-settings',
    roles: ['admin'],
    pathPrefixes: [
      '/admin/leave-settings', '/admin/work-plan-settings',
      '/admin/notification-rules', '/admin/notification-analytics',
      '/admin/team-communication',
    ],
  },
];

function getActiveCategory(pathname: string): string {
  if (pathname === '/') return 'dashboard';
  for (const cat of SIDEBAR_CATEGORIES) {
    if (cat.key === 'dashboard') continue;
    if (cat.pathPrefixes.some((p) => pathname.startsWith(p))) return cat.key;
  }
  return 'dashboard';
}

function getCategoryPath(cat: SidebarCategory, role: string): string {
  if (typeof cat.defaultPath === 'string') return cat.defaultPath;
  return cat.defaultPath[role] || cat.defaultPath.admin || '/';
}

// ─── Route Labels for Auto Breadcrumbs ────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  admin: 'Admin', inspector: 'Inspector', specialist: 'Specialist',
  engineer: 'Engineer', quality: 'Quality',
  users: 'Users', equipment: 'Equipment', checklists: 'Checklists',
  schedules: 'Schedules', assignments: 'Assignments', inspections: 'Inspections',
  'specialist-jobs': 'Specialist Jobs', 'engineer-jobs': 'Engineer Jobs',
  'quality-reviews': 'Quality Reviews', approvals: 'Approvals',
  routines: 'Routines', defects: 'Defects', backlog: 'Backlog',
  reports: 'Reports', 'daily-review': 'Daily Review', overdue: 'Overdue',
  performance: 'Performance', leaves: 'Leaves', roster: 'Roster',
  materials: 'Materials', 'pm-templates': 'PM Templates', cycles: 'Cycles',
  'work-planning': 'Work Planning', 'work-plan-settings': 'Work Plan Settings',
  'leave-settings': 'Leave Settings', 'notification-rules': 'Notification Rules',
  'notification-analytics': 'Notification Analytics', profile: 'Profile',
  notifications: 'Notifications', leaderboard: 'Leaderboard',
  'my-work-plan': 'My Work Plan', 'equipment-dashboard': 'Equipment Dashboard',
  'running-hours': 'Running Hours', 'team-communication': 'Team Communication',
  jobs: 'Jobs', create: 'Create', 'team-assignment': 'Team Assignment',
  'pause-approvals': 'Pause Approvals', reviews: 'Reviews',
  'bonus-requests': 'Bonus Requests',
};

// ─── Auto Page Header ─────────────────────────────────────────

function AutoPageHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === '/') return null;

  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbItems: { title: React.ReactNode; onClick?: () => void }[] = [
    { title: <HomeOutlined />, onClick: () => navigate('/') },
  ];

  let path = '';
  for (const segment of segments) {
    path += `/${segment}`;
    const label = ROUTE_LABELS[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const currentPath = path;
    breadcrumbItems.push({
      title: label,
      onClick: currentPath !== location.pathname ? () => navigate(currentPath) : undefined,
    });
  }

  const lastSegment = segments[segments.length - 1] || '';
  const title = ROUTE_LABELS[lastSegment] || lastSegment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div style={{ marginBottom: 16 }}>
      <Breadcrumb
        items={breadcrumbItems.map((c) => ({
          title: c.onClick ? (
            <a onClick={(e) => { e.preventDefault(); c.onClick?.(); }} style={{ cursor: 'pointer' }}>{c.title}</a>
          ) : (c.title),
        }))}
        style={{ marginBottom: 8 }}
      />
      <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useNotificationAlerts({ user, navigate });

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

  const activeCategory = getActiveCategory(location.pathname);
  const visibleCategories = SIDEBAR_CATEGORIES.filter((c) => c.roles.includes(user.role));

  const userMenuItems = [
    { key: 'profile', label: t('nav.profile') },
    { key: 'lang', label: language === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' : 'English' },
    { type: 'divider' as const },
    { key: 'logout', label: t('auth.logout'), danger: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* ─── Header ─── */}
      <header className="app-header">
        <Typography.Text strong style={{ fontSize: 16 }}>
          {t('common.app_title')}
        </Typography.Text>

        <Space size="middle" align="center">
          <Tooltip title={`${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}K`}>
            <SearchOutlined
              style={{ fontSize: 18, cursor: 'pointer', color: isDark ? '#8c8c8c' : '#595959' }}
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
              }}
            />
          </Tooltip>

          <Tooltip title={isDark ? 'Light Mode' : 'Dark Mode'}>
            <Switch
              checked={isDark}
              onChange={toggleTheme}
              checkedChildren={<BulbFilled />}
              unCheckedChildren={<BulbOutlined />}
              size="small"
            />
          </Tooltip>

          <NotificationBadge
            count={unreadCount}
            priorityCounts={priorityCounts as any}
            hasCritical={(priorityCounts?.critical || 0) > 0}
            onClick={openDrawer}
          >
            <BellOutlined style={{ fontSize: 18, color: isDark ? '#8c8c8c' : '#595959' }} />
          </NotificationBadge>

          <Dropdown
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
              <span style={{ fontSize: 13 }}>{user.full_name}</span>
            </Space>
          </Dropdown>
        </Space>
      </header>

      {/* ─── Body: Sidebar + Content ─── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Icon Sidebar */}
        <nav className="icon-sidebar">
          {visibleCategories.map((cat) => {
            const isActive = activeCategory === cat.key;
            return (
              <Tooltip
                key={cat.key}
                title={t(cat.labelKey)}
                placement={language === 'ar' ? 'left' : 'right'}
              >
                <div
                  className={`sidebar-icon ${isActive ? 'sidebar-icon-active' : ''}`}
                  onClick={() => navigate(getCategoryPath(cat, user.role))}
                >
                  {cat.icon}
                </div>
              </Tooltip>
            );
          })}
        </nav>

        {/* Main Content */}
        <main className="app-content">
          <AutoPageHeader />
          <Outlet />
        </main>
      </div>

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
    </div>
  );
}
