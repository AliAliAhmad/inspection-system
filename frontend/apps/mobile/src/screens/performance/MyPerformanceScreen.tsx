/**
 * MyPerformanceScreen - Worker's own performance dashboard
 *
 * Features:
 * - Performance score card
 * - Active goals with progress bars
 * - Peer rank display
 * - Coaching tips carousel
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  FlatList,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { workPlanTrackingApi, performanceApi } from '@inspection/shared';

import ProgressRing from '../../components/ProgressRing';
import { StatCard } from '../../components/shared/StatCard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Goal {
  id: number;
  title: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  status: 'on_track' | 'at_risk' | 'behind' | 'completed';
}

interface CoachingTip {
  id: number;
  title: string;
  content: string;
  category: string;
}

export default function MyPerformanceScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const tipListRef = useRef<FlatList>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Fetch performance data
  const { data: performanceData, isLoading: loadingPerformance, refetch, isRefetching } = useQuery({
    queryKey: ['my-performance-summary'],
    queryFn: async () => {
      try {
        const response = await workPlanTrackingApi.getMyPerformance({ period: 'monthly' });
        return (response.data as any)?.data ?? response.data;
      } catch {
        return null;
      }
    },
  });

  // Fetch goals
  const { data: goalsData, isLoading: loadingGoals } = useQuery({
    queryKey: ['my-goals'],
    queryFn: async () => {
      try {
        const response = await performanceApi.getMyGoals();
        return ((response.data as any)?.data ?? response.data ?? []) as Goal[];
      } catch {
        return [] as Goal[];
      }
    },
  });

  // Fetch peer ranking
  const { data: rankingData } = useQuery({
    queryKey: ['my-ranking'],
    queryFn: async () => {
      try {
        const response = await performanceApi.getMyRanking();
        return (response.data as any)?.data ?? response.data;
      } catch {
        return { rank: null, total: null, percentile: null };
      }
    },
  });

  // Fetch coaching tips
  const { data: tipsData } = useQuery({
    queryKey: ['coaching-tips'],
    queryFn: async () => {
      try {
        const response = await performanceApi.getCoachingTips();
        return ((response.data as any)?.data ?? response.data ?? []) as CoachingTip[];
      } catch {
        // Return mock tips if API not available
        return [
          { id: 1, title: 'Time Management', content: 'Try to complete jobs within 10% of estimated time for better scores.', category: 'productivity' },
          { id: 2, title: 'Quality Focus', content: 'Double-check your work before marking complete to maintain high QC ratings.', category: 'quality' },
          { id: 3, title: 'Consistency Matters', content: 'Build a streak by completing all daily assignments on time.', category: 'engagement' },
        ] as CoachingTip[];
      }
    },
  });

  const performances = performanceData?.performances || [];
  const latestPerformance = performances[0];
  const goals = goalsData ?? [];
  const tips = tipsData ?? [];
  const ranking = rankingData ?? {};

  // Calculate overall score from latest performance
  const overallScore = latestPerformance
    ? Math.round(
        ((latestPerformance.completion_rate || 0) * 0.4 +
          (latestPerformance.avg_qc_rating || 0) * 20 * 0.3 +
          (latestPerformance.avg_time_rating || 0) * (100 / 7) * 0.3)
      )
    : 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FF9800';
    return '#F44336';
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#4CAF50';
      case 'on_track':
        return '#1976D2';
      case 'at_risk':
        return '#FF9800';
      case 'behind':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  const handleTipScroll = (event: any) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 48));
    setCurrentTipIndex(index);
  };

  const isLoading = loadingPerformance || loadingGoals;

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
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Performance Score Card */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreHeader}>
          <Text style={styles.scoreTitle}>Performance Score</Text>
          <Text style={styles.scorePeriod}>This Month</Text>
        </View>

        <View style={styles.scoreContent}>
          <ProgressRing
            progress={overallScore}
            size={120}
            strokeWidth={10}
            color={getScoreColor(overallScore)}
            showPercentage
          />

          <View style={styles.scoreStats}>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatValue}>
                {latestPerformance?.completion_rate ?? 0}%
              </Text>
              <Text style={styles.scoreStatLabel}>Completion</Text>
            </View>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatValue}>
                {latestPerformance?.avg_qc_rating?.toFixed(1) ?? '--'}
              </Text>
              <Text style={styles.scoreStatLabel}>QC Rating</Text>
            </View>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatValue}>
                {latestPerformance?.total_points_earned ?? 0}
              </Text>
              <Text style={styles.scoreStatLabel}>Points</Text>
            </View>
          </View>
        </View>

        {/* Streak Info */}
        <View style={styles.streakRow}>
          <View style={styles.streakItem}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakValue}>{performanceData?.current_streak || 0}</Text>
            <Text style={styles.streakLabel}>Current Streak</Text>
          </View>
          <View style={styles.streakItem}>
            <Text style={styles.streakIcon}>⭐</Text>
            <Text style={styles.streakValue}>{performanceData?.max_streak || 0}</Text>
            <Text style={styles.streakLabel}>Best Streak</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('Trajectory' as any)}
        >
          <Text style={styles.quickActionIcon}>📈</Text>
          <Text style={styles.quickActionText}>Trajectory</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('SkillGaps' as any)}
        >
          <Text style={styles.quickActionIcon}>🎯</Text>
          <Text style={styles.quickActionText}>Skill Gaps</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => navigation.navigate('Goals' as any)}
        >
          <Text style={styles.quickActionIcon}>🏆</Text>
          <Text style={styles.quickActionText}>Goals</Text>
        </TouchableOpacity>
      </View>

      {/* Peer Rank Display */}
      {ranking.rank && (
        <View style={styles.rankCard}>
          <View style={styles.rankContent}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankNumber}>#{ranking.rank}</Text>
            </View>
            <View style={styles.rankInfo}>
              <Text style={styles.rankTitle}>Your Rank</Text>
              <Text style={styles.rankSubtitle}>
                Out of {ranking.total} {ranking.total === 1 ? 'worker' : 'workers'}
              </Text>
            </View>
            {ranking.percentile && (
              <View style={styles.percentileBadge}>
                <Text style={styles.percentileText}>Top {100 - ranking.percentile}%</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Active Goals */}
      <View style={styles.goalsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Goals</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Goals' as any)}>
            <Text style={styles.seeAllLink}>See All</Text>
          </TouchableOpacity>
        </View>

        {goals.length === 0 ? (
          <View style={styles.emptyGoals}>
            <Text style={styles.emptyGoalsText}>No active goals</Text>
            <TouchableOpacity
              style={styles.createGoalButton}
              onPress={() => navigation.navigate('Goals' as any)}
            >
              <Text style={styles.createGoalButtonText}>Set a Goal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          goals.slice(0, 3).map((goal) => {
            const progress = Math.min(100, (goal.current / goal.target) * 100);
            const statusColor = getGoalStatusColor(goal.status);

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <View style={[styles.goalStatusBadge, { backgroundColor: statusColor }]}>
                    <Text style={styles.goalStatusText}>
                      {goal.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <View style={styles.goalProgress}>
                  <View style={styles.goalProgressTrack}>
                    <View
                      style={[
                        styles.goalProgressFill,
                        { width: `${progress}%`, backgroundColor: statusColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.goalProgressText}>
                    {goal.current}/{goal.target} {goal.unit}
                  </Text>
                </View>

                <Text style={styles.goalDeadline}>Due: {goal.deadline}</Text>
              </View>
            );
          })
        )}
      </View>

      {/* Coaching Tips Carousel */}
      {tips.length > 0 && (
        <View style={styles.tipsSection}>
          <Text style={styles.sectionTitle}>Coaching Tips</Text>

          <FlatList
            ref={tipListRef}
            data={tips}
            keyExtractor={(item) => String(item.id)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleTipScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.tipsContent}
            renderItem={({ item }) => (
              <View style={[styles.tipCard, { width: SCREEN_WIDTH - 48 }]}>
                <View style={styles.tipHeader}>
                  <View style={styles.tipCategoryBadge}>
                    <Text style={styles.tipCategoryText}>{item.category}</Text>
                  </View>
                </View>
                <Text style={styles.tipTitle}>{item.title}</Text>
                <Text style={styles.tipContent}>{item.content}</Text>
              </View>
            )}
          />

          {/* Pagination dots */}
          <View style={styles.tipsPagination}>
            {tips.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  currentTipIndex === index && styles.paginationDotActive,
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickStatsContent}
        >
          <StatCard
            label="Jobs Done"
            value={latestPerformance?.total_jobs_completed ?? 0}
            color="#4CAF50"
            size="medium"
          />
          <StatCard
            label="Hours Worked"
            value={latestPerformance?.total_actual_hours?.toFixed(1) ?? '0'}
            color="#1976D2"
            size="medium"
          />
          <StatCard
            label="Incomplete"
            value={latestPerformance?.total_jobs_incomplete ?? 0}
            color={latestPerformance?.total_jobs_incomplete > 0 ? '#F44336' : '#4CAF50'}
            size="medium"
          />
          <StatCard
            label="Carried Over"
            value={latestPerformance?.total_jobs_carried_over ?? 0}
            color="#FF9800"
            size="medium"
          />
        </ScrollView>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  // Score Card
  scoreCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  scorePeriod: { fontSize: 13, color: '#757575' },
  scoreContent: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  scoreStats: { flex: 1, gap: 12 },
  scoreStat: {},
  scoreStatValue: { fontSize: 20, fontWeight: '700', color: '#212121' },
  scoreStatLabel: { fontSize: 12, color: '#757575' },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  streakItem: { alignItems: 'center' },
  streakIcon: { fontSize: 24 },
  streakValue: { fontSize: 24, fontWeight: '700', color: '#212121', marginTop: 4 },
  streakLabel: { fontSize: 12, color: '#757575', marginTop: 2 },

  // Quick Actions
  quickActionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionIcon: { fontSize: 24, marginBottom: 6 },
  quickActionText: { fontSize: 12, fontWeight: '600', color: '#424242' },

  // Rank Card
  rankCard: {
    backgroundColor: '#1A237E',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  rankContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rankBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFD600',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: { fontSize: 18, fontWeight: '700', color: '#212121' },
  rankInfo: { flex: 1 },
  rankTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  rankSubtitle: { fontSize: 13, color: '#B0BEC5', marginTop: 2 },
  percentileBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  percentileText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  // Goals Section
  goalsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#212121' },
  seeAllLink: { fontSize: 14, fontWeight: '600', color: '#1976D2' },
  emptyGoals: { alignItems: 'center', paddingVertical: 20 },
  emptyGoalsText: { fontSize: 14, color: '#757575', marginBottom: 12 },
  createGoalButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  createGoalButtonText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  goalCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  goalTitle: { fontSize: 14, fontWeight: '600', color: '#212121', flex: 1, marginRight: 8 },
  goalStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  goalStatusText: { fontSize: 10, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  goalProgress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalProgressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalProgressFill: { height: '100%', borderRadius: 4 },
  goalProgressText: { fontSize: 12, fontWeight: '600', color: '#424242', minWidth: 60 },
  goalDeadline: { fontSize: 11, color: '#757575', marginTop: 8 },

  // Tips Section
  tipsSection: {
    marginBottom: 12,
    paddingLeft: 16,
  },
  tipsContent: { paddingRight: 16 },
  tipCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginRight: 8,
  },
  tipHeader: { marginBottom: 8 },
  tipCategoryBadge: { backgroundColor: '#1976D2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start' },
  tipCategoryText: { fontSize: 10, fontWeight: '600', color: '#fff', textTransform: 'uppercase' },
  tipTitle: { fontSize: 16, fontWeight: '700', color: '#1565C0', marginBottom: 6 },
  tipContent: { fontSize: 14, color: '#424242', lineHeight: 20 },
  tipsPagination: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 6 },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E0E0E0' },
  paginationDotActive: { backgroundColor: '#1976D2', width: 20 },

  // Quick Stats
  quickStats: {
    paddingLeft: 16,
    paddingTop: 4,
  },
  quickStatsContent: { paddingRight: 16, paddingTop: 12, gap: 8 },

  bottomSpacer: { height: 40 },
});
