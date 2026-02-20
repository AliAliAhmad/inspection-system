import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Tooltip } from 'antd';
import {
  SearchOutlined,
  StarOutlined,
  StarFilled,
  DashboardOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  TranslationOutlined,
  BulbOutlined,
  UserOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../providers/AuthProvider';
import { useLanguage } from '../../providers/LanguageProvider';
import { useTheme } from '../../providers/ThemeProvider';

// ─── Types ───────────────────────────────────────────────────

interface PageItem {
  key: string;
  emoji: string;
  label: string;
  labelAr?: string;
  path: string;
  roles: string[];
}

interface PageCategory {
  key: string;
  label: string;
  labelAr: string;
  emoji: string;
  color: string;
  items: PageItem[];
}

// ─── Quick Actions ──────────────────────────────────────────

interface QuickAction {
  key: string;
  emoji: string;
  label: string;
  labelAr: string;
  path: string;
  roles: string[];
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'create-wp', emoji: '\u{1F4C5}', label: 'Create Work Plan', labelAr: '\u0625\u0646\u0634\u0627\u0621 \u062E\u0637\u0629', path: '/admin/work-planning', roles: ['admin', 'engineer'], color: '#667eea' },
  { key: 'daily-review', emoji: '\u{1F4DD}', label: 'Daily Review', labelAr: '\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u064A\u0648\u0645\u064A\u0629', path: '/admin/daily-review', roles: ['admin', 'engineer'], color: '#722ed1' },
  { key: 'gen-list', emoji: '\u{1F4CB}', label: 'Inspection List', labelAr: '\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0641\u062D\u0635', path: '/admin/schedules', roles: ['admin'], color: '#52c41a' },
  { key: 'assign', emoji: '\u{1F465}', label: 'Assign Inspectors', labelAr: '\u062A\u0639\u064A\u064A\u0646 \u0645\u0641\u062A\u0634\u064A\u0646', path: '/admin/assignments', roles: ['admin'], color: '#1890ff' },
  { key: 'leave', emoji: '\u{1F3D6}\uFE0F', label: 'Request Leave', labelAr: '\u0637\u0644\u0628 \u0625\u062C\u0627\u0632\u0629', path: '/leaves', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], color: '#13c2c2' },
  { key: 'report', emoji: '\u{1F4CA}', label: 'Reports', labelAr: '\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631', path: '/admin/reports', roles: ['admin'], color: '#fa8c16' },
  { key: 'followup', emoji: '\u{1F50D}', label: 'Follow-Ups', labelAr: '\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0627\u062A', path: '/admin/monitor-followups', roles: ['admin', 'engineer'], color: '#eb2f96' },
  { key: 'assess', emoji: '\u{1F3AF}', label: 'Assessments', labelAr: '\u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A', path: '/admin/assessments', roles: ['admin', 'engineer'], color: '#fa541c' },
  { key: 'my-assign', emoji: '\u{1F4CB}', label: 'My Assignments', labelAr: '\u0645\u0647\u0627\u0645\u064A', path: '/inspector/assignments', roles: ['inspector'], color: '#52c41a' },
  { key: 'my-jobs-s', emoji: '\u{1F527}', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/specialist/jobs', roles: ['specialist'], color: '#1890ff' },
  { key: 'my-jobs-e', emoji: '\u{1F6E0}\uFE0F', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/engineer/jobs', roles: ['engineer'], color: '#fa8c16' },
  { key: 'create-job', emoji: '\u2795', label: 'Create Job', labelAr: '\u0625\u0646\u0634\u0627\u0621 \u0639\u0645\u0644', path: '/engineer/jobs/create', roles: ['engineer'], color: '#52c41a' },
  { key: 'my-reviews', emoji: '\u{1F50D}', label: 'My Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A\u064A', path: '/quality/reviews', roles: ['quality_engineer'], color: '#722ed1' },
  { key: 'approvals', emoji: '\u2714\uFE0F', label: 'Approvals', labelAr: '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A', path: '/admin/approvals', roles: ['admin'], color: '#237804' },
];

// ─── All Page Categories ─────────────────────────────────────

const PAGE_CATEGORIES: PageCategory[] = [
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
      { key: 'profile', emoji: '\u{1F464}', label: 'Profile', labelAr: '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062E\u0635\u064A', path: '/profile', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
      { key: 'notifications', emoji: '\u{1F514}', label: 'Notifications', labelAr: '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/notifications', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
    ],
  },
];

// ─── Favorites (localStorage) ────────────────────────────────

const FAVORITES_KEY = 'homepage_favorites';

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
  catch { return []; }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

// ─── Component ──────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const userRole = user?.role || 'inspector';
  const isAr = language === 'ar';

  // Filter quick actions by role
  const quickActions = useMemo(
    () => QUICK_ACTIONS.filter(a => a.roles.includes(userRole)),
    [userRole],
  );

  // Filter categories by role + search
  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    return PAGE_CATEGORIES.map(cat => {
      const items = cat.items.filter(item => {
        if (!item.roles.includes(userRole)) return false;
        if (q) {
          return (
            item.label.toLowerCase().includes(q) ||
            (item.labelAr && item.labelAr.includes(q)) ||
            cat.label.toLowerCase().includes(q)
          );
        }
        return true;
      });
      return { ...cat, items };
    }).filter(cat => cat.items.length > 0);
  }, [userRole, search]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveFavorites(next);
      return next;
    });
  }, []);

  const goTo = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  // Keyboard shortcut: focus search on /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('homepage-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isSearching = search.trim().length > 0;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─── Search Bar ─── */}
      <Input
        id="homepage-search"
        placeholder={isAr ? '... \u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0627\u062A \u0648\u0627\u0644\u0623\u062F\u0648\u0627\u062A  (/)' : 'Search pages & tools...  (press /)'}
        prefix={<SearchOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        allowClear
        style={{ borderRadius: 10, fontSize: 14, height: 40, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: '1px solid #e8e8e8' }}
      />

      {/* ─── Quick Actions Row ─── */}
      {!isSearching && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <ThunderboltOutlined style={{ color: '#fa8c16', fontSize: 14 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8c8c8c' }}>
              {isAr ? '\u0625\u062C\u0631\u0627\u0621\u0627\u062A \u0633\u0631\u064A\u0639\u0629' : 'Quick Actions'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickActions.map(action => (
              <div
                key={action.key}
                onClick={() => goTo(action.path)}
                onMouseEnter={() => setHoveredItem(`qa-${action.key}`)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: hoveredItem === `qa-${action.key}` ? `${action.color}15` : '#fff',
                  border: `1px solid ${hoveredItem === `qa-${action.key}` ? action.color + '40' : '#e8e8e8'}`,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  color: hoveredItem === `qa-${action.key}` ? action.color : '#595959',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 14 }}>{action.emoji}</span>
                <span>{isAr ? action.labelAr : action.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Pages Grid (3 columns x 2 rows) ─── */}
      <div>
        {!isSearching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <AppstoreOutlined style={{ color: '#1890ff', fontSize: 14 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8c8c8c' }}>
              {isAr ? '\u0627\u0644\u0635\u0641\u062D\u0627\u062A' : 'All Pages'}
            </span>
          </div>
        )}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          {filteredCategories.map(cat => (
            <div
              key={cat.key}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid #f0f0f0',
                overflow: 'hidden',
              }}
            >
              {/* Category Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderBottom: `2px solid ${cat.color}`,
                background: `${cat.color}08`,
              }}>
                <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: cat.color }}>
                  {isAr ? cat.labelAr : cat.label}
                </span>
                <span style={{ fontSize: 11, color: '#bfbfbf', marginLeft: 'auto' }}>
                  {cat.items.length}
                </span>
              </div>

              {/* Items List */}
              <div style={{ padding: '4px 0' }}>
                {cat.items.map(item => {
                  const isFav = favorites.includes(item.key);
                  const isHovered = hoveredItem === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => goTo(item.path)}
                      onMouseEnter={() => setHoveredItem(item.key)}
                      onMouseLeave={() => setHoveredItem(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 14px',
                        cursor: 'pointer',
                        background: isHovered ? '#fafafa' : 'transparent',
                        transition: 'background 0.1s',
                        position: 'relative',
                      }}
                    >
                      <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.emoji}</span>
                      <span style={{ fontSize: 12, color: '#262626', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isAr && item.labelAr ? item.labelAr : item.label}
                      </span>
                      {/* Favorite star */}
                      <button
                        onClick={e => { e.stopPropagation(); toggleFavorite(item.key); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: 12,
                          color: '#faad14',
                          opacity: isHovered || isFav ? 1 : 0,
                          transition: 'opacity 0.15s',
                          flexShrink: 0,
                        }}
                      >
                        {isFav ? <StarFilled /> : <StarOutlined />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* No results */}
        {filteredCategories.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8c8c8c' }}>
            <AppstoreOutlined style={{ fontSize: 36, color: '#d9d9d9', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: '#8c8c8c', margin: 0 }}>
              {isAr ? `\u0644\u0627 \u062A\u0648\u062C\u062F \u0646\u062A\u0627\u0626\u062C \u0644\u0640 "${search}"` : `No pages match "${search}"`}
            </p>
          </div>
        )}
      </div>

      {/* ─── Tools & Shortcuts Strip ─── */}
      {!isSearching && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 16px',
          background: '#fafafa',
          borderRadius: 10,
          border: '1px solid #f0f0f0',
          flexWrap: 'wrap',
        }}>
          <Tooltip title={isAr ? '\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629' : 'Dashboard'}>
            <div
              onClick={() => goTo('/dashboard')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1890ff'; (e.currentTarget as HTMLDivElement).style.color = '#1890ff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <DashboardOutlined /> {isAr ? '\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629' : 'Dashboard'}
            </div>
          </Tooltip>

          <Tooltip title={isAr ? '\u0628\u062D\u062B \u0633\u0631\u064A\u0639' : 'Command Palette'}>
            <div
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#722ed1'; (e.currentTarget as HTMLDivElement).style.color = '#722ed1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <SearchOutlined /> {navigator.platform.includes('Mac') ? '\u2318K' : 'Ctrl+K'}
            </div>
          </Tooltip>

          <Tooltip title={isDark ? 'Light Mode' : 'Dark Mode'}>
            <div
              onClick={toggleTheme}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#fa8c16'; (e.currentTarget as HTMLDivElement).style.color = '#fa8c16'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <BulbOutlined /> {isDark ? (isAr ? '\u0641\u0627\u062A\u062D' : 'Light') : (isAr ? '\u062F\u0627\u0643\u0646' : 'Dark')}
            </div>
          </Tooltip>

          <Tooltip title={isAr ? 'English' : '\u0627\u0644\u0639\u0631\u0628\u064A\u0629'}>
            <div
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#13c2c2'; (e.currentTarget as HTMLDivElement).style.color = '#13c2c2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <TranslationOutlined /> {language === 'en' ? 'AR' : 'EN'}
            </div>
          </Tooltip>

          <Tooltip title={isAr ? '\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u062F\u0627\u062A' : 'Equipment Dashboard'}>
            <div
              onClick={() => goTo('/equipment-dashboard')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#1890ff'; (e.currentTarget as HTMLDivElement).style.color = '#1890ff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <ToolOutlined /> {isAr ? '\u0627\u0644\u0645\u0639\u062F\u0627\u062A' : 'Equipment'}
            </div>
          </Tooltip>

          <Tooltip title={isAr ? '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062E\u0635\u064A' : 'Profile'}>
            <div
              onClick={() => goTo('/profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 16,
                background: '#fff', border: '1px solid #e8e8e8',
                cursor: 'pointer', fontSize: 12, color: '#595959',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#52c41a'; (e.currentTarget as HTMLDivElement).style.color = '#52c41a'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e8e8'; (e.currentTarget as HTMLDivElement).style.color = '#595959'; }}
            >
              <UserOutlined /> {isAr ? '\u062D\u0633\u0627\u0628\u064A' : 'Profile'}
            </div>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
