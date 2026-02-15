/**
 * StreakIndicator - Shows consecutive days active
 *
 * Displays flame icon with streak count.
 * Shows warning when streak is at risk of breaking.
 * Recovery mechanism for missed days.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

// Streak milestone thresholds
const MILESTONES = [3, 5, 7, 14, 21, 30, 60, 90, 180, 365];

// Colors based on streak length
const STREAK_COLORS = {
  none: '#d9d9d9',
  low: '#ff7a45',      // 1-2 days
  medium: '#fa541c',   // 3-6 days
  hot: '#f5222d',      // 7-13 days
  blazing: '#eb2f96',  // 14-29 days
  legendary: '#722ed1', // 30+ days
};

export interface StreakIndicatorProps {
  /** Current streak count */
  currentStreak: number;
  /** Longest streak achieved */
  longestStreak?: number;
  /** Whether streak is at risk (last activity > 20 hours ago) */
  atRisk?: boolean;
  /** Whether streak has freeze protection */
  hasFreezeProtection?: boolean;
  /** Callback when pressed */
  onPress?: () => void;
  /** Size variant */
  size?: 'compact' | 'normal' | 'large';
  /** Show animation */
  animate?: boolean;
  /** Show milestone badge */
  showMilestone?: boolean;
}

function getStreakColor(streak: number): string {
  if (streak === 0) return STREAK_COLORS.none;
  if (streak < 3) return STREAK_COLORS.low;
  if (streak < 7) return STREAK_COLORS.medium;
  if (streak < 14) return STREAK_COLORS.hot;
  if (streak < 30) return STREAK_COLORS.blazing;
  return STREAK_COLORS.legendary;
}

function getNextMilestone(streak: number): number | null {
  const next = MILESTONES.find(m => m > streak);
  return next || null;
}

function getFlameIcon(streak: number): string {
  if (streak === 0) return '\u{1F9CA}'; // Ice cube
  if (streak < 3) return '\u{1F525}';   // Fire
  if (streak < 7) return '\u{1F525}';   // Fire
  if (streak < 14) return '\u{1F525}\u{1F525}'; // Double fire
  if (streak < 30) return '\u{1F525}\u{1F525}\u{1F525}'; // Triple fire
  return '\u{2728}\u{1F525}\u{2728}'; // Sparkle fire sparkle
}

const SIZE_CONFIG = {
  compact: {
    container: 36,
    icon: 18,
    count: 14,
    label: 10,
    padding: 6,
  },
  normal: {
    container: 64,
    icon: 24,
    count: 20,
    label: 12,
    padding: 12,
  },
  large: {
    container: 96,
    icon: 36,
    count: 28,
    label: 14,
    padding: 16,
  },
};

