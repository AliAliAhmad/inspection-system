import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData } from '@inspection/shared';
import { useTheme } from '../../hooks/useTheme';
import { StreakIndicator } from '../../components/gamification/StreakIndicator';
import { KPIAlerts, KPIDefinition } from '../../components/shared/KPIAlerts';

function StatCard({ title, value, color, colors }: { title: string; value: string | number; color?: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
        {typeof value === 'number' && color ? (
          <Text style={{ color }}>{value}</Text>
        ) : (
          value
        )}
      </Text>
      <Text style={[styles.statTitle, { color: colors.textSecondary }]}>{title}</Text>
    </View>
  );
}

function QuickLink({ label, icon, onPress, colors }: { label: string; icon: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity style={[styles.quickLink, { backgroundColor: colors.surface }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.quickLinkIcon}>{icon}</Text>
      <Text style={[styles.quickLinkText, { color: colors.primary }]}>{label}</Text>
      <Text style={[styles.quickLinkArrow, { color: colors.textTertiary }]}>›</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer';
  const isAr = i18n.language === 'ar';

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

  const loading = isAdmin ? adminLoading : dashLoading;
  const refetch = isAdmin ? adminRefetch : dashRefetch;

  // Build KPIs from dashboard data
  const kpis: KPIDefinition[] = useMemo(() => {
    if (isAdmin && adminData) {
      return [
        {
          id: 'inspections_today',
          name: 'Inspections Today',
          nameAr: 'الفحوصات اليوم',
          icon: '📋',
          value: adminData.inspections_today,
          target: 10,
          higherIsBetter: true,
          warningThreshold: 0.7,
          criticalThreshold: 0.4,
          unit: '',
          trend: 'stable' as const,
          changePercent: 0,
          period: 'daily',
        },
        {
          id: 'open_defects',
          name: 'Open Defects',
          nameAr: 'العيوب المفتوحة',
          icon: '⚠️',
          value: adminData.open_defects,
          target: 5,
          higherIsBetter: false,
          warningThreshold: 0.8,
          criticalThreshold: 1.2,
          unit: '',
          trend: adminData.open_defects > 5 ? 'up' as const : 'down' as const,
          changePercent: 0,
          period: 'daily',
        },
      ];
    }
    if (!isAdmin && dashData) {
      return [
        {
          id: 'completion_rate',
          name: 'Completion Rate',
          nameAr: 'معدل الإنجاز',
          icon: '✅',
          value: dashData.completion_rate,
          target: 100,
          higherIsBetter: true,
          warningThreshold: 0.7,
          criticalThreshold: 0.5,
          unit: '%',
          trend: dashData.completion_rate >= 80 ? 'up' as const : 'down' as const,
          changePercent: 0,
          period: 'daily',
        },
      ];
    }
    return [];
  }, [isAdmin, adminData, dashData]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return isAr ? 'صباح الخير' : 'Good Morning';
    if (hour < 17) return isAr ? 'مساء الخير' : 'Good Afternoon';
    return isAr ? 'مساء الخير' : 'Good Evening';
  }, [isAr]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      {/* Welcome header with streak */}
      <View style={[styles.welcomeHeader, { backgroundColor: colors.primary }]}>
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeTextContainer}>
            <Text style={styles.greetingText}>{greeting}</Text>
            <Text style={styles.welcomeName}>{user?.full_name}</Text>
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
      ) : isAdmin && adminData ? (
        <>
          {/* KPI Alerts */}
          {kpis.length > 0 && (
            <View style={styles.sectionContainer}>
              <KPIAlerts kpis={kpis} compact={true} columns={2} />
            </View>
          )}

          {/* Stats Grid */}
          <View style={styles.grid}>
            <StatCard title={t('nav.users')} value={adminData.users_count} colors={colors} />
            <StatCard title={t('nav.equipment')} value={adminData.equipment_count} colors={colors} />
            <StatCard title={t('nav.inspections')} value={adminData.inspections_today} colors={colors} />
            <StatCard title={t('nav.defects')} value={adminData.open_defects} color={adminData.open_defects > 0 ? '#cf1322' : undefined} colors={colors} />
            <StatCard title={t('nav.leaves')} value={adminData.active_leaves} colors={colors} />
          </View>

          {/* Communication Quick Access */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isAr ? 'التواصل' : 'Communication'}
          </Text>
          <QuickLink icon="💬" label={isAr ? 'محادثات الفريق' : 'Team Chat'} onPress={() => navigation.navigate('ChannelList')} colors={colors} />

          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
          <QuickLink icon="📋" label={t('nav.routines', 'Inspection Routines')} onPress={() => navigation.navigate('InspectionRoutines')} colors={colors} />
          <QuickLink icon="⚠️" label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} colors={colors} />
          <QuickLink icon="⚙️" label={t('nav.equipment', 'Equipment')} onPress={() => navigation.navigate('Equipment')} colors={colors} />
          <QuickLink icon="✅" label={t('nav.checklists', 'Checklists')} onPress={() => navigation.navigate('Checklists')} colors={colors} />
          <QuickLink icon="📊" label={t('nav.allInspections', 'All Inspections')} onPress={() => navigation.navigate('AllInspections')} colors={colors} />
          <QuickLink icon="🔧" label={t('nav.allSpecialistJobs', 'Specialist Jobs')} onPress={() => navigation.navigate('AllSpecialistJobs')} colors={colors} />
          <QuickLink icon="👷" label={t('nav.allEngineerJobs', 'Engineer Jobs')} onPress={() => navigation.navigate('AllEngineerJobs')} colors={colors} />
          <QuickLink icon="📅" label={t('nav.schedules', 'Schedules')} onPress={() => navigation.navigate('Schedules')} colors={colors} />
          <QuickLink icon="👥" label={t('nav.teamRoster', 'Team Roster')} onPress={() => navigation.navigate('TeamRoster')} colors={colors} />
          <QuickLink icon="📦" label={t('nav.backlog', 'Backlog')} onPress={() => navigation.navigate('Backlog')} colors={colors} />
          <QuickLink icon="🏖️" label={t('nav.leaveApprovals', 'Leave Approvals')} onPress={() => navigation.navigate('LeaveApprovals')} colors={colors} />
          <QuickLink icon="💰" label={t('nav.bonusApprovals', 'Bonus Approvals')} onPress={() => navigation.navigate('BonusApprovals')} colors={colors} />
          <QuickLink icon="📌" label={t('nav.inspectionAssignments', 'Assignment Lists')} onPress={() => navigation.navigate('InspectionAssignments')} colors={colors} />
          <QuickLink icon="🔍" label={t('nav.qualityReviews', 'Quality Reviews')} onPress={() => navigation.navigate('QualityReviewsAdmin')} colors={colors} />
        </>
      ) : dashData ? (
        <>
          {/* KPI Alerts */}
          {kpis.length > 0 && (
            <View style={styles.sectionContainer}>
              <KPIAlerts kpis={kpis} compact={true} columns={1} />
            </View>
          )}

          {/* Stats Grid */}
          <View style={styles.grid}>
            <StatCard title={t('nav.inspections')} value={dashData.total_inspections} colors={colors} />
            <StatCard title={t('nav.defects')} value={dashData.pending_defects} color={dashData.pending_defects > 0 ? '#cf1322' : undefined} colors={colors} />
            <StatCard title={isAr ? 'المهام النشطة' : 'Active Jobs'} value={dashData.active_jobs} colors={colors} />
            <StatCard title={isAr ? 'الإنجاز' : 'Completion'} value={`${dashData.completion_rate}%`} color="#3f8600" colors={colors} />
          </View>

          {/* Communication Quick Access */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isAr ? 'التواصل' : 'Communication'}
          </Text>
          <QuickLink icon="💬" label={isAr ? 'محادثات الفريق' : 'Team Chat'} onPress={() => navigation.navigate('ChannelList')} colors={colors} />

          {isEngineer && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink icon="⚠️" label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} colors={colors} />
            </>
          )}
        </>
      ) : null}

      {/* Bottom padding */}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  welcomeHeader: {
    marginHorizontal: -16,
    marginTop: -16,
    padding: 20,
    paddingTop: 50,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 16,
  },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeTextContainer: {
    flex: 1,
  },
  greetingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  welcomeName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  sectionContainer: {
    marginBottom: 16,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  statCard: {
    width: '47%',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 4,
  },
  statValue: { fontSize: 28, fontWeight: 'bold' },
  statTitle: { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  quickLink: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  quickLinkIcon: { fontSize: 18, marginRight: 12 },
  quickLinkText: { flex: 1, fontSize: 15, fontWeight: '600' },
  quickLinkArrow: { fontSize: 22 },
});
