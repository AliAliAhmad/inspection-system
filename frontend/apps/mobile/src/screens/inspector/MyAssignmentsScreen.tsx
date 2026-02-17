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
  Modal,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const URGENCY_COLORS = ['#4CAF50', '#FF9800', '#FF5722', '#F44336'];
const URGENCY_BG = ['#E8F5E9', '#FFF3E0', '#FBE9E7', '#FFEBEE'];
const URGENCY_LABELS_EN = ['OK', 'Monitor', 'Attention', 'Critical'];
const URGENCY_LABELS_AR = ['سليم', 'مراقبة', 'يحتاج انتباه', 'حرج'];

const PENDING_LABELS: Record<string, string> = {
  both_inspections: 'Pending: Both inspections',
  mechanical_inspection: 'Pending: Mechanical inspection',
  electrical_inspection: 'Pending: Electrical inspection',
  both_verdicts: 'Pending: Both verdicts',
  mechanical_verdict: 'Pending: Mechanical verdict',
  electrical_verdict: 'Pending: Electrical verdict',
};

// ─── Numeric Validation ───────────────────────────────────
function isNumericInRange(num: number, entry: AnswerSummaryEntry): boolean {
  const rule = entry.numeric_rule;
  const min = entry.min_value;
  const max = entry.max_value;
  if (!rule) return true;
  if (rule === 'less_than' && max != null) return num < max;
  if (rule === 'greater_than' && min != null) return num > min;
  if (rule === 'between' && min != null && max != null) return num >= min && num <= max;
  return true;
}

