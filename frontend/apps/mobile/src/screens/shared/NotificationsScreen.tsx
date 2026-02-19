import React, { useState, useCallback, useRef, useMemo } from 'react';
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
  TextInput,
  ScrollView,
  I18nManager,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  notificationsApi,
  Notification,
  NotificationPriority,
  NotificationGroup,
  AISummary,
  getNotificationMobileRoute,
} from '@inspection/shared';
import { formatDateTime } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import * as ExpoNotifications from 'expo-notifications';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

const NOTIFICATION_TYPES = [
  'inspection_assigned',
  'inspection_submitted',
  'leave_requested',
  'specialist_job_assigned',
  'defect_created',
  'assessment_submitted',
  'quality_review_assigned',
  'mention',
] as const;

type TabKey = 'all' | 'unread' | 'critical' | 'mentions';

interface TabItem {
  key: TabKey;
  label: string;
  badge?: number;
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

  // New state for enhanced features
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<NotificationPriority[]>([]);
  const [isGroupedView, setIsGroupedView] = useState(false);
  const [aiSummaryExpanded, setAiSummaryExpanded] = useState(true);

  // ============ DATA FETCHING ============

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', page, activeTab],
    queryFn: () => {
      const params: Record<string, unknown> = { page, per_page: 20 };
      if (activeTab === 'unread') params.unread_only = true;
      if (activeTab === 'critical') params.priority = 'critical';
      return notificationsApi.list(params as any).then(r => r.data);
    },
    refetchInterval: 30000,
  });

  // Mentions query
  const { data: mentionsData } = useQuery({
    queryKey: ['notifications', 'mentions'],
    queryFn: () => notificationsApi.getMentions().then(r => r.data),
    enabled: activeTab === 'mentions',
  });

  // Unread count query
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then(r => r.data),
    staleTime: 30000,
  });

  // AI summary query (wrapped in try/catch so it doesn't break if API errors)
  const { data: aiSummaryData } = useQuery({
    queryKey: ['notifications', 'ai-summary'],
    queryFn: async () => {
      try {
        const res = await notificationsApi.getAISummary();
        return res.data?.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 300000, // 5 minutes
    retry: false,
  });

  // Groups query
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['notifications', 'groups'],
    queryFn: () => notificationsApi.listGroups().then(r => r.data),
    enabled: isGroupedView,
  });

  // ============ MUTATIONS ============

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

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // ============ DERIVED DATA ============

  // unreadCountData comes from `.then(r => r.data)` so it's { status, count, by_priority }
  const unreadCount = (unreadCountData as any)?.count ?? 0;
  const priorityCounts = ((unreadCountData as any)?.by_priority ?? {}) as Record<string, number>;

  // Feature 9: Update app badge count
  React.useEffect(() => {
    try {
      ExpoNotifications.setBadgeCountAsync(unreadCount);
    } catch {
      // Silently fail if not available
    }
  }, [unreadCount]);

  const rawNotifications = activeTab === 'mentions'
    ? (mentionsData?.data ?? [])
    : (data?.data ?? []);

  // Client-side filter by search, type, and priority
  const notifications = useMemo(() => {
    let filtered = rawNotifications;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n: Notification) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q)
      );
    }

    if (selectedTypes.length > 0) {
      filtered = filtered.filter((n: Notification) => selectedTypes.includes(n.type));
    }

    if (selectedPriorities.length > 0) {
      filtered = filtered.filter((n: Notification) => selectedPriorities.includes(n.priority));
    }

    return filtered;
  }, [rawNotifications, searchQuery, selectedTypes, selectedPriorities]);

  const groups: NotificationGroup[] = groupsData?.data ?? [];

  const activeFilterCount = selectedTypes.length + selectedPriorities.length;

  const tabs: TabItem[] = [
    { key: 'all', label: t('notifications.tabAll', 'All') },
    { key: 'unread', label: t('notifications.tabUnread', 'Unread'), badge: unreadCount },
    { key: 'critical', label: t('notifications.tabCritical', 'Critical'), badge: priorityCounts.critical ?? 0 },
    { key: 'mentions', label: t('notifications.tabMentions', 'Mentions') },
  ];

  // ============ HANDLERS ============

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'ai-summary'] });
    setRefreshing(false);
  }, [refetch, queryClient]);

  const handlePress = useCallback((item: Notification) => {
    if (!item.is_read) markReadMutation.mutate(item.id);
    const route = user ? getNotificationMobileRoute(item, user.role) : null;
    if (route) {
      navigation.navigate(route.screen, route.params);
    } else {
      Alert.alert(
        item.title,
        item.message,
        [{ text: t('common.ok', 'OK') }]
      );
    }
  }, [markReadMutation, user, navigation, t]);

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

  const handleQuickAction = useCallback((item: Notification, action: string) => {
    switch (action) {
      case 'start_inspection':
        if (item.related_id) {
          navigation.navigate('InspectionWizard', { id: item.related_id });
        }
        break;
      case 'view_job':
        if (item.related_id) {
          navigation.navigate('SpecialistJobDetail', { id: item.related_id });
        }
        break;
      case 'view_defect':
        navigation.navigate('Defects');
        break;
      case 'view_assessment':
        if (item.related_id) {
          navigation.navigate('Assessment', { id: item.related_id });
        }
        break;
      case 'view':
        handlePress(item);
        break;
      default:
        handlePress(item);
        break;
    }
  }, [navigation, handlePress]);

  const handleStatCardPress = useCallback((filter: TabKey) => {
    setActiveTab(filter);
    setPage(1);
  }, []);

  const toggleFilter = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters(prev => !prev);
  }, []);

  const toggleGroupView = useCallback(() => {
    setIsGroupedView(prev => !prev);
  }, []);

  const toggleAiSummary = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAiSummaryExpanded(prev => !prev);
  }, []);

  const toggleTypeFilter = useCallback((type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t2 => t2 !== type) : [...prev, type]
    );
  }, []);

  const togglePriorityFilter = useCallback((priority: NotificationPriority) => {
    setSelectedPriorities(prev =>
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    );
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

  // ============ QUICK ACTIONS FOR NOTIFICATION ============

  const getQuickActions = useCallback((item: Notification): Array<{ label: string; action: string; color: string }> => {
    const actions: Array<{ label: string; action: string; color: string }> = [];

    switch (item.type) {
      case 'inspection_assigned':
        actions.push({
          label: t('notifications.startInspection', 'Start Inspection'),
          action: 'start_inspection',
          color: '#52c41a',
        });
        break;
      case 'leave_requested':
        if (user?.role === 'admin' || user?.role === 'engineer') {
          actions.push(
            { label: t('common.approve', 'Approve'), action: 'approve', color: '#52c41a' },
            { label: t('common.reject', 'Reject'), action: 'reject', color: '#f5222d' },
          );
        }
        break;
      case 'specialist_job_assigned':
        actions.push({
          label: t('notifications.viewJob', 'View Job'),
          action: 'view_job',
          color: '#1677ff',
        });
        break;
      case 'defect_created':
        actions.push({
          label: t('notifications.viewDefect', 'View Defect'),
          action: 'view_defect',
          color: '#fa8c16',
        });
        break;
      case 'assessment_submitted':
      case 'assessment_required':
        actions.push({
          label: t('notifications.viewAssessment', 'View Assessment'),
          action: 'view_assessment',
          color: '#722ed1',
        });
        break;
      default: {
        const route = user ? getNotificationMobileRoute(item, user.role) : null;
        if (route) {
          actions.push({
            label: t('notifications.view', 'View'),
            action: 'view',
            color: '#1677ff',
          });
        }
        break;
      }
    }

    return actions;
  }, [t, user]);

  // ============ RENDER HELPERS ============

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

  // ============ FEATURE 7: AI SUMMARY SECTION ============

  const renderAISummary = () => {
    const summary = aiSummaryData as AISummary | null;
    if (!summary) return null;

    return (
      <View style={styles.aiSummaryContainer}>
        <TouchableOpacity style={styles.aiSummaryHeader} onPress={toggleAiSummary} activeOpacity={0.7}>
          <View style={styles.aiSummaryHeaderLeft}>
            <Text style={styles.aiRobotIcon}>{'{ AI }'}</Text>
            <Text style={styles.aiSummaryTitle}>{t('notifications.aiInsights', 'AI Insights')}</Text>
          </View>
          <Text style={styles.aiExpandIcon}>{aiSummaryExpanded ? '\u25B2' : '\u25BC'}</Text>
        </TouchableOpacity>

        {aiSummaryExpanded && (
          <View style={styles.aiSummaryBody}>
            {summary.greeting ? (
              <Text style={styles.aiGreeting}>{summary.greeting}</Text>
            ) : null}
            {summary.summary ? (
              <Text style={styles.aiSummaryText}>{summary.summary}</Text>
            ) : null}

            {summary.pending_actions && summary.pending_actions.length > 0 ? (
              <View style={styles.aiSection}>
                <Text style={styles.aiSectionLabel}>
                  {t('notifications.pendingActions', 'Pending Actions')}
                </Text>
                {summary.pending_actions.map((action, idx) => (
                  <View key={action.id || idx} style={styles.aiActionItem}>
                    <View style={[styles.aiActionDot, { backgroundColor: priorityColors[action.priority] || '#1677ff' }]} />
                    <Text style={styles.aiActionText} numberOfLines={1}>{action.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {summary.tips && summary.tips.length > 0 ? (
              <View style={styles.aiSection}>
                <Text style={styles.aiSectionLabel}>
                  {t('notifications.aiTips', 'Tips')}
                </Text>
                {summary.tips.map((tip, idx) => (
                  <Text key={idx} style={styles.aiTipText}>
                    {'\u2022'} {tip}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  // ============ FEATURE 1: STATISTICS CARDS ============

  const renderStatsCards = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.statsContainer}
      contentContainerStyle={styles.statsContent}
    >
      <TouchableOpacity
        style={[styles.statCard, { borderColor: '#1677ff' }]}
        onPress={() => handleStatCardPress('unread')}
        activeOpacity={0.7}
      >
        <Text style={[styles.statCount, { color: '#1677ff' }]}>{unreadCount}</Text>
        <Text style={styles.statLabel}>{t('notifications.totalUnread', 'Unread')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.statCard, { borderColor: '#eb2f96' }]}
        onPress={() => handleStatCardPress('critical')}
        activeOpacity={0.7}
      >
        <Text style={[styles.statCount, { color: '#eb2f96' }]}>{priorityCounts.critical ?? 0}</Text>
        <Text style={styles.statLabel}>{t('notifications.critical', 'Critical')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.statCard, { borderColor: '#f5222d' }]}
        onPress={() => {
          setSelectedPriorities(['urgent']);
          setSelectedTypes([]);
          setActiveTab('all');
          setShowFilters(true);
          setPage(1);
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.statCount, { color: '#f5222d' }]}>{priorityCounts.urgent ?? 0}</Text>
        <Text style={styles.statLabel}>{t('notifications.urgent', 'Urgent')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.statCard, { borderColor: '#fa8c16' }]}
        onPress={() => {
          setSelectedPriorities(['warning']);
          setSelectedTypes([]);
          setActiveTab('all');
          setShowFilters(true);
          setPage(1);
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.statCount, { color: '#fa8c16' }]}>{priorityCounts.warning ?? 0}</Text>
        <Text style={styles.statLabel}>{t('notifications.warnings', 'Warnings')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ============ FEATURE 2: SEARCH BAR ============

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchInputWrapper}>
        <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
        <TextInput
          style={[styles.searchInput, I18nManager.isRTL && styles.rtlText]}
          placeholder={t('notifications.searchPlaceholder', 'Search notifications...')}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearButton}>
            <Text style={styles.searchClearText}>{'\u2715'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ============ FEATURE 3: ENHANCED TABS ============

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
          {tab.badge !== undefined && tab.badge > 0 && (
            <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  // ============ FEATURE 4: FILTER BAR ============

  const renderFilterBar = () => (
    <View style={styles.filterBarContainer}>
      <TouchableOpacity
        style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
        onPress={toggleFilter}
        activeOpacity={0.7}
      >
        <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
          {t('notifications.filters', 'Filters')}
          {activeFilterCount > 0
            ? ` (${t('notifications.activeFilters', '{{count}} active', { count: activeFilterCount })})`
            : ''}
        </Text>
        <Text style={styles.filterToggleIcon}>{showFilters ? '\u25B2' : '\u25BC'}</Text>
      </TouchableOpacity>

      {showFilters && (
        <View style={styles.filterContent}>
          {/* Type filters */}
          <Text style={styles.filterSectionLabel}>{t('notifications.typeFilter', 'Type')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
            {NOTIFICATION_TYPES.map((type) => {
              const isSelected = selectedTypes.includes(type);
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => toggleTypeFilter(type)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {t(`notifications.${type}`, type.replace(/_/g, ' '))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Priority filters */}
          <Text style={styles.filterSectionLabel}>{t('notifications.priorityFilter', 'Priority')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
            {(['info', 'warning', 'urgent', 'critical'] as NotificationPriority[]).map((priority) => {
              const isSelected = selectedPriorities.includes(priority);
              return (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.filterChip,
                    isSelected && { backgroundColor: priorityColors[priority] },
                  ]}
                  onPress={() => togglePriorityFilter(priority)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {t(PRIORITY_I18N_KEYS[priority])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={() => {
                setSelectedTypes([]);
                setSelectedPriorities([]);
              }}
            >
              <Text style={styles.clearFiltersText}>{t('notifications.clearFilters', 'Clear Filters')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );

  // ============ NOTIFICATION ITEM (with quick actions + acknowledge) ============

  const renderItem = useCallback(({ item }: { item: Notification }) => {
    const route = user ? getNotificationMobileRoute(item, user.role) : null;
    const isHighPriority = item.priority === 'urgent' || item.priority === 'critical';
    const quickActions = getQuickActions(item);
    const isPersistentUnacked = item.is_persistent && !item.acknowledged_at;

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

          {/* Feature 5: Quick Actions */}
          {quickActions.length > 0 && (
            <View style={styles.quickActionsRow}>
              {quickActions.map((qa, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.quickActionButton, { backgroundColor: qa.color }]}
                  onPress={() => handleQuickAction(item, qa.action)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickActionText}>{qa.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Feature 8: Acknowledge button for persistent notifications */}
          {isPersistentUnacked && (
            <TouchableOpacity
              style={styles.acknowledgeButton}
              onPress={() => acknowledgeMutation.mutate(item.id)}
              disabled={acknowledgeMutation.isPending}
              activeOpacity={0.7}
            >
              <Text style={styles.acknowledgeText}>
                {t('notifications.acknowledge', 'Acknowledge')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Show acknowledged badge */}
          {item.is_persistent && item.acknowledged_at ? (
            <View style={styles.acknowledgedBadge}>
              <Text style={styles.acknowledgedText}>
                {'\u2713'} {t('notifications.acknowledged', 'Acknowledged')}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </Swipeable>
    );
  }, [user, handlePress, renderRightActions, renderLeftActions, getQuickActions, handleQuickAction, acknowledgeMutation, t]);

  // ============ FEATURE 6: GROUPED VIEW ============

  const renderGroupItem = useCallback(({ item: group }: { item: NotificationGroup }) => (
    <TouchableOpacity
      style={styles.groupItem}
      activeOpacity={0.7}
      onPress={() => {
        // Navigate to the first notification in the group, or show group details
        if (group.notifications && group.notifications.length > 0) {
          handlePress(group.notifications[0]);
        }
      }}
    >
      <View style={styles.groupHeader}>
        <View style={styles.groupInfo}>
          <Text style={styles.groupTitle} numberOfLines={1}>{group.summary_title}</Text>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{group.notification_count}</Text>
          </View>
        </View>
        <Text style={styles.groupTime}>{formatDateTime(group.updated_at)}</Text>
      </View>
      <Text style={styles.groupMessage} numberOfLines={2}>
        {group.summary_message}
      </Text>
      {group.notifications && group.notifications.length > 0 && (
        <Text style={styles.groupPreview} numberOfLines={1}>
          {t('notifications.latestInGroup', 'Latest: {{message}}', {
            message: group.notifications[0].title,
          })}
        </Text>
      )}
    </TouchableOpacity>
  ), [t, handlePress]);

  // ============ SNOOZE MODAL ============

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

  // ============ EMPTY STATE ============

  const renderEmptyState = () => {
    let emptyMessage: string;
    if (searchQuery || activeFilterCount > 0) {
      emptyMessage = t('notifications.noMatchingNotifications', 'No notifications match your filters');
    } else if (activeTab === 'unread') {
      emptyMessage = t('notifications.allCaughtUp', "You're all caught up!");
    } else if (activeTab === 'critical') {
      emptyMessage = t('notifications.noCritical', 'No critical notifications');
    } else if (activeTab === 'mentions') {
      emptyMessage = t('notifications.noMentions', 'No mentions');
    } else {
      emptyMessage = t('notifications.no_notifications', 'No notifications');
    }

    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>{':-)'}</Text>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        <Text style={styles.emptyHint}>
          {t('notifications.swipeHint', 'Swipe left to snooze or delete, right to mark as read')}
        </Text>
        {(searchQuery || activeFilterCount > 0) && (
          <TouchableOpacity
            style={styles.clearFiltersButtonEmpty}
            onPress={() => {
              setSearchQuery('');
              setSelectedTypes([]);
              setSelectedPriorities([]);
            }}
          >
            <Text style={styles.clearFiltersTextEmpty}>{t('notifications.clearFilters', 'Clear Filters')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ============ LIST HEADER (AI Summary + Stats + Search + Tabs + Filters) ============

  const renderListHeader = () => (
    <View>
      {renderAISummary()}
      {renderStatsCards()}
      {renderSearchBar()}
      {renderTabs()}
      {renderFilterBar()}
    </View>
  );

  // ============ MAIN RENDER ============

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.notifications')}</Text>
        <View style={styles.headerActions}>
          {/* Feature 6: Group toggle */}
          <TouchableOpacity
            onPress={toggleGroupView}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerButton}
          >
            <Text style={[styles.headerButtonText, isGroupedView && styles.headerButtonTextActive]}>
              {isGroupedView ? '\u2630' : '\u2637'}
            </Text>
          </TouchableOpacity>

          {/* Feature 10: Settings button */}
          <TouchableOpacity
            onPress={() => navigation.navigate('NotificationPreferences')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerButton}
          >
            <Text style={styles.headerButtonText}>{'\u2699'}</Text>
          </TouchableOpacity>

          {/* Mark all read */}
          <TouchableOpacity
            onPress={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <Text style={[styles.markAll, markAllReadMutation.isPending && styles.disabled]}>
              {t('notifications.mark_all_read', 'Mark all read')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && !refreshing ? (
        <ScrollView>
          {renderListHeader()}
          <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
        </ScrollView>
      ) : isGroupedView ? (
        // GROUPED VIEW
        <FlatList
          data={groups}
          keyExtractor={(item) => item.group_key || item.id.toString()}
          renderItem={renderGroupItem}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            groupsLoading ? (
              <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
            ) : (
              renderEmptyState()
            )
          }
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
      ) : notifications.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyState()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#1677ff']}
              tintColor="#1677ff"
            />
          }
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          ListHeaderComponent={renderListHeader}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 22,
    color: '#666',
  },
  headerButtonTextActive: {
    color: '#1677ff',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  markAll: { color: '#1677ff', fontSize: 14 },
  disabled: { opacity: 0.5 },

  // AI Summary
  aiSummaryContainer: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#adc6ff',
    overflow: 'hidden',
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  aiSummaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiRobotIcon: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2f54eb',
    backgroundColor: '#d6e4ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    overflow: 'hidden',
  },
  aiSummaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2f54eb',
  },
  aiExpandIcon: {
    fontSize: 12,
    color: '#2f54eb',
  },
  aiSummaryBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  aiGreeting: {
    fontSize: 14,
    color: '#434343',
    marginBottom: 4,
    fontWeight: '500',
  },
  aiSummaryText: {
    fontSize: 13,
    color: '#595959',
    lineHeight: 19,
    marginBottom: 8,
  },
  aiSection: {
    marginTop: 8,
  },
  aiSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2f54eb',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  aiActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aiActionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  aiActionText: {
    fontSize: 13,
    color: '#434343',
    flex: 1,
  },
  aiTipText: {
    fontSize: 12,
    color: '#595959',
    lineHeight: 18,
    marginLeft: 4,
  },

  // Stats Cards
  statsContainer: {
    marginBottom: 8,
  },
  statsContent: {
    paddingHorizontal: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 80,
    alignItems: 'center',
    borderWidth: 1.5,
    marginRight: 8,
    ...Platform.select({
      ios: {
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.08)',
      },
      android: {
        elevation: 1,
      },
    }),
  },
  statCount: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },

  // Search Bar
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    paddingVertical: 0,
  },
  rtlText: {
    textAlign: 'right',
  },
  searchClearButton: {
    padding: 4,
    marginLeft: 4,
  },
  searchClearText: {
    fontSize: 16,
    color: '#999',
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  tabActive: {
    backgroundColor: '#1677ff',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: '#ff4d4f',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },

  // Filter Bar
  filterBarContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  filterToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterToggleActive: {
    backgroundColor: '#fafafa',
  },
  filterToggleText: {
    fontSize: 14,
    color: '#666',
  },
  filterToggleTextActive: {
    color: '#1677ff',
    fontWeight: '500',
  },
  filterToggleIcon: {
    fontSize: 10,
    color: '#999',
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginTop: 8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipScrollView: {
    marginBottom: 4,
  },
  filterChip: {
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1677ff',
  },
  filterChipText: {
    fontSize: 12,
    color: '#666',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  clearFiltersButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  clearFiltersText: {
    fontSize: 13,
    color: '#f5222d',
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
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
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

  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  quickActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  quickActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Acknowledge
  acknowledgeButton: {
    marginTop: 8,
    backgroundColor: '#722ed1',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  acknowledgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  acknowledgedBadge: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  acknowledgedText: {
    fontSize: 11,
    color: '#52c41a',
    fontWeight: '500',
  },

  // Groups
  groupItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    padding: 12,
    ...Platform.select({
      ios: {
        boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.1)',
      },
      android: {
        elevation: 2,
      },
    }),
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  groupBadge: {
    backgroundColor: '#1677ff',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  groupBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  groupTime: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  groupMessage: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 4,
  },
  groupPreview: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
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
  clearFiltersButtonEmpty: {
    marginTop: 16,
    backgroundColor: '#1677ff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  clearFiltersTextEmpty: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
