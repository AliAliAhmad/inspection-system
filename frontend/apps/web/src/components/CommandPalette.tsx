import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Input, List, Typography, Tag, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

const { Text } = Typography;

interface CommandItem {
  label: string;
  emoji: string;
  path: string;
  category: string;
  keywords: string[];
  roles: string[];
}

const ALL_COMMANDS: CommandItem[] = [
  // Shared
  { label: 'Dashboard', emoji: '\ud83d\udcca', path: '/', category: 'Navigation', keywords: ['home', 'main', 'overview'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'Equipment Dashboard', emoji: '\u2699\ufe0f', path: '/equipment-dashboard', category: 'Navigation', keywords: ['fleet', 'assets', 'machines'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'Notifications', emoji: '\ud83d\udd14', path: '/notifications', category: 'Navigation', keywords: ['alerts', 'bell', 'messages'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'Leaderboard', emoji: '\ud83c\udfc6', path: '/leaderboard', category: 'Navigation', keywords: ['ranking', 'top', 'scores', 'points'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'Leaves', emoji: '\ud83c\udfd6\ufe0f', path: '/leaves', category: 'Navigation', keywords: ['vacation', 'time off', 'holiday'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'Profile', emoji: '\ud83d\udc64', path: '/profile', category: 'Navigation', keywords: ['account', 'settings', 'me'], roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { label: 'My Work Plan', emoji: '\ud83d\udccb', path: '/my-work-plan', category: 'Navigation', keywords: ['tasks', 'today', 'schedule'], roles: ['inspector', 'specialist'] },

  // Admin
  { label: 'Work Planning', emoji: '\ud83d\udcc5', path: '/admin/work-planning', category: 'Admin', keywords: ['plan', 'schedule', 'assign'], roles: ['admin', 'engineer'] },
  { label: 'Materials', emoji: '\ud83d\udce6', path: '/admin/materials', category: 'Admin', keywords: ['parts', 'inventory', 'stock', 'spare'], roles: ['admin', 'engineer'] },
  { label: 'PM Templates', emoji: '\ud83d\udcdd', path: '/admin/pm-templates', category: 'Admin', keywords: ['preventive', 'maintenance', 'template'], roles: ['admin', 'engineer'] },
  { label: 'Maintenance Cycles', emoji: '\ud83d\udd04', path: '/admin/cycles', category: 'Admin', keywords: ['cycle', 'recurring', 'periodic'], roles: ['admin'] },
  { label: 'Team Roster', emoji: '\ud83d\udc65', path: '/admin/roster', category: 'Admin', keywords: ['shift', 'schedule', 'team'], roles: ['admin', 'engineer'] },
  { label: 'Users', emoji: '\ud83d\udc68\u200d\ud83d\udcbc', path: '/admin/users', category: 'Admin', keywords: ['people', 'employees', 'workers', 'accounts'], roles: ['admin'] },
  { label: 'Equipment', emoji: '\ud83d\udd27', path: '/admin/equipment', category: 'Admin', keywords: ['asset', 'machine', 'device'], roles: ['admin'] },
  { label: 'Checklists', emoji: '\u2705', path: '/admin/checklists', category: 'Admin', keywords: ['checklist', 'template', 'form'], roles: ['admin'] },
  { label: 'Inspection Schedule', emoji: '\ud83d\udcc6', path: '/admin/schedules', category: 'Admin', keywords: ['timetable', 'routine'], roles: ['admin'] },
  { label: 'Inspection Assignments', emoji: '\ud83d\udccc', path: '/admin/assignments', category: 'Admin', keywords: ['assign', 'distribute'], roles: ['admin'] },
  { label: 'All Inspections', emoji: '\ud83d\udd0d', path: '/admin/inspections', category: 'Admin', keywords: ['view', 'history', 'results'], roles: ['admin'] },
  { label: 'Specialist Jobs', emoji: '\ud83e\udde0', path: '/admin/specialist-jobs', category: 'Admin', keywords: ['specialist', 'task'], roles: ['admin'] },
  { label: 'Engineer Jobs', emoji: '\ud83d\udee0\ufe0f', path: '/admin/engineer-jobs', category: 'Admin', keywords: ['engineer', 'task'], roles: ['admin'] },
  { label: 'Quality Reviews', emoji: '\u2b50', path: '/admin/quality-reviews', category: 'Admin', keywords: ['quality', 'review', 'qc'], roles: ['admin'] },
  { label: 'Approvals', emoji: '\u2714\ufe0f', path: '/admin/approvals', category: 'Admin', keywords: ['approve', 'reject', 'pending'], roles: ['admin'] },
  { label: 'Routines', emoji: '\ud83d\udd01', path: '/admin/routines', category: 'Admin', keywords: ['recurring', 'routine'], roles: ['admin'] },
  { label: 'Defects', emoji: '\ud83d\udc1b', path: '/admin/defects', category: 'Admin', keywords: ['bug', 'issue', 'problem', 'fault'], roles: ['admin', 'engineer'] },
  { label: 'Backlog', emoji: '\u26a0\ufe0f', path: '/admin/backlog', category: 'Admin', keywords: ['queue', 'waiting', 'todo'], roles: ['admin'] },
  { label: 'Reports', emoji: '\ud83d\udcca', path: '/admin/reports', category: 'Admin', keywords: ['report', 'analytics', 'data'], roles: ['admin'] },
  { label: 'Daily Review', emoji: '\ud83d\udcdd', path: '/admin/daily-review', category: 'Admin', keywords: ['review', 'daily', 'summary'], roles: ['admin', 'engineer'] },
  { label: 'Overdue', emoji: '\u23f0', path: '/admin/overdue', category: 'Admin', keywords: ['late', 'missed', 'delayed'], roles: ['admin', 'engineer'] },
  { label: 'Performance', emoji: '\ud83d\udcc8', path: '/admin/performance', category: 'Admin', keywords: ['stats', 'metrics', 'kpi', 'appraisal'], roles: ['admin', 'engineer'] },

  // Engineer
  { label: 'My Jobs (Engineer)', emoji: '\ud83d\udd27', path: '/engineer/jobs', category: 'Engineer', keywords: ['my', 'engineer', 'task'], roles: ['engineer'] },
  { label: 'Create Job', emoji: '\u2795', path: '/engineer/jobs/create', category: 'Engineer', keywords: ['new', 'create', 'add'], roles: ['engineer'] },
  { label: 'Team Assignment', emoji: '\ud83d\udc65', path: '/engineer/team-assignment', category: 'Engineer', keywords: ['assign', 'team', 'worker'], roles: ['engineer'] },
  { label: 'Pause Approvals', emoji: '\u23f8\ufe0f', path: '/engineer/pause-approvals', category: 'Engineer', keywords: ['pause', 'approve', 'break'], roles: ['engineer'] },

  // Inspector
  { label: 'My Assignments', emoji: '\ud83d\udccb', path: '/inspector/assignments', category: 'Inspector', keywords: ['inspection', 'assignment', 'task'], roles: ['inspector'] },

  // Specialist
  { label: 'My Jobs (Specialist)', emoji: '\ud83d\udd27', path: '/specialist/jobs', category: 'Specialist', keywords: ['specialist', 'job', 'task'], roles: ['specialist'] },

  // Quality
  { label: 'Pending Reviews', emoji: '\ud83d\udd0d', path: '/quality/reviews', category: 'Quality', keywords: ['pending', 'review', 'quality'], roles: ['quality_engineer'] },
  { label: 'Overdue Reviews', emoji: '\u23f0', path: '/quality/overdue', category: 'Quality', keywords: ['overdue', 'late', 'review'], roles: ['quality_engineer'] },
  { label: 'Bonus Requests', emoji: '\ud83c\udf1f', path: '/quality/bonus-requests', category: 'Quality', keywords: ['bonus', 'star', 'reward'], roles: ['quality_engineer'] },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filteredCommands = useMemo(() => {
    const role = user?.role || '';
    const roleFiltered = ALL_COMMANDS.filter((c) => c.roles.includes(role));

    if (!search.trim()) return roleFiltered;

    const query = search.toLowerCase();
    return roleFiltered.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query) ||
        c.keywords.some((k) => k.includes(query))
    );
  }, [search, user?.role]);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
    setSearch('');
  };

  return (
    <Modal
      open={open}
      onCancel={() => { setOpen(false); setSearch(''); }}
      footer={null}
      closable={false}
      width={560}
      styles={{ body: { padding: 0 } }}
      style={{ top: 80 }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search pages... (Ctrl+K)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          variant="borderless"
          size="large"
          autoFocus
          onPressEnter={() => {
            if (filteredCommands.length > 0) handleSelect(filteredCommands[0].path);
          }}
        />
      </div>
      <div style={{ maxHeight: 400, overflow: 'auto' }}>
        <List
          dataSource={filteredCommands}
          renderItem={(item) => (
            <List.Item
              onClick={() => handleSelect(item.path)}
              style={{ cursor: 'pointer', padding: '10px 16px', transition: 'background 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f5f5f5'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Space>
                <span style={{ fontSize: 18 }}>{item.emoji}</span>
                <Text strong>{item.label}</Text>
                <Tag color="blue" style={{ fontSize: 11 }}>{item.category}</Tag>
              </Space>
            </List.Item>
          )}
          locale={{ emptyText: 'No matching pages found' }}
        />
      </div>
      <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          \u2191\u2193 Navigate &middot; \u21b5 Select &middot; Esc Close
        </Text>
      </div>
    </Modal>
  );
}
