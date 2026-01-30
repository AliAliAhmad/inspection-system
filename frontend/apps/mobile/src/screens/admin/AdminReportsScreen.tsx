import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  reportsApi,
} from '@inspection/shared';
import type {
  AdminDashboardData,
  PauseAnalytics,
  DefectAnalytics,
  CapacityData,
} from '@inspection/shared';

function StatCard({ title, value, color }: { title: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : undefined]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function ProgressBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <View style={styles.progressBarBg}>
      <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function DataRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.dataRow}>
      {color && <View style={[styles.colorDot, { backgroundColor: color }]} />}
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E53935',
  high: '#FF9800',
  medium: '#FFC107',
  low: '#4CAF50',
};

const STATUS_COLORS: Record<string, string> = {
  open: '#E53935',
  in_progress: '#FF9800',
  resolved: '#4CAF50',
  closed: '#757575',
};

export default function AdminReportsScreen() {
  const { t } = useTranslation();

  const dashboardQuery = useQuery({
    queryKey: ['admin-dashboard-report'],
    queryFn: () => reportsApi.getAdminDashboard(),
  });

  const capacityQuery = useQuery({
    queryKey: ['admin-capacity-report'],
    queryFn: () => reportsApi.getCapacity(),
  });

  const defectQuery = useQuery({
    queryKey: ['admin-defect-analytics'],
    queryFn: () => reportsApi.getDefectAnalytics(),
  });

  const pauseQuery = useQuery({
    queryKey: ['admin-pause-analytics'],
    queryFn: () => reportsApi.getPauseAnalytics(),
  });

  const dashboard: AdminDashboardData | null = (dashboardQuery.data?.data as any)?.data ?? (dashboardQuery.data?.data as any) ?? null;
  const capacity: CapacityData | null = (capacityQuery.data?.data as any)?.data ?? (capacityQuery.data?.data as any) ?? null;
  const defects: DefectAnalytics | null = (defectQuery.data?.data as any)?.data ?? (defectQuery.data?.data as any) ?? null;
  const pauses: PauseAnalytics | null = (pauseQuery.data?.data as any)?.data ?? (pauseQuery.data?.data as any) ?? null;

  const isLoading = dashboardQuery.isLoading || capacityQuery.isLoading || defectQuery.isLoading || pauseQuery.isLoading;
  const isRefetching = dashboardQuery.isRefetching || capacityQuery.isRefetching || defectQuery.isRefetching || pauseQuery.isRefetching;

  const handleRefresh = () => {
    dashboardQuery.refetch();
    capacityQuery.refetch();
    defectQuery.refetch();
    pauseQuery.refetch();
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} />}
    >
      <Text style={styles.title}>{t('nav.reports', 'Reports & Analytics')}</Text>

      {/* Dashboard Stats */}
      {dashboard && (
        <>
          <SectionHeader title={t('reports.dashboard_overview', 'Dashboard Overview')} />
          <View style={styles.grid}>
            <StatCard title={t('reports.users_count', 'Users')} value={dashboard.users_count} color="#1976D2" />
            <StatCard title={t('reports.equipment_count', 'Equipment')} value={dashboard.equipment_count} color="#4CAF50" />
            <StatCard title={t('reports.inspections_today', 'Inspections Today')} value={dashboard.inspections_today} color="#FF9800" />
            <StatCard title={t('reports.open_defects', 'Open Defects')} value={dashboard.open_defects} color={dashboard.open_defects > 0 ? '#E53935' : '#4CAF50'} />
            <StatCard title={t('reports.active_leaves', 'Active Leaves')} value={dashboard.active_leaves} color="#7B1FA2" />
          </View>
        </>
      )}

      {/* Staff Capacity */}
      {capacity && (
        <>
          <SectionHeader title={t('reports.staff_capacity', 'Staff Capacity')} />
          <View style={styles.sectionCard}>
            <View style={styles.capacityRow}>
              <View style={styles.capacityItem}>
                <Text style={styles.capacityValue}>{capacity.total_staff}</Text>
                <Text style={styles.capacityLabel}>{t('reports.total_staff', 'Total')}</Text>
              </View>
              <View style={styles.capacityItem}>
                <Text style={[styles.capacityValue, { color: '#4CAF50' }]}>{capacity.available}</Text>
                <Text style={styles.capacityLabel}>{t('reports.available', 'Available')}</Text>
              </View>
              <View style={styles.capacityItem}>
                <Text style={[styles.capacityValue, { color: '#E53935' }]}>{capacity.on_leave}</Text>
                <Text style={styles.capacityLabel}>{t('reports.on_leave', 'On Leave')}</Text>
              </View>
            </View>
            <Text style={styles.utilizationLabel}>
              {t('reports.utilization_rate', 'Utilization Rate')}: {typeof capacity.utilization_rate === 'number' ? `${Math.round(capacity.utilization_rate * 100)}%` : `${capacity.utilization_rate}%`}
            </Text>
            <ProgressBar
              value={typeof capacity.utilization_rate === 'number' && capacity.utilization_rate <= 1
                ? capacity.utilization_rate * 100
                : Number(capacity.utilization_rate) || 0}
              maxValue={100}
              color="#1976D2"
            />
          </View>
        </>
      )}

      {/* Defect Analytics */}
      {defects && (
        <>
          <SectionHeader title={t('reports.defect_analytics', 'Defect Analytics')} />
          <View style={styles.sectionCard}>
            <DataRow
              label={t('reports.total_defects', 'Total Defects')}
              value={defects.total_defects}
            />

            {defects.by_severity && Object.keys(defects.by_severity).length > 0 && (
              <>
                <Text style={styles.subHeader}>{t('reports.by_severity', 'By Severity')}</Text>
                {Object.entries(defects.by_severity).map(([key, val]) => (
                  <DataRow
                    key={key}
                    label={key}
                    value={val}
                    color={SEVERITY_COLORS[key] ?? '#757575'}
                  />
                ))}
              </>
            )}

            {defects.by_status && Object.keys(defects.by_status).length > 0 && (
              <>
                <Text style={styles.subHeader}>{t('reports.by_status', 'By Status')}</Text>
                {Object.entries(defects.by_status).map(([key, val]) => (
                  <DataRow
                    key={key}
                    label={key.replace(/_/g, ' ')}
                    value={val}
                    color={STATUS_COLORS[key] ?? '#757575'}
                  />
                ))}
              </>
            )}
          </View>
        </>
      )}

      {/* Pause Analytics */}
      {pauses && (
        <>
          <SectionHeader title={t('reports.pause_analytics', 'Pause Analytics')} />
          <View style={styles.sectionCard}>
            <DataRow
              label={t('reports.total_pauses', 'Total Pauses')}
              value={pauses.total_pauses}
            />
            <DataRow
              label={t('reports.avg_duration', 'Average Duration')}
              value={`${Math.round(pauses.average_duration_minutes)} ${t('reports.minutes', 'min')}`}
            />

            {pauses.by_category && Object.keys(pauses.by_category).length > 0 && (
              <>
                <Text style={styles.subHeader}>{t('reports.by_category', 'By Category')}</Text>
                {Object.entries(pauses.by_category).map(([key, val]) => (
                  <DataRow key={key} label={key.replace(/_/g, ' ')} value={val} color="#FF9800" />
                ))}
              </>
            )}
          </View>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#424242',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
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
  },
  statValue: { fontSize: 28, fontWeight: 'bold', color: '#1a1a1a' },
  statTitle: { fontSize: 13, color: '#666', marginTop: 4 },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  capacityItem: { alignItems: 'center' },
  capacityValue: { fontSize: 24, fontWeight: 'bold', color: '#212121' },
  capacityLabel: { fontSize: 12, color: '#757575', marginTop: 4 },
  utilizationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#616161',
    marginTop: 14,
    marginBottom: 6,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dataLabel: {
    flex: 1,
    fontSize: 14,
    color: '#424242',
    textTransform: 'capitalize',
  },
  dataValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  bottomSpacer: { height: 32 },
});
