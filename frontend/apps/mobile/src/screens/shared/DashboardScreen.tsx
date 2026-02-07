import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../providers/AuthProvider';
import { reportsApi, DashboardData, AdminDashboardData } from '@inspection/shared';

function StatCard({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue} numberOfLines={1}>
        {typeof value === 'number' && color ? (
          <Text style={{ color }}>{value}</Text>
        ) : (
          value
        )}
      </Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

function QuickLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickLink} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.quickLinkText}>{label}</Text>
      <Text style={styles.quickLinkArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const isAdmin = user?.role === 'admin';
  const isEngineer = user?.role === 'engineer';

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

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
    >
      <Text style={styles.welcome}>
        {t('common.welcome')}, {user?.full_name}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1677ff" style={{ marginTop: 32 }} />
      ) : isAdmin && adminData ? (
        <>
          <View style={styles.grid}>
            <StatCard title={t('nav.users')} value={adminData.users_count} />
            <StatCard title={t('nav.equipment')} value={adminData.equipment_count} />
            <StatCard title={t('nav.inspections')} value={adminData.inspections_today} />
            <StatCard title={t('nav.defects')} value={adminData.open_defects} color={adminData.open_defects > 0 ? '#cf1322' : undefined} />
            <StatCard title={t('nav.leaves')} value={adminData.active_leaves} />
          </View>

          <Text style={styles.sectionTitle}>{t('nav.quick_links', 'Quick Access')}</Text>
          <QuickLink label={t('nav.routines', 'Inspection Routines')} onPress={() => navigation.navigate('InspectionRoutines')} />
          <QuickLink label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} />
          <QuickLink label={t('nav.equipment', 'Equipment')} onPress={() => navigation.navigate('Equipment')} />
          <QuickLink label={t('nav.checklists', 'Checklists')} onPress={() => navigation.navigate('Checklists')} />
          <QuickLink label={t('nav.allInspections', 'All Inspections')} onPress={() => navigation.navigate('AllInspections')} />
          <QuickLink label={t('nav.allSpecialistJobs', 'Specialist Jobs')} onPress={() => navigation.navigate('AllSpecialistJobs')} />
          <QuickLink label={t('nav.allEngineerJobs', 'Engineer Jobs')} onPress={() => navigation.navigate('AllEngineerJobs')} />
          <QuickLink label={t('nav.schedules', 'Schedules')} onPress={() => navigation.navigate('Schedules')} />
          <QuickLink label={t('nav.teamRoster', 'Team Roster')} onPress={() => navigation.navigate('TeamRoster')} />
          <QuickLink label={t('nav.backlog', 'Backlog')} onPress={() => navigation.navigate('Backlog')} />
          <QuickLink label={t('nav.leaveApprovals', 'Leave Approvals')} onPress={() => navigation.navigate('LeaveApprovals')} />
          <QuickLink label={t('nav.bonusApprovals', 'Bonus Approvals')} onPress={() => navigation.navigate('BonusApprovals')} />
          <QuickLink label={t('nav.inspectionAssignments', 'Assignment Lists')} onPress={() => navigation.navigate('InspectionAssignments')} />
          <QuickLink label={t('nav.qualityReviews', 'Quality Reviews')} onPress={() => navigation.navigate('QualityReviewsAdmin')} />
        </>
      ) : dashData ? (
        <>
          <View style={styles.grid}>
            <StatCard title={t('nav.inspections')} value={dashData.total_inspections} />
            <StatCard title={t('nav.defects')} value={dashData.pending_defects} color={dashData.pending_defects > 0 ? '#cf1322' : undefined} />
            <StatCard title="Active Jobs" value={dashData.active_jobs} />
            <StatCard title="Completion" value={`${dashData.completion_rate}%`} color="#3f8600" />
          </View>
          {isEngineer && (
            <>
              <Text style={styles.sectionTitle}>{t('nav.quick_links', 'Quick Access')}</Text>
              <QuickLink label={t('nav.defects', 'Defects')} onPress={() => navigation.navigate('Defects')} />
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  welcome: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1a1a1a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 4,
  },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
  statTitle: { fontSize: 13, color: '#666', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#424242', marginTop: 20, marginBottom: 10 },
  quickLink: {
    backgroundColor: '#fff',
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
  quickLinkText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1976D2' },
  quickLinkArrow: { fontSize: 22, color: '#999' },
});