export function StreakIndicator({
  currentStreak,
  longestStreak,
  atRisk = false,
  hasFreezeProtection = false,
  onPress,
  size = 'normal',
  animate = true,
  showMilestone = true,
}: StreakIndicatorProps) {
  const { t } = useTranslation();
  const config = SIZE_CONFIG[size];

  // Animation values
  const flameScale = useSharedValue(1);
  const flameBounce = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const warningPulse = useSharedValue(1);
  const shakeX = useSharedValue(0);

  const streakColor = getStreakColor(currentStreak);
  const nextMilestone = getNextMilestone(currentStreak);
  const flameIcon = getFlameIcon(currentStreak);

  useEffect(() => {
    if (!animate) return;

    if (currentStreak > 0) {
      // Flame flicker animation
      flameScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Bounce animation for the count
      flameBounce.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 400, easing: Easing.out(Easing.ease) }),
          withTiming(2, { duration: 400, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );

      // Glow animation for hot streaks
      if (currentStreak >= 7) {
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.4, { duration: 800 }),
            withTiming(0.1, { duration: 800 })
          ),
          -1,
          true
        );
      }
    }

    // Warning shake animation when at risk
    if (atRisk && !hasFreezeProtection) {
      warningPulse.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );

      shakeX.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 50 }),
          withTiming(2, { duration: 100 }),
          withTiming(-2, { duration: 100 }),
          withTiming(0, { duration: 50 })
        ),
        -1,
        false
      );
    } else {
      warningPulse.value = 1;
      shakeX.value = 0;
    }
  }, [currentStreak, atRisk, hasFreezeProtection, animate]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: flameScale.value * warningPulse.value },
      { translateX: shakeX.value },
    ],
  }));

  const countStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: flameBounce.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    backgroundColor: streakColor,
  }));

  const daysToMilestone = useMemo(() => {
    if (!nextMilestone) return null;
    return nextMilestone - currentStreak;
  }, [currentStreak, nextMilestone]);

  const Content = (
    <View style={[styles.container, { padding: config.padding }]}>
      {/* Glow effect for hot streaks */}
      {currentStreak >= 7 && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: config.container * 1.5,
              height: config.container * 1.5,
              borderRadius: config.container * 0.75,
            },
            glowStyle,
          ]}
        />
      )}

      {/* Main flame */}
      <Animated.View style={flameStyle}>
        <Text style={[styles.flameIcon, { fontSize: config.icon }]}>
          {flameIcon}
        </Text>
      </Animated.View>

      {/* Streak count */}
      <Animated.View style={countStyle}>
        <Text
          style={[
            styles.count,
            {
              fontSize: config.count,
              color: currentStreak > 0 ? streakColor : '#999',
            },
          ]}
        >
          {currentStreak}
        </Text>
      </Animated.View>

      {/* Label */}
      {size !== 'compact' && (
        <Text style={[styles.label, { fontSize: config.label }]}>
          {t('leaderboard.days')}
        </Text>
      )}

      {/* At risk warning */}
      {atRisk && !hasFreezeProtection && currentStreak > 0 && (
        <View style={styles.warningBadge}>
          <Text style={styles.warningText}>!</Text>
        </View>
      )}

      {/* Freeze protection indicator */}
      {hasFreezeProtection && (
        <View style={styles.freezeBadge}>
          <Text style={styles.freezeText}>{'\u{1F9CA}'}</Text>
        </View>
      )}

      {/* Milestone progress */}
      {showMilestone && nextMilestone && size === 'large' && (
        <View style={styles.milestoneContainer}>
          <View style={styles.milestoneProgress}>
            <View
              style={[
                styles.milestoneBar,
                {
                  width: `${((currentStreak % (nextMilestone > currentStreak ? nextMilestone - (MILESTONES[MILESTONES.indexOf(nextMilestone) - 1] || 0) : 1)) / (nextMilestone - (MILESTONES[MILESTONES.indexOf(nextMilestone) - 1] || 0))) * 100}%`,
                  backgroundColor: streakColor,
                },
              ]}
            />
          </View>
          <Text style={styles.milestoneText}>
            {daysToMilestone} {t('leaderboard.days')} {'\u{2192}'} {nextMilestone}
          </Text>
        </View>
      )}

      {/* Longest streak badge */}
      {longestStreak && longestStreak > 0 && currentStreak === longestStreak && size !== 'compact' && (
        <View style={styles.recordBadge}>
          <Text style={styles.recordText}>
            {'\u{1F3C6}'} {t('leaderboard.my_rank')}
          </Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.pressable}>
        {Content}
      </Pressable>
    );
  }

  return Content;
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    opacity: 0.2,
  },
  flameIcon: {
    textAlign: 'center',
  },
  count: {
    fontWeight: '900',
    textAlign: 'center',
  },
  label: {
    color: '#666',
    fontWeight: '600',
    marginTop: 2,
  },
  warningBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#faad14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  freezeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
  },
  freezeText: {
    fontSize: 14,
  },
  milestoneContainer: {
    marginTop: 8,
    alignItems: 'center',
    width: '100%',
  },
  milestoneProgress: {
    width: '100%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  milestoneBar: {
    height: '100%',
    borderRadius: 2,
  },
  milestoneText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  recordBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#faad14',
  },
  recordText: {
    fontSize: 10,
    color: '#d48806',
    fontWeight: '600',
  },
});

export default StreakIndicator;
