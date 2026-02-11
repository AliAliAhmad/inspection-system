/**
 * SLABadge - Shows SLA status with colors
 *
 * Displays time remaining or overdue status for SLA deadlines.
 * Color-coded: green (safe), yellow (warning), red (critical/overdue)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface SLABadgeProps {
  /** ISO date string of the SLA deadline */
  deadline: string | null | undefined;
  /** Show compact version (hours only) */
  compact?: boolean;
  /** Show countdown timer style */
  countdown?: boolean;
}

type SLAStatus = 'safe' | 'warning' | 'critical' | 'overdue';

interface SLAInfo {
  status: SLAStatus;
  label: string;
  hoursRemaining: number;
}

const STATUS_STYLES: Record<SLAStatus, { bg: string; text: string; border: string }> = {
  safe: { bg: '#E8F5E9', text: '#2E7D32', border: '#A5D6A7' },
  warning: { bg: '#FFF8E1', text: '#F57F17', border: '#FFE082' },
  critical: { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
  overdue: { bg: '#FFEBEE', text: '#C62828', border: '#EF9A9A' },
};

function getSLAInfo(deadline: string): SLAInfo {
  const now = Date.now();
  const deadlineMs = new Date(deadline).getTime();
  const diffMs = deadlineMs - now;
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    const hoursOverdue = Math.abs(hoursRemaining);
    if (hoursOverdue >= 24) {
      const days = Math.floor(hoursOverdue / 24);
      return { status: 'overdue', label: `${days}d overdue`, hoursRemaining };
    }
    return { status: 'overdue', label: `${Math.ceil(hoursOverdue)}h overdue`, hoursRemaining };
  }

  if (hoursRemaining <= 2) {
    return { status: 'critical', label: `${Math.ceil(hoursRemaining * 60)}m left`, hoursRemaining };
  }

  if (hoursRemaining <= 8) {
    return { status: 'warning', label: `${Math.ceil(hoursRemaining)}h left`, hoursRemaining };
  }

  if (hoursRemaining >= 24) {
    const days = Math.floor(hoursRemaining / 24);
    return { status: 'safe', label: `${days}d left`, hoursRemaining };
  }

  return { status: 'safe', label: `${Math.ceil(hoursRemaining)}h left`, hoursRemaining };
}

export function SLABadge({ deadline, compact = false, countdown = false }: SLABadgeProps) {
  const slaInfo = useMemo(() => {
    if (!deadline) return null;
    return getSLAInfo(deadline);
  }, [deadline]);

  if (!slaInfo) {
    return (
      <View style={[styles.badge, styles.noBadge]}>
        <Text style={styles.noText}>No SLA</Text>
      </View>
    );
  }

  const statusStyle = STATUS_STYLES[slaInfo.status];

  if (countdown) {
    return (
      <View style={[styles.countdownContainer, { backgroundColor: statusStyle.bg }]}>
        {slaInfo.status === 'overdue' && (
          <Text style={[styles.countdownIcon, { color: statusStyle.text }]}>!</Text>
        )}
        <Text style={[styles.countdownText, { color: statusStyle.text }]}>
          {slaInfo.label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
        compact && styles.badgeCompact,
      ]}
    >
      {!compact && slaInfo.status === 'overdue' && (
        <Text style={[styles.icon, { color: statusStyle.text }]}>!</Text>
      )}
      <Text
        style={[
          styles.label,
          { color: statusStyle.text },
          compact && styles.labelCompact,
        ]}
        numberOfLines={1}
      >
        {slaInfo.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  noBadge: {
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
  },
  noText: {
    fontSize: 11,
    color: '#9E9E9E',
  },
  icon: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelCompact: {
    fontSize: 10,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  countdownIcon: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
  },
  countdownText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default SLABadge;
