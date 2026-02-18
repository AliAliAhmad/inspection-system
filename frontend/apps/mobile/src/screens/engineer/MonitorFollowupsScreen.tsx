import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  monitorFollowupsApi,
} from '@inspection/shared';
import type {
  MonitorFollowup,
  FollowupDashboardStats,
  FollowupStatus,
  FollowupType,
} from '@inspection/shared';

// ─── Constants ──────────────────────────────────────────────

type TabKey = 'pending' | 'scheduled' | 'overdue' | 'completed';

const TABS: TabKey[] = ['pending', 'scheduled', 'overdue', 'completed'];

const TAB_COLORS: Record<TabKey, string> = {
  pending: '#fa8c16',
  scheduled: '#1890ff',
  overdue: '#ff4d4f',
  completed: '#52c41a',
};

const TAB_STATUS_MAP: Record<TabKey, FollowupStatus | FollowupStatus[]> = {
  pending: 'pending_schedule',
  scheduled: ['scheduled', 'assignment_created'],
  overdue: 'overdue',
  completed: 'completed',
};

// ─── Helpers ────────────────────────────────────────────────

function getTypeLabel(type: FollowupType, t: (key: string, fallback?: string) => string): string {
  switch (type) {
    case 'routine_check':
      return t('monitor_followup.type_routine', 'Routine Check');
    case 'detailed_inspection':
      return t('monitor_followup.type_detailed', 'Detailed Inspection');
    case 'operational_test':
      return t('monitor_followup.type_operational', 'Operational Test');
    default:
      return type;
  }
}

function getTypeBgColor(type: FollowupType): string {
  switch (type) {
    case 'routine_check':
      return '#E3F2FD';
    case 'detailed_inspection':
      return '#F3E5F5';
    case 'operational_test':
      return '#FFF3E0';
    default:
      return '#F5F5F5';
  }
}

function getTypeTextColor(type: FollowupType): string {
  switch (type) {
    case 'routine_check':
      return '#1565C0';
    case 'detailed_inspection':
      return '#7B1FA2';
    case 'operational_test':
      return '#E65100';
    default:
      return '#616161';
  }
}

function getStatusLabel(status: FollowupStatus, t: (key: string, fallback?: string) => string): string {
  switch (status) {
    case 'pending_schedule':
      return t('monitor_followup.status_pending', 'Pending');
    case 'scheduled':
      return t('monitor_followup.status_scheduled', 'Scheduled');
    case 'assignment_created':
      return t('monitor_followup.status_assigned', 'Assigned');
    case 'in_progress':
      return t('monitor_followup.status_in_progress', 'In Progress');
    case 'completed':
      return t('monitor_followup.status_completed', 'Completed');
    case 'overdue':
      return t('monitor_followup.status_overdue', 'Overdue');
    case 'cancelled':
      return t('monitor_followup.status_cancelled', 'Cancelled');
    default:
      return status;
  }
}

