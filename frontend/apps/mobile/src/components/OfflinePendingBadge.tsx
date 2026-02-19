import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useOffline } from '../providers/OfflineProvider';

/**
 * OfflinePendingBadge
 *
 * A compact badge that shows the count of pending offline mutations.
 * Displays "3 pending uploads" with a sync icon.
 * Tapping it triggers a manual sync attempt.
 *
 * Usage:
 *   <OfflinePendingBadge />
 *
 * Place on the dashboard, header, or status area.
 */
export default function OfflinePendingBadge() {
  const { t } = useTranslation();
  const { pendingCount, isSyncing, triggerSync, isOnline } = useOffline();

  // Nothing to show if queue is empty and not syncing
  if (pendingCount === 0 && !isSyncing) {
    return null;
  }

  const handlePress = () => {
    if (!isSyncing && isOnline) {
      triggerSync();
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSyncing && styles.syncing,
        !isOnline && styles.offline,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={isSyncing || !isOnline}
      accessibilityRole="button"
      accessibilityLabel={
        isSyncing
          ? t('offline.syncing')
          : `${pendingCount} ${t('offline.pending_uploads')}`
      }
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color="#fff" style={styles.icon} />
      ) : (
        <Ionicons
          name="cloud-upload-outline"
          size={16}
          color="#fff"
          style={styles.icon}
        />
      )}

      <Text style={styles.text} numberOfLines={1}>
        {isSyncing
          ? t('offline.syncing')
          : `${pendingCount} ${t('offline.pending_uploads')}`}
      </Text>

      {!isSyncing && isOnline && (
        <Ionicons name="refresh-outline" size={14} color="#fff" style={styles.syncIcon} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'center',
    marginVertical: 4,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.15)',
    elevation: 2,
  },
  syncing: {
    backgroundColor: '#3b82f6',
  },
  offline: {
    backgroundColor: '#6b7280',
  },
  icon: {
    marginRight: 6,
  },
  syncIcon: {
    marginLeft: 6,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
