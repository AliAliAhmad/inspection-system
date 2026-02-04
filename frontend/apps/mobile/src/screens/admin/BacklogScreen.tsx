import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { engineerJobsApi } from '@inspection/shared';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#E53935',
  high: '#FF9800',
  medium: '#FFC107',
  low: '#4CAF50',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  in_progress: '#1976D2',
  completed: '#4CAF50',
  cancelled: '#757575',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

interface BacklogItem {
  id: number;
  title?: string;
  description?: string;
  priority: string;
  status: string;
  equipment_id?: number;
  equipment?: { name: string };
  assigned_to_id?: number;
  assigned_to?: { full_name: string };
  created_at?: string;
  due_date?: string;
  specialist_job?: { description?: string };
  defect?: { description?: string };
}

function BacklogCard({ item }: { item: BacklogItem }) {
  const priorityColor = PRIORITY_COLORS[item.priority] ?? '#757575';
  const statusColor = STATUS_COLORS[item.status] ?? '#757575';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardId}>#{item.id}</Text>
        <View style={styles.badgeRow}>
          <Badge label={item.priority} color={priorityColor} />
          <Badge label={item.status} color={statusColor} />
        </View>
      </View>

      <Text style={styles.cardTitle}>
        {item.title || item.specialist_job?.description || item.defect?.description || `Job #${item.id}`}
      </Text>

      {item.description && (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Equipment: </Text>
        <Text style={styles.cardValue}>
          {item.equipment?.name || (item.equipment_id ? `#${item.equipment_id}` : '-')}
        </Text>
      </View>

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Assigned to: </Text>
        <Text style={styles.cardValue}>
          {item.assigned_to?.full_name || (item.assigned_to_id ? `#${item.assigned_to_id}` : 'Unassigned')}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        {item.created_at && (
          <Text style={styles.dateText}>
            Created: {new Date(item.created_at).toLocaleDateString()}
          </Text>
        )}
        {item.due_date && (
          <Text style={styles.dueDateText}>
            Due: {new Date(item.due_date).toLocaleDateString()}
          </Text>
        )}
      </View>
    </View>
  );
}

interface FilterOption {
  label: string;
  value: string | null;
}

export default function BacklogScreen() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filters: FilterOption[] = [
    { label: t('backlog.all', 'All'), value: null },
    { label: t('backlog.pending', 'Pending'), value: 'pending' },
    { label: t('backlog.in_progress', 'In Progress'), value: 'in_progress' },
    { label: t('backlog.completed', 'Completed'), value: 'completed' },
  ];

  const backlogQuery = useQuery({
    queryKey: ['backlog', activeFilter, page],
    queryFn: () =>
      engineerJobsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter as any } : {}),
      }),
  });

  const responseData = (backlogQuery.data?.data as any) ?? backlogQuery.data;
  const items: BacklogItem[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleFilterChange = useCallback((value: string | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    backlogQuery.refetch();
  }, [backlogQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !backlogQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, backlogQuery.isFetching]);

  if (backlogQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.backlog', 'Backlog')}</Text>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {filters.map((filter) => {
          const isActive = activeFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : styles.filterChipInactive,
              ]}
              onPress={() => handleFilterChange(filter.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Backlog List */}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <BacklogCard item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={backlogQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          backlogQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('backlog.empty', 'No backlog items found.')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  filterScroll: { maxHeight: 48, paddingBottom: 4 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  filterChipInactive: { backgroundColor: '#fff', borderColor: '#BDBDBD' },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  filterChipTextInactive: { color: '#616161' },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardId: { fontSize: 14, fontWeight: '600', color: '#757575' },
  badgeRow: { flexDirection: 'row', gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4 },
  cardDescription: { fontSize: 13, color: '#616161', marginBottom: 8 },
  cardInfoRow: { flexDirection: 'row', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  dateText: { fontSize: 12, color: '#757575' },
  dueDateText: { fontSize: 12, color: '#E53935', fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
});
