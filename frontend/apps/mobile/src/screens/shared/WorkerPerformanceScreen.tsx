/**
 * Worker Performance Screen
 * Shows personal stats, streaks, daily/weekly/monthly performance.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlanTrackingApi } from '@inspection/shared';
import type { PerformancePeriod, WorkPlanPerformance } from '@inspection/shared';

type PeriodTab = 'daily' | 'weekly' | 'monthly';

const PERIOD_TABS: { key: PeriodTab; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

export default function WorkerPerformanceScreen() {
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState<PeriodTab>('daily');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-performance', activePeriod],
    queryFn: () => workPlanTrackingApi.getMyPerformance({ period: activePeriod }),
  });

  const { data: streakData } = useQuery({
    queryKey: ['my-streak'],
    queryFn: () => workPlanTrackingApi.getStreaks(),
  });

  const performances = data?.data?.performances || [];
  const currentStreak = streakData?.data?.current_streak || 0;
  const maxStreak = streakData?.data?.max_streak || 0;

  const renderStarRating = (rating: number | null) => {
    if (rating === null || rating === undefined) return '--';
    const stars = Math.round(rating);
    return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 7 - stars)) + ` ${rating}`;
  };

  const renderPerformanceCard = (perf: WorkPlanPerformance, index: number) => {
    const completionColor = perf.completion_rate >= 90 ? '#4CAF50' : perf.completion_rate >= 70 ? '#FF9800' : '#F44336';

    return (
      <View key={perf.id || index} style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardDate}>{perf.period_start}</Text>
          <View style={[styles.completionBadge, { backgroundColor: completionColor }]}>
            <Text style={styles.completionText}>{perf.completion_rate}%</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{perf.total_jobs_completed}/{perf.total_jobs_assigned}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{perf.total_actual_hours}h</Text>
            <Text style={styles.statLabel}>Actual Hours</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{perf.total_points_earned}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>

        <View style={styles.ratingsRow}>
          {perf.avg_time_rating !== null && (
            <Text style={styles.ratingText}>Time: {renderStarRating(perf.avg_time_rating)}</Text>
          )}
          {perf.avg_qc_rating !== null && (
            <Text style={styles.ratingText}>QC: {perf.avg_qc_rating}/5</Text>
          )}
        </View>

        {perf.total_jobs_incomplete > 0 && (
          <Text style={styles.incompleteText}>
            {perf.total_jobs_incomplete} incomplete, {perf.total_jobs_carried_over} carried over
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Streak section */}
      <View style={styles.streakContainer}>
        <View style={styles.streakBox}>
          <Text style={styles.streakNumber}>{currentStreak}</Text>
          <Text style={styles.streakLabel}>Current Streak</Text>
        </View>
        <View style={styles.streakBox}>
          <Text style={styles.streakNumber}>{maxStreak}</Text>
          <Text style={styles.streakLabel}>Best Streak</Text>
        </View>
      </View>

      {/* Period tabs */}
      <View style={styles.tabContainer}>
        {PERIOD_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activePeriod === tab.key && styles.tabActive]}
            onPress={() => setActivePeriod(tab.key)}
          >
            <Text style={[styles.tabText, activePeriod === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Performance cards */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#1976D2" style={{ marginTop: 40 }} />
      ) : performances.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No performance data yet</Text>
        </View>
      ) : (
        performances.map((perf: WorkPlanPerformance, i: number) => renderPerformanceCard(perf, i))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  streakContainer: { flexDirection: 'row', justifyContent: 'space-around', padding: 16, backgroundColor: '#1976D2' },
  streakBox: { alignItems: 'center' },
  streakNumber: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  streakLabel: { fontSize: 13, color: '#B3D4FC', marginTop: 2 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 8, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#1976D2' },
  tabText: { fontSize: 14, color: '#666' },
  tabTextActive: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, borderRadius: 8, padding: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardDate: { fontSize: 15, fontWeight: '600', color: '#333' },
  completionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  completionText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: '#E0E0E0' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#999', marginTop: 2 },
  ratingsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E0E0E0' },
  ratingText: { fontSize: 12, color: '#666' },
  incompleteText: { fontSize: 12, color: '#F44336', marginTop: 6, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#999' },
});
