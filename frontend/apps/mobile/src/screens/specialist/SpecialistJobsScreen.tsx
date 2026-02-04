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
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  specialistJobsApi,
  SpecialistJob,
} from '@inspection/shared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterTab = 'pending_time' | 'active' | 'completed';

const FILTER_TABS: FilterTab[] = ['pending_time', 'active', 'completed'];

const STATUS_COLORS: Record<string, string> = {
  assigned: '#2196F3',
  in_progress: '#FF9800',
  paused: '#9C27B0',
  completed: '#4CAF50',
  incomplete: '#F44336',
  qc_approved: '#00897B',
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  major: { bg: '#FFEBEE', text: '#D32F2F' },
  minor: { bg: '#FFF3E0', text: '#E65100' },
};

export default function SpecialistJobsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [plannedTimeModalVisible, setPlannedTimeModalVisible] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [plannedHoursInput, setPlannedHoursInput] = useState('');

  const {
    data: allJobs,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['specialistJobs'],
    queryFn: () => specialistJobsApi.list(),
    select: (res) => {
      const payload = res.data;
      return (payload as any).items ?? (payload as any).data ?? payload;
    },
    refetchOnMount: 'always',
  });

  const jobs = (Array.isArray(allJobs) ? allJobs : []) as SpecialistJob[];

  const filteredJobs = jobs.filter((job) => {
    switch (activeTab) {
      case 'pending_time':
        return !job.has_planned_time;
      case 'active':
        return (
          job.has_planned_time &&
          ['assigned', 'in_progress', 'paused'].includes(job.status)
        );
      case 'completed':
        return ['completed', 'incomplete', 'qc_approved'].includes(job.status);
      default:
        return true;
    }
  });

  const enterPlannedTimeMutation = useMutation({
    mutationFn: ({ jobId, hours }: { jobId: number; hours: number }) =>
      specialistJobsApi.enterPlannedTime(jobId, hours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialistJobs'] });
      setPlannedTimeModalVisible(false);
      setSelectedJobId(null);
      setPlannedHoursInput('');
    },
    onError: () => {
      Alert.alert(t('common.error'), t('common.error'));
    },
  });

  const handleCardPress = useCallback(
    (job: SpecialistJob) => {
      if (!job.has_planned_time) {
        if (Platform.OS === 'ios') {
          Alert.prompt(
            t('jobs.enter_planned_time'),
            `${job.job_id}`,
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('common.save'),
                onPress: (value?: string) => {
                  const hours = parseFloat(value ?? '');
                  if (!isNaN(hours) && hours > 0) {
                    enterPlannedTimeMutation.mutate({ jobId: job.id, hours });
                  }
                },
              },
            ],
            'plain-text',
            '',
            'numeric',
          );
        } else {
          setSelectedJobId(job.id);
          setPlannedHoursInput('');
          setPlannedTimeModalVisible(true);
        }
      } else {
        navigation.navigate('SpecialistJobDetail', { jobId: job.id });
      }
    },
    [navigation, t, enterPlannedTimeMutation],
  );

  const handleSubmitPlannedTime = useCallback(() => {
    const hours = parseFloat(plannedHoursInput);
    if (isNaN(hours) || hours <= 0 || selectedJobId === null) return;
    enterPlannedTimeMutation.mutate({ jobId: selectedJobId, hours });
  }, [plannedHoursInput, selectedJobId, enterPlannedTimeMutation]);

  const getTabLabel = (tab: FilterTab): string => {
    switch (tab) {
      case 'pending_time':
        return t('jobs.planned_time');
      case 'active':
        return t('status.in_progress');
      case 'completed':
        return t('status.completed');
      default:
        return tab;
    }
  };

  const renderFilterTabs = () => (
    <View style={styles.filterRow}>
      {FILTER_TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.filterChip,
            activeTab === tab && styles.filterChipActive,
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text
            style={[
              styles.filterChipText,
              activeTab === tab && styles.filterChipTextActive,
            ]}
          >
            {getTabLabel(tab)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderJobCard = ({ item }: { item: SpecialistJob }) => {
    const statusColor = STATUS_COLORS[item.status] ?? '#9E9E9E';
    const categoryStyle = item.category ? CATEGORY_COLORS[item.category] : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.jobIdText} numberOfLines={1}>
            {item.job_id}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusBadgeText}>
              {item.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          {categoryStyle && (
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: categoryStyle.bg },
              ]}
            >
              <Text style={[styles.categoryBadgeText, { color: categoryStyle.text }]}>
                {item.category}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          {item.planned_time_hours != null && (
            <Text style={styles.timeText}>
              {t('jobs.planned_time')}: {item.planned_time_hours}h
            </Text>
          )}
          {item.actual_time_hours != null && (
            <Text style={styles.timeText}>
              {t('jobs.actual_time')}: {item.actual_time_hours}h
            </Text>
          )}
          {!item.has_planned_time && (
            <Text style={styles.pendingTimeText}>
              {t('jobs.enter_planned_time')}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('common.noData')}</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderFilterTabs()}
      <FlatList
        data={filteredJobs}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderJobCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          filteredJobs.length === 0 ? styles.emptyList : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      />

      {/* Planned Time Modal for Android */}
      <Modal
        visible={plannedTimeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlannedTimeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.enter_planned_time')}</Text>
            <TextInput
              style={styles.modalInput}
              value={plannedHoursInput}
              onChangeText={setPlannedHoursInput}
              keyboardType="numeric"
              placeholder="0.0"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setPlannedTimeModalVisible(false);
                  setSelectedJobId(null);
                }}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveButton,
                  enterPlannedTimeMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleSubmitPlannedTime}
                disabled={enterPlannedTimeMutation.isPending}
              >
                {enterPlannedTimeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#1976D2',
  },
  filterChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
  },
  emptyList: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobIdText: {
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  timeText: {
    fontSize: 13,
    color: '#757575',
  },
  pendingTimeText: {
    fontSize: 13,
    color: '#1976D2',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  errorText: {
    fontSize: 16,
    color: '#E53935',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 24,
    width: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#212121',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bdbdbd',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#757575',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
