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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi } from '@inspection/shared';
import type { MyWorkPlanDay, WorkPlanJob, JobType, JobPriority } from '@inspection/shared';

const JOB_TYPE_COLORS: Record<JobType, string> = {
  pm: '#1976D2',
  defect: '#E53935',
  inspection: '#4CAF50',
};

const PRIORITY_COLORS: Record<JobPriority, string> = {
  low: '#9E9E9E',
  normal: '#2196F3',
  high: '#FF9800',
  urgent: '#F44336',
};

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
  const sDay = s.getDate();
  const eDay = e.getDate();
  const year = e.getFullYear();

  if (sMonth === eMonth) {
    return `${sMonth} ${sDay} - ${eDay}, ${year}`;
  }
  return `${sMonth} ${sDay} - ${eMonth} ${eDay}, ${year}`;
}

export default function MyWorkPlanScreen() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-work-plan', weekStart],
    queryFn: () => workPlansApi.getMyPlan(weekStart),
  });

  const workPlan = data?.data?.work_plan;
  const myJobs: MyWorkPlanDay[] = data?.data?.my_jobs ?? [];
  const totalJobs = data?.data?.total_jobs ?? 0;

  const weekEnd = useMemo(() => {
    if (workPlan?.week_end) return workPlan.week_end;
    return addWeeks(weekStart, 0).replace(/-(\d{2})$/, (_, d) => `-${String(Number(d) + 6).padStart(2, '0')}`);
  }, [weekStart, workPlan]);

  const handlePrevWeek = () => setWeekStart(prev => addWeeks(prev, -1));
  const handleNextWeek = () => setWeekStart(prev => addWeeks(prev, 1));
  const handleToday = () => setWeekStart(getWeekStart(new Date()));

  const handleDownloadPDF = () => {
    if (workPlan?.pdf_url) {
      Linking.openURL(workPlan.pdf_url);
    }
  };

  const toggleDay = (date: string) => {
    setExpandedDay(prev => prev === date ? null : date);
  };

  const renderJobCard = useCallback((job: WorkPlanJob & { is_lead: boolean }) => {
    const typeColor = JOB_TYPE_COLORS[job.job_type] ?? '#757575';
    const priorityColor = PRIORITY_COLORS[job.priority] ?? '#757575';

    return (
      <View key={job.id} style={styles.jobCard}>
        <View style={styles.jobHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>
              {t(`work_plan.job_type_${job.job_type}`, job.job_type.toUpperCase())}
            </Text>
          </View>
          {job.is_lead && (
            <View style={styles.leadBadge}>
              <Text style={styles.leadBadgeText}>{t('work_plan.lead', 'Lead')}</Text>
            </View>
          )}
          {job.priority !== 'normal' && (
            <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
              <Text style={styles.priorityBadgeText}>{job.priority}</Text>
            </View>
          )}
        </View>

        {job.equipment && (
          <Text style={styles.equipmentName}>{job.equipment.name}</Text>
        )}

        {job.defect && (
          <Text style={styles.defectDesc} numberOfLines={2}>
            {job.defect.description}
          </Text>
        )}

        <View style={styles.jobDetails}>
          <Text style={styles.hoursText}>
            {job.estimated_hours}h
          </Text>
          {job.berth && (
            <Text style={styles.berthText}>
              {job.berth.toUpperCase()}
            </Text>
          )}
          {job.assignments.length > 0 && (
            <Text style={styles.teamText}>
              {job.assignments.length} {t('work_plan.team_members', 'members')}
            </Text>
          )}
        </View>

        {job.notes && (
          <Text style={styles.notesText} numberOfLines={2}>
            {job.notes}
          </Text>
        )}
      </View>
    );
  }, [t]);

  const renderDaySection = useCallback(({ item }: { item: MyWorkPlanDay }) => {
    const isExpanded = expandedDay === item.date;
    const isToday = item.date === new Date().toISOString().split('T')[0];
    const jobCount = item.jobs.length;

    return (
      <View style={styles.daySection}>
        <TouchableOpacity
          style={[styles.dayHeader, isToday && styles.dayHeaderToday]}
          onPress={() => toggleDay(item.date)}
          activeOpacity={0.7}
        >
          <View style={styles.dayTitleRow}>
            <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
              {item.day_name}
            </Text>
            <Text style={[styles.dayDate, isToday && styles.dayDateToday]}>
              {formatDate(item.date)}
            </Text>
          </View>
          <View style={styles.dayCountRow}>
            <View style={[styles.countBadge, jobCount === 0 && styles.countBadgeEmpty]}>
              <Text style={[styles.countBadgeText, jobCount === 0 && styles.countBadgeTextEmpty]}>
                {jobCount} {t('work_plan.jobs', 'jobs')}
              </Text>
            </View>
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.jobsContainer}>
            {jobCount === 0 ? (
              <Text style={styles.noJobsText}>
                {t('work_plan.no_jobs_this_day', 'No jobs scheduled for this day')}
              </Text>
            ) : (
              item.jobs.map(job => renderJobCard(job))
            )}
          </View>
        )}
      </View>
    );
  }, [expandedDay, t, renderJobCard]);

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>
          {t('work_plan.no_plan', 'No Work Plan')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {t('work_plan.no_plan_message', 'No work plan has been published for this week.')}
        </Text>
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
        <Text style={styles.errorText}>{t('common.error', 'Error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('nav.my_work_plan', 'My Work Plan')}</Text>

      {/* Week Navigation */}
      <View style={styles.weekNav}>
        <TouchableOpacity style={styles.navButton} onPress={handlePrevWeek}>
          <Text style={styles.navButtonText}>{'<'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekDisplay} onPress={handleToday}>
          <Text style={styles.weekText}>
            {workPlan ? formatWeekRange(workPlan.week_start, workPlan.week_end) : formatWeekRange(weekStart, addWeeks(weekStart, 0))}
          </Text>
          <Text style={styles.tapToday}>{t('work_plan.tap_for_today', 'Tap for today')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={handleNextWeek}>
          <Text style={styles.navButtonText}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* Status Bar */}
      {workPlan && (
        <View style={styles.statusBar}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>{t('work_plan.total_jobs', 'Total Jobs')}:</Text>
            <Text style={styles.statusValue}>{totalJobs}</Text>
          </View>
          {workPlan.pdf_url && (
            <TouchableOpacity style={styles.pdfButton} onPress={handleDownloadPDF}>
              <Text style={styles.pdfButtonText}>{t('work_plan.download_pdf', 'PDF')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Days List */}
      {!workPlan ? (
        renderEmpty()
      ) : (
        <FlatList
          data={myJobs}
          keyExtractor={(item) => item.date}
          renderItem={renderDaySection}
          contentContainerStyle={myJobs.length === 0 ? styles.emptyListContainer : styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },

  // Week Navigation
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: { fontSize: 20, fontWeight: '600', color: '#424242' },
  weekDisplay: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  weekText: { fontSize: 16, fontWeight: '600', color: '#212121' },
  tapToday: { fontSize: 11, color: '#757575', marginTop: 2 },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  statusInfo: { flexDirection: 'row', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: '#1565C0' },
  statusValue: { fontSize: 16, fontWeight: 'bold', color: '#1565C0', marginLeft: 6 },
  pdfButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  pdfButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Day Sections
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  daySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
  },
  dayHeaderToday: { backgroundColor: '#E8F5E9' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  dayName: { fontSize: 16, fontWeight: '600', color: '#212121', marginRight: 8 },
  dayNameToday: { color: '#2E7D32' },
  dayDate: { fontSize: 13, color: '#757575' },
  dayDateToday: { color: '#43A047' },
  dayCountRow: { flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1976D2',
    borderRadius: 12,
    marginRight: 8,
  },
  countBadgeEmpty: { backgroundColor: '#E0E0E0' },
  countBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  countBadgeTextEmpty: { color: '#757575' },
  expandIcon: { fontSize: 12, color: '#757575' },

  // Jobs Container
  jobsContainer: {
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  noJobsText: { fontSize: 14, color: '#757575', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },

  // Job Card
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1976D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  leadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFD700',
    borderRadius: 6,
  },
  leadBadgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityBadgeText: { fontSize: 10, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  equipmentName: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4 },
  defectDesc: { fontSize: 13, color: '#616161', marginBottom: 6 },
  jobDetails: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  hoursText: { fontSize: 13, fontWeight: '600', color: '#1976D2' },
  berthText: { fontSize: 12, color: '#757575', fontWeight: '500' },
  teamText: { fontSize: 12, color: '#757575' },
  notesText: { fontSize: 12, color: '#9E9E9E', marginTop: 6, fontStyle: 'italic' },

  // Empty & Error States
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', paddingHorizontal: 40 },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },
});
