import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { assessmentsApi } from '@inspection/shared';
import type { FinalAssessment, Verdict } from '@inspection/shared';
import { useTheme } from '../../hooks/useTheme';
import { RootStackParamList } from '../../navigation/RootNavigator';

// ─── Constants ──────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'escalated' | 'finalized';

const VERDICT_COLORS: Record<string, string> = {
  operational: '#4CAF50',
  monitor: '#FF9800',
  stop: '#F44336',
};

const STAT_CARD_CONFIGS = [
  { key: 'pending_inspector', color: '#1976D2', bgLight: '#E3F2FD' },
  { key: 'pending_engineer', color: '#7B1FA2', bgLight: '#F3E5F5' },
  { key: 'pending_admin', color: '#E65100', bgLight: '#FFF3E0' },
  { key: 'finalized', color: '#2E7D32', bgLight: '#E8F5E9' },
] as const;

// ─── Helpers ────────────────────────────────────────────────

function getVerdictColor(verdict: Verdict | null | undefined): string {
  if (!verdict) return '#9E9E9E';
  return VERDICT_COLORS[verdict] ?? '#9E9E9E';
}

function timeAgo(dateStr: string, isAr: boolean): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return isAr ? 'الآن' : 'just now';
  if (diffMin < 60) return isAr ? `${diffMin} د` : `${diffMin}m ago`;
  if (diffHr < 24) return isAr ? `${diffHr} س` : `${diffHr}h ago`;
  if (diffDay < 30) return isAr ? `${diffDay} ي` : `${diffDay}d ago`;
  return isAr ? `${Math.floor(diffDay / 30)} ش` : `${Math.floor(diffDay / 30)}mo ago`;
}

function getAssessmentStatus(a: FinalAssessment): 'pending' | 'escalated' | 'finalized' {
  if (a.finalized_at) return 'finalized';
  if (a.escalation_level !== 'none') return 'escalated';
  return 'pending';
}

// ─── Inline Components ──────────────────────────────────────

