import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useOffline, SyncItem } from '../../providers/OfflineProvider';

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: '#E65100', bgColor: '#FFF3E0', label: 'Pending' },
  syncing: { color: '#1565C0', bgColor: '#E3F2FD', label: 'Syncing...' },
  synced: { color: '#2E7D32', bgColor: '#E8F5E9', label: 'Synced' },
  failed: { color: '#C62828', bgColor: '#FFEBEE', label: 'Failed' },
};

export default function SyncQueueScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const {
    isOnline,
    isSyncing,
    pendingCount,
    pendingItems,
    lastSyncAt,
    triggerSync,
    retryItem,
    retryAllFailed,
    clearFailed,
    refreshPendingItems,
  } = useOffline();

  const failedCount = pendingItems.filter(i => i.status === 'failed').length;

  const handleRetry = useCallback((item: SyncItem) => {
    retryItem(item.id, item.isMedia);
  }, [retryItem]);

  const handleRetryAll = useCallback(() => {
    Alert.alert(
      t('offline.retry_all', { defaultValue: 'Retry All Failed' }),
      t('offline.retry_all_confirm', { defaultValue: 'Retry all failed items?' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: retryAllFailed },
      ]
    );
  }, [retryAllFailed, t]);

  const handleClearFailed = useCallback(() => {
    Alert.alert(
      t('offline.clear_failed', { defaultValue: 'Clear Failed Items' }),
      t('offline.clear_failed_confirm', { defaultValue: 'Remove all failed items from the queue?' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: 'destructive', onPress: clearFailed },
      ]
    );
  }, [clearFailed, t]);

  const renderItem = ({ item }: { item: SyncItem }) => {
    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemType}>{item.displayName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
            <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>
        <Text style={styles.itemTime}>
          {new Date(item.createdAt).toLocaleString()}
        </Text>
        {item.error && (
          <Text style={styles.errorText} numberOfLines={2}>{item.error}</Text>
        )}
        {item.status === 'failed' && (
          <TouchableOpacity style={styles.retryButton} onPress={() => handleRetry(item)}>
            <Text style={styles.retryButtonText}>{t('common.retry', { defaultValue: 'Retry' })}</Text>
          </TouchableOpacity>
        )}
        {item.status === 'syncing' && item.progress > 0 && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${item.progress}%` }]} />
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{'✓'}</Text>
      <Text style={styles.emptyText}>
        {t('offline.queue_empty', { defaultValue: 'All synced! Nothing pending.' })}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'<-'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('offline.sync_queue', { defaultValue: 'Sync Queue' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Status summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: isOnline ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={[styles.summaryLabel, { color: isOnline ? '#2E7D32' : '#C62828' }]}>
            {isOnline
              ? t('offline.online', { defaultValue: 'Online' })
              : t('offline.offline', { defaultValue: 'Offline' })}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>{t('offline.pending', { defaultValue: 'Pending' })}</Text>
        </View>
        {lastSyncAt && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {t('offline.last_sync', { defaultValue: 'Last sync' })}
            </Text>
            <Text style={styles.summaryTime}>
              {new Date(lastSyncAt).toLocaleTimeString()}
            </Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {isOnline && pendingCount > 0 && (
          <TouchableOpacity
            style={[styles.actionButton, styles.syncButton]}
            onPress={triggerSync}
            disabled={isSyncing}
          >
            <Text style={styles.actionButtonText}>
              {isSyncing
                ? t('offline.syncing', { defaultValue: 'Syncing...' })
                : t('offline.sync_now', { defaultValue: 'Sync Now' })}
            </Text>
          </TouchableOpacity>
        )}
        {failedCount > 0 && (
          <>
            <TouchableOpacity style={[styles.actionButton, styles.retryAllButton]} onPress={handleRetryAll}>
              <Text style={styles.actionButtonText}>
                {t('offline.retry_all', { defaultValue: `Retry All (${failedCount})` })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.clearButton]} onPress={handleClearFailed}>
              <Text style={[styles.actionButtonText, { color: '#C62828' }]}>
                {t('offline.clear_failed', { defaultValue: 'Clear Failed' })}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <FlatList
        data={pendingItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={pendingItems.length === 0 ? styles.emptyList : styles.listContent}
        onRefresh={refreshPendingItems}
        refreshing={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 24, color: '#1976D2' },
  title: { fontSize: 18, fontWeight: '700', color: '#212121' },
  summaryRow: {
    flexDirection: 'row', padding: 12, gap: 8,
  },
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    alignItems: 'center', elevation: 1,
  },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#1976D2' },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: '#757575', marginTop: 2 },
  summaryTime: { fontSize: 12, color: '#424242', marginTop: 2 },
  actionsRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8, gap: 8,
  },
  actionButton: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
  },
  syncButton: { backgroundColor: '#1976D2' },
  retryAllButton: { backgroundColor: '#FF9800' },
  clearButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#C62828' },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  listContent: { padding: 12 },
  emptyList: { flexGrow: 1 },
  itemCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    elevation: 1,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemType: { fontSize: 15, fontWeight: '600', color: '#212121' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  itemTime: { fontSize: 12, color: '#9E9E9E', marginTop: 4 },
  errorText: { fontSize: 12, color: '#C62828', marginTop: 4 },
  retryButton: {
    marginTop: 8, backgroundColor: '#FF9800', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  retryButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  progressBar: {
    marginTop: 8, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#1976D2', borderRadius: 2 },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16, color: '#4CAF50' },
  emptyText: { fontSize: 16, color: '#757575' },
});
