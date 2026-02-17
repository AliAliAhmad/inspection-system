import React, { useState, useCallback, useMemo } from 'react';
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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuth } from '../../providers/AuthProvider';
import {
  inspectionAssignmentsApi,
  InspectionAssignment,
  MyAssignmentStats,
  AnswerSummaryEntry,
  AssessmentSummary,
} from '@inspection/shared';
import { StatCard } from '../../components/shared/StatCard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterStatus = 'all' | 'assigned' | 'in_progress' | 'completed';
type AssessmentFilter = 'all' | 'operational' | 'urgent' | 'stopped';

const FILTER_OPTIONS: FilterStatus[] = ['all', 'assigned', 'in_progress', 'completed'];
const ASSESSMENT_FILTERS: AssessmentFilter[] = ['all', 'operational', 'urgent', 'stopped'];

const STATUS_COLORS: Record<string, string> = {
  assigned: '#2196F3',
  in_progress: '#FF9800',
  mech_complete: '#7B1FA2',
  elec_complete: '#7B1FA2',
  both_complete: '#00BCD4',
  assessment_pending: '#FF5722',
  completed: '#4CAF50',
  pending: '#9E9E9E',
};

const PENDING_LABELS: Record<string, string> = {
  both_inspections: 'Pending: Both inspections',
  mechanical_inspection: 'Pending: Mechanical inspection',
  electrical_inspection: 'Pending: Electrical inspection',
  both_verdicts: 'Pending: Both verdicts',
  mechanical_verdict: 'Pending: Mechanical verdict',
  electrical_verdict: 'Pending: Electrical verdict',
};