function StatCard({
  title,
  value,
  color,
  bgLight,
}: {
  title: string;
  value: number;
  color: string;
  bgLight: string;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: bgLight }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={[s.statTitle, { color }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

function VerdictChip({
  label,
  verdict,
}: {
  label: string;
  verdict: Verdict | null | undefined;
}) {
  const bgColor = getVerdictColor(verdict);
  return (
    <View style={[s.verdictChip, { backgroundColor: bgColor + '20' }]}>
      <View style={[s.verdictDot, { backgroundColor: bgColor }]} />
      <Text style={[s.verdictLabel, { color: bgColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EscalationBadge({ level, isAr }: { level: string; isAr: boolean }) {
  if (level === 'none') return null;
  const label =
    level === 'admin'
      ? isAr ? 'مصعّد للإدارة' : 'Admin Escalation'
      : isAr ? 'مصعّد للمهندس' : 'Engineer Escalation';
  const bgColor = level === 'admin' ? '#F44336' : '#FF9800';

  return (
    <View style={[s.escalationBadge, { backgroundColor: bgColor + '18' }]}>
      <Text style={[s.escalationText, { color: bgColor }]}>{label}</Text>
    </View>
  );
}

function FilterTabs({
  active,
  onChange,
  isAr,
  colors,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  isAr: boolean;
  colors: any;
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: isAr ? 'الكل' : 'All' },
    { key: 'pending', label: isAr ? 'معلق' : 'Pending' },
    { key: 'escalated', label: isAr ? 'مصعّد' : 'Escalated' },
    { key: 'finalized', label: isAr ? 'مكتمل' : 'Finalized' },
  ];

  return (
    <View style={[s.filterRow, { backgroundColor: colors.surface }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[
              s.filterTab,
              isActive && { backgroundColor: colors.primary },
            ]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                s.filterTabText,
                { color: isActive ? '#fff' : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AssessmentCard({
  assessment,
  isAr,
  colors,
  onPress,
}: {
  assessment: FinalAssessment;
  isAr: boolean;
  colors: any;
  onPress: () => void;
}) {
  const status = getAssessmentStatus(assessment);

  const statusColors: Record<string, string> = {
    pending: '#FF9800',
    escalated: '#F44336',
    finalized: '#4CAF50',
  };
  const statusLabels: Record<string, string> = isAr
    ? { pending: 'معلق', escalated: 'مصعّد', finalized: 'مكتمل' }
    : { pending: 'Pending', escalated: 'Escalated', finalized: 'Finalized' };

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={s.cardHeader}>
        <Text style={[s.equipmentName, { color: colors.text }]} numberOfLines={1}>
          {isAr ? `معدة #${assessment.equipment_id}` : `Equipment #${assessment.equipment_id}`}
        </Text>
        <View
          style={[
            s.statusBadge,
            { backgroundColor: statusColors[status] + '18' },
          ]}
        >
          <Text style={[s.statusText, { color: statusColors[status] }]}>
            {statusLabels[status]}
          </Text>
        </View>
      </View>

      {/* Verdict chips */}
      <View style={s.verdictRow}>
        <VerdictChip
          label={isAr ? 'النظام' : 'System'}
          verdict={assessment.system_verdict}
        />
        <VerdictChip
          label={isAr ? 'ميكانيكي' : 'Mech'}
          verdict={assessment.mech_verdict}
        />
        <VerdictChip
          label={isAr ? 'كهربائي' : 'Elec'}
          verdict={assessment.elec_verdict}
        />
        <VerdictChip
          label={isAr ? 'مهندس' : 'Engr'}
          verdict={assessment.engineer_verdict}
        />
        <VerdictChip
          label={isAr ? 'نهائي' : 'Final'}
          verdict={assessment.final_status}
        />
      </View>

      {/* Escalation + time row */}
      <View style={s.cardFooter}>
        <EscalationBadge level={assessment.escalation_level} isAr={isAr} />
        <Text style={[s.timeAgo, { color: colors.textTertiary }]}>
          {timeAgo(assessment.created_at, isAr)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({ isAr, colors }: { isAr: boolean; colors: any }) {
  return (
    <View style={s.emptyContainer}>
      <Text style={s.emptyIcon}>📋</Text>
      <Text style={[s.emptyTitle, { color: colors.text }]}>
        {isAr ? 'لا توجد تقييمات' : 'No Assessments'}
      </Text>
      <Text style={[s.emptySubtitle, { color: colors.textSecondary }]}>
        {isAr
          ? 'لا توجد تقييمات تطابق الفلتر المحدد'
          : 'No assessments match the selected filter'}
      </Text>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────

export default function AssessmentTrackingScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const isAr = i18n.language === 'ar';

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Fetch assessments
  const {
    data: assessments,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['assessments-tracking'],
    queryFn: async () => {
      const res = await assessmentsApi.list({ per_page: 200 });
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

  // Compute stats
  const stats = useMemo(() => {
    const items = assessments ?? [];
    let pendingInspector = 0;
    let pendingEngineer = 0;
    let pendingAdmin = 0;
    let finalized = 0;

    for (const a of items) {
      if (a.finalized_at) {
        finalized++;
      } else if (a.escalation_level === 'admin') {
        pendingAdmin++;
      } else if (a.escalation_level === 'engineer') {
        pendingEngineer++;
      } else {
        pendingInspector++;
      }
    }

    return { pendingInspector, pendingEngineer, pendingAdmin, finalized };
  }, [assessments]);

  const statLabels = useMemo(
    () =>
      isAr
        ? ['معلق - مفتش', 'معلق - مهندس', 'معلق - إدارة', 'مكتمل']
        : ['Pending Inspector', 'Pending Engineer', 'Pending Admin', 'Finalized'],
    [isAr],
  );

  const statValues = [
    stats.pendingInspector,
    stats.pendingEngineer,
    stats.pendingAdmin,
    stats.finalized,
  ];

  // Filter assessments
  const filteredAssessments = useMemo(() => {
    const items = assessments ?? [];
    if (activeFilter === 'all') return items;
    return items.filter((a) => getAssessmentStatus(a) === activeFilter);
  }, [assessments, activeFilter]);

  const handleCardPress = useCallback(
    (assessment: FinalAssessment) => {
      navigation.navigate('Assessment', { id: assessment.id });
    },
    [navigation],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <View style={[s.container, { backgroundColor: colors.backgroundSecondary ?? '#f5f5f5' }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={s.backArrow}>{isAr ? '>' : '<'}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {isAr ? 'متابعة التقييمات' : 'Assessment Tracking'}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Stat cards — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          {STAT_CARD_CONFIGS.map((cfg, idx) => (
            <StatCard
              key={cfg.key}
              title={statLabels[idx]}
              value={statValues[idx]}
              color={cfg.color}
              bgLight={cfg.bgLight}
            />
          ))}
        </ScrollView>

        {/* Filter tabs */}
        <FilterTabs
          active={activeFilter}
          onChange={setActiveFilter}
          isAr={isAr}
          colors={colors}
        />

        {/* Content */}
        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={s.loader}
          />
        ) : filteredAssessments.length === 0 ? (
          <EmptyState isAr={isAr} colors={colors} />
        ) : (
          filteredAssessments.map((assessment) => (
            <AssessmentCard
              key={assessment.id}
              assessment={assessment}
              isAr={isAr}
              colors={colors}
              onPress={() => handleCardPress(assessment)}
            />
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
    marginBottom: 14,
  },
  statCard: {
    width: 130,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Assessment card
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Verdict row
  verdictRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  verdictChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  verdictDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  verdictLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Escalation
  escalationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  escalationText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Card footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeAgo: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Loading
  loader: {
    marginTop: 40,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
