import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
} from 'react-native';
import { useTranslation } from 'react-i18next';

export interface QuestionTimeData {
  questionId: number;
  questionText: string;
  startTime: number;
  endTime?: number;
  totalSeconds: number;
  pausedSeconds: number;
  isPaused: boolean;
}

export interface QuestionTimerProps {
  /** Current question ID */
  questionId: number;
  /** Question text for analytics display */
  questionText: string;
  /** Auto-start timer when component mounts */
  autoStart?: boolean;
  /** Threshold in seconds for "slow" question warning (default: 120 = 2 min) */
  slowThreshold?: number;
  /** Called when time is recorded for a question */
  onTimeRecord?: (timeData: QuestionTimeData) => void;
  /** Compact display mode */
  compact?: boolean;
  /** Show pause/resume controls */
  showControls?: boolean;
  /** Custom colors */
  colors?: {
    normal?: string;
    warning?: string;
    paused?: string;
    background?: string;
  };
}

const DEFAULT_COLORS = {
  normal: '#1976D2',
  warning: '#FF9800',
  paused: '#9E9E9E',
  background: '#E3F2FD',
};

const SLOW_THRESHOLD_SECONDS = 120; // 2 minutes

export function QuestionTimer({
  questionId,
  questionText,
  autoStart = true,
  slowThreshold = SLOW_THRESHOLD_SECONDS,
  onTimeRecord,
  compact = false,
  showControls = true,
  colors: customColors,
}: QuestionTimerProps) {
  const { t } = useTranslation();
  const colors = { ...DEFAULT_COLORS, ...customColors };

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(!autoStart);
  const [pausedSeconds, setPausedSeconds] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const pauseStartRef = useRef<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const previousQuestionId = useRef<number>(questionId);

  // Handle question change - record time for previous question
  useEffect(() => {
    if (previousQuestionId.current !== questionId && previousQuestionId.current > 0) {
      // Question changed - record time for previous question
      const timeData: QuestionTimeData = {
        questionId: previousQuestionId.current,
        questionText,
        startTime: startTimeRef.current,
        endTime: Date.now(),
        totalSeconds: elapsedSeconds,
        pausedSeconds,
        isPaused: false,
      };

      onTimeRecord?.(timeData);
    }

    // Reset for new question
    if (previousQuestionId.current !== questionId) {
      previousQuestionId.current = questionId;
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      setPausedSeconds(0);
      setIsPaused(!autoStart);
      setShowWarning(false);
      pauseStartRef.current = null;
    }
  }, [questionId, autoStart, elapsedSeconds, pausedSeconds, onTimeRecord, questionText]);

  // Timer tick
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setElapsedSeconds(prev => {
        const newValue = prev + 1;

        // Check for slow threshold
        if (newValue === slowThreshold && !showWarning) {
          setShowWarning(true);
          Vibration.vibrate([100, 100, 100]);

          // Start pulse animation
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.1,
                duration: 500,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
              }),
            ])
          ).start();
        }

        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, slowThreshold, showWarning, pulseAnim]);

  // Format time as mm:ss
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Pause handler
  const handlePause = useCallback(() => {
    if (!isPaused) {
      setIsPaused(true);
      pauseStartRef.current = Date.now();
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isPaused, pulseAnim]);

  // Resume handler
  const handleResume = useCallback(() => {
    if (isPaused && pauseStartRef.current) {
      const pauseDuration = Math.floor((Date.now() - pauseStartRef.current) / 1000);
      setPausedSeconds(prev => prev + pauseDuration);
      pauseStartRef.current = null;
    }
    setIsPaused(false);
  }, [isPaused]);

  // Get current time color
  const getTimeColor = () => {
    if (isPaused) return colors.paused;
    if (showWarning) return colors.warning;
    return colors.normal;
  };

  // Compact mode
  if (compact) {
    return (
      <Animated.View
        style={[
          styles.compactContainer,
          { transform: [{ scale: pulseAnim }] }
        ]}
      >
        <View style={[styles.compactBadge, { backgroundColor: getTimeColor() }]}>
          <Text style={styles.compactIcon}>
            {isPaused ? '||' : showWarning ? '!' : ''}
          </Text>
          <Text style={styles.compactTime}>{formatTime(elapsedSeconds)}</Text>
        </View>
        {showControls && (
          <TouchableOpacity
            style={styles.compactButton}
            onPress={isPaused ? handleResume : handlePause}
          >
            <Text style={styles.compactButtonText}>
              {isPaused ? t('common.resume', 'Resume') : t('common.pause', 'Pause')}
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { transform: [{ scale: pulseAnim }] }
      ]}
    >
      <View style={styles.timerRow}>
        <View style={styles.timerInfo}>
          <Text style={styles.timerLabel}>
            {t('inspection.questionTime', 'Time on Question')}
          </Text>
          <Text style={[styles.timerValue, { color: getTimeColor() }]}>
            {formatTime(elapsedSeconds)}
          </Text>
        </View>

        {showWarning && (
          <View style={styles.warningBadge}>
            <Text style={styles.warningText}>
              {t('inspection.slowQuestion', 'Taking long')}
            </Text>
          </View>
        )}

        {showControls && (
          <TouchableOpacity
            style={[
              styles.controlButton,
              { backgroundColor: isPaused ? colors.normal : colors.paused }
            ]}
            onPress={isPaused ? handleResume : handlePause}
          >
            <Text style={styles.controlButtonText}>
              {isPaused ? '>' : '||'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {isPaused && (
        <View style={styles.pausedIndicator}>
          <Text style={styles.pausedText}>
            {t('inspection.timerPaused', 'Timer paused')}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// Hook for tracking question times across an inspection
export function useQuestionTimerTracker() {
  const [questionTimes, setQuestionTimes] = useState<Map<number, QuestionTimeData>>(new Map());

  const recordTime = useCallback((timeData: QuestionTimeData) => {
    setQuestionTimes(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(timeData.questionId);

      if (existing) {
        // Add to existing time (user revisited question)
        newMap.set(timeData.questionId, {
          ...existing,
          totalSeconds: existing.totalSeconds + timeData.totalSeconds,
          pausedSeconds: existing.pausedSeconds + timeData.pausedSeconds,
        });
      } else {
        newMap.set(timeData.questionId, timeData);
      }

      return newMap;
    });
  }, []);

  const getAverageTime = useCallback((): number => {
    if (questionTimes.size === 0) return 0;
    const total = Array.from(questionTimes.values()).reduce(
      (sum, data) => sum + data.totalSeconds,
      0
    );
    return Math.round(total / questionTimes.size);
  }, [questionTimes]);

  const getSlowQuestions = useCallback((threshold: number = SLOW_THRESHOLD_SECONDS): QuestionTimeData[] => {
    return Array.from(questionTimes.values()).filter(
      data => data.totalSeconds > threshold
    );
  }, [questionTimes]);

  const getTotalTime = useCallback((): number => {
    return Array.from(questionTimes.values()).reduce(
      (sum, data) => sum + data.totalSeconds,
      0
    );
  }, [questionTimes]);

  const reset = useCallback(() => {
    setQuestionTimes(new Map());
  }, []);

  return {
    questionTimes,
    recordTime,
    getAverageTime,
    getSlowQuestions,
    getTotalTime,
    reset,
  };
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerInfo: {
    flex: 1,
  },
  timerLabel: {
    fontSize: 11,
    color: '#616161',
    fontWeight: '500',
  },
  timerValue: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  warningBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  warningText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E65100',
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  pausedIndicator: {
    marginTop: 6,
    alignItems: 'center',
  },
  pausedText: {
    fontSize: 11,
    color: '#9E9E9E',
    fontStyle: 'italic',
  },
  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  compactIcon: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  compactTime: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  compactButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  compactButtonText: {
    fontSize: 11,
    color: '#616161',
  },
});

export default QuestionTimer;
