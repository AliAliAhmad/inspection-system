import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { notificationsApi, Notification, NotificationPriority, getNotificationMobileRoute } from '@inspection/shared';
import { formatDateTime } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const priorityColors: Record<NotificationPriority, string> = {
  info: '#1677ff',
  warning: '#fa8c16',
  urgent: '#f5222d',
  critical: '#eb2f96',
};

const PRIORITY_I18N_KEYS: Record<NotificationPriority, string> = {
  info: 'notifications.info',
  warning: 'notifications.warning',
  urgent: 'notifications.urgent',
  critical: 'notifications.critical',
};

type TabKey = 'all' | 'unread' | 'urgent';

interface TabItem {
  key: TabKey;
  label: string;
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const tabs: TabItem[] = [
    { key: 'all', label: t('notifications.all', 'All') },
    { key: 'unread', label: t('notifications.unread', 'Unread') },
    { key: 'urgent', label: t('notifications.urgent', 'Urgent') },
  ];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', page, activeTab],
    queryFn: () => {
      const params: Record<string, unknown> = { page, per_page: 20 };
      if (activeTab === 'unread') params.unread_only = true;
      if (activeTab === 'urgent') params.priority = 'urgent,critical';
      return notificationsApi.list(params as any).then(r => r.data);
    },
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, durationMinutes }: { id: number; durationMinutes: number }) => {
      const snoozeUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      return notificationsApi.snooze(id, { snooze_until: snoozeUntil });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setSnoozeModalVisible(false);
      setSelectedNotification(null);
    },
  });

  const notifications = data?.data ?? [];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handlePress = useCallback((item: Notification) => {
    if (!item.is_read) markReadMutation.mutate(item.id);
    const route = user ? getNotificationMobileRoute(item, user.role) : null;
    if (route) {
      navigation.navigate(route.screen, route.params);
    }
  }, [markReadMutation, user, navigation]);

  const handleDelete = useCallback((id: number) => {
    Alert.alert(
      t('notifications.deleteConfirm', 'Delete Notification'),
      t('notifications.deleteMessage', 'Are you sure you want to delete this notification?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('common.delete', 'Delete'), style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }, [deleteMutation, t]);

  const handleSnooze = useCallback((item: Notification) => {
    setSelectedNotification(item);
    setSnoozeModalVisible(true);
  }, []);

  const snoozeOptions = [
    { label: t('notifications.snooze15', '15 minutes'), value: 15 },
    { label: t('notifications.snooze30', '30 minutes'), value: 30 },
    { label: t('notifications.snooze1h', '1 hour'), value: 60 },
    { label: t('notifications.snooze3h', '3 hours'), value: 180 },
    { label: t('notifications.snooze1d', '1 day'), value: 1440 },
  ];

  const closeSwipeable = (id: number) => {
    const ref = swipeableRefs.current.get(id);
    if (ref) ref.close();
  };

  const renderRightActions = useCallback((
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>,
    item: Notification
  ) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [160, 0],
    });

    return (
      <Animated.View style={[styles.rightActions, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.actionButton, styles.snoozeButton]}
          onPress={() => {
            closeSwipeable(item.id);
            handleSnooze(item);
          }}
        >
          <Text style={styles.actionText}>{t('notifications.snooze', 'Snooze')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => {
            closeSwipeable(item.id);
            handleDelete(item.id);
          }}
        >
          <Text style={styles.actionText}>{t('common.delete', 'Delete')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [handleSnooze, handleDelete, t]);

  const renderLeftActions = useCallback((
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>,
    item: Notification
  ) => {
    if (item.is_read) return null;

    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-80, 0],
    });

    return (
      <Animated.View style={[styles.leftActions, { transform: [{ translateX }] }]}>
        <TouchableOpacity
          style={[styles.actionButton, styles.readButton]}
          onPress={() => {
            closeSwipeable(item.id);
            markReadMutation.mutate(item.id);
          }}
        >
          <Text style={styles.actionText}>{t('notifications.markRead', 'Read')}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [markReadMutation, t]);

  const renderPriorityBadge = (priority: NotificationPriority) => {
    const isHighPriority = priority === 'urgent' || priority === 'critical';
    return (
      <View style={[styles.priorityBadge, { backgroundColor: priorityColors[priority] }]}>
        <Text style={styles.priorityBadgeText}>
          {isHighPriority ? '!' : ''} {t(PRIORITY_I18N_KEYS[priority])}
        </Text>
      </View>
    );
  };

  const renderItem = useCallback(({ item }: { item: Notification }) => {
    const route = user ? getNotificationMobileRoute(item, user.role) : null;
    const isHighPriority = item.priority === 'urgent' || item.priority === 'critical';

    return (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
        renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
        friction={2}
        overshootFriction={8}
      >
        <TouchableOpacity
          style={[
            styles.item,
            !item.is_read && styles.itemUnread,
            isHighPriority && styles.itemHighPriority,
          ]}
          onPress={() => handlePress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.itemHeader}>
            <View style={[styles.priorityDot, { backgroundColor: priorityColors[item.priority] }]} />
            <Text style={[styles.itemTitle, !item.is_read && styles.bold]} numberOfLines={1}>
              {item.title}
            </Text>
            {renderPriorityBadge(item.priority)}
            {route && <Text style={styles.chevron}>{'>'}</Text>}
          </View>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          <View style={styles.itemFooter}>
            <Text style={styles.itemTime}>{formatDateTime(item.created_at)}</Text>
            {!item.is_read && <View style={styles.unreadIndicator} />}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  }, [user, handlePress, renderRightActions, renderLeftActions]);

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          onPress={() => {
            setActiveTab(tab.key);
            setPage(1);
          }}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSnoozeModal = () => (
    <Modal
      visible={snoozeModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setSnoozeModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setSnoozeModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('notifications.snoozeFor', 'Snooze for...')}</Text>
          {snoozeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={styles.snoozeOption}
              onPress={() => {
                if (selectedNotification) {
                  snoozeMutation.mutate({ id: selectedNotification.id, durationMinutes: option.value });
                }
              }}
            >
              <Text style={styles.snoozeOptionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.snoozeOption, styles.cancelOption]}
            onPress={() => setSnoozeModalVisible(false)}
          >
            <Text style={styles.cancelOptionText}>{t('common.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.notifications')}</Text>
        <TouchableOpacity
          onPress={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
        >
          <Text style={[styles.markAll, markAllReadMutation.isPending && styles.disabled]}>
            {t('notifications.mark_all_read')}
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabs()}

      {isLoading && !refreshing ? (
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{':-)'}</Text>
          <Text style={styles.emptyText}>
            {activeTab === 'unread'
              ? t('notifications.no_unread', 'All caught up!')
              : activeTab === 'urgent'
              ? t('notifications.no_urgent', 'No urgent notifications')
              : t('notifications.no_notifications')}
          </Text>
          <Text style={styles.emptyHint}>
            {t('notifications.swipeHint', 'Swipe left to snooze or delete, right to mark as read')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#1677ff']}
              tintColor="#1677ff"
            />
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {renderSnoozeModal()}
    </GestureHandlerRootView>
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
  disabled: { opacity: 0.5 },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  tabActive: {
    backgroundColor: '#1677ff',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingBottom: 16,
  },
  separator: {
    height: 1,
  },

  // Item
  item: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    padding: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  itemUnread: {
    backgroundColor: '#f6ffed',
    borderLeftWidth: 3,
    borderLeftColor: '#52c41a'
  },
  itemHighPriority: {
    borderLeftColor: '#f5222d',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  priorityBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  itemTitle: {
    fontSize: 15,
    color: '#1a1a1a',
    flex: 1
  },
  bold: { fontWeight: 'bold' },
  chevron: {
    fontSize: 16,
    color: '#1677ff',
    fontWeight: 'bold',
    marginLeft: 8
  },
  itemMessage: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    lineHeight: 18,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTime: {
    fontSize: 11,
    color: '#999'
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#52c41a',
  },

  // Swipe Actions
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginRight: 16,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 16,
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    height: '100%',
    borderRadius: 8,
  },
  snoozeButton: {
    backgroundColor: '#fa8c16',
    marginRight: 4,
  },
  deleteButton: {
    backgroundColor: '#f5222d',
  },
  readButton: {
    backgroundColor: '#52c41a',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty state
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 12,
    color: '#bbb',
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: SCREEN_WIDTH - 64,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  snoozeOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  snoozeOptionText: {
    fontSize: 16,
    color: '#1677ff',
    textAlign: 'center',
  },
  cancelOption: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  cancelOptionText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
