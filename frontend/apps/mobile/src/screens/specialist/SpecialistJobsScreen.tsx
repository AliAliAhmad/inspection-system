import React, { useState, useCallback, useEffect } from 'react';
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
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import {
  specialistJobsApi,
  SpecialistJob,
  MySpecialistStats,
  AITimeEstimate,
} from '@inspection/shared';
import { StatCard } from '../../components/shared/StatCard';

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
  const [aiEstimate, setAiEstimate] = useState<AITimeEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  // Personal stats query
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['specialist-jobs', 'my-stats'],
    queryFn: () => specialistJobsApi.getMyStats().then((res) => res.data?.data),
    refetchInterval: 60000,
  });

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

  const fetchAIEstimate = useCallback(async (jobId: number) => {
    setLoadingEstimate(true);
    setAiEstimate(null);
    try {
      const res = await specialistJobsApi.getAITimeEstimate(jobId);
      if (res.data?.data) {
        setAiEstimate(res.data.data);
        setPlannedHoursInput(String(res.data.data.estimated_hours));
      }
    } catch {
      // AI estimate is optional
    } finally {
      setLoadingEstimate(false);
    }
  }, []);

  const handleCardPress = useCallback(
    (job: SpecialistJob) => {
      if (!job.has_planned_time) {
        setSelectedJobId(job.id);
        setPlannedHoursInput('');
        setAiEstimate(null);
        setPlannedTimeModalVisible(true);
        fetchAIEstimate(job.id);
      } else {
        navigation.navigate('SpecialistJobDetail', { jobId: job.id });
      }
    },
    [navigation, fetchAIEstimate],
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

  const renderStatsSection = () => {
    if (statsLoading) {
      return (
        <View style={styles.statsLoading}>
          <ActivityIndicator size="small" color="#1976D2" />
        </View>
      );
    }

    if (!stats) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsContainer}
        contentContainerStyle={styles.statsContent}
      >
        <StatCard
          label={t('jobs.pending_time', 'Need Time')}
          value={stats.today.pending_time}
          color="#FF9800"
          icon="⏱️"
          size="small"
        />
        <StatCard
          label={t('status.in_progress', 'In Progress')}
          value={stats.today.in_progress}
          color="#2196F3"
          icon="🔧"
          size="small"
        />
        <StatCard
          label={t('jobs.today_completed', 'Today')}
          value={stats.today.completed}
          color="#4CAF50"
          icon="✅"
          size="small"
        />
        <StatCard
          label={t('jobs.week_completed', 'This Week')}
          value={stats.week.completed}
          subtitle={`/ ${stats.week.total}`}
          color="#9C27B0"
          icon="📊"
          size="small"
        />
        <StatCard
          label={t('jobs.month_completed', 'This Month')}
          value={stats.month.completed}
          color="#00897B"
          icon="🏆"
          size="small"
        />
        <StatCard
          label={t('jobs.total_points', 'Points')}
          value={stats.total_points}
          color="#E91E63"
          icon="⭐"
          size="small"
        />
        <StatCard
          label={t('jobs.avg_time', 'Avg Time')}
          value={`${stats.averages.completion_time_hours}h`}
          color="#607D8B"
          icon="⌛"
          size="small"
        />
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {renderStatsSection()}
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
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              refetchStats();
            }}
          />
        }
      />

      {/* Planned Time Modal */}
      <Modal
        visible={plannedTimeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlannedTimeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('jobs.enter_planned_time')}</Text>

            {/* AI Estimation Section */}
            {loadingEstimate ? (
              <View style={styles.aiLoadingContainer}>
                <ActivityIndicator size="small" color="#1976D2" />
                <Text style={styles.aiLoadingText}>
                  {t('jobs.ai_estimating', 'AI analyzing...')}
                </Text>
              </View>
            ) : aiEstimate ? (
              <View style={styles.aiContainer}>
                <View style={styles.aiHeader}>
                  <Text style={styles.aiIcon}>🤖</Text>
                  <Text style={styles.aiTitle}>{t('jobs.ai_suggestion', 'AI Suggestion')}</Text>
                  <View style={[
                    styles.confidenceBadge,
                    {
                      backgroundColor:
                        aiEstimate.confidence === 'high' ? '#E8F5E9' :
                        aiEstimate.confidence === 'medium' ? '#FFF3E0' : '#F5F5F5'
                    }
                  ]}>
                    <Text style={[
                      styles.confidenceText,
                      {
                        color:
                          aiEstimate.confidence === 'high' ? '#2E7D32' :
                          aiEstimate.confidence === 'medium' ? '#E65100' : '#757575'
                      }
                    ]}>
                      {aiEstimate.confidence}
                    </Text>
                  </View>
                </View>
                <Text style={styles.aiRange}>
                  {t('jobs.ai_range', 'Range')}: {aiEstimate.range.min}h - {aiEstimate.range.max}h
                </Text>
                <View style={styles.aiSuggestionsRow}>
                  {aiEstimate.suggestions.map((s) => (
                    <TouchableOpacity
                      key={s.label}
                      style={[
                        styles.aiSuggestionBtn,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionBtnActive
                      ]}
                      onPress={() => setPlannedHoursInput(String(s.hours))}
                    >
                      <Text style={[
                        styles.aiSuggestionText,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionTextActive
                      ]}>
                        {s.hours}h
                      </Text>
                      <Text style={[
                        styles.aiSuggestionLabel,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionTextActive
                      ]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <TextInput
              style={styles.modalInput}
              value={plannedHoursInput}
              onChangeText={setPlannedHoursInput}
              keyboardType="numeric"
              placeholder="0.0"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setPlannedTimeModalVisible(false);
                  setSelectedJobId(null);
                  setAiEstimate(null);
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
                  <Text style={styles.modalSaveText}>{t('jobs.start', 'Start')}</Text>
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
  statsLoading: {
    padding: 16,
    alignItems: 'center',
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statsContent: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
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
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.1)',
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
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.25)',
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
  // AI Estimation styles
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  aiLoadingText: {
    fontSize: 13,
    color: '#1976D2',
  },
  aiContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  aiIcon: {
    fontSize: 16,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976D2',
    flex: 1,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  aiRange: {
    fontSize: 12,
    color: '#616161',
    marginBottom: 10,
  },
  aiSuggestionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  aiSuggestionBtn: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  aiSuggestionBtnActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  aiSuggestionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1976D2',
  },
  aiSuggestionTextActive: {
    color: '#fff',
  },
  aiSuggestionLabel: {
    fontSize: 10,
    color: '#757575',
    marginTop: 2,
  },
});
