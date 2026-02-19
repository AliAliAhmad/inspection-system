/**
 * TrajectoryScreen - Performance trajectory prediction chart
 *
 * Features:
 * - Performance trend visualization
 * - AI predictions for next 3 months
 * - Trend indicators (improving/stable/declining)
 * - Insights and coaching tips based on trajectory
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path, Circle, Line, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { performanceApi } from '@inspection/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 200;
const CHART_PADDING = { top: 20, right: 20, bottom: 30, left: 40 };

interface TrajectoryPoint {
  month: number;
  date: string;
  predicted_points: number;
  predicted_rank: number;
}

interface TrajectoryData {
  user_id: number;
  user_name: string;
  current_rank: number;
  current_points: number;
  trend: 'improving' | 'declining' | 'stable';
  avg_monthly_growth: number;
  predictions: TrajectoryPoint[];
  confidence: number;
  has_sufficient_data?: boolean;
  message?: string;
  generated_at: string;
}

export default function TrajectoryScreen() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<3 | 6>(3);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['performance', 'my-trajectory', period],
    queryFn: async () => {
      try {
        // Get current user's trajectory (user_id from auth context)
        const response = await performanceApi.getTrajectory(0, period); // 0 = current user
        return (response.data as any)?.data ?? response.data;
      } catch (error) {
        console.error('Error fetching trajectory:', error);
        return null;
      }
    },
  });

  const trajectoryData = data as TrajectoryData | null;

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return '#4CAF50';
      case 'declining':
        return '#F44336';
      default:
        return '#2196F3';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return String.fromCodePoint(0x2B06); // up arrow
      case 'declining':
        return String.fromCodePoint(0x2B07); // down arrow
      default:
        return String.fromCodePoint(0x27A1); // right arrow
    }
  };

  // Generate chart path
  const generateChartPath = (): { linePath: string; areaPath: string; points: { x: number; y: number; value: number }[] } | null => {
    if (!trajectoryData?.predictions?.length) return null;

    const predictions = trajectoryData.predictions;
    const points = [
      { x: 0, y: trajectoryData.current_points ?? 0 },
      ...predictions.map((p) => ({ x: p.month, y: p.predicted_points })),
    ];

    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y)) - 50;
    const maxY = Math.max(...points.map((p) => p.y)) + 50;

    const scaleX = (x: number) =>
      CHART_PADDING.left + ((x / maxX) * (CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right));
    const scaleY = (y: number) =>
      CHART_HEIGHT - CHART_PADDING.bottom - (((y - minY) / (maxY - minY)) * (CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom));

    const pathData = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`)
      .join(' ');

    // Create area path for gradient fill
    const areaPath = `${pathData} L ${scaleX(maxX)} ${CHART_HEIGHT - CHART_PADDING.bottom} L ${CHART_PADDING.left} ${CHART_HEIGHT - CHART_PADDING.bottom} Z`;

    return { linePath: pathData, areaPath, points: points.map((p) => ({ x: scaleX(p.x), y: scaleY(p.y), value: p.y })) };
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  const chartData = generateChartPath();
  const trendColor = getTrendColor(trajectoryData?.trend || 'stable');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t('performance.trajectory', 'Performance Trajectory')}</Text>
          <View style={[styles.trendBadge, { backgroundColor: trendColor }]}>
            <Text style={styles.trendIcon}>{getTrendIcon(trajectoryData?.trend || 'stable')}</Text>
            <Text style={styles.trendText}>
              {trajectoryData?.trend?.charAt(0).toUpperCase()}
              {trajectoryData?.trend?.slice(1) || 'Stable'}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{trajectoryData?.current_points ?? 0}</Text>
            <Text style={styles.statLabel}>Current Points</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>#{trajectoryData?.current_rank ?? '--'}</Text>
            <Text style={styles.statLabel}>Current Rank</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: trendColor }]}>
              {(trajectoryData?.avg_monthly_growth ?? 0) >= 0 ? '+' : ''}
              {(trajectoryData?.avg_monthly_growth ?? 0).toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>Monthly Growth</Text>
          </View>
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, period === 3 && styles.periodButtonActive]}
          onPress={() => setPeriod(3)}
        >
          <Text style={[styles.periodButtonText, period === 3 && styles.periodButtonTextActive]}>
            3 Months
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, period === 6 && styles.periodButtonActive]}
          onPress={() => setPeriod(6)}
        >
          <Text style={[styles.periodButtonText, period === 6 && styles.periodButtonTextActive]}>
            6 Months
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      {trajectoryData?.has_sufficient_data === false ? (
        <View style={styles.noDataCard}>
          <Text style={styles.noDataIcon}>...</Text>
          <Text style={styles.noDataTitle}>Not Enough Data</Text>
          <Text style={styles.noDataText}>
            {trajectoryData?.message || 'More historical data is needed for predictions.'}
          </Text>
        </View>
      ) : (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Predicted Points Over Time</Text>

          <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={trendColor} stopOpacity="0.3" />
                <Stop offset="100%" stopColor={trendColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((ratio) => (
              <Line
                key={ratio}
                x1={CHART_PADDING.left}
                y1={CHART_HEIGHT * ratio}
                x2={CHART_WIDTH - CHART_PADDING.right}
                y2={CHART_HEIGHT * ratio}
                stroke="#E0E0E0"
                strokeWidth={1}
                strokeDasharray="4,4"
              />
            ))}

            {/* Area fill */}
            {chartData && chartData.areaPath && (
              <Path d={chartData.areaPath} fill="url(#areaGradient)" />
            )}

            {/* Main line */}
            {chartData && chartData.linePath && (
              <Path
                d={chartData.linePath}
                fill="none"
                stroke={trendColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data points */}
            {chartData?.points?.map((point, index) => (
              <G key={index}>
                <Circle cx={point.x} cy={point.y} r={6} fill="#fff" stroke={trendColor} strokeWidth={3} />
              </G>
            ))}

            {/* Y-axis labels */}
            {chartData?.points && chartData.points.length > 0 && (
              <>
                <G>
                  <Circle cx={10} cy={10} r={0} />
                </G>
              </>
            )}
          </Svg>

          {/* X-axis labels */}
          <View style={styles.xAxisLabels}>
            <Text style={styles.axisLabel}>Now</Text>
            {trajectoryData?.predictions?.map((p) => (
              <Text key={p.month} style={styles.axisLabel}>
                {p.date}
              </Text>
            ))}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: trendColor }]} />
              <Text style={styles.legendText}>Predicted Points</Text>
            </View>
            <Text style={styles.confidenceText}>
              Confidence: {((trajectoryData?.confidence ?? 0) * 100).toFixed(0)}%
            </Text>
          </View>
        </View>
      )}

      {/* Predictions Table */}
      {trajectoryData?.predictions && trajectoryData.predictions.length > 0 && (
        <View style={styles.predictionsCard}>
          <Text style={styles.cardTitle}>Monthly Predictions</Text>

          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.tableColMonth]}>Month</Text>
            <Text style={[styles.tableHeaderCell, styles.tableColPoints]}>Points</Text>
            <Text style={[styles.tableHeaderCell, styles.tableColRank]}>Rank</Text>
          </View>

          {trajectoryData.predictions.map((prediction, index) => (
            <View key={prediction.month} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
              <Text style={[styles.tableCell, styles.tableColMonth]}>{prediction.date}</Text>
              <Text style={[styles.tableCell, styles.tableColPoints, { color: trendColor, fontWeight: '700' }]}>
                {prediction.predicted_points.toLocaleString()}
              </Text>
              <Text style={[styles.tableCell, styles.tableColRank]}>#{prediction.predicted_rank}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Insights */}
      <View style={styles.insightsCard}>
        <Text style={styles.cardTitle}>Trajectory Insights</Text>

        {trajectoryData?.trend === 'improving' && (
          <View style={[styles.insightItem, styles.insightPositive]}>
            <Text style={styles.insightIcon}>+</Text>
            <Text style={styles.insightText}>
              Your performance is on an upward trend. Keep up the great work!
            </Text>
          </View>
        )}

        {trajectoryData?.trend === 'declining' && (
          <View style={[styles.insightItem, styles.insightNegative]}>
            <Text style={styles.insightIcon}>!</Text>
            <Text style={styles.insightText}>
              Your performance has been declining. Consider reviewing your approach and seeking feedback.
            </Text>
          </View>
        )}

        {trajectoryData?.trend === 'stable' && (
          <View style={[styles.insightItem, styles.insightNeutral]}>
            <Text style={styles.insightIcon}>i</Text>
            <Text style={styles.insightText}>
              Your performance is stable. Focus on specific skills to move up the rankings.
            </Text>
          </View>
        )}

        <View style={[styles.insightItem, styles.insightInfo]}>
          <Text style={styles.insightIcon}>i</Text>
          <Text style={styles.insightText}>
            Predictions are based on your historical performance data and may vary based on future actions.
          </Text>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },

  // Header Card
  headerCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  trendIcon: { fontSize: 12, color: '#fff' },
  trendText: { fontSize: 12, fontWeight: '600', color: '#fff' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#212121' },
  statLabel: { fontSize: 12, color: '#757575', marginTop: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#E0E0E0' },

  // Period Selector
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: { backgroundColor: '#fff' },
  periodButtonText: { fontSize: 14, fontWeight: '600', color: '#757575' },
  periodButtonTextActive: { color: '#1976D2' },

  // Chart Card
  chartCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 16 },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: CHART_PADDING.left,
    marginTop: 8,
  },
  axisLabel: { fontSize: 10, color: '#757575' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#757575' },
  confidenceText: { fontSize: 12, color: '#757575' },

  // No Data Card
  noDataCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  noDataIcon: { fontSize: 48, color: '#BDBDBD', marginBottom: 12 },
  noDataTitle: { fontSize: 16, fontWeight: '600', color: '#424242', marginBottom: 8 },
  noDataText: { fontSize: 14, color: '#757575', textAlign: 'center' },

  // Predictions Card
  predictionsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 10,
    marginBottom: 8,
  },
  tableHeaderCell: { fontSize: 12, fontWeight: '600', color: '#757575', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 12 },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { fontSize: 14, color: '#424242' },
  tableColMonth: { flex: 2 },
  tableColPoints: { flex: 1.5, textAlign: 'center' },
  tableColRank: { flex: 1, textAlign: 'right' },

  // Insights Card
  insightsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 10,
  },
  insightPositive: { backgroundColor: '#E8F5E9' },
  insightNegative: { backgroundColor: '#FFEBEE' },
  insightNeutral: { backgroundColor: '#E3F2FD' },
  insightInfo: { backgroundColor: '#FFF3E0' },
  insightIcon: { fontSize: 16, fontWeight: '700', color: '#424242', width: 20, textAlign: 'center' },
  insightText: { flex: 1, fontSize: 13, color: '#424242', lineHeight: 20 },

  bottomSpacer: { height: 40 },
});