// ─── Answer Cell Component ────────────────────────────────
function AnswerCell({ entry }: { entry: AnswerSummaryEntry }) {
  const val = entry.answer_value?.toLowerCase().trim();
  let label = '';
  let bgColor = '#E0E0E0';
  let textColor = '#333';

  if (entry.answer_type === 'pass_fail' || entry.answer_type === 'yes_no') {
    if (val === 'pass' || val === 'yes') {
      label = 'P';
      bgColor = '#C8E6C9';
      textColor = '#2E7D32';
    } else if (val === 'fail' || val === 'no') {
      label = 'F';
      bgColor = '#FFCDD2';
      textColor = '#C62828';
    } else if (val === 'stop' || val === 'stopped') {
      label = 'S';
      bgColor = '#F44336';
      textColor = '#fff';
    } else {
      label = val?.charAt(0)?.toUpperCase() || '?';
    }
  } else if (entry.answer_type === 'numeric') {
    const num = parseFloat(entry.answer_value);
    label = isNaN(num) ? entry.answer_value : String(num);
    if (!isNaN(num)) {
      const inRange = isNumericInRange(num, entry);
      bgColor = inRange ? '#C8E6C9' : '#FFCDD2';
      textColor = inRange ? '#2E7D32' : '#C62828';
    }
  } else {
    // text type — just show first 3 chars
    label = entry.answer_value?.substring(0, 3) || '—';
    bgColor = '#E8EAF6';
    textColor = '#3F51B5';
  }

  return (
    <View style={[styles.answerCell, { backgroundColor: bgColor }]}>
      <Text style={[styles.answerCellText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function isNumericInRange(num: number, entry: AnswerSummaryEntry): boolean {
  const rule = entry.numeric_rule;
  const min = entry.min_value;
  const max = entry.max_value;

  if (!rule) return true; // no rule = assume ok
  if (rule === 'less_than' && max != null) return num < max;
  if (rule === 'greater_than' && min != null) return num > min;
  if (rule === 'between' && min != null && max != null) return num >= min && num <= max;
  return true;
}

// ─── Answer Bar (stacked column) ──────────────────────────
function AnswerBar({ answers }: { answers: AnswerSummaryEntry[] }) {
  if (!answers || answers.length === 0) return null;
  return (
    <View style={styles.answerBar}>
      {answers.map((entry, i) => (
        <AnswerCell key={i} entry={entry} />
      ))}
    </View>
  );
}

// ─── Assessment Badge ─────────────────────────────────────
function AssessmentBadge({ assessment, isAr }: { assessment?: AssessmentSummary | null; isAr: boolean }) {
  if (!assessment || !assessment.final_status) return null;

  let label = '';
  let bgColor = '#E0E0E0';
  let textColor = '#333';

  if (assessment.final_status === 'operational') {
    label = isAr ? 'تشغيلي' : 'Pass';
    bgColor = '#C8E6C9';
    textColor = '#2E7D32';
  } else if (assessment.final_status === 'urgent') {
    label = isAr ? 'صيانة عاجلة' : 'Urgent Maintenance';
    bgColor = '#FFCDD2';
    textColor = '#C62828';
  }

  return (
    <View style={[styles.assessmentBadge, { backgroundColor: bgColor }]}>
      <Text style={[styles.assessmentBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────
export default function MyAssignmentsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const isAr = i18n.language === 'ar';
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>('all');

  // Personal stats
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['my-assignments', 'stats'],
    queryFn: () => inspectionAssignmentsApi.getMyStats().then((res) => res.data?.data),
    refetchInterval: 60000,
  });

  // Fetch ALL assignments (with answers_summary + assessment)
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['myAssignments'],
    queryFn: () => inspectionAssignmentsApi.getMyAssignments(),
    select: (res) => (res.data as any).data ?? res.data,
  });

  const allAssignments = (Array.isArray(data) ? data : []) as InspectionAssignment[];

  // Status grouping
  const IN_PROGRESS_STATUSES = ['in_progress', 'mech_complete', 'elec_complete', 'both_complete', 'assessment_pending'];
  const COMPLETED_STATUSES = ['completed'];
  const ASSIGNED_STATUSES = ['assigned', 'pending'];

  const assignments = useMemo(() => {
    return allAssignments.filter((a) => {
      // Status filter
      let statusMatch = true;
      if (activeFilter === 'assigned') statusMatch = ASSIGNED_STATUSES.includes(a.status);
      else if (activeFilter === 'in_progress') statusMatch = IN_PROGRESS_STATUSES.includes(a.status);
      else if (activeFilter === 'completed') statusMatch = COMPLETED_STATUSES.includes(a.status);

      // Assessment filter
      let assessMatch = true;
      if (assessmentFilter === 'operational') {
        assessMatch = (a as any).assessment?.final_status === 'operational';
      } else if (assessmentFilter === 'urgent') {
        assessMatch = (a as any).assessment?.final_status === 'urgent';
      } else if (assessmentFilter === 'stopped') {
        // "stopped" = urgent (safety rule = equipment stopped)
        assessMatch = (a as any).assessment?.final_status === 'urgent';
      }

      return statusMatch && assessMatch;
    });
  }, [allAssignments, activeFilter, assessmentFilter]);

  const handlePress = useCallback(
    (assignment: InspectionAssignment) => {
      const isMech = user?.id === assignment.mechanical_inspector_id;
      const isElec = user?.id === assignment.electrical_inspector_id;
      const thisInspectorDone =
        (isMech && assignment.mech_completed_at) ||
        (isElec && assignment.elec_completed_at);

      if (thisInspectorDone || assignment.status === 'completed') {
        navigation.navigate('Assessment', { id: assignment.id });
      } else {
        navigation.navigate('InspectionWizard', { id: assignment.id });
      }
    },
    [navigation, user],
  );

  const getFilterLabel = (filter: FilterStatus): string => {
    switch (filter) {
      case 'all': return t('common.all');
      case 'assigned': return t('status.assigned');
      case 'in_progress': return t('status.in_progress');
      case 'completed': return t('status.completed');
      default: return filter;
    }
  };

  const getAssessmentLabel = (filter: AssessmentFilter): string => {
    if (filter === 'all') return isAr ? 'الكل' : 'All';
    if (filter === 'operational') return isAr ? 'تشغيلي' : 'Operational';
    if (filter === 'urgent') return isAr ? 'صيانة عاجلة' : 'Urgent';
    if (filter === 'stopped') return isAr ? 'متوقف' : 'Stopped';
    return filter;
  };

  const assessmentFilterColor = (filter: AssessmentFilter): string => {
    if (filter === 'operational') return '#4CAF50';
    if (filter === 'urgent') return '#FF9800';
    if (filter === 'stopped') return '#F44336';
    return '#1976D2';
  };

  const renderFilterChips = () => (
    <View style={styles.filterRow}>
      {FILTER_OPTIONS.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.filterChip,
            activeFilter === filter && styles.filterChipActive,
          ]}
          onPress={() => setActiveFilter(filter)}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === filter && styles.filterChipTextActive,
            ]}
          >
            {getFilterLabel(filter)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderAssessmentFilters = () => (
    <View style={styles.assessmentFilterRow}>
      {ASSESSMENT_FILTERS.map((filter) => {
        const isActive = assessmentFilter === filter;
        const color = assessmentFilterColor(filter);
        return (
          <TouchableOpacity
            key={filter}
            style={[
              styles.assessmentChip,
              { borderColor: color },
              isActive && { backgroundColor: color },
            ]}
            onPress={() => setAssessmentFilter(filter)}
          >
            <Text
              style={[
                styles.assessmentChipText,
                { color: color },
                isActive && { color: '#fff' },
              ]}
            >
              {getAssessmentLabel(filter)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderAssignmentCard = ({ item }: { item: InspectionAssignment }) => {
    const statusColor = STATUS_COLORS[item.status] ?? '#9E9E9E';
    const equipmentName = item.equipment?.name ?? `#${item.equipment_id}`;
    const equipmentType = item.equipment?.equipment_type ?? '';
    const location = item.equipment?.location ?? '';
    const berth = item.berth ?? item.equipment?.berth;
    const answersSummary = (item as any).answers_summary as AnswerSummaryEntry[] | undefined;
    const assessment = (item as any).assessment as AssessmentSummary | undefined;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.equipmentName} numberOfLines={1}>
            {equipmentName}
          </Text>
          <View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{item.status.replace(/_/g, ' ')}</Text>
            </View>
            {item.pending_on && PENDING_LABELS[item.pending_on] ? (
              <Text style={styles.pendingOnText}>{PENDING_LABELS[item.pending_on]}</Text>
            ) : null}
          </View>
        </View>

        {equipmentType ? (
          <Text style={styles.equipmentType}>
            {t('equipment.type')}: {equipmentType}
          </Text>
        ) : null}

        {location ? (
          <Text style={styles.detailText}>
            {t('equipment.location')}: {location}
          </Text>
        ) : null}

        {berth ? (
          <Text style={styles.detailText}>
            {t('equipment.berth')}: {berth}
          </Text>
        ) : null}

        {/* ─── Answer Bar + Assessment ─── */}
        {answersSummary && answersSummary.length > 0 && (
          <View style={styles.answerSection}>
            <AnswerBar answers={answersSummary} />
            <AssessmentBadge assessment={assessment} isAr={isAr} />
          </View>
        )}

        <View style={styles.cardFooter}>
          <View
            style={[
              styles.shiftBadge,
              item.shift === 'night' ? styles.shiftNight : styles.shiftDay,
            ]}
          >
            <Text style={styles.shiftBadgeText}>
              {item.shift === 'day' ? '☀ Day' : '☾ Night'}
            </Text>
          </View>

          {item.deadline ? (
            <Text style={styles.deadlineText}>
              {new Date(item.deadline).toLocaleDateString()}
            </Text>
          ) : null}
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
        <StatCard label={t('inspections.today_total', 'Today Total')} value={stats.today.total} color="#2196F3" icon="📋" size="small" />
        <StatCard label={t('status.assigned', 'Assigned')} value={stats.today.assigned} color="#FF9800" icon="⏳" size="small" />
        <StatCard label={t('status.in_progress', 'In Progress')} value={stats.today.in_progress} color="#9C27B0" icon="🔧" size="small" />
        <StatCard label={t('inspections.today_completed', 'Completed')} value={stats.today.completed} color="#4CAF50" icon="✅" size="small" />
        <StatCard label={t('inspections.week_completed', 'This Week')} value={stats.week.completed} subtitle={`/ ${stats.week.total}`} color="#00897B" icon="📊" size="small" />
        <StatCard label={t('inspections.month_completed', 'This Month')} value={stats.month.completed} color="#3F51B5" icon="🏆" size="small" />
        {stats.backlog_count > 0 && (
          <StatCard label={t('inspections.backlog', 'Backlog')} value={stats.backlog_count} color="#E53935" icon="⚠️" size="small" />
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {renderStatsSection()}
      {renderFilterChips()}
      {renderAssessmentFilters()}
      <FlatList
        data={assignments}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderAssignmentCard}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={assignments.length === 0 ? styles.emptyList : styles.listContent}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  statsLoading: { padding: 16, alignItems: 'center', backgroundColor: '#fff' },
  statsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  statsContent: { paddingHorizontal: 8, paddingVertical: 12, gap: 8 },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#e8e8e8', marginRight: 8 },
  filterChipActive: { backgroundColor: '#1976D2' },
  filterChipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },

  // Assessment filter row
  assessmentFilterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', gap: 6,
  },
  assessmentChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1.5,
  },
  assessmentChipText: { fontSize: 12, fontWeight: '600' },

  listContent: { padding: 12 },
  emptyList: { flexGrow: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  equipmentName: { fontSize: 16, fontWeight: '700', color: '#212121', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start', maxWidth: 140 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  pendingOnText: { fontSize: 10, color: '#757575', marginTop: 3, textAlign: 'right' },
  equipmentType: { fontSize: 13, color: '#757575', marginBottom: 2 },
  detailText: { fontSize: 13, color: '#757575', marginBottom: 2 },

  // ─── Answer Bar ───
  answerSection: {
    flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 4, gap: 8,
  },
  answerBar: {
    flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 3,
  },
  answerCell: {
    minWidth: 24, height: 22, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  answerCellText: { fontSize: 10, fontWeight: '800' },

  // Assessment badge
  assessmentBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-end',
  },
  assessmentBadgeText: { fontSize: 11, fontWeight: '700' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  shiftBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  shiftDay: { backgroundColor: '#FFF3E0' },
  shiftNight: { backgroundColor: '#E8EAF6' },
  shiftBadgeText: { fontSize: 12, fontWeight: '500', color: '#424242' },
  deadlineText: { fontSize: 12, color: '#E53935', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyText: { fontSize: 15, color: '#999' },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
});
