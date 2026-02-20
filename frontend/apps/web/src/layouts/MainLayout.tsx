import { useState, useMemo, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Breadcrumb, Typography, Dropdown, Avatar, Space, Tooltip, Switch, Popover, Input, Badge } from 'antd';
import {
  HomeOutlined,
  UserOutlined,
  BellOutlined,
  BulbOutlined,
  BulbFilled,
  SearchOutlined,
  AppstoreOutlined,
  CloseOutlined,
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
import LiveTicker from '../components/LiveTicker';
import { ServiceAlertBadge } from '../components/equipment/ServiceAlertNotification';

// ─── App Launcher Config ─────────────────────────────────────

interface LauncherItem {
  key: string;
  emoji: string;
  label: string;
  labelAr?: string;
  path: string;
  roles: string[];
}

interface LauncherCategory {
  key: string;
  label: string;
  labelAr: string;
  emoji: string;
  color: string;
  items: LauncherItem[];
}

const LAUNCHER_CATEGORIES: LauncherCategory[] = [
  {
    key: 'operations',
    label: 'Operations',
    labelAr: '\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A',
    emoji: '\u{1F4CA}',
    color: '#667eea',
    items: [
      { key: 'work-planning', emoji: '\u{1F4C5}', label: 'Work Planning', labelAr: '\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0639\u0645\u0644', path: '/admin/work-planning', roles: ['admin', 'engineer'] },
      { key: 'daily-review', emoji: '\u{1F4DD}', label: 'Daily Review', labelAr: '\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u064A\u0648\u0645\u064A\u0629', path: '/admin/daily-review', roles: ['admin', 'engineer'] },
      { key: 'schedules', emoji: '\u{1F4C6}', label: 'Schedules', labelAr: '\u0627\u0644\u062C\u062F\u0627\u0648\u0644', path: '/admin/schedules', roles: ['admin'] },
      { key: 'assignments', emoji: '\u{1F4CB}', label: 'Assignments', labelAr: '\u0627\u0644\u062A\u0639\u064A\u064A\u0646\u0627\u062A', path: '/admin/assignments', roles: ['admin'] },
      { key: 'overdue', emoji: '\u23F0', label: 'Overdue', labelAr: '\u0645\u062A\u0623\u062E\u0631', path: '/admin/overdue', roles: ['admin', 'engineer'] },
      { key: 'approvals', emoji: '\u2714\uFE0F', label: 'Approvals', labelAr: '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A', path: '/admin/approvals', roles: ['admin'] },
      { key: 'my-work-plan', emoji: '\u{1F4CB}', label: 'My Work Plan', labelAr: '\u062E\u0637\u0629 \u0639\u0645\u0644\u064A', path: '/my-work-plan', roles: ['inspector', 'specialist', 'engineer'] },
      { key: 'my-assignments', emoji: '\u{1F4CB}', label: 'My Assignments', labelAr: '\u0645\u0647\u0627\u0645\u064A', path: '/inspector/assignments', roles: ['inspector'] },
      { key: 'my-jobs-specialist', emoji: '\u{1F527}', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/specialist/jobs', roles: ['specialist'] },
      { key: 'my-jobs-engineer', emoji: '\u{1F6E0}\uFE0F', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/engineer/jobs', roles: ['engineer'] },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment',
    labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A',
    emoji: '\u{1F527}',
    color: '#1890ff',
    items: [
      { key: 'equipment-dashboard', emoji: '\u{1F4CA}', label: 'Dashboard', labelAr: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u062F\u0627\u062A', path: '/equipment-dashboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
      { key: 'equipment-list', emoji: '\u{1F527}', label: 'Equipment', labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A', path: '/admin/equipment', roles: ['admin'] },
      { key: 'running-hours', emoji: '\u23F1\uFE0F', label: 'Running Hours', labelAr: '\u0633\u0627\u0639\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644', path: '/admin/running-hours', roles: ['admin', 'engineer'] },
      { key: 'defects', emoji: '\u{1F41B}', label: 'Defects', labelAr: '\u0627\u0644\u0639\u064A\u0648\u0628', path: '/admin/defects', roles: ['admin', 'engineer'] },
      { key: 'backlog', emoji: '\u{1F4CB}', label: 'Backlog', labelAr: '\u0627\u0644\u0645\u062A\u0631\u0627\u0643\u0645', path: '/admin/backlog', roles: ['admin'] },
      { key: 'checklists', emoji: '\u2705', label: 'Checklists', labelAr: '\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0641\u062D\u0635', path: '/admin/checklists', roles: ['admin'] },
      { key: 'routines', emoji: '\u{1F501}', label: 'Routines', labelAr: '\u0627\u0644\u0631\u0648\u062A\u064A\u0646', path: '/admin/routines', roles: ['admin'] },
    ],
  },
  {
    key: 'inspections',
    label: 'Inspections',
    labelAr: '\u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A',
    emoji: '\u{1F4CB}',
    color: '#52c41a',
    items: [
      { key: 'all-inspections', emoji: '\u{1F4CB}', label: 'All Inspections', labelAr: '\u0643\u0644 \u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A', path: '/admin/inspections', roles: ['admin'] },
      { key: 'assessment-tracking', emoji: '\u{1F3AF}', label: 'Assessment Tracking', labelAr: '\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A', path: '/admin/assessments', roles: ['admin', 'engineer'] },
      { key: 'monitor-followups', emoji: '\u{1F50D}', label: 'Monitor Follow-Ups', labelAr: '\u0645\u062A\u0627\u0628\u0639\u0627\u062A \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629', path: '/admin/monitor-followups', roles: ['admin', 'engineer'] },
      { key: 'quality-reviews', emoji: '\u2B50', label: 'Quality Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629', path: '/admin/quality-reviews', roles: ['admin'] },
      { key: 'specialist-jobs', emoji: '\u{1F528}', label: 'Specialist Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u062A\u062E\u0635\u0635\u064A\u0646', path: '/admin/specialist-jobs', roles: ['admin'] },
      { key: 'engineer-jobs', emoji: '\u{1F6E0}\uFE0F', label: 'Engineer Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646', path: '/admin/engineer-jobs', roles: ['admin'] },
      { key: 'qe-reviews', emoji: '\u{1F50D}', label: 'My Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A\u064A', path: '/quality/reviews', roles: ['quality_engineer'] },
      { key: 'qe-overdue', emoji: '\u23F0', label: 'Overdue Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0645\u062A\u0623\u062E\u0631\u0629', path: '/quality/overdue', roles: ['quality_engineer'] },
      { key: 'qe-bonus', emoji: '\u{1F4B0}', label: 'Bonus Requests', labelAr: '\u0637\u0644\u0628\u0627\u062A \u0645\u0643\u0627\u0641\u0622\u062A', path: '/quality/bonus-requests', roles: ['quality_engineer'] },
    ],
  },
  {
    key: 'team',
    label: 'Team',
    labelAr: '\u0627\u0644\u0641\u0631\u064A\u0642',
    emoji: '\u{1F465}',
    color: '#722ed1',
    items: [
      { key: 'users', emoji: '\u{1F465}', label: 'Users', labelAr: '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646', path: '/admin/users', roles: ['admin'] },
      { key: 'roster', emoji: '\u{1F4C5}', label: 'Roster', labelAr: '\u062C\u062F\u0648\u0644 \u0627\u0644\u062F\u0648\u0627\u0645', path: '/admin/roster', roles: ['admin', 'engineer'] },
      { key: 'leaves', emoji: '\u{1F3D6}\uFE0F', label: 'Leaves', labelAr: '\u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A', path: '/leaves', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
      { key: 'performance', emoji: '\u{1F4C8}', label: 'Performance', labelAr: '\u0627\u0644\u0623\u062F\u0627\u0621', path: '/admin/performance', roles: ['admin', 'engineer'] },
      { key: 'leaderboard', emoji: '\u{1F3C6}', label: 'Leaderboard', labelAr: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u062A\u0635\u062F\u0631\u064A\u0646', path: '/leaderboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
      { key: 'team-communication', emoji: '\u{1F4AC}', label: 'Communication', labelAr: '\u0627\u0644\u062A\u0648\u0627\u0635\u0644', path: '/admin/team-communication', roles: ['admin'] },
      { key: 'team-assignment', emoji: '\u{1F465}', label: 'Team Assignment', labelAr: '\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0641\u0631\u064A\u0642', path: '/engineer/team-assignment', roles: ['engineer'] },
      { key: 'pause-approvals', emoji: '\u23F8\uFE0F', label: 'Pause Approvals', labelAr: '\u0645\u0648\u0627\u0641\u0642\u0627\u062A \u0627\u0644\u0625\u064A\u0642\u0627\u0641', path: '/engineer/pause-approvals', roles: ['engineer'] },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    labelAr: '\u0627\u0644\u0635\u064A\u0627\u0646\u0629',
    emoji: '\u{1F4E6}',
    color: '#fa8c16',
    items: [
      { key: 'materials', emoji: '\u{1F4E6}', label: 'Materials', labelAr: '\u0627\u0644\u0645\u0648\u0627\u062F', path: '/admin/materials', roles: ['admin', 'engineer'] },
      { key: 'pm-templates', emoji: '\u{1F4C4}', label: 'PM Templates', labelAr: '\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0635\u064A\u0627\u0646\u0629', path: '/admin/pm-templates', roles: ['admin', 'engineer'] },
      { key: 'cycles', emoji: '\u{1F504}', label: 'Cycles', labelAr: '\u0627\u0644\u062F\u0648\u0631\u0627\u062A', path: '/admin/cycles', roles: ['admin'] },
      { key: 'reports', emoji: '\u{1F4CA}', label: 'Reports', labelAr: '\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631', path: '/admin/reports', roles: ['admin'] },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    labelAr: '\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A',
    emoji: '\u2699\uFE0F',
    color: '#8c8c8c',
    items: [
      { key: 'leave-settings', emoji: '\u{1F3D6}\uFE0F', label: 'Leave Settings', labelAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A', path: '/admin/leave-settings', roles: ['admin'] },
      { key: 'work-plan-settings', emoji: '\u{1F4C5}', label: 'Work Plan Settings', labelAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062E\u0637\u0629 \u0627\u0644\u0639\u0645\u0644', path: '/admin/work-plan-settings', roles: ['admin'] },
      { key: 'notification-rules', emoji: '\u{1F514}', label: 'Notification Rules', labelAr: '\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/admin/notification-rules', roles: ['admin'] },
      { key: 'notification-analytics', emoji: '\u{1F4CA}', label: 'Notification Analytics', labelAr: '\u062A\u062D\u0644\u064A\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/admin/notification-analytics', roles: ['admin'] },
    ],
  },
];

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
  dashboard: 'Dashboard', 'my-work-plan': 'My Work Plan', 'equipment-dashboard': 'Equipment Dashboard',
  'running-hours': 'Running Hours', 'team-communication': 'Team Communication',
  'monitor-followups': 'Monitor Follow-Ups',
  jobs: 'Jobs', create: 'Create', 'team-assignment': 'Team Assignment',
  'pause-approvals': 'Pause Approvals', reviews: 'Reviews',
  'bonus-requests': 'Bonus Requests',
};

// Pages that should NOT show the auto page header (they handle their own)
const NO_HEADER_PAGES = ['/', '/admin/work-planning', '/admin/work-plan/'];

// ─── Auto Page Header ─────────────────────────────────────────

function AutoPageHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname === '/') return null;
  if (NO_HEADER_PAGES.some(p => location.pathname.startsWith(p))) return null;

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

// ─── App Launcher Component ──────────────────────────────────

function AppLauncher({ userRole, language }: { userRole: string; language: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<any>(null);
  const isAr = language === 'ar';

  // Focus search when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 100);
    } else {
      setSearch('');
    }
  }, [open]);

  // Filter categories and items based on role and search
  const filteredCategories = useMemo(() => {
    const query = search.toLowerCase().trim();
    return LAUNCHER_CATEGORIES.map(cat => {
      const items = cat.items.filter(item => {
        if (!item.roles.includes(userRole)) return false;
        if (query) {
          return item.label.toLowerCase().includes(query) ||
            (item.labelAr && item.labelAr.includes(query)) ||
            cat.label.toLowerCase().includes(query);
        }
        return true;
      });
      return { ...cat, items };
    }).filter(cat => cat.items.length > 0);
  }, [userRole, search]);

  const handleNavigate = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const content = (
    <div className="app-launcher-content" style={{ width: 520, maxHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Search */}
      <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
        <Input
          ref={searchRef}
          placeholder={isAr ? '\u0628\u062D\u062B...' : 'Search apps...'}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ borderRadius: 8 }}
        />
      </div>

      {/* Categories Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {filteredCategories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#8c8c8c' }}>
            {isAr ? '\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C' : 'No apps found'}
          </div>
        ) : (
          filteredCategories.map(cat => (
            <div key={cat.key} style={{ marginBottom: 16 }}>
              {/* Category Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{cat.emoji}</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: cat.color,
                }}>
                  {isAr ? cat.labelAr : cat.label}
                </span>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              </div>

              {/* Items Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 4,
              }}>
                {cat.items.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <div
                      key={item.key}
                      className="launcher-app-item"
                      onClick={() => handleNavigate(item.path)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        padding: '10px 4px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: isActive ? 'rgba(24, 144, 255, 0.08)' : 'transparent',
                        border: isActive ? '1px solid rgba(24, 144, 255, 0.2)' : '1px solid transparent',
                      }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{item.emoji}</span>
                      <span style={{
                        fontSize: 11,
                        color: isActive ? '#1890ff' : '#595959',
                        fontWeight: isActive ? 600 : 400,
                        textAlign: 'center',
                        lineHeight: 1.2,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {isAr && item.labelAr ? item.labelAr : item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid #f0f0f0',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <span
          onClick={() => handleNavigate('/')}
          style={{ fontSize: 12, color: '#1890ff', cursor: 'pointer' }}
        >
          <HomeOutlined /> {isAr ? '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629' : 'Dashboard'}
        </span>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
      overlayClassName="app-launcher-popover"
      overlayInnerStyle={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}
    >
      <Tooltip title={isAr ? '\u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A' : 'Apps'}>
        <div className={`launcher-trigger ${open ? 'launcher-trigger-active' : ''}`}>
          <AppstoreOutlined style={{ fontSize: 20 }} />
        </div>
      </Tooltip>
    </Popover>
  );
}

// ─── Main Layout ──────────────────────────────────────────────

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
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
        <Space size="middle" align="center">
          {/* App Launcher */}
          <AppLauncher userRole={user.role} language={language} />

          <Typography.Text
            strong
            style={{ fontSize: 16, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            {t('common.app_title')}
          </Typography.Text>
        </Space>

        <Space size="middle" align="center">
          <Tooltip title="Dashboard">
            <HomeOutlined
              style={{ fontSize: 18, cursor: 'pointer', color: isDark ? '#8c8c8c' : '#595959' }}
              onClick={() => navigate('/dashboard')}
            />
          </Tooltip>

          <Tooltip title={`${navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl+'}K`}>
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

          {/* Service Alert Badge (equipment maintenance alerts) */}
          {(user.role === 'admin' || user.role === 'engineer') && (
            <ServiceAlertBadge onClick={() => navigate('/admin/running-hours')} />
          )}

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

      {/* ─── Live Ticker (all pages except Work Planning) ─── */}
      <LiveTicker />

      {/* ─── Body: Full Width Content (no sidebar) ─── */}
      <main className="app-content">
        <AutoPageHeader />
        <Outlet />
      </main>

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
