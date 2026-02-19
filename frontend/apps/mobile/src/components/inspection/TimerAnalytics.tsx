import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { QuestionTimeData } from './QuestionTimer';

export interface TimerAnalyticsProps {
  /** Map of question times from useQuestionTimerTracker */
  questionTimes: Map<number, QuestionTimeData>;
  /** Team average time per question (seconds) for comparison */
  teamAverageSeconds?: number;
  /** Historical average for this inspection template */
  historicalAverageSeconds?: number;
  /** Threshold for slow questions (seconds) */
  slowThreshold?: number;
  /** Callback when a question is tapped */
  onQuestionPress?: (questionId: number) => void;
  /** Show detailed breakdown */
  showDetails?: boolean;
  /** Compact mode for inline display */
  compact?: boolean;
}

interface QuestionTypeStats {
  type: string;
  count: number;
  totalSeconds: number;
  averageSeconds: number;
}

const SLOW_THRESHOLD_SECONDS = 120;

export function TimerAnalytics({
  questionTimes,
  teamAverageSeconds,
  historicalAverageSeconds,
  slowThreshold = SLOW_THRESHOLD_SECONDS,
  onQuestionPress,
  showDetails = true,
  compact = false,
}: TimerAnalyticsProps) {
  const { t } = useTranslation();

  // Calculate statistics
  const stats = useMemo(() => {
    const times = Array.from(questionTimes.values());
    if (times.length === 0) {
      return {
        totalQuestions: 0,
        totalTime: 0,
        averageTime: 0,
        fastestTime: 0,
        slowestTime: 0,
        slowQuestions: [],
        pausedTime: 0,
      };
    }

    const totalTime = times.reduce((sum, t) => sum + t.totalSeconds, 0);
    const pausedTime = times.reduce((sum, t) => sum + t.pausedSeconds, 0);
    const sortedTimes = [...times].sort((a, b) => a.totalSeconds - b.totalSeconds);

    return {
      totalQuestions: times.length,
      totalTime,
      averageTime: Math.round(totalTime / times.length),
      fastestTime: sortedTimes[0]?.totalSeconds || 0,
      slowestTime: sortedTimes[sortedTimes.length - 1]?.totalSeconds || 0,
      slowQuestions: times.filter(t => t.totalSeconds > slowThreshold),
      pausedTime,
    };
  }, [questionTimes, slowThreshold]);

  // Format time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format time as human readable
  const formatTimeReadable = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  };

  // Compare with team average
  const comparisonToTeam = useMemo(() => {
    if (!teamAverageSeconds || stats.averageTime === 0) return null;
    const diff = stats.averageTime - teamAverageSeconds;
    const percent = Math.round((diff / teamAverageSeconds) * 100);
    return {
      diff,
      percent,
      isFaster: diff < 0,
      isSlower: diff > 0,
    };
  }, [stats.averageTime, teamAverageSeconds]);

  // Compare with historical average
  const comparisonToHistory = useMemo(() => {
    if (!historicalAverageSeconds || stats.averageTime === 0) return null;
    const diff = stats.averageTime - historicalAverageSeconds;
    const percent = Math.round((diff / historicalAverageSeconds) * 100);
    return {
      diff,
      percent,
      isFaster: diff < 0,
      isSlower: diff > 0,
    };
  }, [stats.averageTime, historicalAverageSeconds]);

  // Compact mode
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View style={styles.compactStat}>
            <Text style={styles.compactValue}>{formatTime(stats.totalTime)}</Text>
            <Text style={styles.compactLabel}>{t('inspection.totalTime', 'Total')}</Text>
          </View>
          <View style={styles.compactDivider} />
          <View style={styles.compactStat}>
            <Text style={styles.compactValue}>{formatTime(stats.averageTime)}</Text>
            <Text style={styles.compactLabel}>{t('inspection.avgPerQ', 'Avg/Q')}</Text>
          </View>
          {stats.slowQuestions.length > 0 && (
            <>
              <View style={styles.compactDivider} />
              <View style={styles.compactStat}>
                <Text style={[styles.compactValue, styles.compactWarning]}>
                  {stats.slowQuestions.length}
                </Text>
                <Text style={styles.compactLabel}>{t('inspection.slow', 'Slow')}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('inspection.timeAnalytics', 'Time Analytics')}</Text>

      {/* Summary Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatTimeReadable(stats.totalTime)}</Text>
          <Text style={styles.statLabel}>{t('inspection.totalTime', 'Total Time')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatTimeReadable(stats.averageTime)}</Text>
          <Text style={styles.statLabel}>{t('inspection.avgPerQuestion', 'Avg per Question')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.totalQuestions}</Text>
          <Text style={styles.statLabel}>{t('inspection.questionsAnswered', 'Answered')}</Text>
        </View>
        <View style={[styles.statCard, stats.slowQuestions.length > 0 && styles.statCardWarning]}>
          <Text style={[styles.statValue, stats.slowQuestions.length > 0 && styles.statValueWarning]}>
            {stats.slowQuestions.length}
          </Text>
          <Text style={styles.statLabel}>{t('inspection.slowQuestions', 'Slow Questions')}</Text>
        </View>
      </View>

      {/* Time Range */}
      {stats.totalQuestions > 0 && (
        <View style={styles.rangeCard}>
          <View style={styles.rangeItem}>
            <Text style={styles.rangeIcon}>&#x1F3C3;</Text>
            <View>
              <Text style={styles.rangeValue}>{formatTimeReadable(stats.fastestTime)}</Text>
              <Text style={styles.rangeLabel}>{t('inspection.fastest', 'Fastest')}</Text>
            </View>
          </View>
          <View style={styles.rangeDivider} />
          <View style={styles.rangeItem}>
            <Text style={styles.rangeIcon}>&#x1F422;</Text>
            <View>
              <Text style={styles.rangeValue}>{formatTimeReadable(stats.slowestTime)}</Text>
              <Text style={styles.rangeLabel}>{t('inspection.slowest', 'Slowest')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Comparisons */}
      {(comparisonToTeam || comparisonToHistory) && (
        <View style={styles.comparisonsCard}>
          <Text style={styles.comparisonsTitle}>{t('inspection.comparisons', 'Comparisons')}</Text>

          {comparisonToTeam && (
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>{t('inspection.vsTeamAvg', 'vs Team Average')}</Text>
              <View style={[
                styles.comparisonBadge,
                comparisonToTeam.isFaster ? styles.badgeFaster : styles.badgeSlower
              ]}>
                <Text style={styles.comparisonBadgeText}>
                  {comparisonToTeam.isFaster ? '-' : '+'}
                  {Math.abs(comparisonToTeam.percent)}%
                </Text>
              </View>
            </View>
          )}

          {comparisonToHistory && (
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>{t('inspection.vsHistory', 'vs Your History')}</Text>
              <View style={[
                styles.comparisonBadge,
                comparisonToHistory.isFaster ? styles.badgeFaster : styles.badgeSlower
              ]}>
                <Text style={styles.comparisonBadgeText}>
                  {comparisonToHistory.isFaster ? '-' : '+'}
                  {Math.abs(comparisonToHistory.percent)}%
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Slow Questions List */}
      {showDetails && stats.slowQuestions.length > 0 && (
        <View style={styles.slowQuestionsCard}>
          <Text style={styles.slowQuestionsTitle}>
            {t('inspection.slowQuestionsDetail', 'Slow Questions (>2 min)')}
          </Text>
          <ScrollView style={styles.slowQuestionsList} nestedScrollEnabled>
            {stats.slowQuestions
              .sort((a, b) => b.totalSeconds - a.totalSeconds)
              .map((q, index) => (
                <TouchableOpacity
                  key={q.questionId}
                  style={styles.slowQuestionItem}
                  onPress={() => onQuestionPress?.(q.questionId)}
                >
                  <View style={styles.slowQuestionInfo}>
                    <Text style={styles.slowQuestionNumber}>Q{index + 1}</Text>
                    <Text style={styles.slowQuestionText} numberOfLines={2}>
                      {q.questionText}
                    </Text>
                  </View>
                  <Text style={styles.slowQuestionTime}>
                    {formatTimeReadable(q.totalSeconds)}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}

      {/* Paused Time */}
      {stats.pausedTime > 0 && (
        <View style={styles.pausedCard}>
          <Text style={styles.pausedLabel}>{t('inspection.pausedTime', 'Time Paused')}</Text>
          <Text style={styles.pausedValue}>{formatTimeReadable(stats.pausedTime)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statCardWarning: {
    backgroundColor: '#FFF3E0',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#212121',
  },
  statValueWarning: {
    color: '#E65100',
  },
  statLabel: {
    fontSize: 11,
    color: '#616161',
    marginTop: 4,
    textAlign: 'center',
  },
  rangeCard: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  rangeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeIcon: {
    fontSize: 20,
  },
  rangeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  rangeLabel: {
    fontSize: 10,
    color: '#616161',
  },
  rangeDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 12,
  },
  comparisonsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  comparisonsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  comparisonLabel: {
    fontSize: 12,
    color: '#424242',
  },
  comparisonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeFaster: {
    backgroundColor: '#E8F5E9',
  },
  badgeSlower: {
    backgroundColor: '#FFEBEE',
  },
  comparisonBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#212121',
  },
  slowQuestionsCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  slowQuestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  slowQuestionsList: {
    maxHeight: 150,
  },
  slowQuestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  slowQuestionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slowQuestionNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E65100',
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  slowQuestionText: {
    flex: 1,
    fontSize: 12,
    color: '#424242',
  },
  slowQuestionTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
    marginLeft: 8,
  },
  pausedCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  pausedLabel: {
    fontSize: 12,
    color: '#616161',
  },
  pausedValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9E9E9E',
  },
  // Compact styles
  compactContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 8,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactStat: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  compactValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    fontFamily: 'monospace',
  },
  compactWarning: {
    color: '#E65100',
  },
  compactLabel: {
    fontSize: 9,
    color: '#616161',
    marginTop: 2,
  },
  compactDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E0E0E0',
  },
});

export default TimerAnalytics;