function getStatusColor(status: FollowupStatus): string {
  switch (status) {
    case 'pending_schedule':
      return '#fa8c16';
    case 'scheduled':
    case 'assignment_created':
      return '#1890ff';
    case 'in_progress':
      return '#1890ff';
    case 'completed':
      return '#52c41a';
    case 'overdue':
      return '#ff4d4f';
    case 'cancelled':
      return '#8c8c8c';
    default:
      return '#8c8c8c';
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── Followup Card ──────────────────────────────────────────

function FollowupCard({
  item,
  t,
  onSchedule,
}: {
  item: MonitorFollowup;
  t: any;
  onSchedule: (id: number) => void;
}) {
  const isPending = item.status === 'pending_schedule';

  return (
    <View style={styles.card}>
      {/* Header: equipment name + status badge */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.equipment_name || t('monitor_followup.unknown_equipment', 'Unknown Equipment')}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusBadgeText}>{getStatusLabel(item.status, t)}</Text>
        </View>
      </View>

      {/* Date */}
      <Text style={styles.cardDate}>
        {item.followup_date ? formatDate(item.followup_date) : t('monitor_followup.no_date', 'No date set')}
      </Text>

      {/* Badges: type + location */}
      <View style={styles.badgeRow}>
        {item.followup_type && (
          <View style={[styles.tagBadge, { backgroundColor: getTypeBgColor(item.followup_type) }]}>
            <Text style={[styles.tagText, { color: getTypeTextColor(item.followup_type) }]}>
              {getTypeLabel(item.followup_type, t)}
            </Text>
          </View>
        )}
        {item.location && (
          <View style={[styles.tagBadge, { backgroundColor: '#E8F5E9' }]}>
            <Text style={[styles.tagText, { color: '#2E7D32' }]}>
              {item.location === 'east'
                ? t('monitor_followup.location_east', 'East')
                : t('monitor_followup.location_west', 'West')}
            </Text>
          </View>
        )}
      </View>

      {/* Inspector names */}
      {(item.mechanical_inspector_name || item.electrical_inspector_name) && (
        <View style={styles.inspectorsRow}>
          {item.mechanical_inspector_name && (
            <Text style={styles.inspectorText} numberOfLines={1}>
              {t('monitor_followup.mech_short', 'Mech')}: {item.mechanical_inspector_name}
            </Text>
          )}
          {item.electrical_inspector_name && (
            <Text style={styles.inspectorText} numberOfLines={1}>
              {t('monitor_followup.elec_short', 'Elec')}: {item.electrical_inspector_name}
            </Text>
          )}
        </View>
      )}

      {/* Overdue indicator */}
      {item.is_overdue && item.overdue_since && (
        <Text style={styles.overdueText}>
          {t('monitor_followup.overdue_since', 'Overdue since')} {formatDate(item.overdue_since)}
        </Text>
      )}

      {/* Schedule button for pending items */}
      {isPending && (
        <TouchableOpacity
          style={styles.scheduleBtn}
          onPress={() => onSchedule(item.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.scheduleBtnText}>
            {t('monitor_followup.schedule', 'Schedule')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────

export default function MonitorFollowupsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isAr = i18n.language === 'ar';
  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  // Dashboard stats
  const { data: statsData } = useQuery({
    queryKey: ['monitor-followup-dashboard'],
    queryFn: () =>
      monitorFollowupsApi.getDashboard().then(r => (r.data as any)?.data as FollowupDashboardStats),
    staleTime: 60000,
  });

  // Follow-up list
  const {
    data: followupsData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['monitor-followups', activeTab],
    queryFn: () => {
      const statusFilter = TAB_STATUS_MAP[activeTab];
      if (activeTab === 'pending') {
        return monitorFollowupsApi.getPending().then(r => (r.data as any)?.data as MonitorFollowup[]);
      }
      if (activeTab === 'overdue') {
        return monitorFollowupsApi.getOverdue().then(r => (r.data as any)?.data as MonitorFollowup[]);
      }
      // For scheduled and completed, use list with status filter
      const status = Array.isArray(statusFilter) ? statusFilter[0] : statusFilter;
      return monitorFollowupsApi.list({ status }).then(r => (r.data as any)?.data as MonitorFollowup[]);
    },
    staleTime: 30000,
  });

  const followups = followupsData ?? [];

  const stats = {
    pending: statsData?.pending_schedule ?? 0,
    scheduled: statsData?.scheduled ?? 0,
    overdue: statsData?.overdue ?? 0,
    completed: statsData?.completed_this_month ?? 0,
  };

  const handleSchedule = useCallback(
    (followupId: number) => {
      navigation.navigate('MonitorFollowupSchedule', { followupId });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: MonitorFollowup }) => (
      <FollowupCard item={item} t={t} onSchedule={handleSchedule} />
    ),
    [t, handleSchedule],
  );

  const keyExtractor = useCallback((item: MonitorFollowup) => item.id.toString(), []);

  // ─── Tab label helper ────────────────────────────────────

  function getTabLabel(tab: TabKey): string {
    switch (tab) {
      case 'pending':
        return t('monitor_followup.tab_pending', 'Pending');
      case 'scheduled':
        return t('monitor_followup.tab_scheduled', 'Scheduled');
      case 'overdue':
        return t('monitor_followup.tab_overdue', 'Overdue');
      case 'completed':
        return t('monitor_followup.tab_completed', 'Completed');
      default:
        return tab;
    }
  }

  if (isLoading && !followupsData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1890ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {t('monitor_followup.title', 'Monitor Follow-ups')}
        </Text>
      </View>

      {/* Stats Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
        style={styles.statsScrollView}
      >
        <StatCard
          label={t('monitor_followup.stat_pending', 'Pending')}
          value={stats.pending}
          color={TAB_COLORS.pending}
        />
        <StatCard
          label={t('monitor_followup.stat_scheduled', 'Scheduled')}
          value={stats.scheduled}
          color={TAB_COLORS.scheduled}
        />
        <StatCard
          label={t('monitor_followup.stat_overdue', 'Overdue')}
          value={stats.overdue}
          color={TAB_COLORS.overdue}
        />
        <StatCard
          label={t('monitor_followup.stat_completed', 'Completed')}
          value={stats.completed}
          color={TAB_COLORS.completed}
        />
      </ScrollView>

      {/* Tab Buttons */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          const color = TAB_COLORS[tab];
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabBtn,
                isActive && { backgroundColor: color },
                !isActive && { backgroundColor: '#F0F0F0' },
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  isActive && { color: '#fff' },
                  !isActive && { color: '#616161' },
                ]}
              >
                {getTabLabel(tab)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <FlatList
        data={followups}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={followups.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>
              {activeTab === 'completed' ? '✅' : activeTab === 'overdue' ? '⏰' : '📋'}
            </Text>
            <Text style={styles.emptyTitle}>
              {t('monitor_followup.no_followups', 'No follow-ups found')}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t(
                'monitor_followup.no_followups_message',
                'There are no follow-ups in this category.',
              )}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
  },

  // Stats
  statsScrollView: {
    flexGrow: 0,
    marginBottom: 4,
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    minWidth: 100,
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },

  // Tabs
  tabRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDate: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  inspectorsRow: {
    marginBottom: 8,
    gap: 2,
  },
  inspectorText: {
    fontSize: 13,
    color: '#616161',
  },
  overdueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff4d4f',
    marginBottom: 8,
  },
  scheduleBtn: {
    backgroundColor: '#1890ff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
});
