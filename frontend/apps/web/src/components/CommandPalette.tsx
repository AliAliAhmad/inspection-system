/**
 * CommandPalette - Spotlight-like search (Cmd+K / Ctrl+K)
 * Searches: pages (static), equipment, users, inspections, defects (API)
 * Features: arrow key navigation, recent history, Arabic/English, role-based filtering
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Modal, Input, Tag, Spin, Empty, Typography } from 'antd';
import {
  SearchOutlined,
  DashboardOutlined,
  ToolOutlined,
  FileTextOutlined,
  UserOutlined,
  BugOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  TeamOutlined,
  TrophyOutlined,
  BellOutlined,
  ScheduleOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  StarOutlined,
  AuditOutlined,
  RiseOutlined,
  ControlOutlined,
  SyncOutlined,
  WarningOutlined,
  HistoryOutlined,
  EnterOutlined,
  ExperimentOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useTranslation } from 'react-i18next';
import { getApiClient } from '@inspection/shared';

const { Text } = Typography;

interface CommandItem {
  id: string;
  label: string;
  labelAr?: string;
  emoji: string;
  path: string;
  category: string;
  keywords: string[];
  roles: string[];
  description?: string;
  icon?: React.ReactNode;
}

const ALL_COMMANDS: CommandItem[] = [
  // Shared
  { id: 'p-dash', label: 'Dashboard', labelAr: 'لوحة المتابعة', emoji: '📊', path: '/', category: 'Navigation', keywords: ['home', 'main', 'overview', 'الرئيسية'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-eq-dash', label: 'Equipment Dashboard', labelAr: 'لوحة المعدات', emoji: '⚙️', path: '/equipment-dashboard', category: 'Navigation', keywords: ['fleet', 'assets', 'machines', 'معدات'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-notif', label: 'Notifications', labelAr: 'الإشعارات', emoji: '🔔', path: '/notifications', category: 'Navigation', keywords: ['alerts', 'bell', 'messages', 'تنبيهات'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-leader', label: 'Leaderboard', labelAr: 'لوحة المتصدرين', emoji: '🏆', path: '/leaderboard', category: 'Navigation', keywords: ['ranking', 'top', 'scores', 'points', 'نقاط'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-leaves', label: 'Leaves', labelAr: 'الإجازات', emoji: '🏖️', path: '/leaves', category: 'Navigation', keywords: ['vacation', 'time off', 'holiday', 'إجازة'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-profile', label: 'Profile', labelAr: 'الملف الشخصي', emoji: '👤', path: '/profile', category: 'Navigation', keywords: ['account', 'settings', 'me', 'حساب'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { id: 'p-mywork', label: 'My Work Plan', labelAr: 'خطة عملي', emoji: '📋', path: '/my-work-plan', category: 'Navigation', keywords: ['tasks', 'today', 'schedule', 'مهام'], roles: ['inspector', 'specialist'] },

  // Admin
  { id: 'p-wp', label: 'Work Planning', labelAr: 'تخطيط العمل', emoji: '📅', path: '/admin/work-planning', category: 'Admin', keywords: ['plan', 'schedule', 'assign', 'جدولة'], roles: ['admin', 'engineer'] },
  { id: 'p-mat', label: 'Materials', labelAr: 'المواد', emoji: '📦', path: '/admin/materials', category: 'Admin', keywords: ['parts', 'inventory', 'stock', 'spare', 'مخزون'], roles: ['admin', 'engineer'] },
  { id: 'p-pmt', label: 'PM Templates', labelAr: 'قوالب الصيانة', emoji: '📝', path: '/admin/pm-templates', category: 'Admin', keywords: ['preventive', 'maintenance', 'template', 'صيانة'], roles: ['admin', 'engineer'] },
  { id: 'p-cyc', label: 'Maintenance Cycles', labelAr: 'دورات الصيانة', emoji: '🔄', path: '/admin/cycles', category: 'Admin', keywords: ['cycle', 'recurring', 'periodic', 'دورة'], roles: ['admin'] },
  { id: 'p-roster', label: 'Team Roster', labelAr: 'قائمة الفريق', emoji: '👥', path: '/admin/roster', category: 'Admin', keywords: ['shift', 'schedule', 'team', 'فريق'], roles: ['admin', 'engineer'] },
  { id: 'p-users', label: 'Users', labelAr: 'المستخدمين', emoji: '👨‍💼', path: '/admin/users', category: 'Admin', keywords: ['people', 'employees', 'workers', 'accounts', 'موظفين'], roles: ['admin'] },
  { id: 'p-equip', label: 'Equipment', labelAr: 'المعدات', emoji: '🔧', path: '/admin/equipment', category: 'Admin', keywords: ['asset', 'machine', 'device', 'معدة'], roles: ['admin'] },
  { id: 'p-rh', label: 'Running Hours', labelAr: 'ساعات التشغيل', emoji: '⏱️', path: '/admin/running-hours', category: 'Admin', keywords: ['hours', 'service', 'runtime', 'خدمة'], roles: ['admin'] },
  { id: 'p-check', label: 'Checklists', labelAr: 'قوائم الفحص', emoji: '✅', path: '/admin/checklists', category: 'Admin', keywords: ['checklist', 'template', 'form', 'نموذج'], roles: ['admin'] },
  { id: 'p-sched', label: 'Inspection Schedule', labelAr: 'جدول الفحص', emoji: '📆', path: '/admin/schedules', category: 'Admin', keywords: ['timetable', 'routine', 'جدول'], roles: ['admin'] },
  { id: 'p-assign', label: 'Inspection Assignments', labelAr: 'تعيينات الفحص', emoji: '📌', path: '/admin/assignments', category: 'Admin', keywords: ['assign', 'distribute', 'توزيع'], roles: ['admin'] },
  { id: 'p-insp', label: 'All Inspections', labelAr: 'جميع الفحوصات', emoji: '🔍', path: '/admin/inspections', category: 'Admin', keywords: ['view', 'history', 'results', 'فحص'], roles: ['admin'] },
  { id: 'p-spec', label: 'Specialist Jobs', labelAr: 'وظائف المتخصصين', emoji: '🧠', path: '/admin/specialist-jobs', category: 'Admin', keywords: ['specialist', 'task', 'متخصص'], roles: ['admin'] },
  { id: 'p-eng', label: 'Engineer Jobs', labelAr: 'وظائف المهندسين', emoji: '🛠️', path: '/admin/engineer-jobs', category: 'Admin', keywords: ['engineer', 'task', 'مهندس'], roles: ['admin'] },
  { id: 'p-qr', label: 'Quality Reviews', labelAr: 'مراجعات الجودة', emoji: '⭐', path: '/admin/quality-reviews', category: 'Admin', keywords: ['quality', 'review', 'qc', 'جودة'], roles: ['admin'] },
  { id: 'p-appr', label: 'Approvals', labelAr: 'الموافقات', emoji: '✔️', path: '/admin/approvals', category: 'Admin', keywords: ['approve', 'reject', 'pending', 'موافقة'], roles: ['admin', 'engineer'] },
  { id: 'p-rout', label: 'Routines', labelAr: 'الروتينات', emoji: '🔁', path: '/admin/routines', category: 'Admin', keywords: ['recurring', 'routine', 'متكرر'], roles: ['admin'] },
  { id: 'p-def', label: 'Defects', labelAr: 'العيوب', emoji: '🐛', path: '/admin/defects', category: 'Admin', keywords: ['bug', 'issue', 'problem', 'fault', 'عيب'], roles: ['admin', 'engineer'] },
  { id: 'p-back', label: 'Backlog', labelAr: 'المتأخرات', emoji: '⚠️', path: '/admin/backlog', category: 'Admin', keywords: ['queue', 'waiting', 'todo', 'متأخر'], roles: ['admin'] },
  { id: 'p-rep', label: 'Reports', labelAr: 'التقارير', emoji: '📊', path: '/admin/reports', category: 'Admin', keywords: ['report', 'analytics', 'data', 'تحليلات'], roles: ['admin'] },
  { id: 'p-dr', label: 'Daily Review', labelAr: 'المراجعة اليومية', emoji: '📝', path: '/admin/daily-review', category: 'Admin', keywords: ['review', 'daily', 'summary', 'يومي'], roles: ['admin', 'engineer'] },
  { id: 'p-over', label: 'Overdue', labelAr: 'المتأخرات', emoji: '⏰', path: '/admin/overdue', category: 'Admin', keywords: ['late', 'missed', 'delayed', 'متأخر'], roles: ['admin', 'engineer'] },
  { id: 'p-perf', label: 'Performance', labelAr: 'الأداء', emoji: '📈', path: '/admin/performance', category: 'Admin', keywords: ['stats', 'metrics', 'kpi', 'أداء'], roles: ['admin', 'engineer'] },
  { id: 'p-nr', label: 'Notification Rules', labelAr: 'قواعد الإشعارات', emoji: '⚡', path: '/admin/notification-rules', category: 'Admin', keywords: ['rule', 'automation', 'أتمتة'], roles: ['admin'] },
  { id: 'p-na', label: 'Notification Analytics', labelAr: 'تحليلات الإشعارات', emoji: '📉', path: '/admin/notification-analytics', category: 'Admin', keywords: ['analytics', 'notification', 'إشعار'], roles: ['admin'] },
  { id: 'p-ls', label: 'Leave Settings', labelAr: 'إعدادات الإجازات', emoji: '⚙️', path: '/admin/leave-settings', category: 'Admin', keywords: ['policy', 'settings', 'إعدادات'], roles: ['admin'] },
  { id: 'p-wps', label: 'Work Plan Settings', labelAr: 'إعدادات خطة العمل', emoji: '⚙️', path: '/admin/work-plan-settings', category: 'Admin', keywords: ['settings', 'config', 'إعدادات'], roles: ['admin'] },
  { id: 'p-tc', label: 'Team Communication', labelAr: 'تواصل الفريق', emoji: '💬', path: '/admin/team-communication', category: 'Admin', keywords: ['chat', 'message', 'channel', 'رسالة'], roles: ['admin'] },

  // Engineer
  { id: 'p-ej', label: 'My Jobs (Engineer)', labelAr: 'وظائفي', emoji: '🔧', path: '/engineer/jobs', category: 'Engineer', keywords: ['my', 'engineer', 'task'], roles: ['engineer'] },
  { id: 'p-cj', label: 'Create Job', labelAr: 'إنشاء وظيفة', emoji: '➕', path: '/engineer/jobs/create', category: 'Engineer', keywords: ['new', 'create', 'add'], roles: ['engineer'] },
  { id: 'p-ta', label: 'Team Assignment', labelAr: 'تعيين الفريق', emoji: '👥', path: '/engineer/team-assignment', category: 'Engineer', keywords: ['assign', 'team', 'worker'], roles: ['engineer'] },
  { id: 'p-pa', label: 'Pause Approvals', labelAr: 'موافقات الإيقاف', emoji: '⏸️', path: '/engineer/pause-approvals', category: 'Engineer', keywords: ['pause', 'approve', 'break'], roles: ['engineer'] },

  // Inspector
  { id: 'p-ma', label: 'My Assignments', labelAr: 'تعييناتي', emoji: '📋', path: '/inspector/assignments', category: 'Inspector', keywords: ['inspection', 'assignment', 'task'], roles: ['inspector'] },

  // Specialist
  { id: 'p-sj', label: 'My Jobs (Specialist)', labelAr: 'وظائفي', emoji: '🔧', path: '/specialist/jobs', category: 'Specialist', keywords: ['specialist', 'job', 'task'], roles: ['specialist'] },

  // Quality
  { id: 'p-pr', label: 'Pending Reviews', labelAr: 'مراجعات معلقة', emoji: '🔍', path: '/quality/reviews', category: 'Quality', keywords: ['pending', 'review', 'quality'], roles: ['quality_engineer'] },
  { id: 'p-or', label: 'Overdue Reviews', labelAr: 'مراجعات متأخرة', emoji: '⏰', path: '/quality/overdue', category: 'Quality', keywords: ['overdue', 'late', 'review'], roles: ['quality_engineer'] },
  { id: 'p-br', label: 'Bonus Requests', labelAr: 'طلبات المكافآت', emoji: '🌟', path: '/quality/bonus-requests', category: 'Quality', keywords: ['bonus', 'star', 'reward'], roles: ['quality_engineer'] },
];

const CATEGORY_COLORS: Record<string, string> = {
  Recent: 'default',
  Navigation: 'blue',
  Admin: 'geekblue',
  Engineer: 'cyan',
  Inspector: 'green',
  Specialist: 'orange',
  Quality: 'purple',
  Equipment: 'green',
  Users: 'purple',
  Inspections: 'orange',
  Defects: 'red',
};

const RECENT_KEY = 'cmd_palette_recent';
const MAX_RECENT = 5;

function getRecent(): CommandItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function saveRecent(item: CommandItem) {
  const recent = getRecent().filter((r) => r.id !== item.id);
  recent.unshift({ ...item, category: 'Recent' });
  if (recent.length > MAX_RECENT) recent.pop();
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [apiResults, setApiResults] = useState<CommandItem[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const inputRef = useRef<any>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      setApiResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // API search for dynamic entities
  const searchAPI = useCallback(async (q: string) => {
    if (q.length < 2) { setApiResults([]); return; }
    setApiLoading(true);
    const results: CommandItem[] = [];

    try {
      const api = getApiClient();
      const [eqRes, userRes, inspRes, defRes] = await Promise.allSettled([
        api.get('/api/equipment', { params: { search: q, per_page: 4 } }),
        api.get('/api/users', { params: { search: q, per_page: 4 } }),
        api.get('/api/inspections', { params: { search: q, per_page: 4 } }),
        api.get('/api/defects', { params: { search: q, per_page: 4 } }),
      ]);

      if (eqRes.status === 'fulfilled' && eqRes.value?.data?.data) {
        for (const eq of eqRes.value.data.data.slice(0, 4)) {
          results.push({
            id: `eq-${eq.id}`, label: eq.name || eq.code || `Equipment #${eq.id}`,
            labelAr: eq.name_ar, emoji: '🔧', path: `/admin/equipment?id=${eq.id}`,
            category: 'Equipment', keywords: [], roles: [],
            description: [eq.code, eq.location].filter(Boolean).join(' · '),
          });
        }
      }

      if (userRes.status === 'fulfilled' && userRes.value?.data?.data) {
        for (const u of userRes.value.data.data.slice(0, 4)) {
          results.push({
            id: `user-${u.id}`, label: u.full_name || u.username || `User #${u.id}`,
            emoji: '👤', path: `/admin/users?id=${u.id}`,
            category: 'Users', keywords: [], roles: [],
            description: u.role,
          });
        }
      }

      if (inspRes.status === 'fulfilled' && inspRes.value?.data?.data) {
        for (const i of inspRes.value.data.data.slice(0, 4)) {
          results.push({
            id: `insp-${i.id}`, label: i.inspection_code || `Inspection #${i.id}`,
            emoji: '📋', path: `/admin/inspections?id=${i.id}`,
            category: 'Inspections', keywords: [], roles: [],
            description: i.equipment_name || i.status,
          });
        }
      }

      if (defRes.status === 'fulfilled' && defRes.value?.data?.data) {
        for (const d of defRes.value.data.data.slice(0, 4)) {
          results.push({
            id: `def-${d.id}`, label: d.title || d.code || `Defect #${d.id}`,
            labelAr: d.title_ar, emoji: '🐛', path: `/admin/defects?id=${d.id}`,
            category: 'Defects', keywords: [], roles: [],
            description: d.severity || d.status,
          });
        }
      }
    } catch { /* silent */ }

    setApiResults(results);
    setApiLoading(false);
  }, []);

  // Debounced API search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.length >= 2) {
      debounceRef.current = setTimeout(() => searchAPI(search), 300);
    } else {
      setApiResults([]);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, searchAPI]);

  // Filter static commands
  const filteredCommands = useMemo(() => {
    const role = user?.role || '';
    const roleFiltered = ALL_COMMANDS.filter((c) => c.roles.includes(role));
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return roleFiltered.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.labelAr && c.labelAr.includes(search)) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q))
    ).slice(0, 10);
  }, [search, user?.role]);

  // Combined results
  const allResults = useMemo(() => {
    if (!search.trim()) return getRecent();
    return [...filteredCommands, ...apiResults];
  }, [search, filteredCommands, apiResults]);

  // Reset index on results change
  useEffect(() => { setSelectedIndex(0); }, [allResults.length]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((item: CommandItem) => {
    saveRecent(item);
    setOpen(false);
    setSearch('');
    navigate(item.path);
  }, [navigate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((p) => Math.min(p + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((p) => Math.max(p - 1, 0));
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(allResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [allResults, selectedIndex, handleSelect]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map: Record<string, CommandItem[]> = {};
    for (const item of allResults) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [allResults]);

  let flatIdx = -1;

  return (
    <Modal
      open={open}
      onCancel={() => { setOpen(false); setSearch(''); }}
      footer={null}
      closable={false}
      width={600}
      styles={{ body: { padding: 0 }, content: { borderRadius: 12, overflow: 'hidden' } }}
      style={{ top: 80 }}
      destroyOnClose
    >
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <SearchOutlined style={{ fontSize: 18, color: '#bfbfbf' }} />
        <Input
          ref={inputRef}
          placeholder={isAr ? 'ابحث عن صفحة، معدة، فحص، مستخدم...' : 'Search pages, equipment, inspections, users...'}
          variant="borderless"
          size="large"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ fontSize: 15, direction: isAr ? 'rtl' : 'ltr' }}
        />
        {apiLoading && <Spin size="small" />}
        <Tag style={{ borderRadius: 4, fontSize: 11, padding: '0 6px', color: '#8c8c8c', border: '1px solid #d9d9d9', background: '#fafafa', flexShrink: 0 }}>
          {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}
        </Tag>
      </div>

      {/* Results */}
      <div ref={listRef} style={{ maxHeight: 400, overflowY: 'auto', padding: '4px 0' }}>
        {allResults.length === 0 && !apiLoading && (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            {search ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isAr ? 'لا توجد نتائج' : 'No results found'} />
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {isAr ? 'اكتب للبحث...' : 'Start typing to search...'}
              </Text>
            )}
          </div>
        )}

        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            {/* Category header */}
            <div style={{
              padding: '8px 16px 4px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#8c8c8c',
              letterSpacing: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              direction: isAr ? 'rtl' : 'ltr',
            }}>
              {cat === 'Recent' && <HistoryOutlined />}
              {cat}
            </div>

            {/* Items */}
            {items.map((item) => {
              flatIdx++;
              const isSelected = flatIdx === selectedIndex;
              const idx = flatIdx;

              return (
                <div
                  key={item.id}
                  data-idx={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#e6f4ff' : 'transparent',
                    transition: 'background-color 0.1s',
                    direction: isAr ? 'rtl' : 'ltr',
                  }}
                >
                  {/* Emoji icon */}
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? '#1677ff' : '#f5f5f5',
                    color: isSelected ? '#fff' : '#595959',
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    {item.emoji}
                  </div>

                  {/* Label + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#262626',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {isAr && item.labelAr ? item.labelAr : item.label}
                    </div>
                    {item.description && (
                      <div style={{
                        fontSize: 12,
                        color: '#8c8c8c',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {item.description}
                      </div>
                    )}
                  </div>

                  {/* Category tag */}
                  {cat !== 'Recent' && (
                    <Tag color={CATEGORY_COLORS[cat] || 'default'} style={{ fontSize: 10, margin: 0 }}>
                      {cat}
                    </Tag>
                  )}

                  {/* Enter hint */}
                  {isSelected && <EnterOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer shortcuts */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: 11,
        color: '#8c8c8c',
      }}>
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> {isAr ? 'تنقل' : 'Navigate'}</span>
        <span><Kbd>↵</Kbd> {isAr ? 'فتح' : 'Open'}</span>
        <span><Kbd>Esc</Kbd> {isAr ? 'إغلاق' : 'Close'}</span>
      </div>
    </Modal>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      background: '#f5f5f5',
      border: '1px solid #d9d9d9',
      borderRadius: 3,
      padding: '1px 5px',
      fontSize: 10,
      fontFamily: 'monospace',
    }}>
      {children}
    </kbd>
  );
}
