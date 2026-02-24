import React, { useRef, useMemo } from 'react';
import { scale, vscale, mscale, fontScale } from '../../utils/scale';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
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
  notificationsApi,
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
    <TouchableOpacity testID="assignment-summary" style={[s.widgetCard, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
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
    { icon: '📋', label: isAr ? 'بدء فحص' : 'Start Inspection', screen: 'Assignments', color: '#1976D2' },
    { icon: '⚠️', label: isAr ? 'إبلاغ عيب' : 'Report Defect', screen: 'Defects', color: '#E53935' },
    { icon: '📅', label: isAr ? 'خطة العمل' : 'Work Plan', screen: 'WorkPlanOverview', color: '#7B1FA2' },
    { icon: '💬', label: isAr ? 'محادثة' : 'Team Chat', screen: 'ChannelList', color: '#00897B' },
  ];

  return (
    <View style={s.quickActionsGrid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.screen}
          testID={`quick-action-${a.screen}`}
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
                testID="acknowledge-handover-btn"
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
        testID="create-handover-btn"
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

// ─── Widget: Start Next Inspection ──────────────────────────

function StartNextInspectionCard({ colors, navigation, isAr }: { colors: any; navigation: any; isAr: boolean }) {
  const { t } = useTranslation();

  const { data: nextAssignment, isLoading } = useQuery({
    queryKey: ['next-assignment'],
    queryFn: () =>
      inspectionAssignmentsApi
        .getMyAssignments({ status: 'assigned', per_page: 1 })
        .then(r => {
          const items = (r.data as any)?.data?.items ?? (r.data as any)?.data ?? [];
          return Array.isArray(items) && items.length > 0 ? items[0] : null;
        }),
    staleTime: 60000,
  });

  if (isLoading) return null;

  if (!nextAssignment) {
    return (
      <View style={[s.nextInspectionCard, { backgroundColor: '#E8F5E9' }]}>
        <View style={s.nextInspectionContent}>
          <Text style={s.nextInspectionIcon}>✅</Text>
          <Text style={[s.allCaughtUpText, { color: '#2E7D32' }]}>
            {t('dashboard.all_caught_up')}
          </Text>
        </View>
      </View>
    );
  }

  const equipmentName = isAr
    ? (nextAssignment.equipment?.name_ar || nextAssignment.equipment?.name || `#${nextAssignment.equipment_id}`)
    : (nextAssignment.equipment?.name || `#${nextAssignment.equipment_id}`);

  return (
    <TouchableOpacity
      testID="start-next-inspection"
      style={[s.nextInspectionCard, { backgroundColor: '#1565C0' }]}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('InspectionWizard', { id: nextAssignment.id })}
    >
      <View style={s.nextInspectionContent}>
        <View style={s.nextInspectionIconContainer}>
          <Text style={s.nextInspectionIcon}>🔧</Text>
        </View>
        <View style={s.nextInspectionTextContainer}>
          <Text style={s.nextInspectionTitle}>
            {t('dashboard.next_inspection')}
          </Text>
          <Text style={s.nextInspectionEquipment} numberOfLines={1}>
            {equipmentName}
          </Text>
          <Text style={s.nextInspectionTap}>
            {t('dashboard.tap_to_start')}
          </Text>
        </View>
        <Text style={s.nextInspectionArrow}>›</Text>
      </View>
    </TouchableOpacity>
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
  const isAdminOrEngineer = isAdmin || isEngineer;
  const isInspector = user?.role === 'inspector' || user?.role === 'specialist';
  const isAr = i18n.language === 'ar';

  // Dashboard data — inspectors/specialists see their own stats, admin/engineers see the full picture
  const { data: dashData, isLoading: dashLoading, refetch: dashRefetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.getDashboard().then(r => r.data.data ?? { total_inspections: 0, pending_defects: 0, active_jobs: 0, completion_rate: 0 }),
    enabled: !isAdminOrEngineer,
  });

  const { data: adminData, isLoading: adminLoading, refetch: adminRefetch } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => reportsApi.getAdminDashboard().then(r => r.data.data),
    enabled: isAdminOrEngineer,
  });

  // Personal assignment stats (for assignment summary + weekly trend)
  const { data: myStats, refetch: refetchStats } = useQuery({
    queryKey: ['my-assignment-stats'],
    queryFn: () => inspectionAssignmentsApi.getMyStats().then(r => (r.data as any)?.data as MyAssignmentStats),
    staleTime: 60000,
  });

  // Unread notification count — auto-refresh every 30 seconds
  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then(r => (r.data as any)?.count ?? (r.data as any)?.data?.count ?? 0),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const unreadCount: number = typeof unreadData === 'number' ? unreadData : 0;

  const loading = isAdminOrEngineer ? adminLoading : dashLoading;
  const refetch = () => {
    if (isAdminOrEngineer) adminRefetch();
    else dashRefetch();
    refetchStats();
  };

  // Scroll-to-top when tab is tapped (React Navigation standard hook)
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  // Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return isAr ? 'صباح الخير' : 'Good Morning';
    if (hour < 17) return isAr ? 'مساء الخير' : 'Good Afternoon';
    return isAr ? 'مساء الخير' : 'Good Evening';
  }, [isAr]);

  return (
    <ScrollView
      ref={scrollRef}
      testID="dashboard-screen"
      style={[s.container, { backgroundColor: colors.backgroundSecondary }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      {/* Welcome header */}
      <View style={[s.welcomeHeader, { backgroundColor: colors.primary }]}>
        {/* Bell — top-right corner, above the name row */}
        <TouchableOpacity
          testID="notification-bell"
          style={s.bellContainer}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Text style={s.bellIcon}>{'\u{1F514}'}</Text>
          {unreadCount > 0 && (
            <View style={s.bellBadge}>
              <Text style={s.bellBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={s.welcomeRow}>
          <View style={s.welcomeTextContainer}>
            <Text style={s.greetingText}>{greeting}</Text>
            <View style={s.nameRow}>
              <Text style={s.welcomeName} numberOfLines={1}>{user?.full_name}</Text>
              <View style={s.starBadge}>
                <Text style={s.starText}>⭐ {(user as any)?.inspector_points ?? (user as any)?.specialist_points ?? (user as any)?.engineer_points ?? (user as any)?.total_points ?? 0}</Text>
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
          {/* === Start Next Inspection (inspector/specialist only) === */}
          {isInspector && (
            <StartNextInspectionCard colors={colors} navigation={navigation} isAr={isAr} />
          )}

          {/* === Widget 2: Quick Actions (always shown first) === */}
          <QuickActions isAr={isAr} colors={colors} navigation={navigation} />

          {/* === Widget 1: Today's Assignment Summary === */}
          {myStats && (
            <AssignmentSummary
              stats={myStats}
              isAr={isAr}
              colors={colors}
              onPress={() => navigation.navigate('Assignments')}
            />
          )}

          {/* === Stats Grid === */}
          {isAdminOrEngineer && adminData ? (
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
              <QuickLink icon="🎯" label={t('nav.assessmentTracking', 'Assessment Tracking')} onPress={() => navigation.navigate('AssessmentTracking')} colors={colors} />
              <QuickLink icon="🔍" label={t('nav.monitorFollowups', 'Monitor Follow-Ups')} onPress={() => navigation.navigate('MonitorFollowups')} colors={colors} />
            </>
          )}

          {isEngineer && (
            <>
              <Text style={[s.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink icon="⚠️" label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} colors={colors} />
              <QuickLink icon="⚙️" label={t('nav.equipment', 'Equipment')} onPress={() => navigation.navigate('Equipment')} colors={colors} />
              <QuickLink icon="📊" label={t('nav.allInspections', 'All Inspections')} onPress={() => navigation.navigate('AllInspections')} colors={colors} />
              <QuickLink icon="📅" label={t('nav.schedules', 'Schedules')} onPress={() => navigation.navigate('Schedules')} colors={colors} />
              <QuickLink icon="👥" label={t('nav.teamRoster', 'Team Roster')} onPress={() => navigation.navigate('TeamRoster')} colors={colors} />
              <QuickLink icon="📦" label={t('nav.backlog', 'Backlog')} onPress={() => navigation.navigate('Backlog')} colors={colors} />
              <QuickLink icon="🎯" label={t('nav.assessmentTracking', 'Assessment Tracking')} onPress={() => navigation.navigate('AssessmentTracking')} colors={colors} />
              <QuickLink icon="🔍" label={t('nav.monitorFollowups', 'Monitor Follow-Ups')} onPress={() => navigation.navigate('MonitorFollowups')} colors={colors} />
            </>
          )}

          {user?.role === 'quality_engineer' && (
            <>
              <Text style={[s.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink icon="⭐" label={t('nav.pendingReviews', 'Pending Reviews')} onPress={() => navigation.navigate('PendingReviews')} colors={colors} />
              <QuickLink icon="⏰" label={t('nav.overdueReviews', 'Overdue Reviews')} onPress={() => navigation.navigate('OverdueReviews')} colors={colors} />
              <QuickLink icon="📊" label={t('nav.allInspections', 'All Inspections')} onPress={() => navigation.navigate('AllInspections')} colors={colors} />
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
  container: { flex: 1, padding: scale(16) },
  welcomeHeader: {
    marginHorizontal: -scale(16), marginTop: -scale(16),
    paddingHorizontal: scale(20), paddingTop: vscale(30), paddingBottom: vscale(10),
    borderBottomLeftRadius: mscale(20), borderBottomRightRadius: mscale(20),
    marginBottom: scale(16),
  },
  welcomeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  welcomeTextContainer: { flex: 1 },
  greetingText: { fontSize: fontScale(16), color: 'rgba(255,255,255,0.8)', marginBottom: vscale(4) },
  welcomeName: { fontSize: fontScale(23), fontWeight: 'bold', color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  starBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: scale(12), paddingVertical: vscale(5), borderRadius: mscale(14),
  },
  starText: { fontSize: fontScale(23), fontWeight: '800', color: '#fff' },

  // Notification bell — absolutely positioned at top-right of welcome header
  bellContainer: {
    position: 'absolute',
    top: vscale(10),
    right: scale(16),
    padding: scale(6),
    zIndex: 10,
  },
  bellIcon: {
    fontSize: fontScale(24),
    color: '#fff',
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#E53935',
    borderRadius: mscale(10),
    minWidth: scale(18),
    height: scale(18),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(4),
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: fontScale(11),
    fontWeight: '700',
    textAlign: 'center',
  },

  sectionTitle: { fontSize: fontScale(18), fontWeight: '700', marginTop: vscale(20), marginBottom: vscale(10) },

  // Quick Actions grid
  quickActionsGrid: { flexDirection: 'row', gap: scale(10), marginBottom: vscale(14) },
  quickActionCard: {
    flex: 1, borderRadius: mscale(14), padding: scale(14), alignItems: 'center',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2,
  },
  quickActionIcon: {
    width: scale(44), height: scale(44), borderRadius: scale(22),
    justifyContent: 'center', alignItems: 'center', marginBottom: vscale(8),
  },
  quickActionEmoji: { fontSize: fontScale(22) },
  quickActionLabel: { fontSize: fontScale(14), fontWeight: '600', textAlign: 'center' },

  // Widget card (shared)
  widgetCard: {
    borderRadius: mscale(14), padding: scale(16), marginBottom: vscale(14),
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2,
  },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vscale(12) },
  widgetTitle: { fontSize: fontScale(17), fontWeight: '700' },
  widgetArrow: { fontSize: fontScale(22) },

  // Assignment Summary
  assignmentRow: { flexDirection: 'row', alignItems: 'center' },
  assignmentItem: { flex: 1, alignItems: 'center' },
  assignmentValue: { fontSize: fontScale(25), fontWeight: '800' },
  assignmentLabel: { fontSize: fontScale(14), marginTop: vscale(2) },
  assignmentDivider: { width: 1, height: vscale(30), marginHorizontal: scale(4) },
  backlogBadge: {
    backgroundColor: '#FFF3E0', borderRadius: mscale(8),
    paddingHorizontal: scale(10), paddingVertical: vscale(4), marginTop: vscale(10), alignSelf: 'flex-start',
  },
  backlogText: { fontSize: fontScale(15), fontWeight: '600', color: '#E65100' },

  // Stats grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginBottom: vscale(8) },
  statCard: {
    width: '47%', borderRadius: mscale(12), padding: scale(14),
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2, marginBottom: vscale(4),
  },
  statValue: { fontSize: fontScale(27), fontWeight: 'bold' },
  statTitle: { fontSize: fontScale(15), marginTop: vscale(2) },

  // Weekly Trend
  trendContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: vscale(80), marginBottom: vscale(8) },
  trendDay: { alignItems: 'center', flex: 1 },
  trendBarBg: { width: scale(18), borderRadius: mscale(9), justifyContent: 'flex-end', overflow: 'hidden' },
  trendBarFill: { width: '100%', borderRadius: mscale(9) },
  trendLabel: { fontSize: fontScale(13), fontWeight: '600', marginTop: vscale(4) },
  todayDot: { width: scale(4), height: scale(4), borderRadius: scale(2), backgroundColor: '#1976D2', marginTop: vscale(2) },
  trendLegend: { flexDirection: 'row', justifyContent: 'center', gap: scale(16), marginTop: vscale(4) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  legendDot: { width: scale(8), height: scale(8), borderRadius: scale(4) },
  legendText: { fontSize: fontScale(13) },

  // Shift Handover
  handoverContent: { marginBottom: vscale(10) },
  handoverInfo: { marginBottom: vscale(6) },
  handoverFrom: { fontSize: fontScale(16), fontWeight: '500' },
  handoverShift: { fontSize: fontScale(14), marginTop: vscale(2) },
  handoverPending: { fontSize: fontScale(15), fontWeight: '600', marginTop: vscale(4) },
  handoverAlert: { fontSize: fontScale(15), fontWeight: '700', marginTop: vscale(2) },
  handoverEmpty: { fontSize: fontScale(16), marginBottom: vscale(10), textAlign: 'center', paddingVertical: vscale(8) },
  handoverActions: { marginTop: vscale(8) },
  acknowledgeBtn: {
    backgroundColor: '#1976D2', borderRadius: mscale(8),
    paddingVertical: vscale(8), paddingHorizontal: scale(16), alignSelf: 'flex-start',
  },
  acknowledgeBtnText: { color: '#fff', fontSize: fontScale(16), fontWeight: '600' },
  pendingBadge: {
    backgroundColor: '#E53935', borderRadius: mscale(10),
    minWidth: scale(20), height: scale(20), justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(5),
  },
  pendingBadgeText: { color: '#fff', fontSize: fontScale(14), fontWeight: '700' },
  createHandoverBtn: {
    borderWidth: 1.5, borderRadius: mscale(10), borderStyle: 'dashed',
    paddingVertical: vscale(10), alignItems: 'center',
  },
  createHandoverText: { fontSize: fontScale(16), fontWeight: '600' },

  // Quick Links
  quickLink: {
    borderRadius: mscale(12), padding: scale(14), flexDirection: 'row', alignItems: 'center', marginBottom: vscale(8),
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)', elevation: 2,
  },
  quickLinkIcon: { fontSize: fontScale(18), marginRight: scale(12) },
  quickLinkText: { flex: 1, fontSize: fontScale(17), fontWeight: '600' },
  quickLinkArrow: { fontSize: fontScale(22) },

  sectionContainer: { marginBottom: vscale(16) },

  // Start Next Inspection card
  nextInspectionCard: {
    borderRadius: mscale(16), padding: scale(18), marginBottom: vscale(14),
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)', elevation: 4,
  },
  nextInspectionContent: {
    flexDirection: 'row', alignItems: 'center',
  },
  nextInspectionIconContainer: {
    width: scale(48), height: scale(48), borderRadius: scale(24),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: scale(14),
  },
  nextInspectionIcon: { fontSize: fontScale(26) },
  nextInspectionTextContainer: { flex: 1 },
  nextInspectionTitle: {
    fontSize: fontScale(14), fontWeight: '600', color: 'rgba(255,255,255,0.85)',
    marginBottom: vscale(2),
  },
  nextInspectionEquipment: {
    fontSize: fontScale(18), fontWeight: '800', color: '#fff',
    marginBottom: vscale(2),
  },
  nextInspectionTap: {
    fontSize: fontScale(13), color: 'rgba(255,255,255,0.7)',
  },
  nextInspectionArrow: {
    fontSize: fontScale(32), fontWeight: '300', color: 'rgba(255,255,255,0.7)',
    marginLeft: scale(8),
  },
  allCaughtUpText: {
    fontSize: fontScale(16), fontWeight: '600', marginLeft: scale(10),
  },
});
