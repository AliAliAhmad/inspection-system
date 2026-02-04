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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { specialistJobsApi } from '@inspection/shared';
import type { SpecialistJob } from '@inspection/shared';

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  assigned: '#1976D2',
  in_progress: '#2196F3',
  paused: '#FFC107',
  completed: '#4CAF50',
  verified: '#388E3C',
};

interface FilterOption {
  label: string;
  value: string | null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function JobCard({
  job,
  onPress,
}: {
  job: SpecialistJob;
  onPress: (j: SpecialistJob) => void;
}) {
  const statusColor = STATUS_COLORS[job.status] ?? '#757575';

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(job)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardId}>Job #{job.job_id || job.id}</Text>
        <Badge label={job.status} color={statusColor} />
      </View>

      {job.defect?.description && (
        <Text style={styles.cardTitle} numberOfLines={2}>
          {job.defect.description}
        </Text>
      )}

      <View style={styles.cardInfoRow}>
        <Text style={styles.cardLabel}>Specialist ID: </Text>
        <Text style={styles.cardValue}>#{job.specialist_id}</Text>
      </View>

      {job.category && (
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardLabel}>Category: </Text>
          <Badge label={job.category} color={job.category === 'major' ? '#E53935' : '#757575'} />
        </View>
      )}

      <View style={styles.cardFooter}>
        {job.started_at && (
          <Text style={styles.dateText}>
            Started: {new Date(job.started_at).toLocaleDateString()}
          </Text>
        )}
        {job.completed_at && (
          <Text style={styles.completedText}>
            Completed: {new Date(job.completed_at).toLocaleDateString()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AllSpecialistJobsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filters: FilterOption[] = [
    { label: t('jobs.all', 'All'), value: null },
    { label: t('jobs.pending', 'Pending'), value: 'pending' },
    { label: t('jobs.assigned', 'Assigned'), value: 'assigned' },
    { label: t('jobs.in_progress', 'In Progress'), value: 'in_progress' },
    { label: t('jobs.completed', 'Completed'), value: 'completed' },
    { label: t('jobs.verified', 'Verified'), value: 'verified' },
  ];

  const jobsQuery = useQuery({
    queryKey: ['all-specialist-jobs', activeFilter, page],
    queryFn: () =>
      specialistJobsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
      }),
  });

  const responseData = (jobsQuery.data?.data as any) ?? jobsQuery.data;
  const jobs: SpecialistJob[] = responseData?.data ?? [];
  const pagination = responseData?.pagination ?? null;
  const hasNextPage = pagination?.has_next ?? false;

  const handleFilterChange = useCallback((value: string | null) => {
    setActiveFilter(value);
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
    jobsQuery.refetch();
  }, [jobsQuery]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !jobsQuery.isFetching) {
      setPage((prev) => prev + 1);
    }
  }, [hasNextPage, jobsQuery.isFetching]);

  const handleJobPress = (job: SpecialistJob) => {
    navigation.navigate('SpecialistJobDetail', { jobId: job.id });
  };

  if (jobsQuery.isLoading && page === 1) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.allSpecialistJobs', 'All Specialist Jobs')}</Text>

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

      {/* Jobs List */}
      <FlatList
        data={jobs}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <JobCard job={item} onPress={handleJobPress} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={jobsQuery.isRefetching && page === 1}
            onRefresh={handleRefresh}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          jobsQuery.isFetching && page > 1 ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#1976D2" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('jobs.empty', 'No jobs found.')}</Text>
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
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 8 },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  dateText: { fontSize: 12, color: '#757575' },
  completedText: { fontSize: 12, color: '#4CAF50', fontWeight: '500' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
});
