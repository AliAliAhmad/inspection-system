/**
 * SkillGapsScreen - Skill gaps analysis with radar chart
 *
 * Features:
 * - Radar chart visualization of skills
 * - Current vs target level comparison
 * - Priority-based skill gap listing
 * - Improvement recommendations
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
import Svg, { Path, Circle, Line, G, Polygon, Text as SvgText } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { performanceApi } from '@inspection/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_SIZE = Math.min(SCREEN_WIDTH - 64, 300);
const CENTER_X = CHART_SIZE / 2;
const CENTER_Y = CHART_SIZE / 2;
const MAX_RADIUS = CHART_SIZE / 2 - 40;

interface SkillGap {
  skill: string;
  current_level: number;
  target_level: number;
  gap: number;
  improvement_tips: string[];
}

const PRIORITY_COLORS = {
  high: { bg: '#FFEBEE', border: '#FFCDD2', text: '#F44336' },
  medium: { bg: '#FFF8E1', border: '#FFECB3', text: '#FF9800' },
  low: { bg: '#E8F5E9', border: '#C8E6C9', text: '#4CAF50' },
};

const getPriority = (gap: number): 'high' | 'medium' | 'low' => {
  if (gap >= 1.5) return 'high';
  if (gap >= 0.5) return 'medium';
  return 'low';
};

export default function SkillGapsScreen() {
  const { t } = useTranslation();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['performance', 'my-skill-gaps'],
    queryFn: async () => {
      try {
        // Get current user's skill gaps (user_id from auth context)
        const response = await performanceApi.getSkillGaps(0); // 0 = current user
        return (response.data as any)?.data ?? response.data ?? [];
      } catch (error) {
        console.error('Error fetching skill gaps:', error);
        return [];
      }
    },
  });

  const skillGaps = (data as SkillGap[]) || [];

  // Calculate radar chart points
  const getRadarPoint = (value: number, maxValue: number, index: number, total: number) => {
    const normalizedValue = (value / maxValue) * MAX_RADIUS;
    const angle = (index * 2 * Math.PI) / total - Math.PI / 2;
    return {
      x: CENTER_X + normalizedValue * Math.cos(angle),
      y: CENTER_Y + normalizedValue * Math.sin(angle),
    };
  };

  const generateRadarPath = (values: number[], maxValue: number) => {
    if (values.length < 3) return '';
    const points = values.map((v, i) => getRadarPoint(v, maxValue, i, values.length));
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  };

  // Default skills if no data
  const defaultSkills: SkillGap[] = [
    { skill: 'Time Management', current_level: 3.5, target_level: 4.5, gap: 1.0, improvement_tips: ['Plan tasks before starting'] },
    { skill: 'Work Quality', current_level: 4.0, target_level: 4.5, gap: 0.5, improvement_tips: ['Double-check work'] },
    { skill: 'Consistency', current_level: 3.0, target_level: 4.0, gap: 1.0, improvement_tips: ['Build routines'] },
    { skill: 'Safety Compliance', current_level: 4.5, target_level: 4.5, gap: 0, improvement_tips: [] },
    { skill: 'Communication', current_level: 3.5, target_level: 4.0, gap: 0.5, improvement_tips: ['Be proactive'] },
  ];

  const skills = skillGaps.length > 0 ? skillGaps : defaultSkills;
  const maxLevel = 5;

  const currentPath = generateRadarPath(
    skills.map((s) => s.current_level),
    maxLevel
  );

  const targetPath = generateRadarPath(
    skills.map((s) => s.target_level),
    maxLevel
  );

  // Grid circles
  const gridLevels = [0.25, 0.5, 0.75, 1];

  // Calculate overall score
  const overallScore = skills.length > 0
    ? Math.round((skills.reduce((sum, s) => sum + s.current_level, 0) / (skills.length * maxLevel)) * 100)
    : 0;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  const sortedGaps = [...skills].filter((s) => s.gap > 0).sort((a, b) => b.gap - a.gap);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t('performance.skill_gaps', 'Skill Gaps Analysis')}</Text>
          <View style={[styles.scoreBadge, {
            backgroundColor: overallScore >= 80 ? '#E8F5E9' : overallScore >= 60 ? '#FFF8E1' : '#FFEBEE',
          }]}>
            <Text style={[styles.scoreText, {
              color: overallScore >= 80 ? '#4CAF50' : overallScore >= 60 ? '#FF9800' : '#F44336',
            }]}>
              {overallScore}%
            </Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          {sortedGaps.length === 0
            ? 'All skills at target level!'
            : `${sortedGaps.length} skill${sortedGaps.length > 1 ? 's' : ''} need improvement`}
        </Text>
      </View>

      {/* Radar Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Skills Overview</Text>

        <View style={styles.chartContainer}>
          <Svg width={CHART_SIZE} height={CHART_SIZE}>
            {/* Grid circles */}
            {gridLevels.map((level, i) => (
              <Circle
                key={i}
                cx={CENTER_X}
                cy={CENTER_Y}
                r={MAX_RADIUS * level}
                fill="none"
                stroke="#E0E0E0"
                strokeWidth={1}
              />
            ))}

            {/* Grid lines from center to each skill */}
            {skills.map((_, i) => {
              const point = getRadarPoint(maxLevel, maxLevel, i, skills.length);
              return (
                <Line
                  key={i}
                  x1={CENTER_X}
                  y1={CENTER_Y}
                  x2={point.x}
                  y2={point.y}
                  stroke="#E0E0E0"
                  strokeWidth={1}
                />
              );
            })}

            {/* Target area (dashed) */}
            {targetPath && (
              <Path
                d={targetPath}
                fill="rgba(33, 150, 243, 0.1)"
                stroke="#2196F3"
                strokeWidth={2}
                strokeDasharray="6,4"
              />
            )}

            {/* Current area */}
            {currentPath && (
              <Path
                d={currentPath}
                fill="rgba(76, 175, 80, 0.3)"
                stroke="#4CAF50"
                strokeWidth={2}
              />
            )}

            {/* Data points and labels */}
            {skills.map((skill, i) => {
              const currentPoint = getRadarPoint(skill.current_level, maxLevel, i, skills.length);
              const labelPoint = getRadarPoint(maxLevel * 1.15, maxLevel, i, skills.length);
              const hasGap = skill.gap > 0;
              const priority = getPriority(skill.gap);

              return (
                <G key={i}>
                  {/* Current level point */}
                  <Circle
                    cx={currentPoint.x}
                    cy={currentPoint.y}
                    r={6}
                    fill={hasGap ? PRIORITY_COLORS[priority].text : '#4CAF50'}
                    stroke="#fff"
                    strokeWidth={2}
                  />

                  {/* Skill label */}
                  <SvgText
                    x={labelPoint.x}
                    y={labelPoint.y}
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    fontSize={10}
                    fill="#616161"
                  >
                    {skill.skill.length > 10 ? skill.skill.substring(0, 8) + '..' : skill.skill}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.legendText}>Current</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#2196F3', opacity: 0.6 }]} />
            <Text style={styles.legendText}>Target</Text>
          </View>
        </View>
      </View>

      {/* Priority Skill Gaps */}
      {sortedGaps.length > 0 && (
        <View style={styles.gapsCard}>
          <Text style={styles.cardTitle}>Priority Skill Gaps</Text>

          {sortedGaps.map((skill, index) => {
            const priority = getPriority(skill.gap);
            const colors = PRIORITY_COLORS[priority];

            return (
              <View
                key={index}
                style={[styles.gapItem, { backgroundColor: colors.bg, borderColor: colors.border }]}
              >
                <View style={styles.gapHeader}>
                  <View style={styles.gapTitleRow}>
                    <Text style={styles.gapSkillName}>{skill.skill}</Text>
                    <View style={[styles.priorityBadge, { backgroundColor: colors.text }]}>
                      <Text style={styles.priorityText}>{priority.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelText}>
                      Current: <Text style={{ fontWeight: '700' }}>{skill.current_level.toFixed(1)}</Text>
                    </Text>
                    <Text style={styles.levelDivider}>|</Text>
                    <Text style={styles.levelText}>
                      Target: <Text style={{ fontWeight: '700' }}>{skill.target_level.toFixed(1)}</Text>
                    </Text>
                    <Text style={[styles.gapText, { color: colors.text }]}>
                      Gap: {skill.gap.toFixed(1)}
                    </Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${(skill.current_level / skill.target_level) * 100}%`,
                          backgroundColor: colors.text,
                        },
                      ]}
                    />
                    <View style={styles.targetMarker} />
                  </View>
                </View>

                {/* Improvement Tips */}
                {skill.improvement_tips && skill.improvement_tips.length > 0 && (
                  <View style={styles.tipsContainer}>
                    <Text style={styles.tipsLabel}>Tips:</Text>
                    {skill.improvement_tips.slice(0, 2).map((tip, tipIndex) => (
                      <Text key={tipIndex} style={styles.tipText}>
                        - {tip}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Success Message if no gaps */}
      {sortedGaps.length === 0 && (
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>-</Text>
          <Text style={styles.successTitle}>Excellent Performance!</Text>
          <Text style={styles.successText}>
            All your skills are at or above target level. Keep up the great work!
          </Text>
        </View>
      )}

      {/* General Recommendations */}
      <View style={styles.recommendationsCard}>
        <Text style={styles.cardTitle}>Improvement Recommendations</Text>

        <View style={styles.recommendationItem}>
          <Text style={styles.recommendationIcon}>1</Text>
          <View style={styles.recommendationContent}>
            <Text style={styles.recommendationTitle}>Focus on High Priority Gaps</Text>
            <Text style={styles.recommendationText}>
              Address skills with the largest gaps first for maximum impact.
            </Text>
          </View>
        </View>

        <View style={styles.recommendationItem}>
          <Text style={styles.recommendationIcon}>2</Text>
          <View style={styles.recommendationContent}>
            <Text style={styles.recommendationTitle}>Request Feedback</Text>
            <Text style={styles.recommendationText}>
              Ask your supervisor for specific feedback on improvement areas.
            </Text>
          </View>
        </View>

        <View style={styles.recommendationItem}>
          <Text style={styles.recommendationIcon}>3</Text>
          <View style={styles.recommendationContent}>
            <Text style={styles.recommendationTitle}>Track Progress</Text>
            <Text style={styles.recommendationText}>
              Monitor your skill improvements weekly to stay motivated.
            </Text>
          </View>
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
    marginBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  headerSubtitle: { fontSize: 14, color: '#757575' },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  scoreText: { fontSize: 16, fontWeight: '700' },

  // Chart Card
  chartCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  chartTitle: { fontSize: 14, fontWeight: '600', color: '#424242', marginBottom: 16, alignSelf: 'flex-start' },
  chartContainer: { alignItems: 'center', justifyContent: 'center' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 20, height: 3, borderRadius: 2 },
  legendText: { fontSize: 12, color: '#757575' },

  // Gaps Card
  gapsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212121', marginBottom: 16 },
  gapItem: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  gapHeader: { marginBottom: 10 },
  gapTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  gapSkillName: { fontSize: 15, fontWeight: '600', color: '#212121' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priorityText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelText: { fontSize: 12, color: '#616161' },
  levelDivider: { color: '#E0E0E0' },
  gapText: { fontSize: 12, fontWeight: '600', marginLeft: 'auto' },

  progressContainer: { marginBottom: 10 },
  progressTrack: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  targetMarker: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#424242',
  },

  tipsContainer: { paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  tipsLabel: { fontSize: 11, fontWeight: '600', color: '#757575', marginBottom: 4 },
  tipText: { fontSize: 12, color: '#616161', marginLeft: 8, marginBottom: 2 },

  // Success Card
  successCard: {
    backgroundColor: '#E8F5E9',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  successIcon: { fontSize: 48, color: '#4CAF50', marginBottom: 12 },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#2E7D32', marginBottom: 8 },
  successText: { fontSize: 14, color: '#388E3C', textAlign: 'center' },

  // Recommendations Card
  recommendationsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
  },
  recommendationItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  recommendationIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E3F2FD',
    color: '#1976D2',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  recommendationContent: { flex: 1 },
  recommendationTitle: { fontSize: 14, fontWeight: '600', color: '#212121', marginBottom: 4 },
  recommendationText: { fontSize: 13, color: '#757575', lineHeight: 18 },

  bottomSpacer: { height: 40 },
});
