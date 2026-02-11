/**
 * ScheduleAIScreen - Main Schedule AI dashboard for mobile
 *
 * Features:
 * - Stats cards in 2x2 grid
 * - Critical insights section
 * - Coverage gaps alerts
 * - Action buttons for navigation
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { scheduleAIApi } from '@inspection/shared';
import { Card, Button } from 'react-native-paper';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ScheduleAIScreen() {
  const navigation = useNavigation<NavigationProp>();

  // Fetch risk scores
  const {
    data: riskScoresData,
    isLoading: loadingRiskScores,
    refetch: refetchRiskScores,
    isRefetching: isRefetchingRiskScores,
  } = useQuery({
    queryKey: ['schedule-ai-risk-scores'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getRiskScores();
        return response;
      } catch (error) {
        console.error('Error fetching risk scores:', error);
        return null;
      }
    },
  });

  // Fetch coverage gaps
  const {
    data: coverageGapsData,
    isLoading: loadingCoverageGaps,
    refetch: refetchCoverageGaps,
  } = useQuery({
    queryKey: ['schedule-ai-coverage-gaps'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getCoverageGaps();
        return response;
      } catch (error) {
        console.error('Error fetching coverage gaps:', error);
        return null;
      }
    },
  });

  // Fetch insights
  const {
    data: insightsData,
    isLoading: loadingInsights,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ['schedule-ai-insights'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getInsights();
        return response || [];
      } catch (error) {
        console.error('Error fetching insights:', error);
        return [];
      }
    },
  });

  // Fetch SLA warnings
  const { data: slaWarningsData } = useQuery({
    queryKey: ['schedule-ai-sla-warnings'],
    queryFn: async () => {
      try {
        const response = await scheduleAIApi.getSLAWarnings(7);
        return response || [];
      } catch (error) {
        console.error('Error fetching SLA warnings:', error);
        return [];
      }
    },
  });

  const handleRefresh = () => {
    refetchRiskScores();
    refetchCoverageGaps();
    refetchInsights();
  };

  const isLoading = loadingRiskScores || loadingCoverageGaps || loadingInsights;
  const isRefreshing = isRefetchingRiskScores;

  const summary = riskScoresData?.summary;
  const coverageGaps = coverageGapsData?.gaps || [];
  const insights = insightsData || [];
  const slaWarnings = slaWarningsData || [];

  // Calculate coverage rate
  const coverageRate = summary?.total_equipment
    ? Math.round(
        ((summary.total_equipment - (coverageGaps.filter((g) => g.severity === 'critical' || g.severity === 'high').length)) /
          summary.total_equipment) *
          100
      )
    : 0;

  // Critical insights (top 3)
  const criticalInsights = insights
    .filter((i) => i.priority === 'high')
    .slice(0, 3);

  // Critical gaps
  const criticalGaps = coverageGaps
    .filter((g) => g.severity === 'critical')
    .slice(0, 3);

  // SLA risks count
  const slaRisksCount = slaWarnings.filter(
    (w) => w.risk_level === 'critical' || w.risk_level === 'high'
  ).length;

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
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <Card style={[styles.statCard, styles.statCardPrimary]}>
            <Card.Content>
              <Text style={styles.statValue}>{summary?.total_equipment || 0}</Text>
              <Text style={styles.statLabel}>Total Equipment</Text>
            </Card.Content>
          </Card>

          <Card style={[styles.statCard, styles.statCardSuccess]}>
            <Card.Content>
              <Text style={styles.statValue}>{coverageRate}%</Text>
              <Text style={styles.statLabel}>Coverage Rate</Text>
            </Card.Content>
          </Card>
        </View>

        <View style={styles.statsRow}>
          <Card style={[styles.statCard, styles.statCardWarning]}>
            <Card.Content>
              <Text style={styles.statValue}>
                {summary?.average_risk_score?.toFixed(1) || '0.0'}
              </Text>
              <Text style={styles.statLabel}>Avg Risk Score</Text>
            </Card.Content>
          </Card>

          <Card style={[styles.statCard, styles.statCardDanger]}>
            <Card.Content>
              <Text style={styles.statValue}>{slaRisksCount}</Text>
              <Text style={styles.statLabel}>SLA Risks</Text>
            </Card.Content>
          </Card>
        </View>
      </View>

      {/* Critical Insights */}
      {criticalInsights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Critical Insights</Text>
          {criticalInsights.map((insight, index) => (
            <Card key={index} style={styles.insightCard}>
              <Card.Content>
                <View style={styles.insightHeader}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{insight.category}</Text>
                  </View>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityText}>HIGH</Text>
                  </View>
                </View>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightDescription} numberOfLines={2}>
                  {insight.description}
                </Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}

      {/* Coverage Gaps Alerts */}
      {criticalGaps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coverage Gaps</Text>
          {criticalGaps.map((gap) => (
            <Card key={gap.equipment_id} style={styles.gapCard}>
              <Card.Content>
                <View style={styles.gapHeader}>
                  <Text style={styles.gapEquipment}>{gap.equipment_name}</Text>
                  <View style={styles.gapSeverityBadge}>
                    <Text style={styles.gapSeverityText}>CRITICAL</Text>
                  </View>
                </View>
                <Text style={styles.gapLocation}>{gap.location}</Text>
                <Text style={styles.gapOverdue}>{gap.days_overdue} days overdue</Text>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <View style={styles.actionsRow}>
          <Button
            mode="contained"
            icon="alert-circle"
            onPress={() => navigation.navigate('EquipmentRisks' as any)}
            style={[styles.actionButton, styles.actionButtonPrimary]}
            labelStyle={styles.actionButtonLabel}
          >
            View All Risks
          </Button>

          <Button
            mode="contained"
            icon="map"
            onPress={() => navigation.navigate('RouteOptimizer' as any)}
            style={[styles.actionButton, styles.actionButtonSecondary]}
            labelStyle={styles.actionButtonLabel}
          >
            Route Optimizer
          </Button>
        </View>

        <View style={styles.actionsRow}>
          <Button
            mode="outlined"
            icon="chart-line"
            onPress={() => navigation.navigate('InspectorStats' as any)}
            style={styles.actionButtonOutlined}
            labelStyle={styles.actionButtonLabelOutlined}
          >
            My Performance
          </Button>
        </View>
      </View>

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

  // Stats Grid
  statsGrid: { padding: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: 12 },
  statCardPrimary: { backgroundColor: '#1976D2' },
  statCardSuccess: { backgroundColor: '#4CAF50' },
  statCardWarning: { backgroundColor: '#FF9800' },
  statCardDanger: { backgroundColor: '#F44336' },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: { fontSize: 12, color: '#fff', opacity: 0.9 },

  // Section
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },

  // Insight Card
  insightCard: { marginBottom: 10, borderRadius: 10 },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1976D2',
    textTransform: 'uppercase',
  },
  priorityBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F44336',
    textTransform: 'uppercase',
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  insightDescription: { fontSize: 12, color: '#757575', lineHeight: 18 },

  // Gap Card
  gapCard: { marginBottom: 10, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#F44336' },
  gapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gapEquipment: { fontSize: 14, fontWeight: '600', color: '#212121', flex: 1 },
  gapSeverityBadge: {
    backgroundColor: '#F44336',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gapSeverityText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  gapLocation: { fontSize: 12, color: '#757575', marginBottom: 4 },
  gapOverdue: { fontSize: 12, color: '#F44336', fontWeight: '500' },

  // Actions
  actionsSection: { paddingHorizontal: 16, gap: 12 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, borderRadius: 10 },
  actionButtonPrimary: { backgroundColor: '#1976D2' },
  actionButtonSecondary: { backgroundColor: '#FF9800' },
  actionButtonLabel: { fontSize: 12, fontWeight: '600' },
  actionButtonOutlined: { borderRadius: 10, borderColor: '#1976D2' },
  actionButtonLabelOutlined: { fontSize: 12, fontWeight: '600', color: '#1976D2' },

  bottomSpacer: { height: 40 },
});
