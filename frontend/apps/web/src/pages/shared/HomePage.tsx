import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Tag, Tooltip, Badge } from 'antd';
import {
  SearchOutlined,
  StarOutlined,
  StarFilled,
  ClockCircleOutlined,
  RightOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../providers/AuthProvider';

// ─── Types ───────────────────────────────────────────────────

interface LauncherItem {
  key: string;
  emoji: string;
  label: string;
  labelAr?: string;
  path: string;
  roles: string[];
  description?: string;
  descriptionAr?: string;
}

interface LauncherCategory {
  key: string;
  label: string;
  labelAr: string;
  emoji: string;
  color: string;
  gradient: string;
  items: LauncherItem[];
}

// ─── All Categories with Descriptions ─────────────────────────

const HOMEPAGE_CATEGORIES: LauncherCategory[] = [
  {
    key: 'operations',
    label: 'Operations',
    labelAr: '\u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A',
    emoji: '\u{1F4CA}',
    color: '#667eea',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    items: [
      { key: 'work-planning', emoji: '\u{1F4C5}', label: 'Work Planning', labelAr: '\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0639\u0645\u0644', path: '/admin/work-planning', roles: ['admin', 'engineer'], description: 'Create & manage daily work plans', descriptionAr: '\u0625\u0646\u0634\u0627\u0621 \u0648\u0625\u062F\u0627\u0631\u0629 \u062E\u0637\u0637 \u0627\u0644\u0639\u0645\u0644' },
      { key: 'daily-review', emoji: '\u{1F4DD}', label: 'Daily Review', labelAr: '\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u064A\u0648\u0645\u064A\u0629', path: '/admin/daily-review', roles: ['admin', 'engineer'], description: 'Review daily operations & tasks', descriptionAr: '\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u064A\u0648\u0645\u064A\u0629' },
      { key: 'schedules', emoji: '\u{1F4C6}', label: 'Schedules', labelAr: '\u0627\u0644\u062C\u062F\u0627\u0648\u0644', path: '/admin/schedules', roles: ['admin'], description: 'Manage inspection schedules', descriptionAr: '\u0625\u062F\u0627\u0631\u0629 \u062C\u062F\u0627\u0648\u0644 \u0627\u0644\u0641\u062D\u0635' },
      { key: 'assignments', emoji: '\u{1F4CB}', label: 'Assignments', labelAr: '\u0627\u0644\u062A\u0639\u064A\u064A\u0646\u0627\u062A', path: '/admin/assignments', roles: ['admin'], description: 'Assign inspections to teams', descriptionAr: '\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A \u0644\u0644\u0641\u0631\u0642' },
      { key: 'overdue', emoji: '\u23F0', label: 'Overdue', labelAr: '\u0645\u062A\u0623\u062E\u0631', path: '/admin/overdue', roles: ['admin', 'engineer'], description: 'Track overdue items', descriptionAr: '\u062A\u062A\u0628\u0639 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u0629' },
      { key: 'approvals', emoji: '\u2714\uFE0F', label: 'Approvals', labelAr: '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062A', path: '/admin/approvals', roles: ['admin'], description: 'Leaves, bonuses & pauses', descriptionAr: '\u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A \u0648\u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062A' },
      { key: 'my-work-plan', emoji: '\u{1F4CB}', label: 'My Work Plan', labelAr: '\u062E\u0637\u0629 \u0639\u0645\u0644\u064A', path: '/my-work-plan', roles: ['inspector', 'specialist', 'engineer'], description: 'Your personal work plan', descriptionAr: '\u062E\u0637\u0629 \u0639\u0645\u0644\u0643 \u0627\u0644\u0634\u062E\u0635\u064A\u0629' },
      { key: 'my-assignments', emoji: '\u{1F4CB}', label: 'My Assignments', labelAr: '\u0645\u0647\u0627\u0645\u064A', path: '/inspector/assignments', roles: ['inspector'], description: 'Your inspection assignments', descriptionAr: '\u0645\u0647\u0627\u0645 \u0627\u0644\u0641\u062D\u0635 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0643' },
      { key: 'my-jobs-specialist', emoji: '\u{1F527}', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/specialist/jobs', roles: ['specialist'], description: 'Your specialist jobs', descriptionAr: '\u0623\u0639\u0645\u0627\u0644\u0643 \u0627\u0644\u062A\u062E\u0635\u0635\u064A\u0629' },
      { key: 'my-jobs-engineer', emoji: '\u{1F6E0}\uFE0F', label: 'My Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644\u064A', path: '/engineer/jobs', roles: ['engineer'], description: 'Your engineering jobs', descriptionAr: '\u0623\u0639\u0645\u0627\u0644\u0643 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629' },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment',
    labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A',
    emoji: '\u{1F527}',
    color: '#1890ff',
    gradient: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
    items: [
      { key: 'equipment-dashboard', emoji: '\u{1F4CA}', label: 'Dashboard', labelAr: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u062F\u0627\u062A', path: '/equipment-dashboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], description: 'Real-time equipment status', descriptionAr: '\u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u0639\u062F\u0627\u062A \u0645\u0628\u0627\u0634\u0631\u0629' },
      { key: 'equipment-list', emoji: '\u{1F527}', label: 'Equipment', labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A', path: '/admin/equipment', roles: ['admin'], description: 'Manage all equipment', descriptionAr: '\u0625\u062F\u0627\u0631\u0629 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0639\u062F\u0627\u062A' },
      { key: 'running-hours', emoji: '\u23F1\uFE0F', label: 'Running Hours', labelAr: '\u0633\u0627\u0639\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644', path: '/admin/running-hours', roles: ['admin', 'engineer'], description: 'Track operating hours', descriptionAr: '\u062A\u062A\u0628\u0639 \u0633\u0627\u0639\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644' },
      { key: 'defects', emoji: '\u{1F41B}', label: 'Defects', labelAr: '\u0627\u0644\u0639\u064A\u0648\u0628', path: '/admin/defects', roles: ['admin', 'engineer'], description: 'Track & resolve issues', descriptionAr: '\u062A\u062A\u0628\u0639 \u0648\u062D\u0644 \u0627\u0644\u0645\u0634\u0627\u0643\u0644' },
      { key: 'backlog', emoji: '\u{1F4CB}', label: 'Backlog', labelAr: '\u0627\u0644\u0645\u062A\u0631\u0627\u0643\u0645', path: '/admin/backlog', roles: ['admin'], description: 'Deferred & pending items', descriptionAr: '\u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0645\u0624\u062C\u0644\u0629' },
      { key: 'checklists', emoji: '\u2705', label: 'Checklists', labelAr: '\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0641\u062D\u0635', path: '/admin/checklists', roles: ['admin'], description: 'Inspection question templates', descriptionAr: '\u0642\u0648\u0627\u0644\u0628 \u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0641\u062D\u0635' },
      { key: 'routines', emoji: '\u{1F501}', label: 'Routines', labelAr: '\u0627\u0644\u0631\u0648\u062A\u064A\u0646', path: '/admin/routines', roles: ['admin'], description: 'Preventive maintenance routines', descriptionAr: '\u0631\u0648\u062A\u064A\u0646 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0648\u0642\u0627\u0626\u064A\u0629' },
    ],
  },
  {
    key: 'inspections',
    label: 'Inspections',
    labelAr: '\u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A',
    emoji: '\u{1F4CB}',
    color: '#52c41a',
    gradient: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    items: [
      { key: 'all-inspections', emoji: '\u{1F4CB}', label: 'All Inspections', labelAr: '\u0643\u0644 \u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A', path: '/admin/inspections', roles: ['admin'], description: 'View all inspections', descriptionAr: '\u0639\u0631\u0636 \u062C\u0645\u064A\u0639 \u0627\u0644\u0641\u062D\u0648\u0635\u0627\u062A' },
      { key: 'assessment-tracking', emoji: '\u{1F3AF}', label: 'Assessment Tracking', labelAr: '\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A', path: '/admin/assessments', roles: ['admin', 'engineer'], description: 'Multi-layer assessment pipeline', descriptionAr: '\u062E\u0637 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0637\u0628\u0642\u0627\u062A' },
      { key: 'monitor-followups', emoji: '\u{1F50D}', label: 'Monitor Follow-Ups', labelAr: '\u0645\u062A\u0627\u0628\u0639\u0627\u062A \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629', path: '/admin/monitor-followups', roles: ['admin', 'engineer'], description: 'Schedule follow-up inspections', descriptionAr: '\u062C\u062F\u0648\u0644\u0629 \u0641\u062D\u0648\u0635\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629' },
      { key: 'quality-reviews', emoji: '\u2B50', label: 'Quality Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629', path: '/admin/quality-reviews', roles: ['admin'], description: 'Quality review queue', descriptionAr: '\u0642\u0627\u0626\u0645\u0629 \u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629' },
      { key: 'specialist-jobs', emoji: '\u{1F528}', label: 'Specialist Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u062A\u062E\u0635\u0635\u064A\u0646', path: '/admin/specialist-jobs', roles: ['admin'], description: 'All specialist work', descriptionAr: '\u062C\u0645\u064A\u0639 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u062A\u062E\u0635\u0635\u064A\u0646' },
      { key: 'engineer-jobs', emoji: '\u{1F6E0}\uFE0F', label: 'Engineer Jobs', labelAr: '\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0645\u0647\u0646\u062F\u0633\u064A\u0646', path: '/admin/engineer-jobs', roles: ['admin'], description: 'All engineering work', descriptionAr: '\u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0647\u0646\u062F\u0633\u064A\u0629' },
      { key: 'qe-reviews', emoji: '\u{1F50D}', label: 'My Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A\u064A', path: '/quality/reviews', roles: ['quality_engineer'], description: 'Your quality reviews', descriptionAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0643' },
      { key: 'qe-overdue', emoji: '\u23F0', label: 'Overdue Reviews', labelAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0645\u062A\u0623\u062E\u0631\u0629', path: '/quality/overdue', roles: ['quality_engineer'], description: 'Overdue quality reviews', descriptionAr: '\u0645\u0631\u0627\u062C\u0639\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u0629' },
      { key: 'qe-bonus', emoji: '\u{1F4B0}', label: 'Bonus Requests', labelAr: '\u0637\u0644\u0628\u0627\u062A \u0645\u0643\u0627\u0641\u0622\u062A', path: '/quality/bonus-requests', roles: ['quality_engineer'], description: 'Review bonus requests', descriptionAr: '\u0645\u0631\u0627\u062C\u0639\u0629 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062A' },
    ],
  },
  {
    key: 'team',
    label: 'Team',
    labelAr: '\u0627\u0644\u0641\u0631\u064A\u0642',
    emoji: '\u{1F465}',
    color: '#722ed1',
    gradient: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
    items: [
      { key: 'users', emoji: '\u{1F465}', label: 'Users', labelAr: '\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646', path: '/admin/users', roles: ['admin'], description: 'Manage user accounts', descriptionAr: '\u0625\u062F\u0627\u0631\u0629 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646' },
      { key: 'roster', emoji: '\u{1F4C5}', label: 'Roster', labelAr: '\u062C\u062F\u0648\u0644 \u0627\u0644\u062F\u0648\u0627\u0645', path: '/admin/roster', roles: ['admin', 'engineer'], description: 'Team shifts & availability', descriptionAr: '\u0648\u0631\u062F\u064A\u0627\u062A \u0627\u0644\u0641\u0631\u064A\u0642' },
      { key: 'leaves', emoji: '\u{1F3D6}\uFE0F', label: 'Leaves', labelAr: '\u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A', path: '/leaves', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], description: 'Request & manage leaves', descriptionAr: '\u0637\u0644\u0628 \u0648\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A' },
      { key: 'performance', emoji: '\u{1F4C8}', label: 'Performance', labelAr: '\u0627\u0644\u0623\u062F\u0627\u0621', path: '/admin/performance', roles: ['admin', 'engineer'], description: 'Team & individual metrics', descriptionAr: '\u0645\u0642\u0627\u064A\u064A\u0633 \u0627\u0644\u0641\u0631\u064A\u0642 \u0648\u0627\u0644\u0623\u0641\u0631\u0627\u062F' },
      { key: 'leaderboard', emoji: '\u{1F3C6}', label: 'Leaderboard', labelAr: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u062A\u0635\u062F\u0631\u064A\u0646', path: '/leaderboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], description: 'Performance rankings', descriptionAr: '\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0623\u062F\u0627\u0621' },
      { key: 'team-communication', emoji: '\u{1F4AC}', label: 'Communication', labelAr: '\u0627\u0644\u062A\u0648\u0627\u0635\u0644', path: '/admin/team-communication', roles: ['admin'], description: 'Team channels & broadcasts', descriptionAr: '\u0642\u0646\u0648\u0627\u062A \u0648\u0628\u062B \u0627\u0644\u0641\u0631\u064A\u0642' },
      { key: 'team-assignment', emoji: '\u{1F465}', label: 'Team Assignment', labelAr: '\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0641\u0631\u064A\u0642', path: '/engineer/team-assignment', roles: ['engineer'], description: 'Drag-drop team assignments', descriptionAr: '\u062A\u0639\u064A\u064A\u0646 \u0627\u0644\u0641\u0631\u064A\u0642 \u0628\u0627\u0644\u0633\u062D\u0628' },
      { key: 'pause-approvals', emoji: '\u23F8\uFE0F', label: 'Pause Approvals', labelAr: '\u0645\u0648\u0627\u0641\u0642\u0627\u062A \u0627\u0644\u0625\u064A\u0642\u0627\u0641', path: '/engineer/pause-approvals', roles: ['engineer'], description: 'Approve pause requests', descriptionAr: '\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0637\u0644\u0628\u0627\u062A \u0627\u0644\u0625\u064A\u0642\u0627\u0641' },
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    labelAr: '\u0627\u0644\u0635\u064A\u0627\u0646\u0629',
    emoji: '\u{1F4E6}',
    color: '#fa8c16',
    gradient: 'linear-gradient(135deg, #fa8c16 0%, #d46b08 100%)',
    items: [
      { key: 'materials', emoji: '\u{1F4E6}', label: 'Materials', labelAr: '\u0627\u0644\u0645\u0648\u0627\u062F', path: '/admin/materials', roles: ['admin', 'engineer'], description: 'Spare parts & inventory', descriptionAr: '\u0642\u0637\u0639 \u0627\u0644\u063A\u064A\u0627\u0631 \u0648\u0627\u0644\u0645\u062E\u0632\u0648\u0646' },
      { key: 'pm-templates', emoji: '\u{1F4C4}', label: 'PM Templates', labelAr: '\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0635\u064A\u0627\u0646\u0629', path: '/admin/pm-templates', roles: ['admin', 'engineer'], description: 'Preventive maintenance templates', descriptionAr: '\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0635\u064A\u0627\u0646\u0629 \u0627\u0644\u0648\u0642\u0627\u0626\u064A\u0629' },
      { key: 'cycles', emoji: '\u{1F504}', label: 'Cycles', labelAr: '\u0627\u0644\u062F\u0648\u0631\u0627\u062A', path: '/admin/cycles', roles: ['admin'], description: 'Maintenance cycles', descriptionAr: '\u062F\u0648\u0631\u0627\u062A \u0627\u0644\u0635\u064A\u0627\u0646\u0629' },
      { key: 'reports', emoji: '\u{1F4CA}', label: 'Reports', labelAr: '\u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631', path: '/admin/reports', roles: ['admin'], description: 'Generate system reports', descriptionAr: '\u0625\u0646\u0634\u0627\u0621 \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    labelAr: '\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A',
    emoji: '\u2699\uFE0F',
    color: '#8c8c8c',
    gradient: 'linear-gradient(135deg, #8c8c8c 0%, #595959 100%)',
    items: [
      { key: 'leave-settings', emoji: '\u{1F3D6}\uFE0F', label: 'Leave Settings', labelAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A', path: '/admin/leave-settings', roles: ['admin'], description: 'Leave types & policies', descriptionAr: '\u0623\u0646\u0648\u0627\u0639 \u0648\u0633\u064A\u0627\u0633\u0627\u062A \u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A' },
      { key: 'work-plan-settings', emoji: '\u{1F4C5}', label: 'Work Plan Settings', labelAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062E\u0637\u0629 \u0627\u0644\u0639\u0645\u0644', path: '/admin/work-plan-settings', roles: ['admin'], description: 'Work plan configuration', descriptionAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062E\u0637\u0629 \u0627\u0644\u0639\u0645\u0644' },
      { key: 'notification-rules', emoji: '\u{1F514}', label: 'Notification Rules', labelAr: '\u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/admin/notification-rules', roles: ['admin'], description: 'Triggers & escalation', descriptionAr: '\u0627\u0644\u0645\u0634\u063A\u0644\u0627\u062A \u0648\u0627\u0644\u062A\u0635\u0639\u064A\u062F' },
      { key: 'notification-analytics', emoji: '\u{1F4CA}', label: 'Notification Analytics', labelAr: '\u062A\u062D\u0644\u064A\u0644\u0627\u062A \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/admin/notification-analytics', roles: ['admin'], description: 'Delivery & engagement stats', descriptionAr: '\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u062A\u0633\u0644\u064A\u0645 \u0648\u0627\u0644\u062A\u0641\u0627\u0639\u0644' },
      { key: 'profile', emoji: '\u{1F464}', label: 'Profile', labelAr: '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062E\u0635\u064A', path: '/profile', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], description: 'Your account settings', descriptionAr: '\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062D\u0633\u0627\u0628\u0643' },
      { key: 'notifications', emoji: '\u{1F514}', label: 'Notifications', labelAr: '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', path: '/notifications', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'], description: 'View all notifications', descriptionAr: '\u0639\u0631\u0636 \u062C\u0645\u064A\u0639 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A' },
    ],
  },
];

// ─── Quick Access Items (always visible on top) ──────────────

const QUICK_ACCESS = [
  { key: 'dashboard', emoji: '\u{1F3E0}', label: 'Dashboard', labelAr: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0642\u064A\u0627\u062F\u0629', path: '/', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { key: 'equipment-dashboard', emoji: '\u{1F527}', label: 'Equipment', labelAr: '\u0627\u0644\u0645\u0639\u062F\u0627\u062A', path: '/equipment-dashboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { key: 'leaderboard', emoji: '\u{1F3C6}', label: 'Leaderboard', labelAr: '\u0627\u0644\u0645\u062A\u0635\u062F\u0631\u064A\u0646', path: '/leaderboard', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
  { key: 'leaves', emoji: '\u{1F3D6}\uFE0F', label: 'Leaves', labelAr: '\u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A', path: '/leaves', roles: ['admin', 'engineer', 'inspector', 'specialist', 'quality_engineer'] },
];

// ─── Favorites & Recent (localStorage) ──────────────────────

const FAVORITES_KEY = 'homepage_favorites';
const RECENT_KEY = 'homepage_recent';
const MAX_RECENT = 8;

function loadFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch { return []; }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function addRecent(path: string) {
  const recent = loadRecent().filter(p => p !== path);
  recent.unshift(path);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// ─── Helper: Get all items flat ─────────────────────────────

function getAllItems(role: string): LauncherItem[] {
  const items: LauncherItem[] = [];
  for (const cat of HOMEPAGE_CATEGORIES) {
    for (const item of cat.items) {
      if (item.roles.includes(role)) items.push(item);
    }
  }
  return items;
}

// ─── Styles ──────────────────────────────────────────────────

const styles = {
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 24px 80px',
  } as React.CSSProperties,
  searchWrapper: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
    background: 'linear-gradient(180deg, #f5f5f5 80%, transparent 100%)',
    paddingBottom: 16,
    marginBottom: 8,
  } as React.CSSProperties,
  searchInput: {
    borderRadius: 12,
    fontSize: 16,
    height: 48,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    border: '1px solid #e8e8e8',
  } as React.CSSProperties,
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 28,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#8c8c8c',
    margin: 0,
  } as React.CSSProperties,
  quickAccessRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginBottom: 4,
  } as React.CSSProperties,
  quickAccessChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 20,
    background: '#fff',
    border: '1px solid #e8e8e8',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  favoritesRow: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto' as const,
    paddingBottom: 4,
  } as React.CSSProperties,
  favoriteChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 16,
    background: '#fffbe6',
    border: '1px solid #ffe58f',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.2s',
  } as React.CSSProperties,
  recentChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 16,
    background: '#f0f5ff',
    border: '1px solid #d6e4ff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.2s',
  } as React.CSSProperties,
  categorySection: {
    marginBottom: 8,
  } as React.CSSProperties,
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderRadius: '12px 12px 0 0',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as React.CSSProperties,
  categoryHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,
  categoryEmoji: {
    fontSize: 20,
  } as React.CSSProperties,
  categoryLabel: {
    fontSize: 15,
    fontWeight: 600,
    margin: 0,
    color: '#fff',
  } as React.CSSProperties,
  categoryCount: {
    fontSize: 12,
    opacity: 0.8,
    color: '#fff',
  } as React.CSSProperties,
  categoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 1,
    background: '#f0f0f0',
    borderRadius: '0 0 12px 12px',
    overflow: 'hidden',
  } as React.CSSProperties,
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: '#fff',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative' as const,
    minHeight: 60,
  } as React.CSSProperties,
  itemEmoji: {
    fontSize: 24,
    lineHeight: 1,
    flexShrink: 0,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    background: '#f5f5f5',
  } as React.CSSProperties,
  itemInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  itemName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#262626',
    margin: 0,
    lineHeight: 1.3,
  } as React.CSSProperties,
  itemDescription: {
    fontSize: 11,
    color: '#8c8c8c',
    margin: 0,
    lineHeight: 1.3,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  starBtn: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    fontSize: 14,
    color: '#faad14',
    cursor: 'pointer',
    opacity: 0,
    transition: 'opacity 0.2s',
    zIndex: 2,
    background: 'none',
    border: 'none',
    padding: 2,
  } as React.CSSProperties,
  noResults: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    color: '#8c8c8c',
  } as React.CSSProperties,
};

