import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { workPlansApi } from '@inspection/shared';
import type { WorkPlan, WorkPlanDay, WorkPlanJob } from '@inspection/shared';

type BerthTab = 'east' | 'west';

const JOB_TYPE_EMOJI: Record<string, string> = {
  pm: '🔧',
  defect: '🔴',
  inspection: '✅',
};

const PRIORITY_COLORS: Record<string, string> = {
  normal: '#4CAF50',
  high: '#FF9800',
  critical: '#F44336',
};

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatDayHeader(dateStr: string): { day: string; date: string; isToday: boolean } {
  const d = new Date(dateStr);
  const today = new Date().toISOString().split('T')[0];
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    date: d.getDate().toString(),
    isToday: dateStr === today,
  };
}

export default function WorkPlanOverviewScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [berth, setBerth] = useState<BerthTab>('east');
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['work-plans', weekStart],
    queryFn: () => workPlansApi.list({ week_start: weekStart, include_days: true }),
  });

  const workPlan: WorkPlan | undefined = data?.data?.work_plans?.[0];
  const days = workPlan?.days || [];

  const getJobsForBerth = useCallback((day: WorkPlanDay): WorkPlanJob[] => {
    if (berth === 'east') {
      return [...(day.jobs_east || []), ...(day.jobs_both || [])];
    }
    return [...(day.jobs_west || []), ...(day.jobs_both || [])];
  }, [berth]);

  const stats = useMemo(() => {
    let totalJobs = 0;
    let assignedJobs = 0;
    let unassignedJobs = 0;

    days.forEach(day => {
      const jobs = getJobsForBerth(day);
      jobs.forEach(job => {
        totalJobs++;
        if (job.assignments && job.assignments.length > 0) {
          assignedJobs++;
        } else {
          unassignedJobs++;
        }
      });
    });

    return { totalJobs, assignedJobs, unassignedJobs };
  }, [days, getJobsForBerth]);

  const handleJobPress = (job: WorkPlanJob, dayId: number) => {
    navigation.navigate('WorkPlanJobDetail', {
      jobId: job.id,
      planId: workPlan?.id,
      dayId
    });
  };

  const handleCallTeam = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const renderJob = (job: WorkPlanJob, dayId: number) => {
    const priority = job.computed_priority || job.priority || 'normal';
    const priorityColor = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
    const hasNoSAP = !job.sap_order_number;
    const teamCount = job.assignments?.length || 0;
    const leadUser = job.assignments?.find(a => a.is_lead)?.user;

    return (
      <TouchableOpacity
        key={job.id}
        style={[styles.jobCard, hasNoSAP && styles.jobCardNoSAP]}
        onPress={() => handleJobPress(job, dayId)}
        activeOpacity={0.7}
      >
        <View style={styles.jobHeader}>
          <Text style={styles.jobTypeEmoji}>{JOB_TYPE_EMOJI[job.job_type] || '📋'}</Text>
          <View style={styles.jobInfo}>
            <Text style={styles.equipmentName} numberOfLines={1}>
              {job.equipment?.serial_number || job.equipment?.name || job.defect?.description?.substring(0, 30) || 'Job'}
            </Text>
            {job.description && (
              <Text style={styles.jobDescription} numberOfLines={1}>{job.description}</Text>
            )}
          </View>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
        </View>

        <View style={styles.jobMeta}>
          <Text style={styles.hoursText}>{job.estimated_hours}h</Text>

          {job.overdue_value && job.overdue_value > 0 && (
            <View style={styles.overdueTag}>
              <Text style={styles.overdueText}>
                ⏰ {job.overdue_value}{job.overdue_unit === 'hours' ? 'h' : 'd'}
              </Text>
            </View>
          )}

          {hasNoSAP && (
            <View style={styles.noSapTag}>
              <Text style={styles.noSapText}>No SAP</Text>
            </View>
          )}
        </View>

        <View style={styles.teamRow}>
          {teamCount === 0 ? (
            <Text style={styles.unassignedText}>👤 Unassigned</Text>
          ) : (
            <>
              <Text style={styles.teamText}>
                {leadUser ? `👑 ${leadUser.full_name?.split(' ')[0]}` : `👥 ${teamCount} assigned`}
              </Text>
              {(leadUser as any)?.phone && (
                <TouchableOpacity
                  style={styles.callButton}
                  onPress={() => handleCallTeam((leadUser as any).phone)}
                >
                  <Text style={styles.callButtonText}>📞</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderDayCard = ({ item: day }: { item: WorkPlanDay }) => {
    const { day: dayName, date, isToday } = formatDayHeader(day.date);
    const jobs = getJobsForBerth(day);
    const isExpanded = expandedDay === day.id;
    const totalHours = jobs.reduce((sum, j) => sum + (j.estimated_hours || 0), 0);

    return (
      <View style={[styles.dayCard, isToday && styles.dayCardToday]}>
        <TouchableOpacity
          style={styles.dayHeader}
          onPress={() => setExpandedDay(isExpanded ? null : day.id)}
          activeOpacity={0.7}
        >
          <View style={styles.dayInfo}>
            <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{dayName}</Text>
            <Text style={[styles.dayDate, isToday && styles.dayDateToday]}>{date}</Text>
          </View>
          <View style={styles.daySummary}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{jobs.length} jobs</Text>
            </View>
            <Text style={styles.hoursSum}>{totalHours}h</Text>
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.jobsList}>
            {jobs.length === 0 ? (
              <Text style={styles.noJobsText}>No jobs scheduled</Text>
            ) : (
              jobs.map(job => renderJob(job, day.id))
            )}
          </View>
        )}
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('nav.work_planning', 'Work Planning')}</Text>
        {workPlan && (
          <View style={[styles.statusBadge, workPlan.status === 'published' ? styles.statusPublished : styles.statusDraft]}>
            <Text style={styles.statusText}>{workPlan.status.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.navButton} onPress={() => setWeekStart(prev => addWeeks(prev, -1))}>
          <Text style={styles.navButtonText}>◀</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekDisplay} onPress={() => setWeekStart(getWeekStart(new Date()))}>
          <Text style={styles.weekText}>
            {workPlan ? formatWeekRange(workPlan.week_start, workPlan.week_end) : 'No Plan'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => setWeekStart(prev => addWeeks(prev, 1))}>
          <Text style={styles.navButtonText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Berth Tabs */}
      <View style={styles.berthTabs}>
        <TouchableOpacity
          style={[styles.berthTab, berth === 'east' && styles.berthTabActive]}
          onPress={() => setBerth('east')}
        >
          <Text style={[styles.berthTabText, berth === 'east' && styles.berthTabTextActive]}>
            🚢 East
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.berthTab, berth === 'west' && styles.berthTabActive]}
          onPress={() => setBerth('west')}
        >
          <Text style={[styles.berthTabText, berth === 'west' && styles.berthTabTextActive]}>
            ⚓ West
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      {workPlan && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalJobs}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.assignedJobs}</Text>
            <Text style={styles.statLabel}>Assigned</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#FF9800' }]}>{stats.unassignedJobs}</Text>
            <Text style={styles.statLabel}>Unassigned</Text>
          </View>
          {workPlan.pdf_url && (
            <TouchableOpacity style={styles.pdfButton} onPress={() => Linking.openURL(workPlan.pdf_url!)}>
              <Text style={styles.pdfButtonText}>📄 PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Days List */}
      {!workPlan ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Work Plan</Text>
          <Text style={styles.emptySubtitle}>No plan has been created for this week</Text>
        </View>
      ) : (
        <FlatList
          data={days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderDayCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
        />
      )}

      {/* Floating Action Button - Unassigned Jobs */}
      {workPlan && stats.unassignedJobs > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('UnassignedJobs', { planId: workPlan.id })}
        >
          <Text style={styles.fabText}>👤 {stats.unassignedJobs}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#212121' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPublished: { backgroundColor: '#E8F5E9' },
  statusDraft: { backgroundColor: '#FFF3E0' },
  statusText: { fontSize: 11, fontWeight: '600' },

  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: { fontSize: 16, color: '#424242' },
  weekDisplay: { flex: 1, alignItems: 'center' },
  weekText: { fontSize: 15, fontWeight: '600', color: '#212121' },

  berthTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  berthTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  berthTabActive: { backgroundColor: '#1976D2' },
  berthTabText: { fontSize: 14, fontWeight: '500', color: '#616161' },
  berthTabTextActive: { color: '#fff' },

  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1565C0' },
  statLabel: { fontSize: 11, color: '#1976D2', marginTop: 2 },
  pdfButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  pdfButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  listContent: { padding: 12 },

  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  dayCardToday: { borderWidth: 2, borderColor: '#4CAF50' },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  dayInfo: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dayName: { fontSize: 14, fontWeight: '600', color: '#757575' },
  dayNameToday: { color: '#4CAF50' },
  dayDate: { fontSize: 22, fontWeight: 'bold', color: '#212121' },
  dayDateToday: { color: '#4CAF50' },
  daySummary: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1976D2',
    borderRadius: 12,
  },
  countText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  hoursSum: { fontSize: 13, color: '#757575' },
  expandIcon: { fontSize: 12, color: '#9e9e9e' },

  jobsList: { padding: 12, backgroundColor: '#fafafa', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  noJobsText: { textAlign: 'center', color: '#9e9e9e', fontStyle: 'italic', paddingVertical: 16 },

  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    elevation: 1,
  },
  jobCardNoSAP: { borderLeftColor: '#F44336' },
  jobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  jobTypeEmoji: { fontSize: 18, marginRight: 10 },
  jobInfo: { flex: 1 },
  equipmentName: { fontSize: 14, fontWeight: '600', color: '#212121' },
  jobDescription: { fontSize: 12, color: '#757575', marginTop: 2 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },

  jobMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  hoursText: { fontSize: 13, fontWeight: '600', color: '#1976D2' },
  overdueTag: { backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  overdueText: { fontSize: 11, color: '#E65100' },
  noSapTag: { backgroundColor: '#FFEBEE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  noSapText: { fontSize: 11, color: '#C62828' },

  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamText: { fontSize: 12, color: '#616161' },
  unassignedText: { fontSize: 12, color: '#FF9800', fontStyle: 'italic' },
  callButton: { padding: 6 },
  callButtonText: { fontSize: 16 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575' },

  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FF9800',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
