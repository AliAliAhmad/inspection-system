import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface PersistentNotificationBarProps {
  jobName: string;
  jobStatus: 'assigned' | 'in_progress' | 'paused';
  equipmentName?: string;
  elapsedTime?: string;
  onPause: () => void;
  onComplete: () => void;
  onIncomplete: () => void;
}

export default function PersistentNotificationBar({
  jobName,
  jobStatus,
  equipmentName,
  elapsedTime,
  onPause,
  onComplete,
  onIncomplete,
}: PersistentNotificationBarProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const statusColors: Record<string, { bg: string; text: string; label: string; labelAr: string }> = {
    assigned: { bg: '#e6f4ff', text: '#1677ff', label: 'ASSIGNED', labelAr: 'معين' },
    in_progress: { bg: '#f6ffed', text: '#52c41a', label: 'IN PROGRESS', labelAr: 'قيد التنفيذ' },
    paused: { bg: '#fff7e6', text: '#fa8c16', label: 'PAUSED', labelAr: 'متوقف' },
  };

  const status = statusColors[jobStatus] || statusColors.assigned;

  const handleAction = (action: () => void) => {
    Vibration.vibrate(50);
    action();
  };

  return (
    <View style={styles.container}>
      {/* Job info row */}
      <View style={styles.infoRow}>
        <View style={styles.jobInfo}>
          <Text style={styles.jobName} numberOfLines={1}>🔧 {jobName}</Text>
          {equipmentName && (
            <Text style={styles.equipmentName} numberOfLines={1}>📋 {equipmentName}</Text>
          )}
        </View>
        <View style={styles.rightInfo}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>
              {isAr ? status.labelAr : status.label}
            </Text>
          </View>
          {elapsedTime && (
            <Text style={styles.timer}>⏱ {elapsedTime}</Text>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#fff7e6', borderColor: '#ffd591' }]}
          onPress={() => handleAction(onPause)}
        >
          <Text style={styles.actionIcon}>⏸️</Text>
          <Text style={[styles.actionLabel, { color: '#fa8c16' }]}>
            {isAr ? 'إيقاف' : 'PAUSE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }]}
          onPress={() => handleAction(onComplete)}
        >
          <Text style={styles.actionIcon}>✅</Text>
          <Text style={[styles.actionLabel, { color: '#52c41a' }]}>
            {isAr ? 'تم' : 'DONE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#fff2f0', borderColor: '#ffa39e' }]}
          onPress={() => handleAction(onIncomplete)}
        >
          <Text style={styles.actionIcon}>❌</Text>
          <Text style={[styles.actionLabel, { color: '#ff4d4f' }]}>
            {isAr ? 'لم يتم' : 'NOT DONE'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 8,
    padding: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  jobInfo: {
    flex: 1,
    marginRight: 8,
  },
  jobName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#262626',
    marginBottom: 2,
  },
  equipmentName: {
    fontSize: 12,
    color: '#8c8c8c',
  },
  rightInfo: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timer: {
    fontSize: 13,
    fontWeight: '700',
    color: '#595959',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
