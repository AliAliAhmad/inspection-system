/**
 * AnimatedProgress - Animated progress components
 *
 * Features:
 * - Smooth progress bar fill animation
 * - Circular progress with animation
 * - Count-up numbers
 * - Percentage transitions
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  Easing,
  useDerivedValue,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ==================== Animated Progress Bar ====================

export interface AnimatedProgressBarProps {
  /** Progress value from 0-100 */
  progress: number;
  /** Height of the bar */
  height?: number;
  /** Primary color */
  color?: string;
  /** Background/track color */
  trackColor?: string;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: 'inside' | 'right' | 'above';
  /** Animation duration in ms */
  duration?: number;
  /** Custom style */
  style?: ViewStyle;
  /** Use gradient colors based on progress */
  useGradientColors?: boolean;
}

export function AnimatedProgressBar({
  progress,
  height = 8,
  color = '#1976D2',
  trackColor = '#E0E0E0',
  showLabel = false,
  labelPosition = 'right',
  duration = 300,
  style,
  useGradientColors = false,
}: AnimatedProgressBarProps) {
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(Math.min(100, Math.max(0, progress)), {
      duration,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress, duration, animatedProgress]);

  const getColorForProgress = (p: number): string => {
    if (!useGradientColors) return color;
    if (p >= 100) return '#4CAF50';
    if (p >= 75) return '#8BC34A';
    if (p >= 50) return '#FF9800';
    if (p >= 25) return '#FF5722';
    return '#F44336';
  };

  const animatedBarStyle = useAnimatedStyle(() => {
    return {
      width: `${animatedProgress.value}%`,
      backgroundColor: getColorForProgress(animatedProgress.value),
    };
  });

  const AnimatedLabel = () => {
    const [displayValue, setDisplayValue] = React.useState(0);

    useDerivedValue(() => {
      runOnJS(setDisplayValue)(Math.round(animatedProgress.value));
    });

    return <Text style={styles.label}>{displayValue}%</Text>;
  };

  return (
    <View style={[styles.progressBarContainer, style]}>
      {showLabel && labelPosition === 'above' && (
        <View style={styles.labelAbove}>
          <AnimatedLabel />
        </View>
      )}
      <View style={styles.progressBarRow}>
        <View
          style={[
            styles.progressBarTrack,
            { height, backgroundColor: trackColor },
          ]}
        >
          <Animated.View
            style={[
              styles.progressBarFill,
              { height, borderRadius: height / 2 },
              animatedBarStyle,
            ]}
          />
          {showLabel && labelPosition === 'inside' && height >= 16 && (
            <View style={styles.labelInside}>
              <AnimatedLabel />
            </View>
          )}
        </View>
        {showLabel && labelPosition === 'right' && (
          <View style={styles.labelRight}>
            <AnimatedLabel />
          </View>
        )}
      </View>
    </View>
  );
}

// ==================== Animated Circular Progress ====================

export interface AnimatedCircularProgressProps {
  /** Progress value from 0-100 */
  progress: number;
  /** Size of the circle */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Primary color */
  color?: string;
  /** Track color */
  trackColor?: string;
  /** Show percentage in center */
  showPercentage?: boolean;
  /** Custom center content */
  centerContent?: React.ReactNode;
  /** Animation duration */
  duration?: number;
  /** Use spring animation */
  useSpring?: boolean;
}

export function AnimatedCircularProgress({
  progress,
  size = 80,
  strokeWidth = 8,
  color = '#1976D2',
  trackColor = '#E0E0E0',
  showPercentage = true,
  centerContent,
  duration = 500,
  useSpring = true,
}: AnimatedCircularProgressProps) {
  const animatedProgress = useSharedValue(0);
  const [displayValue, setDisplayValue] = React.useState(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const normalizedProgress = Math.min(100, Math.max(0, progress));
    if (useSpring) {
      animatedProgress.value = withSpring(normalizedProgress, {
        damping: 15,
        stiffness: 100,
      });
    } else {
      animatedProgress.value = withTiming(normalizedProgress, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    }
  }, [progress, duration, useSpring, animatedProgress]);

  useDerivedValue(() => {
    runOnJS(setDisplayValue)(Math.round(animatedProgress.value));
  });

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset =
      circumference - (animatedProgress.value / 100) * circumference;
    return {
      strokeDashoffset,
    };
  });

  return (
    <View style={[styles.circularContainer, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {/* Track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      <View style={styles.circularCenter}>
        {centerContent || (
          showPercentage && (
            <Text
              style={[
                styles.circularPercentage,
                { fontSize: size * 0.22, color },
              ]}
            >
              {displayValue}%
            </Text>
          )
        )}
      </View>
    </View>
  );
}

// ==================== Animated Count Up ====================

export interface AnimatedCountUpProps {
  /** Target value */
  value: number;
  /** Duration in ms */
  duration?: number;
  /** Decimal places */
  decimals?: number;
  /** Prefix text */
  prefix?: string;
  /** Suffix text */
  suffix?: string;
  /** Text style */
  style?: any;
  /** Use spring animation */
  useSpring?: boolean;
}

export function AnimatedCountUp({
  value,
  duration = 500,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
  useSpring = false,
}: AnimatedCountUpProps) {
  const animatedValue = useSharedValue(0);
  const [displayValue, setDisplayValue] = React.useState(0);

  useEffect(() => {
    if (useSpring) {
      animatedValue.value = withSpring(value, {
        damping: 15,
        stiffness: 80,
      });
    } else {
      animatedValue.value = withTiming(value, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      });
    }
  }, [value, duration, useSpring, animatedValue]);

  useDerivedValue(() => {
    runOnJS(setDisplayValue)(animatedValue.value);
  });

  const formattedValue = displayValue.toFixed(decimals);

  return (
    <Text style={style}>
      {prefix}
      {formattedValue}
      {suffix}
    </Text>
  );
}

// ==================== Animated Percentage ====================

export interface AnimatedPercentageProps {
  /** Percentage value (0-100 or 0-1 based on format) */
  value: number;
  /** Input format: 'percentage' (0-100) or 'decimal' (0-1) */
  format?: 'percentage' | 'decimal';
  /** Show % symbol */
  showSymbol?: boolean;
  /** Text style */
  style?: any;
  /** Duration in ms */
  duration?: number;
  /** Decimal places */
  decimals?: number;
}

export function AnimatedPercentage({
  value,
  format = 'percentage',
  showSymbol = true,
  style,
  duration = 300,
  decimals = 0,
}: AnimatedPercentageProps) {
  const percentValue = format === 'decimal' ? value * 100 : value;

  return (
    <AnimatedCountUp
      value={percentValue}
      duration={duration}
      decimals={decimals}
      suffix={showSymbol ? '%' : ''}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  progressBarContainer: {
    width: '100%',
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarTrack: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#424242',
  },
  labelAbove: {
    marginBottom: 4,
    alignItems: 'flex-end',
  },
  labelRight: {
    marginLeft: 8,
    minWidth: 36,
  },
  labelInside: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  circularContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularPercentage: {
    fontWeight: '700',
  },
});

export default {
  AnimatedProgressBar,
  AnimatedCircularProgress,
  AnimatedCountUp,
  AnimatedPercentage,
};
