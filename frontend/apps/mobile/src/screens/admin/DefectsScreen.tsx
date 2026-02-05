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
import {
  defectsApi,
} from '@inspection/shared';
import type {
  Defect,
  DefectStatus,
} from '@inspection/shared';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E53935',
  high: '#FF9800',
  medium: '#FFC107',
  low: '#4CAF50',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#E53935',
  in_progress: '#1976D2',
  resolved: '#4CAF50',
  closed: '#757575',
  false_alarm: '#7B1FA2',
};

interface FilterOption {
  label: string;
  value: DefectStatus | null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function DefectCard({ defect }: { defect: Defect }) {
  const severityColor = SEVERITY_COLORS[defect.severity] ?? '#757575';
  const statusColor = STATUS_COLORS[defect.status] ?? '#757575';

  const statusLabel = defect.status.replace(/_/g, ' ');
  const dueDateLabel = defect.created_at
    ? new Date(defect.created_at).toLocaleDateString()
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardDescriptionRow}>
        <Text style={styles.cardDescription} numberOfLines={2}>
          {defect.description}
        </Text>
        {defect.occurrence_count > 1 && (
          <View style={styles.occurrenceBadge}>
            <Text style={styles.occurrenceBadgeText}>x{defect.occurrence_count}</Text>
          </View>
        )}
      </View>

      {defect.equipment && (
        <Text style={styles.equipmentText} numberOfLines={1}>
          {defect.equipment.name} — {defect.equipment.serial_number}
        </Text>
      )}

      <View style={styles.badgeRow}>
        <Badge label={defect.severity} color={severityColor} />
        <Badge label={statusLabel} color={statusColor} />
        {defect.category && (
          <Badge
            label={defect.category}
            color={defect.category === 'electrical' ? '#1565C0' : '#6D4C41'}
          />
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.priorityText}>
          Priority: <Text style={styles.priorityValue}>{defect.priority}</Text>
        </Text>
        {dueDateLabel && (
          <Text style={styles.dateText}>{dueDateLabel}</Text>
        )}
      </View>
    </View>
  );
}

export default function DefectsScreen() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<DefectStatus | null>(null);
  const [page, setPage] = useState(1);

  const filters: FilterOption[] = [
    { label: t('defects.filter_all', 'All'), value: null },
    { label: t('defects.filter_open', 'Open'), value: 'open' },
    { label: t('defects.filter_in_progress', 'In Progress'), value: 'in_progress' },
    { label: t('defects.filter_resolved', 'Resolved'), value: 'resolved' },
    { label: t('defects.filter_closed', 'Closed'), value: 'closed' },
    { label: t('defects.filter_false_alarm', 'False Alarm'), value: 'false_alarm' },
  ];

  const defectsQuery = useQuery({
    queryKey: ['defects', activeFilter, page],
    queryFn: () =>
      defectsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
      }),
  });

  const responseData = (defectsQuery.data?.data as any) ?? defectsQuery.data;
  const defects: Defect[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleFilterChange = useCallback((value: DefectStatus | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    defectsQuery.refetch();
  }, [defectsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !defectsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, defectsQuery.isFetching]);

  if (defectsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('defects.title', 'Defects')}</Text>

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

      {/* Defect List */}
      <FlatList
        data={defects}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <DefectCard defect={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={defectsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          defectsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {t('defects.empty', 'No defects found.')}
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
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  filterScroll: {
    maxHeight: 48,
    paddingBottom: 4,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  filterChipInactive: {
    backgroundColor: '#fff',
    borderColor: '#BDBDBD',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterChipTextInactive: {
    color: '#616161',
  },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDescriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardDescription: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
    flex: 1,
    marginRight: 8,
  },
  occurrenceBadge: {
    backgroundColor: '#E53935',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  occurrenceBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  equipmentText: {
    fontSize: 13,
    color: '#1565C0',
    fontWeight: '500',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 12,
    color: '#757575',
  },
  priorityValue: {
    fontWeight: '600',
    color: '#424242',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: '#757575',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#757575',
  },
});