// ─── Answer Cell (Clickable) ──────────────────────────────
function AnswerCell({
  entry,
  index,
  onPress,
}: {
  entry: AnswerSummaryEntry;
  index: number;
  onPress: () => void;
}) {
  const val = entry.answer_value?.toLowerCase().trim();
  let label = '';
  let bgColor = '#E0E0E0';
  let textColor = '#333';
  let borderColor = 'transparent';

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
    label = entry.answer_value?.substring(0, 3) || '—';
    bgColor = '#E8EAF6';
    textColor = '#3F51B5';
  }

  // Urgency border indicator
  const urgency = entry.urgency_level ?? 0;
  if (urgency > 0) {
    borderColor = URGENCY_COLORS[urgency] ?? 'transparent';
  }

  return (
    <TouchableOpacity
      style={[
        styles.answerCell,
        { backgroundColor: bgColor },
        urgency > 0 && { borderWidth: 2, borderColor },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.answerCellText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Answer Bar (stacked row) ─────────────────────────────
function AnswerBar({
  answers,
  onCellPress,
}: {
  answers: AnswerSummaryEntry[];
  onCellPress: (index: number) => void;
}) {
  if (!answers || answers.length === 0) return null;
  return (
    <View style={styles.answerBar}>
      {answers.map((entry, i) => (
        <AnswerCell
          key={i}
          entry={entry}
          index={i}
          onPress={() => onCellPress(i)}
        />
      ))}
    </View>
  );
}

// ─── Assessment Badge (inline near equipment name) ────────
function AssessmentBadge({
  assessment,
  predicted,
  urgencyScore,
  isAr,
}: {
  assessment?: AssessmentSummary | null;
  predicted?: 'operational' | 'urgent' | 'monitor' | null;
  urgencyScore?: number;
  isAr: boolean;
}) {
  const status = assessment?.final_status ?? predicted;
  if (!status) return null;

  let label = '';
  let bgColor = '#E0E0E0';
  let textColor = '#333';
  let icon = '';

  if (status === 'operational') {
    label = isAr ? 'تشغيلي' : 'Pass';
    bgColor = '#4CAF50';
    textColor = '#fff';
    icon = '✓';
  } else if (status === 'urgent') {
    label = isAr ? 'صيانة عاجلة' : 'Urgent';
    bgColor = '#F44336';
    textColor = '#fff';
    icon = '⚠';
  } else if (status === 'monitor') {
    label = isAr ? 'مراقبة' : 'Monitor';
    bgColor = '#FF9800';
    textColor = '#fff';
    icon = '👁';
  }

  const isPredicted = !assessment?.final_status && !!predicted;

  return (
    <View style={[styles.assessmentBadge, { backgroundColor: bgColor }]}>
      <Text style={[styles.assessmentBadgeText, { color: textColor }]}>
        {icon} {label}
      </Text>
      {isPredicted && (
        <Text style={styles.assessmentPredictedTag}>
          {isAr ? 'متوقع' : 'predicted'}
        </Text>
      )}
    </View>
  );
}

// ─── Detail Bottom Sheet Modal ────────────────────────────
function AnswerDetailModal({
  visible,
  entry,
  onClose,
  isAr,
}: {
  visible: boolean;
  entry: AnswerSummaryEntry | null;
  onClose: () => void;
  isAr: boolean;
}) {
  if (!entry) return null;

  const urgency = entry.urgency_level ?? 0;
  const urgencyLabel = isAr ? URGENCY_LABELS_AR[urgency] : URGENCY_LABELS_EN[urgency];
  const urgencyColor = URGENCY_COLORS[urgency];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
          {/* Handle bar */}
          <View style={styles.modalHandle} />

          {/* Question text */}
          <Text style={styles.modalQuestionText}>
            {entry.question_text || (isAr ? 'سؤال' : 'Question')}
          </Text>

          {/* Category */}
          {entry.category && (
            <View style={styles.modalCategoryRow}>
              <Text style={styles.modalCategoryLabel}>
                {isAr ? 'الفئة' : 'Category'}:
              </Text>
              <View style={[
                styles.modalCategoryBadge,
                entry.category === 'mechanical'
                  ? { backgroundColor: '#E3F2FD' }
                  : { backgroundColor: '#FFF3E0' },
              ]}>
                <Text style={styles.modalCategoryText}>
                  {entry.category}
                </Text>
              </View>
            </View>
          )}

          {/* Answer */}
          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'الإجابة' : 'Answer'}</Text>
            <Text style={styles.modalValue}>{entry.answer_value || '—'}</Text>
          </View>

          {/* Answer Type */}
          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'نوع' : 'Type'}</Text>
            <Text style={styles.modalValue}>{entry.answer_type?.replace('_', ' ')}</Text>
          </View>

          {/* Numeric range if applicable */}
          {entry.answer_type === 'numeric' && (entry.min_value != null || entry.max_value != null) && (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>{isAr ? 'النطاق' : 'Range'}</Text>
              <Text style={styles.modalValue}>
                {entry.numeric_rule === 'between'
                  ? `${entry.min_value} – ${entry.max_value}`
                  : entry.numeric_rule === 'less_than'
                    ? `< ${entry.max_value}`
                    : `> ${entry.min_value}`}
              </Text>
            </View>
          )}

          {/* Urgency */}
          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'مستوى الطوارئ' : 'Urgency'}</Text>
            <View style={[styles.modalUrgencyBadge, { backgroundColor: urgencyColor }]}>
              <Text style={styles.modalUrgencyText}>{urgencyLabel}</Text>
            </View>
          </View>

          {/* Comment */}
          {entry.comment && (
            <View style={styles.modalCommentSection}>
              <Text style={styles.modalLabel}>{isAr ? 'ملاحظة' : 'Comment'}</Text>
              <Text style={styles.modalComment}>{entry.comment}</Text>
            </View>
          )}

          {/* Photo indicator */}
          {entry.has_photo && (
            <View style={styles.modalPhotoIndicator}>
              <Text style={styles.modalPhotoText}>
                📷 {isAr ? 'يحتوي صورة' : 'Has photo attached'}
              </Text>
            </View>
          )}

          {/* Close button */}
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>{isAr ? 'إغلاق' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
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
  const [selectedEntry, setSelectedEntry] = useState<AnswerSummaryEntry | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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
      let statusMatch = true;
      if (activeFilter === 'assigned') statusMatch = ASSIGNED_STATUSES.includes(a.status);
      else if (activeFilter === 'in_progress') statusMatch = IN_PROGRESS_STATUSES.includes(a.status);
      else if (activeFilter === 'completed') statusMatch = COMPLETED_STATUSES.includes(a.status);

      let assessMatch = true;
      const finalStatus = a.assessment?.final_status;
      const predicted = a.predicted_assessment;
      const effective = finalStatus ?? predicted;

      if (assessmentFilter === 'operational') {
        assessMatch = effective === 'operational';
      } else if (assessmentFilter === 'urgent') {
        assessMatch = effective === 'urgent';
      } else if (assessmentFilter === 'stopped') {
        assessMatch = effective === 'urgent' || effective === 'monitor';
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

  const handleCellPress = useCallback((entry: AnswerSummaryEntry) => {
    setSelectedEntry(entry);
    setModalVisible(true);
  }, []);

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
    const answersSummary = item.answers_summary;
    const assessment = item.assessment;
    const urgencyScore = item.urgency_score ?? 0;
    const predicted = item.predicted_assessment;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        {/* ─── Card Header: Equipment Name + Assessment Badge ─── */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.equipmentName} numberOfLines={1}>
              {equipmentName}
            </Text>
            <AssessmentBadge
              assessment={assessment}
              predicted={predicted}
              urgencyScore={urgencyScore}
              isAr={isAr}
            />
          </View>
          <View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{item.status.replace(/_/g, ' ')}</Text>
            </View>
            {item.pending_on && PENDING_LABELS[item.pending_on] ? (
              <Text style={styles.pendingOnText}>{PENDING_LABELS[item.pending_on]}</Text>
            ) : null}
          </View>
        </View>

        {/* Equipment details */}
        {equipmentType ? (
          <Text style={styles.equipmentType}>
            {t('equipment.type')}: {equipmentType}
          </Text>
        ) : null}

        {(location || berth) ? (
          <Text style={styles.detailText}>
            {location}{location && berth ? ' • ' : ''}{berth ? `${t('equipment.berth')}: ${berth}` : ''}
          </Text>
        ) : null}

        {/* ─── Answer Bar + Urgency Score ─── */}
        {answersSummary && answersSummary.length > 0 && (
          <View style={styles.answerSection}>
            <AnswerBar
              answers={answersSummary}
              onCellPress={(i) => handleCellPress(answersSummary[i])}
            />
            {urgencyScore > 0 && (
              <View style={[
                styles.urgencyScoreBadge,
                { backgroundColor: urgencyScore >= 10 ? '#FFEBEE' : urgencyScore >= 5 ? '#FFF3E0' : '#E8F5E9' },
              ]}>
                <Text style={[
                  styles.urgencyScoreText,
                  { color: urgencyScore >= 10 ? '#C62828' : urgencyScore >= 5 ? '#E65100' : '#2E7D32' },
                ]}>
                  {isAr ? 'خطورة' : 'Risk'}: {urgencyScore}
                </Text>
              </View>
            )}
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
      <AnswerDetailModal
        visible={modalVisible}
        entry={selectedEntry}
        onClose={() => setModalVisible(false)}
        isAr={isAr}
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
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8,
  },
  cardHeaderLeft: {
    flex: 1, marginRight: 8, gap: 4,
  },
  equipmentName: { fontSize: 16, fontWeight: '700', color: '#212121' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start', maxWidth: 140 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  pendingOnText: { fontSize: 10, color: '#757575', marginTop: 3, textAlign: 'right' },
  equipmentType: { fontSize: 13, color: '#757575', marginBottom: 2 },
  detailText: { fontSize: 13, color: '#757575', marginBottom: 2 },

  // ─── Assessment Badge (inline) ───
  assessmentBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4,
  },
  assessmentBadgeText: { fontSize: 12, fontWeight: '700' },
  assessmentPredictedTag: {
    fontSize: 9, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic',
  },

  // ─── Answer Bar ───
  answerSection: {
    marginTop: 10, marginBottom: 4, gap: 6,
  },
  answerBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 3,
  },
  answerCell: {
    minWidth: 26, height: 24, borderRadius: 4,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  answerCellText: { fontSize: 10, fontWeight: '800' },

  // Urgency score badge
  urgencyScoreBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  urgencyScoreText: { fontSize: 11, fontWeight: '600' },

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

  // ─── Modal ───
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: '70%',
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  modalQuestionText: {
    fontSize: 17, fontWeight: '700', color: '#212121', marginBottom: 16, lineHeight: 24,
  },
  modalCategoryRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8,
  },
  modalCategoryLabel: { fontSize: 13, color: '#757575' },
  modalCategoryBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  modalCategoryText: { fontSize: 12, fontWeight: '600', color: '#424242', textTransform: 'capitalize' },
  modalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  modalLabel: { fontSize: 14, color: '#757575', fontWeight: '500' },
  modalValue: { fontSize: 14, color: '#212121', fontWeight: '600' },
  modalUrgencyBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  modalUrgencyText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  modalCommentSection: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F5F5F5',
  },
  modalComment: {
    fontSize: 14, color: '#424242', marginTop: 6, lineHeight: 20,
  },
  modalPhotoIndicator: {
    marginTop: 12, padding: 10, backgroundColor: '#E3F2FD', borderRadius: 8,
  },
  modalPhotoText: { fontSize: 13, color: '#1565C0' },
  modalCloseButton: {
    marginTop: 20, backgroundColor: '#1976D2', paddingVertical: 12,
    borderRadius: 10, alignItems: 'center',
  },
  modalCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
