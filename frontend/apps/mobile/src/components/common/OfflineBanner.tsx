import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOffline } from '../../providers/OfflineProvider';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const { isOnline, issyncing, pendingCount, triggerSync } = useOffline();

  if (isOnline && pendingCount === 0) return null;

  return (
    <View style={[styles.container, isOnline ? styles.syncing : styles.offline]}>
      {!isOnline ? (
        <View style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.text}>
            {t('common.offline', 'You are offline')}
          </Text>
          {pendingCount > 0 && (
            <Text style={styles.badge}>
              {pendingCount} {t('common.pending', 'pending')}
            </Text>
          )}
        </View>
      ) : issyncing ? (
        <View style={styles.row}>
          <Text style={styles.text}>
            {t('common.syncing', 'Syncing changes...')}
          </Text>
        </View>
      ) : pendingCount > 0 ? (
        <TouchableOpacity style={styles.row} onPress={triggerSync}>
          <Text style={styles.text}>
            {pendingCount} {t('common.unsyncedChanges', 'unsynced changes')}
          </Text>
          <Text style={styles.syncBtn}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offline: { backgroundColor: '#d32f2f' },
  syncing: { backgroundColor: '#f57c00' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
  badge: { color: '#fff', fontSize: 12, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  syncBtn: { color: '#fff', fontSize: 13, fontWeight: 'bold', textDecorationLine: 'underline' },
});
