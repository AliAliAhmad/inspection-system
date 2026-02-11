/**
 * DaysOverdueBadge - Shows days overdue with color coding
 *
 * Displays how many days an item is overdue.
 * Color intensity increases with days overdue.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface DaysOverdueBadgeProps {
  /** Due date as ISO string or Date */
  dueDate: string | Date;
  /** Show as compact pill */
  compact?: boolean;
  /** Optional press handler */
  onPress?: () => void;
  /** Custom prefix text */
  prefix?: string;
}

type OverdueLevel = 'on_time' | 'slight' | 'moderate' | 'severe' | 'critical';

interface OverdueInfo {
  level: OverdueLevel;
  daysOverdue: number;
  label: string;
  bg: string;
  text: string;
}

function getOverdueInfo(dueDate: Date): OverdueInfo {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  const diffMs = today.getTime() - due.getTime();
  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) {
    return {
      level: 'on_time',
      daysOverdue: 0,
      label: 'On Time',
      bg: '#E8F5E9',
      text: '#2E7D32',
    };
  }

  if (daysOverdue <= 1) {
    return {
      level: 'slight',
      daysOverdue,
      label: '1 day',
      bg: '#FFF8E1',
      text: '#F57F17',
    };
  }

  if (daysOverdue <= 3) {
    return {
      level: 'moderate',
      daysOverdue,
      label: `${daysOverdue} days`,
      bg: '#FFF3E0',
      text: '#E65100',
    };
  }

  if (daysOverdue <= 7) {
    return {
      level: 'severe',
      daysOverdue,
      label: `${daysOverdue} days`,
      bg: '#FFEBEE',
      text: '#C62828',
    };
  }

  // More than a week
  if (daysOverdue <= 30) {
    const weeks = Math.floor(daysOverdue / 7);
    return {
      level: 'critical',
      daysOverdue,
      label: weeks === 1 ? '1 week' : `${weeks} weeks`,
      bg: '#FFCDD2',
      text: '#B71C1C',
    };
  }

  // More than a month
  const months = Math.floor(daysOverdue / 30);
  return {
    level: 'critical',
    daysOverdue,
    label: months === 1 ? '1 month' : `${months} months`,
    bg: '#FFCDD2',
    text: '#B71C1C',
  };
}

export function DaysOverdueBadge({
  dueDate,
  compact = false,
  onPress,
  prefix = 'Overdue:',
}: DaysOverdueBadgeProps) {
  const overdueInfo = useMemo(() => {
    const date = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    return getOverdueInfo(date);
  }, [dueDate]);

  const content = (
    <View
      style={[
        styles.container,
        { backgroundColor: overdueInfo.bg },
        compact && styles.containerCompact,
      ]}
    >
      {overdueInfo.level === 'on_time' ? (
        <Text style={[styles.label, { color: overdueInfo.text }, compact && styles.labelCompact]}>
          {overdueInfo.label}
        </Text>
      ) : (
        <>
          {!compact && (
            <Text style={[styles.prefix, { color: overdueInfo.text }]}>
              {prefix}
            </Text>
          )}
          <View style={styles.valueContainer}>
            <Text
              style={[
                styles.value,
                { color: overdueInfo.text },
                compact && styles.valueCompact,
              ]}
            >
              {overdueInfo.label}
            </Text>
            {overdueInfo.level === 'critical' && (
              <Text style={[styles.alertIcon, { color: overdueInfo.text }]}>!</Text>
            )}
          </View>
        </>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  containerCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  prefix: {
    fontSize: 12,
    fontWeight: '500',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelCompact: {
    fontSize: 11,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
  },
  valueCompact: {
    fontSize: 11,
    fontWeight: '600',
  },
  alertIcon: {
    fontSize: 12,
    fontWeight: '700',
  },
});

export default DaysOverdueBadge;
