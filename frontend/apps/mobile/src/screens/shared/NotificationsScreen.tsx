import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notificationsApi, Notification, NotificationPriority } from '@inspection/shared';
import { formatDateTime } from '@inspection/shared';

const priorityColors: Record<NotificationPriority, string> = {
  info: '#1677ff',
  warning: '#fa8c16',
  urgent: '#f5222d',
  critical: '#eb2f96',
};

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsApi.list({ page, per_page: 20 }).then(r => r.data),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.data ?? [];

  const renderItem = useCallback(({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.item, !item.is_read && styles.itemUnread]}
      onPress={() => {
        if (!item.is_read) markReadMutation.mutate(item.id);
      }}
    >
      <View style={styles.itemHeader}>
        <View style={[styles.priorityDot, { backgroundColor: priorityColors[item.priority] }]} />
        <Text style={[styles.itemTitle, !item.is_read && styles.bold]}>{item.title}</Text>
      </View>
      <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
      <Text style={styles.itemTime}>{formatDateTime(item.created_at)}</Text>
    </TouchableOpacity>
  ), [markReadMutation]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.notifications')}</Text>
        <TouchableOpacity onPress={() => markAllReadMutation.mutate()}>
          <Text style={styles.markAll}>{t('notifications.mark_all_read')}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('notifications.no_notifications')}</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  markAll: { color: '#1677ff', fontSize: 14 },
  item: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    padding: 12,
  },
  itemUnread: { backgroundColor: '#f6ffed', borderLeftWidth: 3, borderLeftColor: '#52c41a' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  itemTitle: { fontSize: 15, color: '#1a1a1a', flex: 1 },
  bold: { fontWeight: 'bold' },
  itemMessage: { fontSize: 13, color: '#666', marginBottom: 4 },
  itemTime: { fontSize: 11, color: '#999' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 48 },
  emptyText: { fontSize: 16, color: '#999' },
});
