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
  Modal,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { specialistJobsApi } from '@inspection/shared';
import type { SpecialistJob, SpecialistJobStats } from '@inspection/shared';
import { StatCard } from '../../components/shared/StatCard';

const STATUS_COLORS: Record<string, string> = {
  pending: '#FF9800',
  assigned: '#1976D2',
  in_progress: '#2196F3',
  paused: '#FFC107',
  completed: '#4CAF50',
  incomplete: '#F44336',
  qc_approved: '#00897B',
  cancelled: '#9E9E9E',
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
  const isIncomplete = job.status === 'incomplete';
  const needsAck = isIncomplete && !job.incomplete_acknowledged_by;

  return (
    <TouchableOpacity
      style={[styles.card, needsAck && styles.cardWarning]}
      onPress={() => onPress(job)}
      activeOpacity={0.7}
    >
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
        <Text style={styles.cardLabel}>Specialist: </Text>
        <Text style={styles.cardValue}>
          {job.specialist?.full_name || `#${job.specialist_id}`}
        </Text>
      </View>

      {job.category && (
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardLabel}>Category: </Text>
          <Badge label={job.category} color={job.category === 'major' ? '#E53935' : '#FF9800'} />
        </View>
      )}

      {(job.planned_time_hours || job.actual_time_hours) && (
        <View style={styles.cardInfoRow}>
          <Text style={styles.cardLabel}>Time: </Text>
          <Text style={styles.cardValue}>
            {job.planned_time_hours ? `${job.planned_time_hours}h planned` : ''}
            {job.actual_time_hours ? ` / ${job.actual_time_hours.toFixed(1)}h actual` : ''}
          </Text>
        </View>
      )}

      {needsAck && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>Needs acknowledgment</Text>
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
            Done: {new Date(job.completed_at).toLocaleDateString()}
          </Text>
        )}
        {job.time_rating != null && (
          <Text style={styles.ratingText}>
            {'★'.repeat(Math.round(job.time_rating))}{'☆'.repeat(5 - Math.round(job.time_rating))}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function WorkloadModal({
  visible,
  onClose,
  workload,
}: {
  visible: boolean;
  onClose: () => void;
  workload: SpecialistJobStats['specialist_workload'];
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Specialist Workload</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView style={styles.modalContent}>
          {workload?.map((item, index) => (
            <View key={item.id} style={styles.workloadItem}>
              <View style={styles.workloadRank}>
                <Text style={styles.workloadRankText}>{index + 1}</Text>
              </View>
              <View style={styles.workloadInfo}>
                <Text style={styles.workloadName}>{item.name}</Text>
                <Text style={styles.workloadJobs}>{item.active_jobs} active jobs</Text>
              </View>
              <View style={[
                styles.workloadBadge,
                { backgroundColor: item.active_jobs > 3 ? '#FFEBEE' : '#E8F5E9' }
              ]}>
                <Text style={[
                  styles.workloadBadgeText,
                  { color: item.active_jobs > 3 ? '#E53935' : '#4CAF50' }
                ]}>
                  {item.active_jobs > 3 ? 'High' : 'Normal'}
                </Text>
              </View>
            </View>
          ))}
          {(!workload || workload.length === 0) && (
            <Text style={styles.emptyModalText}>No active specialists</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PerformersModal({
  visible,
  onClose,
  performers,
}: {
  visible: boolean;
  onClose: () => void;
  performers: SpecialistJobStats['top_performers'];
}) {
  const getMedalColor = (index: number) => {
    if (index === 0) return '#FFD700';
    if (index === 1) return '#C0C0C0';
    if (index === 2) return '#CD7F32';
    return '#E0E0E0';
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalClose}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Top Performers</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView style={styles.modalContent}>
          {performers?.map((item, index) => (
            <View key={item.id} style={styles.performerItem}>
              <View style={[styles.performerMedal, { backgroundColor: getMedalColor(index) }]}>
                <Text style={styles.performerMedalText}>{index + 1}</Text>
              </View>
              <View style={styles.performerInfo}>
                <Text style={styles.performerName}>{item.name}</Text>
                <Text style={styles.performerStats}>
                  {item.completed} completed • {'★'.repeat(Math.round(item.avg_rating))}
                </Text>
              </View>
            </View>
          ))}
          {(!performers || performers.length === 0) && (
            <Text style={styles.emptyModalText}>No data this month</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function AllSpecialistJobsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [workloadModalVisible, setWorkloadModalVisible] = useState(false);
  const [performersModalVisible, setPerformersModalVisible] = useState(false);

  const filters: FilterOption[] = [
    { label: t('jobs.all', 'All'), value: null },
    { label: t('jobs.assigned', 'Assigned'), value: 'assigned' },
    { label: t('jobs.in_progress', 'In Progress'), value: 'in_progress' },
    { label: t('jobs.paused', 'Paused'), value: 'paused' },
    { label: t('jobs.completed', 'Completed'), value: 'completed' },
    { label: t('jobs.incomplete', 'Incomplete'), value: 'incomplete' },
  ];

  // Fetch stats
  const statsQuery = useQuery({
    queryKey: ['specialist-jobs', 'stats'],
    queryFn: () => specialistJobsApi.getStats().then((r) => (r.data as any)?.data as SpecialistJobStats),
    staleTime: 60000,
  });

  const jobsQuery = useQuery({
    queryKey: ['all-specialist-jobs', activeFilter, page],
    queryFn: () =>
      specialistJobsApi.list({
        page,
        per_page: 20,
        ...(activeFilter ? { status: activeFilter } : {}),
      }),
  });

  const stats = statsQuery.data;
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
    statsQuery.refetch();
  }, [jobsQuery, statsQuery]);

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

      {/* Stats Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsRow}
        contentContainerStyle={styles.statsContent}
      >
        <StatCard
          label="Active"
          value={stats?.active?.total || 0}
          color="#1976D2"
          icon="⚡"
        />
        <StatCard
          label="Assigned"
          value={stats?.active?.assigned || 0}
          color="#2196F3"
        />
        <StatCard
          label="In Progress"
          value={stats?.active?.in_progress || 0}
          color="#FF9800"
        />
        <StatCard
          label="Paused"
          value={stats?.active?.paused || 0}
          color="#FFC107"
        />
        <StatCard
          label="Incomplete"
          value={stats?.incomplete?.unacknowledged || 0}
          color={stats?.incomplete?.unacknowledged ? '#E53935' : '#4CAF50'}
          subtitle={stats?.incomplete?.unacknowledged ? 'Need ack' : ''}
        />
        <StatCard
          label="Month"
          value={stats?.month?.completed || 0}
          color="#4CAF50"
          icon="✓"
        />
        <StatCard
          label="Avg Time"
          value={`${stats?.averages?.completion_time_hours || 0}h`}
          color="#9C27B0"
        />
        <StatCard
          label="Rating"
          value={stats?.averages?.time_rating?.toFixed(1) || '0'}
          color="#FF5722"
          icon="★"
        />
        <StatCard
          label="Workload"
          value={stats?.specialist_workload?.length || 0}
          color="#00BCD4"
          onPress={() => setWorkloadModalVisible(true)}
        />
        <StatCard
          label="Top"
          value={stats?.top_performers?.length || 0}
          color="#FFD700"
          icon="🏆"
          onPress={() => setPerformersModalVisible(true)}
        />
      </ScrollView>

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

      {/* Modals */}
      <WorkloadModal
        visible={workloadModalVisible}
        onClose={() => setWorkloadModalVisible(false)}
        workload={stats?.specialist_workload || []}
      />
      <PerformersModal
        visible={performersModalVisible}
        onClose={() => setPerformersModalVisible(false)}
        performers={stats?.top_performers || []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  statsRow: { maxHeight: 90, paddingVertical: 4 },
  statsContent: { paddingHorizontal: 12 },
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
  cardWarning: { borderLeftWidth: 4, borderLeftColor: '#FF9800' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardId: { fontSize: 14, fontWeight: '600', color: '#757575' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 8 },
  cardInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardLabel: { fontSize: 13, color: '#757575' },
  cardValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  dateText: { fontSize: 12, color: '#757575' },
  completedText: { fontSize: 12, color: '#4CAF50', fontWeight: '500' },
  ratingText: { fontSize: 12, color: '#FFD700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  warningBanner: { backgroundColor: '#FFF3E0', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginTop: 8 },
  warningText: { fontSize: 12, color: '#E65100', fontWeight: '600' },
  footerLoader: { paddingVertical: 16, alignItems: 'center' },
  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#757575' },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalClose: { fontSize: 16, color: '#1976D2', fontWeight: '600' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#212121' },
  modalContent: { padding: 16 },
  emptyModalText: { fontSize: 15, color: '#757575', textAlign: 'center', paddingVertical: 40 },
  // Workload modal
  workloadItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10 },
  workloadRank: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  workloadRankText: { fontSize: 14, fontWeight: '700', color: '#1976D2' },
  workloadInfo: { flex: 1 },
  workloadName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  workloadJobs: { fontSize: 13, color: '#757575', marginTop: 2 },
  workloadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  workloadBadgeText: { fontSize: 11, fontWeight: '600' },
  // Performers modal
  performerItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 10 },
  performerMedal: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  performerMedalText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  performerInfo: { flex: 1 },
  performerName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  performerStats: { fontSize: 13, color: '#757575', marginTop: 2 },
});
