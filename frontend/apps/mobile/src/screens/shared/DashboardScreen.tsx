import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../providers/AuthProvider';
import {
  reportsApi,
  DashboardData,
  AdminDashboardData,
  inspectionAssignmentsApi,
  MyAssignmentStats,
  shiftHandoverApi,
} from '@inspection/shared';
import { useTheme } from '../../hooks/useTheme';
import { StreakIndicator } from '../../components/gamification/StreakIndicator';

// ─── Inline Components ───────────────────────────────────────

function StatCard({ title, value, color, colors }: { title: string; value: string | number; color?: string; colors: any }) {
  return (
    <View style={[s.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[s.statValue, { color: colors.text }]} numberOfLines={1}>
        {typeof value === 'number' && color ? (
          <Text style={{ color }}>{value}</Text>
        ) : (
          value
        )}
      </Text>
      <Text style={[s.statTitle, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

function QuickLink({ label, icon, onPress, colors }: { label: string; icon: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity style={[s.quickLink, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.quickLinkIcon}>{icon}</Text>
      <Text style={[s.quickLinkText, { color: colors.primary }]}>{label}</Text>
      <Text style={[s.quickLinkArrow, { color: colors.textTertiary }]}>&rsaquo;</Text>
    </TouchableOpacity>
  );
}

// ─── Widget 1: Today's Assignment Summary ──────────────────

function AssignmentSummary({ stats, isAr, colors, onPress }: { stats: MyAssignmentStats; isAr: boolean; colors: any; onPress: () => void }) {
  const { today } = stats;
  return (
    <TouchableOpacity style={[s.widgetCard, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <View style={s.widgetHeader}>
        <Text style={[s.widgetTitle, { color: colors.text }]}>
          {isAr ? 'مهام اليوم' : "Today's Assignments"}
        </Text>
        <Text style={[s.widgetArrow, { color: colors.textTertiary }]}>&rsaquo;</Text>
      </View>
      <View style={s.assignmentRow}>
        <View style={s.assignmentItem}>
          <Text style={[s.assignmentValue, { color: '#2196F3' }]}>{today.assigned}</Text>
          <Text style={[s.assignmentLabel, { color: colors.textSecondary }]}>
            {isAr ? 'معين' : 'Assigned'}
          </Text>
        </View>
        <View style={[s.assignmentDivider, { backgroundColor: colors.border }]} />
        <View style={s.assignmentItem}>
          <Text style={[s.assignmentValue, { color: '#FF9800' }]}>{today.in_progress}</Text>
          <Text style={[s.assignmentLabel, { color: colors.textSecondary }]}>
            {isAr ? 'قيد العمل' : 'In Progress'}
          </Text>
        </View>
        <View style={[s.assignmentDivider, { backgroundColor: colors.border }]} />
        <View style={s.assignmentItem}>
          <Text style={[s.assignmentValue, { color: '#4CAF50' }]}>{today.completed}</Text>
          <Text style={[s.assignmentLabel, { color: colors.textSecondary }]}>
            {isAr ? 'مكتمل' : 'Done'}
          </Text>
        </View>
        <View style={[s.assignmentDivider, { backgroundColor: colors.border }]} />
        <View style={s.assignmentItem}>
          <Text style={[s.assignmentValue, { color: colors.text }]}>{today.total}</Text>
          <Text style={[s.assignmentLabel, { color: colors.textSecondary }]}>
            {isAr ? 'المجموع' : 'Total'}
          </Text>
        </View>
      </View>
      {stats.backlog_count > 0 && (
        <View style={s.backlogBadge}>
          <Text style={s.backlogText}>
            {isAr ? `${stats.backlog_count} متأخر` : `${stats.backlog_count} overdue`}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Widget 2: Quick Actions ───────────────────────────────

function QuickActions({ isAr, colors, navigation }: { isAr: boolean; colors: any; navigation: any }) {
  const actions = [
    { icon: '📋', label: isAr ? 'بدء فحص' : 'Start Inspection', screen: 'MyAssignments', color: '#1976D2' },
    { icon: '⚠️', label: isAr ? 'إبلاغ عيب' : 'Report Defect', screen: 'Defects', color: '#E53935' },
    { icon: '📅', label: isAr ? 'خطة العمل' : 'Work Plan', screen: 'MyWorkPlan', color: '#7B1FA2' },
    { icon: '💬', label: isAr ? 'محادثة' : 'Team Chat', screen: 'ChannelList', color: '#00897B' },
  ];

  return (
    <View style={s.quickActionsGrid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.screen}
          style={[s.quickActionCard, { backgroundColor: colors.surface }]}
          onPress={() => navigation.navigate(a.screen)}
          activeOpacity={0.7}
        >
          <View style={[s.quickActionIcon, { backgroundColor: a.color + '18' }]}>
            <Text style={s.quickActionEmoji}>{a.icon}</Text>
          </View>
          <Text style={[s.quickActionLabel, { color: colors.text }]} numberOfLines={1}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Widget 3: Weekly Trend Mini-chart ─────────────────────

function WeeklyTrend({ trend, isAr, colors }: { trend: MyAssignmentStats['daily_trend']; isAr: boolean; colors: any }) {
  if (!trend || trend.length === 0) return null;

  const maxVal = Math.max(...trend.map(d => d.total), 1);

  return (
    <View style={[s.widgetCard, { backgroundColor: colors.surface }]}>
      <Text style={[s.widgetTitle, { color: colors.text }]}>
        {isAr ? 'الأداء الأسبوعي' : 'Weekly Performance'}
      </Text>
      <View style={s.trendContainer}>
        {trend.map((day, i) => {
          const totalH = Math.max((day.total / maxVal) * 60, 4);
          const completedH = day.total > 0 ? (day.completed / day.total) * totalH : 0;
          const isToday = i === trend.length - 1;
          return (
            <View key={day.date} style={s.trendDay}>
              <View style={[s.trendBarBg, { height: totalH, backgroundColor: colors.border }]}>
                <View style={[s.trendBarFill, { height: completedH, backgroundColor: isToday ? '#1976D2' : '#4CAF50' }]} />
              </View>
              <Text style={[s.trendLabel, { color: isToday ? colors.primary : colors.textTertiary }]}>
                {day.day_name?.substring(0, 2) || ''}
              </Text>
              {isToday && <View style={s.todayDot} />}
            </View>
          );
        })}
      </View>
      <View style={s.trendLegend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: '#4CAF50' }]} />
          <Text style={[s.legendText, { color: colors.textSecondary }]}>
            {isAr ? 'مكتمل' : 'Completed'}
          </Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: colors.border }]} />
          <Text style={[s.legendText, { color: colors.textSecondary }]}>
            {isAr ? 'المجموع' : 'Total'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Widget 4: Shift Handover Card ─────────────────────────

function ShiftHandoverCard({ isAr, colors, navigation }: { isAr: boolean; colors: any; navigation: any }) {
  const queryClient = useQueryClient();
  const { data: pendingHandovers } = useQuery({
    queryKey: ['shift-handover-pending'],
    queryFn: () => shiftHandoverApi.getPending().then(r => (r.data as any).data ?? []),
    staleTime: 2 * 60 * 1000,
  });

  const { data: latestHandover } = useQuery({
    queryKey: ['shift-handover-latest'],
    queryFn: () => shiftHandoverApi.getLatest().then(r => (r.data as any).data ?? null),
    staleTime: 2 * 60 * 1000,
  });

  const pendingCount = pendingHandovers?.length ?? 0;

  return (
    <View style={[s.widgetCard, { backgroundColor: colors.surface }]}>
      <View style={s.widgetHeader}>
        <Text style={[s.widgetTitle, { color: colors.text }]}>
          {isAr ? 'تسليم الوردية' : 'Shift Handover'}
        </Text>
        {pendingCount > 0 && (
          <View style={s.pendingBadge}>
            <Text style={s.pendingBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </View>

      {latestHandover ? (
        <View style={s.handoverContent}>
          <View style={s.handoverInfo}>
            <Text style={[s.handoverFrom, { color: colors.textSecondary }]}>
              {isAr ? 'من:' : 'From:'} {latestHandover.outgoing_user_name}
            </Text>
            <Text style={[s.handoverShift, { color: colors.textTertiary }]}>
              {latestHandover.shift_type} - {latestHandover.shift_date}
            </Text>
          </View>
          {latestHandover.pending_items?.length > 0 && (
            <Text style={[s.handoverPending, { color: '#E65100' }]}>
              {latestHandover.pending_items.length} {isAr ? 'عناصر معلقة' : 'pending items'}
            </Text>
          )}
          {latestHandover.safety_alerts?.length > 0 && (
            <Text style={[s.handoverAlert, { color: '#C62828' }]}>
              {latestHandover.safety_alerts.length} {isAr ? 'تنبيهات أمان' : 'safety alerts'}
            </Text>
          )}
          {!latestHandover.acknowledged_by_id && (
            <View style={s.handoverActions}>
              <TouchableOpacity
                style={s.acknowledgeBtn}
                onPress={() => {
                  shiftHandoverApi.acknowledge(latestHandover.id).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['shift-handover-pending'] });
                    queryClient.invalidateQueries({ queryKey: ['shift-handover-latest'] });
                  }).catch(() => {});
                }}
              >
                <Text style={s.acknowledgeBtnText}>
                  {isAr ? 'تأكيد الاستلام' : 'Acknowledge'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <Text style={[s.handoverEmpty, { color: colors.textTertiary }]}>
          {isAr ? 'لا توجد ملاحظات تسليم' : 'No handover notes yet'}
        </Text>
      )}

      <TouchableOpacity
        style={[s.createHandoverBtn, { borderColor: colors.border }]}
        onPress={() => navigation.navigate('CreateHandover')}
      >
        <Text style={[s.createHandoverText, { color: colors.primary }]}>
          + {isAr ? 'إنشاء تسليم وردية' : 'Create Shift Handover'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Dashboard ────────────────────────────────────────

export default function DashboardScreen() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer';
  const isAr = i18n.language === 'ar';

  // Dashboard data
  const { data: dashData, isLoading: dashLoading, refetch: dashRefetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard().then(r => r.data.data ?? { total_inspections: 0, pending_defects: 0, active_jobs: 0, completion_rate: 0 }),
    enabled: !isAdmin,
  });

  const { data: adminData, isLoading: adminLoading, refetch: adminRefetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard().then(r => r.data.data),
    enabled: isAdmin,
  });

  // Personal assignment stats (for assignment summary + weekly trend)
  const { data: myStats, refetch: refetchStats } = useQuery({
    queryKey: ['my-assignment-stats'],
    queryFn: () => inspectionAssignmentsApi.getMyStats().then(r => (r.data as any)?.data as MyAssignmentStats),
    staleTime: 60000,
  });

  const loading = isAdmin ? adminLoading : dashLoading;
  const refetch = () => {
    if (isAdmin) adminRefetch();
    else dashRefetch();
    refetchStats();
  };

  // Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return isAr ? 'صباح الخير' : 'Good Morning';
    if (hour < 17) return isAr ? 'مساء الخير' : 'Good Afternoon';
    return isAr ? 'مساء الخير' : 'Good Evening';
  }, [isAr]);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.backgroundSecondary }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      {/* Welcome header */}
      <View style={[s.welcomeHeader, { backgroundColor: colors.primary }]}>
        <View style={s.welcomeRow}>
          <View style={s.welcomeTextContainer}>
            <Text style={s.greetingText}>{greeting}</Text>
            <View style={s.nameRow}>
              <Text style={s.welcomeName}>{user?.full_name}</Text>
              <View style={s.starBadge}>
                <Text style={s.starText}>⭐ {(user as any)?.total_stars ?? 0}</Text>
              </View>
            </View>
          </View>
          <StreakIndicator
            currentStreak={user?.total_points ? Math.min(Math.floor(user.total_points / 10), 30) : 0}
            size="compact"
            animate={true}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <>
          {/* === Widget 2: Quick Actions (always shown first) === */}
          <QuickActions isAr={isAr} colors={colors} navigation={navigation} />

          {/* === Widget 1: Today's Assignment Summary === */}
          {myStats && (
            <AssignmentSummary
              stats={myStats}
              isAr={isAr}
              colors={colors}
              onPress={() => navigation.navigate('MyAssignments')}
            />
          )}

          {/* === Stats Grid === */}
          {isAdmin && adminData ? (
            <View style={s.grid}>
              <StatCard title={t('nav.users')} value={adminData.users_count} colors={colors} />
              <StatCard title={t('nav.equipment')} value={adminData.equipment_count} colors={colors} />
              <StatCard title={t('nav.inspections')} value={adminData.inspections_today} colors={colors} />
              <StatCard title={t('nav.defects')} value={adminData.open_defects} color={adminData.open_defects > 0 ? '#cf1322' : undefined} colors={colors} />
              <StatCard title={t('nav.leaves')} value={adminData.active_leaves} colors={colors} />
            </View>
          ) : dashData ? (
            <View style={s.grid}>
              <StatCard title={t('nav.inspections')} value={dashData.total_inspections} colors={colors} />
              <StatCard title={t('nav.defects')} value={dashData.pending_defects} color={dashData.pending_defects > 0 ? '#cf1322' : undefined} colors={colors} />
              <StatCard title={isAr ? 'المهام النشطة' : 'Active Jobs'} value={dashData.active_jobs} colors={colors} />
              <StatCard title={isAr ? 'الإنجاز' : 'Completion'} value={`${dashData.completion_rate}%`} color="#3f8600" colors={colors} />
              <StatCard title={isAr ? 'غير مكتمل' : 'Incomplete'} value={`${(dashData as any).incomplete_rate ?? 0}%`} color={(dashData as any).incomplete_rate > 0 ? '#cf1322' : '#8c8c8c'} colors={colors} />
              <StatCard title={isAr ? 'النجوم' : 'Stars'} value={`${(dashData as any).total_stars ?? 0}`} color="#faad14" colors={colors} />
            </View>
          ) : null}

          {/* === Widget 3: Weekly Trend === */}
          {myStats?.daily_trend && myStats.daily_trend.length > 0 && (
            <WeeklyTrend trend={myStats.daily_trend} isAr={isAr} colors={colors} />
          )}

          {/* === Widget 4: Shift Handover === */}
          <ShiftHandoverCard isAr={isAr} colors={colors} navigation={navigation} />

          {/* === Admin Quick Links === */}
          {isAdmin && (
            <>
              <Text style={[s.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink icon="📋" label={t('nav.routines', 'Inspection Routines')} onPress={() => navigation.navigate('InspectionRoutines')} colors={colors} />
              <QuickLink icon="⚙️" label={t('nav.equipment', 'Equipment')} onPress={() => navigation.navigate('Equipment')} colors={colors} />
              <QuickLink icon="✅" label={t('nav.checklists', 'Checklists')} onPress={() => navigation.navigate('Checklists')} colors={colors} />
              <QuickLink icon="📊" label={t('nav.allInspections', 'All Inspections')} onPress={() => navigation.navigate('AllInspections')} colors={colors} />
              <QuickLink icon="🔧" label={t('nav.allSpecialistJobs', 'Specialist Jobs')} onPress={() => navigation.navigate('AllSpecialistJobs')} colors={colors} />
              <QuickLink icon="👷" label={t('nav.allEngineerJobs', 'Engineer Jobs')} onPress={() => navigation.navigate('AllEngineerJobs')} colors={colors} />
              <QuickLink icon="📅" label={t('nav.schedules', 'Schedules')} onPress={() => navigation.navigate('Schedules')} colors={colors} />
              <QuickLink icon="👥" label={t('nav.teamRoster', 'Team Roster')} onPress={() => navigation.navigate('TeamRoster')} colors={colors} />
              <QuickLink icon="📦" label={t('nav.backlog', 'Backlog')} onPress={() => navigation.navigate('Backlog')} colors={colors} />
              <QuickLink icon="🏖️" label={t('nav.leaveApprovals', 'Leave Approvals')} onPress={() => navigation.navigate('LeaveApprovals')} colors={colors} />
              <QuickLink icon="📌" label={t('nav.inspectionAssignments', 'Assignment Lists')} onPress={() => navigation.navigate('InspectionAssignments')} colors={colors} />
              <QuickLink icon="🔍" label={t('nav.qualityReviews', 'Quality Reviews')} onPress={() => navigation.navigate('QualityReviewsAdmin')} colors={colors} />
            </>
          )}

          {isEngineer && (
            <>
              <Text style={[s.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink icon="⚠️" label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} colors={colors} />
            </>
          )}
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  welcomeHeader: {
    marginHorizontal: -16, marginTop: -16,
    paddingHorizontal: 20, paddingTop: 30, paddingBottom: 10,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    marginBottom: 16,
  },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  welcomeTextContainer: { flex: 1 },
  greetingText: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  welcomeName: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
  },
  starText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },

  // Quick Actions grid
  quickActionsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickActionCard: {
    flex: 1, borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  quickActionIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  quickActionEmoji: { fontSize: 22 },
  quickActionLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  // Widget card (shared)
  widgetCard: {
    borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  widgetTitle: { fontSize: 15, fontWeight: '700' },
  widgetArrow: { fontSize: 22 },

  // Assignment Summary
  assignmentRow: { flexDirection: 'row', alignItems: 'center' },
  assignmentItem: { flex: 1, alignItems: 'center' },
  assignmentValue: { fontSize: 24, fontWeight: '800' },
  assignmentLabel: { fontSize: 11, marginTop: 2 },
  assignmentDivider: { width: 1, height: 30, marginHorizontal: 4 },
  backlogBadge: {
    backgroundColor: '#FFF3E0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 10, alignSelf: 'flex-start',
  },
  backlogText: { fontSize: 12, fontWeight: '600', color: '#E65100' },

  // Stats grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: {
    width: '47%', borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, marginBottom: 4,
  },
  statValue: { fontSize: 26, fontWeight: 'bold' },
  statTitle: { fontSize: 12, marginTop: 2 },

  // Weekly Trend
  trendContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 80, marginBottom: 8 },
  trendDay: { alignItems: 'center', flex: 1 },
  trendBarBg: { width: 18, borderRadius: 9, justifyContent: 'flex-end', overflow: 'hidden' },
  trendBarFill: { width: '100%', borderRadius: 9 },
  trendLabel: { fontSize: 10, fontWeight: '600', marginTop: 4 },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#1976D2', marginTop: 2 },
  trendLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10 },

  // Shift Handover
  handoverContent: { marginBottom: 10 },
  handoverInfo: { marginBottom: 6 },
  handoverFrom: { fontSize: 13, fontWeight: '500' },
  handoverShift: { fontSize: 11, marginTop: 2 },
  handoverPending: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  handoverAlert: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  handoverEmpty: { fontSize: 13, marginBottom: 10, textAlign: 'center', paddingVertical: 8 },
  handoverActions: { marginTop: 8 },
  acknowledgeBtn: {
    backgroundColor: '#1976D2', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start',
  },
  acknowledgeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pendingBadge: {
    backgroundColor: '#E53935', borderRadius: 10,
    minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  pendingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  createHandoverBtn: {
    borderWidth: 1.5, borderRadius: 10, borderStyle: 'dashed',
    paddingVertical: 10, alignItems: 'center',
  },
  createHandoverText: { fontSize: 13, fontWeight: '600' },

  // Quick Links
  quickLink: {
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  quickLinkIcon: { fontSize: 18, marginRight: 12 },
  quickLinkText: { flex: 1, fontSize: 15, fontWeight: '600' },
  quickLinkArrow: { fontSize: 22 },

  sectionContainer: { marginBottom: 16 },
});
