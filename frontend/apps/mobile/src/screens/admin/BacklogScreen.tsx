import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi } from '@inspection/shared';
import type { InspectionAssignment } from '@inspection/shared';

const SHIFT_COLORS: Record<string, string> = {
  day: '#1976D2',
  night: '#7B1FA2',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function getOverdueHours(deadline: string | null): number {
  if (!deadline) return 0;
  const diff = Date.now() - new Date(deadline).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}

function getOverdueLabel(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return `${days}d ${remaining}h`;
  }
  return `${hours}h`;
}

function getOverdueColor(hours: number): string {
  if (hours >= 24) return '#E53935';
  if (hours >= 8) return '#FF9800';
  return '#FFC107';
}

function BacklogCard({ item }: { item: InspectionAssignment }) {
  const overdueHours = getOverdueHours(item.deadline);
  const overdueColor = getOverdueColor(overdueHours);
  const shiftColor = SHIFT_COLORS[item.shift ?? 'day'] ?? '#757575';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.equipmentName}>
          {item.equipment?.name || `Equipment #${item.equipment_id}`}
        </Text>
        <Badge label={item.shift || 'day'} color={shiftColor} />
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Status: </Text>
        <Badge label={item.status?.replace(/_/g, ' ') || 'unknown'} color="#757575" />
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Deadline: </Text>
        <Text style={[styles.cardValue, { color: '#E53935' }]}>
          {formatDateTime(item.deadline)}
        </Text>
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Assigned at: </Text>
        <Text style={styles.cardValue}>{formatDateTime(item.assigned_at)}</Text>
      </View>

      <View style={styles.overdueRow}>
        <Text style={styles.overdueLabel}>Overdue by:</Text>
        <Badge label={getOverdueLabel(overdueHours)} color={overdueColor} />
      </View>
    </View>
  );
}

export default function BacklogScreen() {
  const { t } = useTranslation();

  const backlogQuery = useQuery({
    queryKey: ['backlog-assignments'],
    queryFn: () =>
      inspectionAssignmentsApi.getBacklog().then((r) => {
        const d = r.data;
        return Array.isArray(d) ? d : (d as any).data ?? [];
      }),
  });

  const assignments: InspectionAssignment[] = backlogQuery.data || [];

  const handleRefresh = useCallback(() => {
    backlogQuery.refetch();
  }, [backlogQuery]);

  if (backlogQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.backlog', 'Overdue Inspections')}</Text>
        {assignments.length > 0 && (
          <Badge label={String(assignments.length)} color="#E53935" />
        )}
      </View>

      <FlatList
        data={assignments}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <BacklogCard item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={backlogQuery.isRefetching}
            onRefresh={handleRefresh}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('backlog.noOverdue', 'No overdue inspections')}
            </Text>
            <Text style={styles.emptySubtext}>
              {t('backlog.allCaughtUp', 'All inspections are up to date!')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2, borderLeftWidth: 4, borderLeftColor: '#E53935' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  equipmentName: { fontSize: 16, fontWeight: '600', color: '#212121', flex: 1, marginRight: 10 },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardLabel: { fontSize: 13, color: '#757575', width: 90 },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  overdueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', gap: 10 },
  overdueLabel: { fontSize: 14, fontWeight: '600', color: '#424242' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  emptyContainer: { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#4CAF50', fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#757575', marginTop: 4 },
});
