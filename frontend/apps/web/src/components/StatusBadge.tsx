import { Tag } from 'antd';

const STATUS_CONFIG: Record<string, { color: string; emoji: string }> = {
  // General
  active: { color: 'green', emoji: '\u2705' },
  inactive: { color: 'red', emoji: '\u274c' },
  pending: { color: 'gold', emoji: '\u23f3' },
  processing: { color: 'blue', emoji: '\u26a1' },
  completed: { color: 'green', emoji: '\u2705' },
  incomplete: { color: 'orange', emoji: '\u26a0\ufe0f' },
  cancelled: { color: 'default', emoji: '\ud83d\udeab' },

  // Jobs
  open: { color: 'blue', emoji: '\ud83d\udce5' },
  in_progress: { color: 'processing', emoji: '\ud83d\udd04' },
  paused: { color: 'orange', emoji: '\u23f8\ufe0f' },
  not_started: { color: 'default', emoji: '\u23f9\ufe0f' },

  // Approvals
  approved: { color: 'green', emoji: '\u2714\ufe0f' },
  rejected: { color: 'red', emoji: '\u274c' },

  // Quality
  pass: { color: 'green', emoji: '\u2705' },
  fail: { color: 'red', emoji: '\u274c' },

  // Priority
  critical: { color: 'red', emoji: '\ud83d\udd34' },
  high: { color: 'volcano', emoji: '\ud83d\udfe0' },
  medium: { color: 'gold', emoji: '\ud83d\udfe1' },
  low: { color: 'green', emoji: '\ud83d\udfe2' },

  // Leaves
  on_leave: { color: 'purple', emoji: '\ud83c\udfd6\ufe0f' },

  // Review
  submitted: { color: 'cyan', emoji: '\ud83d\udce8' },
  partial: { color: 'gold', emoji: '\ud83d\udcdd' },
  overdue: { color: 'red', emoji: '\u23f0' },

  // Equipment
  operational: { color: 'green', emoji: '\u2705' },
  maintenance: { color: 'orange', emoji: '\ud83d\udd27' },
  breakdown: { color: 'red', emoji: '\u26d4' },
  standby: { color: 'default', emoji: '\u23f8\ufe0f' },
};

interface StatusBadgeProps {
  status: string;
  showEmoji?: boolean;
  label?: string;
}

export default function StatusBadge({ status, showEmoji = true, label }: StatusBadgeProps) {
  const normalizedStatus = status?.toLowerCase().replace(/[\s-]/g, '_') || 'pending';
  const config = STATUS_CONFIG[normalizedStatus] || { color: 'default', emoji: '\u2753' };
  const displayLabel = label || status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';

  return (
    <Tag color={config.color} style={{ borderRadius: 6, fontWeight: 500 }}>
      {showEmoji && <span style={{ marginRight: 4 }}>{config.emoji}</span>}
      {displayLabel}
    </Tag>
  );
}