// ─── Component ──────────────────────────────────────────────

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [recentPaths] = useState<string[]>(loadRecent);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const userRole = user?.role || 'inspector';
  const allItems = useMemo(() => getAllItems(userRole), [userRole]);

  // Filter categories by role + search
  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    return HOMEPAGE_CATEGORIES.map(cat => {
      const items = cat.items.filter(item => {
        if (!item.roles.includes(userRole)) return false;
        if (q) {
          return (
            item.label.toLowerCase().includes(q) ||
            (item.labelAr && item.labelAr.includes(q)) ||
            (item.description && item.description.toLowerCase().includes(q)) ||
            cat.label.toLowerCase().includes(q)
          );
        }
        return true;
      });
      return { ...cat, items };
    }).filter(cat => cat.items.length > 0);
  }, [userRole, search]);

  // Quick access filtered by role
  const quickAccess = useMemo(
    () => QUICK_ACCESS.filter(q => q.roles.includes(userRole)),
    [userRole],
  );

  // Favorites as items
  const favoriteItems = useMemo(
    () => allItems.filter(i => favorites.includes(i.key)),
    [allItems, favorites],
  );

  // Recent items
  const recentItems = useMemo(() => {
    return recentPaths
      .map(path => allItems.find(i => i.path === path) || QUICK_ACCESS.find(q => q.path === path))
      .filter(Boolean) as LauncherItem[];
  }, [allItems, recentPaths]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      saveFavorites(next);
      return next;
    });
  }, []);

  const goTo = useCallback((path: string) => {
    addRecent(path);
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
    <div style={styles.container}>
      {/* Search */}
      <div style={styles.searchWrapper}>
        <Input
          id="homepage-search"
          placeholder="Search pages, tools, equipment...  (press /)"
          prefix={<SearchOutlined style={{ color: '#bfbfbf', fontSize: 18 }} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={styles.searchInput}
          size="large"
        />
      </div>

      {/* Quick Access Pills */}
      {!isSearching && (
        <div style={styles.quickAccessRow}>
          {quickAccess.map(item => (
            <div
              key={item.key}
              style={{
                ...styles.quickAccessChip,
                ...(hoveredItem === `qa-${item.key}` ? { background: '#f0f0f0', borderColor: '#d9d9d9' } : {}),
              }}
              onClick={() => goTo(item.path)}
              onMouseEnter={() => setHoveredItem(`qa-${item.key}`)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Favorites */}
      {!isSearching && favoriteItems.length > 0 && (
        <>
          <div style={styles.sectionHeader}>
            <StarFilled style={{ color: '#faad14', fontSize: 14 }} />
            <h3 style={styles.sectionTitle}>Favorites</h3>
          </div>
          <div style={styles.favoritesRow}>
            {favoriteItems.map(item => (
              <div
                key={item.key}
                style={{
                  ...styles.favoriteChip,
                  ...(hoveredItem === `fav-${item.key}` ? { background: '#fff1b8', borderColor: '#ffd666' } : {}),
                }}
                onClick={() => goTo(item.path)}
                onMouseEnter={() => setHoveredItem(`fav-${item.key}`)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recently Visited */}
      {!isSearching && recentItems.length > 0 && (
        <>
          <div style={styles.sectionHeader}>
            <ClockCircleOutlined style={{ color: '#597ef7', fontSize: 14 }} />
            <h3 style={styles.sectionTitle}>Recently Visited</h3>
          </div>
          <div style={styles.favoritesRow}>
            {recentItems.map(item => (
              <div
                key={item.key}
                style={{
                  ...styles.recentChip,
                  ...(hoveredItem === `rec-${item.key}` ? { background: '#d6e4ff', borderColor: '#adc6ff' } : {}),
                }}
                onClick={() => goTo(item.path)}
                onMouseEnter={() => setHoveredItem(`rec-${item.key}`)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span>{item.emoji}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Category Sections */}
      {filteredCategories.length > 0 ? (
        filteredCategories.map(cat => (
          <div key={cat.key} style={styles.categorySection}>
            <div style={styles.sectionHeader}>
              <span style={{ fontSize: 16 }}>{cat.emoji}</span>
              <h3 style={{ ...styles.sectionTitle, color: cat.color }}>{cat.label}</h3>
              <Tag color={cat.color} style={{ borderRadius: 10, fontSize: 11, marginLeft: 4 }}>
                {cat.items.length}
              </Tag>
            </div>
            <div style={styles.categoryGrid}>
              {cat.items.map(item => {
                const isFav = favorites.includes(item.key);
                const isHovered = hoveredItem === item.key;
                return (
                  <div
                    key={item.key}
                    style={{
                      ...styles.itemCard,
                      ...(isHovered ? { background: '#fafafa', transform: 'scale(1.01)' } : {}),
                    }}
                    onClick={() => goTo(item.path)}
                    onMouseEnter={() => setHoveredItem(item.key)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <div style={{ ...styles.itemEmoji, background: `${cat.color}12` }}>
                      {item.emoji}
                    </div>
                    <div style={styles.itemInfo}>
                      <p style={styles.itemName}>{item.label}</p>
                      {item.description && (
                        <p style={styles.itemDescription}>{item.description}</p>
                      )}
                    </div>
                    <button
                      style={{
                        ...styles.starBtn,
                        opacity: isHovered || isFav ? 1 : 0,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        toggleFavorite(item.key);
                      }}
                    >
                      {isFav ? <StarFilled /> : <StarOutlined />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div style={styles.noResults}>
          <AppstoreOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
          <p style={{ fontSize: 16, color: '#8c8c8c' }}>No pages match "{search}"</p>
          <p style={{ fontSize: 13, color: '#bfbfbf' }}>Try a different search term</p>
        </div>
      )}
    </div>
  );
}
