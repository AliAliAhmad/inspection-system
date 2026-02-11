/**
 * InspectorStatsScreen - Personal inspector performance stats
 *
 * Features:
 * - Overall quality score with progress ring
 * - Comparison to team average
 * - Performance trend chart
 * - Strengths and improvement areas
 * - Recent inspections count
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import { Card, List, ProgressBar } from 'react-native-paper';
import ProgressRing from '../../components/ProgressRing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function InspectorStatsScreen() {
  // Fetch current user's inspector scores
  const {
    data: inspectorScoresData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['my-inspector-scores'],
    queryFn: async () => {
      try {
        // Fetch all inspector scores (backend should filter by current user if needed)
        const response = await scheduleAIApi.getInspectorScores();
        // For demo, we'll take the first inspector as "current user"
        return response && response.length > 0 ? response[0] : null;
      } catch (error) {
        console.error('Error fetching inspector scores:', error);
        return null;
      }
    },
  });

  // Fetch team performance for comparison
  const { data: teamPerformanceData } = useQuery({
    queryKey: ['team-performance'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getTeamPerformance(30);
        return response;
      } catch (error) {
        console.error('Error fetching team performance:', error);
        return null;
      }
    },
  });

  const inspectorScore = inspectorScoresData;
  const teamPerformance = teamPerformanceData;

  const qualityScore = inspectorScore?.quality_score || 0;
  const teamAvgQuality = teamPerformance?.team_summary?.avg_quality_score || 0;
  const comparisonToTeam = qualityScore - teamAvgQuality;

  // Recent inspections (mock data - replace with actual API call)
  const recentInspectionsCount = 24;

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '📈';
      case 'declining':
        return '📉';
      default:
        return '➡️';
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '#4CAF50';
      case 'declining':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (!inspectorScore) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No performance data available</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Overall Quality Score */}
      <Card style={styles.scoreCard}>
        <Card.Content>
          <Text style={styles.scoreCardTitle}>Overall Quality Score</Text>
          <View style={styles.scoreContent}>
            <ProgressRing
              progress={qualityScore}
              size={140}
              strokeWidth={12}
              color={qualityScore >= 80 ? '#4CAF50' : qualityScore >= 60 ? '#FF9800' : '#F44336'}
              showPercentage
            />
            <View style={styles.scoreDetails}>
              <View style={styles.scoreDetailItem}>
                <Text style={styles.scoreDetailLabel}>Your Score</Text>
                <Text style={styles.scoreDetailValue}>{qualityScore.toFixed(1)}%</Text>
              </View>
              <View style={styles.scoreDetailItem}>
                <Text style={styles.scoreDetailLabel}>Team Avg</Text>
                <Text style={styles.scoreDetailValue}>{teamAvgQuality.toFixed(1)}%</Text>
              </View>
              <View style={styles.scoreDetailItem}>
                <Text style={styles.scoreDetailLabel}>Trend</Text>
                <View style={styles.trendRow}>
                  <Text style={styles.trendIcon}>
                    {getTrendIcon(inspectorScore.trend)}
                  </Text>
                  <Text
                    style={[
                      styles.trendText,
                      { color: getTrendColor(inspectorScore.trend) },
                    ]}
                  >
                    {inspectorScore.trend}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Comparison to Team */}
      <Card style={styles.comparisonCard}>
        <Card.Content>
          <Text style={styles.comparisonTitle}>Comparison to Team Average</Text>
          <View style={styles.comparisonContent}>
            <Text
              style={[
                styles.comparisonValue,
                { color: comparisonToTeam >= 0 ? '#4CAF50' : '#F44336' },
              ]}
            >
              {comparisonToTeam >= 0 ? '+' : ''}
              {comparisonToTeam.toFixed(1)}%
            </Text>
            <Text style={styles.comparisonLabel}>
              {comparisonToTeam >= 0 ? 'above' : 'below'} team average
            </Text>
          </View>
          <ProgressBar
            progress={Math.min(qualityScore / 100, 1)}
            color={qualityScore >= 80 ? '#4CAF50' : qualityScore >= 60 ? '#FF9800' : '#F44336'}
            style={styles.progressBar}
          />
        </Card.Content>
      </Card>

      {/* Performance Metrics */}
      <Card style={styles.metricsCard}>
        <Card.Content>
          <Text style={styles.metricsTitle}>Performance Metrics</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {inspectorScore.completion_rate.toFixed(1)}%
              </Text>
              <Text style={styles.metricLabel}>Completion Rate</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {inspectorScore.avg_inspection_time.toFixed(0)} min
              </Text>
              <Text style={styles.metricLabel}>Avg Inspection Time</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {inspectorScore.defect_detection_rate.toFixed(1)}%
              </Text>
              <Text style={styles.metricLabel}>Defect Detection</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{recentInspectionsCount}</Text>
              <Text style={styles.metricLabel}>Recent Inspections</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Performance Trend Chart Placeholder */}
      <Card style={styles.chartCard}>
        <Card.Content>
          <Text style={styles.chartTitle}>Performance Trend (30 Days)</Text>
          <View style={styles.chartPlaceholder}>
            <Text style={styles.chartPlaceholderText}>📊</Text>
            <Text style={styles.chartPlaceholderSubtext}>
              Chart visualization would display here
            </Text>
            <Text style={styles.chartPlaceholderSubtext}>
              (Quality score, completion rate over time)
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Strengths */}
      {inspectorScore.strengths && inspectorScore.strengths.length > 0 && (
        <Card style={styles.listCard}>
          <Card.Content>
            <Text style={styles.listCardTitle}>✓ Strengths</Text>
            {inspectorScore.strengths.map((strength, index) => (
              <List.Item
                key={index}
                title={strength}
                titleStyle={styles.strengthText}
                left={(props) => <List.Icon {...props} icon="check-circle" color="#4CAF50" />}
                style={styles.listItem}
              />
            ))}
          </Card.Content>
        </Card>
      )}

      {/* Areas for Improvement */}
      {inspectorScore.areas_for_improvement &&
        inspectorScore.areas_for_improvement.length > 0 && (
          <Card style={styles.listCard}>
            <Card.Content>
              <Text style={styles.listCardTitle}>• Areas for Improvement</Text>
              {inspectorScore.areas_for_improvement.map((area, index) => (
                <List.Item
                  key={index}
                  title={area}
                  titleStyle={styles.improvementText}
                  left={(props) => <List.Icon {...props} icon="alert-circle" color="#FF9800" />}
                  style={styles.listItem}
                />
              ))}
            </Card.Content>
          </Card>
        )}

      {/* Achievements Placeholder */}
      <Card style={styles.achievementsCard}>
        <Card.Content>
          <Text style={styles.achievementsTitle}>🏆 Achievements</Text>
          <View style={styles.achievementsGrid}>
            <View style={styles.achievementBadge}>
              <Text style={styles.achievementIcon}>🥇</Text>
              <Text style={styles.achievementName}>Quality Expert</Text>
            </View>
            <View style={styles.achievementBadge}>
              <Text style={styles.achievementIcon}>⚡</Text>
              <Text style={styles.achievementName}>Speed Demon</Text>
            </View>
            <View style={styles.achievementBadge}>
              <Text style={styles.achievementIcon}>🔍</Text>
              <Text style={styles.achievementName}>Defect Hunter</Text>
            </View>
            <View style={[styles.achievementBadge, styles.achievementBadgeLocked]}>
              <Text style={styles.achievementIcon}>🔒</Text>
              <Text style={styles.achievementName}>Locked</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  emptyText: { fontSize: 14, color: '#757575' },

  // Score Card
  scoreCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 16,
  },
  scoreCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  scoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  scoreDetails: { flex: 1, gap: 12 },
  scoreDetailItem: {},
  scoreDetailLabel: { fontSize: 11, color: '#757575', marginBottom: 2 },
  scoreDetailValue: { fontSize: 18, fontWeight: '700', color: '#212121' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trendIcon: { fontSize: 16 },
  trendText: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },

  // Comparison Card
  comparisonCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1565C0',
    marginBottom: 12,
  },
  comparisonContent: {
    alignItems: 'center',
    marginBottom: 12,
  },
  comparisonValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  comparisonLabel: {
    fontSize: 13,
    color: '#757575',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },

  // Metrics Card
  metricsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  metricsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricItem: {
    width: (SCREEN_WIDTH - 64) / 2,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#757575',
    textAlign: 'center',
  },

  // Chart Card
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  chartPlaceholder: {
    height: 180,
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartPlaceholderText: {
    fontSize: 48,
    marginBottom: 8,
  },
  chartPlaceholderSubtext: {
    fontSize: 12,
    color: '#757575',
  },

  // List Card
  listCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  listCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  listItem: {
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  strengthText: {
    fontSize: 13,
    color: '#212121',
  },
  improvementText: {
    fontSize: 13,
    color: '#212121',
  },

  // Achievements Card
  achievementsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFF9C4',
  },
  achievementsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 16,
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  achievementBadge: {
    width: (SCREEN_WIDTH - 80) / 4,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  achievementBadgeLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  achievementName: {
    fontSize: 9,
    color: '#424242',
    textAlign: 'center',
  },

  bottomSpacer: { height: 40 },
});
