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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FilterStatus = 'all' | 'assigned' | 'in_progress' | 'completed';
type AssessmentFilter = 'all' | 'operational' | 'urgent' | 'stopped';

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
  isAr,
}: {
  assessment?: AssessmentSummary | null;
  predicted?: 'operational' | 'urgent' | 'monitor' | null;
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
          <View style={styles.modalHandle} />

          <Text style={styles.modalQuestionText}>
            {entry.question_text || (isAr ? 'سؤال' : 'Question')}
          </Text>

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
                <Text style={styles.modalCategoryText}>{entry.category}</Text>
              </View>
            </View>
          )}

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'الإجابة' : 'Answer'}</Text>
            <Text style={styles.modalValue}>{entry.answer_value || '—'}</Text>
          </View>

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'نوع' : 'Type'}</Text>
            <Text style={styles.modalValue}>{entry.answer_type?.replace('_', ' ')}</Text>
          </View>

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

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>{isAr ? 'مستوى الطوارئ' : 'Urgency'}</Text>
            <View style={[styles.modalUrgencyBadge, { backgroundColor: urgencyColor }]}>
              <Text style={styles.modalUrgencyText}>{urgencyLabel}</Text>
            </View>
          </View>

          {entry.comment && (
            <View style={styles.modalCommentSection}>
              <Text style={styles.modalLabel}>{isAr ? 'ملاحظة' : 'Comment'}</Text>
              <Text style={styles.modalComment}>{entry.comment}</Text>
            </View>
          )}

          {entry.has_photo && (
            <View style={styles.modalPhotoIndicator}>
              <Text style={styles.modalPhotoText}>
                📷 {isAr ? 'يحتوي صورة' : 'Has photo attached'}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>{isAr ? 'إغلاق' : 'Close'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Stat Filter Card ─────────────────────────────────────
function StatFilterCard({
  label,
  value,
  icon,
  color,
  isActive,
  onPress,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.statCard,
        isActive && { borderColor: color, borderWidth: 2.5 },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      {isActive && <View style={[styles.statActiveDot, { backgroundColor: color }]} />}
    </TouchableOpacity>
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

  // Compute counts for each filter
  const filterCounts = useMemo(() => {
    const all = allAssignments.length;
    const assigned = allAssignments.filter(a => ASSIGNED_STATUSES.includes(a.status)).length;
    const inProgress = allAssignments.filter(a => IN_PROGRESS_STATUSES.includes(a.status)).length;
    const completed = allAssignments.filter(a => COMPLETED_STATUSES.includes(a.status)).length;
    return { all, assigned, inProgress, completed };
  }, [allAssignments]);

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

  const handleStatPress = useCallback((filter: FilterStatus) => {
    setActiveFilter(prev => prev === filter ? 'all' : filter);
  }, []);

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

  // User star score
  const userStars = (user as any)?.total_stars ?? 0;

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
        {/* Card Header: Equipment Name + Assessment Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.equipmentName} numberOfLines={1}>
              {equipmentName}
            </Text>
            <AssessmentBadge
              assessment={assessment}
              predicted={predicted}
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

        {/* Answer Bar + Urgency Score */}
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

  // Stat cards data — tapping filters the list
  const statCards: { key: FilterStatus; label: string; value: number; icon: string; color: string }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All', value: filterCounts.all, icon: '📋', color: '#1976D2' },
    { key: 'assigned', label: isAr ? 'معين' : 'Assigned', value: filterCounts.assigned, icon: '⏳', color: '#FF9800' },
    { key: 'in_progress', label: isAr ? 'جاري' : 'In Progress', value: filterCounts.inProgress, icon: '🔧', color: '#9C27B0' },
    { key: 'completed', label: isAr ? 'مكتمل' : 'Completed', value: filterCounts.completed, icon: '✅', color: '#4CAF50' },
  ];

  // Add week/month stats if available
  const extraStats = stats ? [
    { key: 'week' as FilterStatus, label: isAr ? 'هذا الأسبوع' : 'This Week', value: stats.week?.completed ?? 0, icon: '📊', color: '#00897B' },
    { key: 'month' as FilterStatus, label: isAr ? 'هذا الشهر' : 'This Month', value: stats.month?.completed ?? 0, icon: '🏆', color: '#3F51B5' },
  ] : [];

  return (
    <View style={styles.container}>
      {/* User greeting + star score */}
      <View style={styles.greetingRow}>
        <Text style={styles.greetingText}>
          {user?.full_name || (isAr ? 'مفتش' : 'Inspector')}
        </Text>
        {userStars > 0 && (
          <View style={styles.starBadge}>
            <Text style={styles.starText}>⭐ {userStars}</Text>
          </View>
        )}
      </View>

      {/* Stat cards as clickable filters — horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsContainer}
        contentContainerStyle={styles.statsContent}
      >
        {statCards.map((card) => (
          <StatFilterCard
            key={card.key}
            label={card.label}
            value={card.value}
            icon={card.icon}
            color={card.color}
            isActive={activeFilter === card.key}
            onPress={() => handleStatPress(card.key)}
          />
        ))}
        {extraStats.map((card) => (
          <View key={card.key} style={styles.statCard}>
            <Text style={styles.statIcon}>{card.icon}</Text>
            <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>{card.label}</Text>
          </View>
        ))}
        {stats && stats.backlog_count > 0 && (
          <View style={[styles.statCard, { borderColor: '#E53935', borderWidth: 1.5 }]}>
            <Text style={styles.statIcon}>⚠️</Text>
            <Text style={[styles.statValue, { color: '#E53935' }]}>{stats.backlog_count}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>{isAr ? 'متأخر' : 'Backlog'}</Text>
          </View>
        )}
      </ScrollView>

      {/* Assessment filter */}
      {renderAssessmentFilters()}

      {/* Assignment list */}
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

  // Greeting row
  greetingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#fff',
  },
  greetingText: { fontSize: 17, fontWeight: '700', color: '#212121' },
  starBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF8E1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  starText: { fontSize: 13, fontWeight: '700', color: '#F57F17' },

  // Stat filter cards (horizontal scroll)
  statsContainer: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
    maxHeight: 100,
  },
  statsContent: { paddingHorizontal: 8, paddingVertical: 10, gap: 8 },
  statCard: {
    backgroundColor: '#fff', borderRadius: 10, minWidth: 80, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#757575', marginTop: 2, textAlign: 'center' },
  statActiveDot: {
    width: 6, height: 6, borderRadius: 3, marginTop: 4,
  },

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

  // Assessment Badge (inline)
  assessmentBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4,
  },
  assessmentBadgeText: { fontSize: 12, fontWeight: '700' },
  assessmentPredictedTag: {
    fontSize: 9, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic',
  },

  // Answer Bar
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

  // Modal
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
