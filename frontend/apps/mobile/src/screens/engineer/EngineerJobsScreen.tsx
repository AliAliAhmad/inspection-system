import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
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
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { engineerJobsApi } from '@inspection/shared';
import type { EngineerJob } from '@inspection/shared';

type Filter = 'all' | 'active' | 'completed';

const FILTERS: Filter[] = ['all', 'active', 'completed'];

export default function EngineerJobsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeFilter, setActiveFilter] = useState<Filter>('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['engineerJobs'],
    queryFn: () => engineerJobsApi.list(),
  });

  const jobs: EngineerJob[] = (data?.data as any)?.items ?? (data?.data as any)?.data ?? [];

  const filteredJobs = jobs.filter((job) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active')
      return ['assigned', 'in_progress', 'planned'].includes(job.status);
    if (activeFilter === 'completed')
      return ['completed', 'reviewed'].includes(job.status);
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return '#FF9800';
      case 'in_progress': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'reviewed': return '#9C27B0';
      default: return '#757575';
    }
  };

  const getCategoryColor = (category: string | null) => {
    if (category === 'major') return '#F44336';
    if (category === 'minor') return '#FF9800';
    return '#757575';
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'custom_project': return t('common.custom_project', 'Custom Project');
      case 'system_review': return t('common.system_review', 'System Review');
      case 'special_task': return t('common.special_task', 'Special Task');
      default: return type;
    }
  };

  const renderJob = useCallback(({ item }: { item: EngineerJob }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('EngineerJobDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.badgeText}>{t(`status.${item.status}`, item.status)}</Text>
        </View>
      </View>
      <Text style={styles.jobId}>{item.job_id}</Text>
      <View style={styles.cardTags}>
        <View style={[styles.tagBadge, { backgroundColor: '#E3F2FD' }]}>
          <Text style={[styles.tagText, { color: '#1565C0' }]}>{getTypeLabel(item.job_type)}</Text>
        </View>
        {item.category && (
          <View style={[styles.tagBadge, { backgroundColor: item.category === 'major' ? '#FFEBEE' : '#FFF3E0' }]}>
            <Text style={[styles.tagText, { color: getCategoryColor(item.category) }]}>
              {t(`common.${item.category}`, item.category)}
            </Text>
          </View>
        )}
      </View>
      {(item.planned_time_days || item.planned_time_hours) && (
        <Text style={styles.plannedTime}>
          {t('jobs.planned_time', 'Planned')}: {item.planned_time_days ? `${item.planned_time_days}d ` : ''}{item.planned_time_hours ? `${item.planned_time_hours}h` : ''}
        </Text>
      )}
    </TouchableOpacity>
  ), [navigation, t]);

  const renderFilterTab = (filter: Filter) => (
    <TouchableOpacity
      key={filter}
      style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text style={[styles.filterTabText, activeFilter === filter && styles.filterTabTextActive]}>
        {t(`common.${filter}`, filter.charAt(0).toUpperCase() + filter.slice(1))}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.my_jobs', 'My Jobs')}</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('CreateJob')}
        >
          <Text style={styles.createButtonText}>+ {t('nav.create_job', 'Create Job')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(renderFilterTab)}
      </View>

      <FlatList
        data={filteredJobs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderJob}
        contentContainerStyle={filteredJobs.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('common.no_data', 'No jobs found')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('common.no_jobs_message', 'No jobs match the current filter.')}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  createButton: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  filterTabActive: { backgroundColor: '#1976D2' },
  filterTabText: { color: '#616161', fontWeight: '500', fontSize: 14 },
  filterTabTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
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
    marginBottom: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#212121', flex: 1, marginRight: 8 },
  jobId: { fontSize: 13, color: '#757575', marginBottom: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardTags: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12, fontWeight: '500' },
  plannedTime: { fontSize: 13, color: '#757575' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center' },
});
