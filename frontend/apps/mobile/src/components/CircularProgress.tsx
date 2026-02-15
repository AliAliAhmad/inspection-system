/**
 * CircularProgress - Enhanced circular progress indicator with color segments
 *
 * Features:
 * - SVG-based circular progress
 * - Color segments based on progress (red/yellow/green)
 * - Animated transitions between values
 * - Pulse animation at 100%
 * - Center percentage display with optional icon
 * - Multiple sizes (small, medium, large)
 * - Tap to see detailed breakdown
 * - Accessibility labels
 */
import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Create animated versions of SVG components
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

// Color constants
const COLORS = {
  red: '#f5222d',
  yellow: '#faad14',
  green: '#52c41a',
  track: '#E8E8E8',
  trackDark: '#D9D9D9',
};

// Size configurations
const SIZE_CONFIG = {
  small: {
    size: 48,
    strokeWidth: 4,
    fontSize: 12,
    iconSize: 14,
    labelSize: 8,
  },
  medium: {
    size: 80,
    strokeWidth: 6,
    fontSize: 18,
    iconSize: 22,
    labelSize: 10,
  },
  large: {
    size: 120,
    strokeWidth: 8,
    fontSize: 28,
    iconSize: 32,
    labelSize: 12,
  },
  xlarge: {
    size: 160,
    strokeWidth: 10,
    fontSize: 36,
    iconSize: 40,
    labelSize: 14,
  },
};

export type ProgressSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface CircularProgressProps {
  /** Progress value from 0-100 */
  progress: number;
  /** Size variant */
  size?: ProgressSize;
  /** Custom size in pixels (overrides size variant) */
  customSize?: number;
  /** Custom stroke width */
  strokeWidth?: number;
  /** Show percentage in center */
  showPercentage?: boolean;
  /** Custom center icon (emoji or text) */
  centerIcon?: string;
  /** Label text below percentage */
  label?: string;
  /** Use gradient between segment colors */
  useGradient?: boolean;
  /** Enable pulse animation at 100% */
  pulseAt100?: boolean;
  /** Animate progress changes */
  animated?: boolean;
  /** Animation duration in ms */
  animationDuration?: number;
  /** Press handler for detailed breakdown */
  onPress?: () => void;
  /** Detailed breakdown data */
  breakdown?: ProgressBreakdown[];
  /** Custom track color */
  trackColor?: string;
  /** Override progress color (disables segment colors) */
  progressColor?: string;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Show segment indicators around ring */
  showSegmentIndicators?: boolean;
  /** Invert colors (for pass/fail where lower is better) */
  invertColors?: boolean;
}

export interface ProgressBreakdown {
  label: string;
  value: number;
  total: number;
  color?: string;
}

/**
 * Get progress color based on percentage
 */
function getProgressColor(progress: number, invertColors?: boolean): string {
  const p = invertColors ? 100 - progress : progress;
  if (p <= 33) return COLORS.red;
  if (p <= 66) return COLORS.yellow;
  return COLORS.green;
}

/**
 * Get interpolated color for gradient effect
 */
function getGradientColors(progress: number, invertColors?: boolean): { start: string; end: string } {
  const p = invertColors ? 100 - progress : progress;

  if (p <= 33) {
    return { start: COLORS.red, end: COLORS.red };
  }
  if (p <= 50) {
    return { start: COLORS.red, end: COLORS.yellow };
  }
  if (p <= 66) {
    return { start: COLORS.yellow, end: COLORS.yellow };
  }
  if (p <= 83) {
    return { start: COLORS.yellow, end: COLORS.green };
  }
  return { start: COLORS.green, end: COLORS.green };
}

export function CircularProgress({
  progress,
  size = 'medium',
  customSize,
  strokeWidth: customStrokeWidth,
  showPercentage = true,
  centerIcon,
  label,
  useGradient = false,
  pulseAt100 = true,
  animated = true,
  animationDuration = 600,
  onPress,
  breakdown,
  trackColor = COLORS.track,
  progressColor,
  accessibilityLabel,
  showSegmentIndicators = false,
  invertColors = false,
}: CircularProgressProps) {
  // Get size configuration
  const sizeConfig = SIZE_CONFIG[size];
  const actualSize = customSize || sizeConfig.size;
  const actualStrokeWidth = customStrokeWidth || sizeConfig.strokeWidth;

  // Calculate dimensions
  const radius = (actualSize - actualStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = Math.min(100, Math.max(0, progress));

  // Animation values
  const animatedProgress = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  // Get colors
  const currentColor = progressColor || getProgressColor(normalizedProgress, invertColors);
  const gradientColors = useGradient ? getGradientColors(normalizedProgress, invertColors) : null;

  // Update progress animation
  useEffect(() => {
    if (animated) {
      animatedProgress.value = withTiming(normalizedProgress, {
        duration: animationDuration,
        easing: Easing.bezierFn(0.4, 0, 0.2, 1),
      });
    } else {
      animatedProgress.value = normalizedProgress;
    }
  }, [normalizedProgress, animated, animationDuration]);

  // Pulse animation at 100%
  useEffect(() => {
    if (pulseAt100 && normalizedProgress >= 100) {
      // Start pulse animation
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [normalizedProgress, pulseAt100]);

  // Animated progress circle props
  const animatedCircleProps = useAnimatedProps(() => {
    const progressValue = animatedProgress.value;
    const strokeDashoffset = circumference - (progressValue / 100) * circumference;

    return {
      strokeDashoffset,
    };
  });

  // Animated pulse style
  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Handle press with haptic feedback
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }, [onPress]);

  // Announce progress for accessibility
  const progressAccessibilityLabel = accessibilityLabel ||
    `Progress: ${Math.round(normalizedProgress)} percent${label ? `, ${label}` : ''}`;

  // Render segment indicators
  const renderSegmentIndicators = () => {
    if (!showSegmentIndicators) return null;

    const segments = [
      { position: 33, color: COLORS.red },
      { position: 66, color: COLORS.yellow },
      { position: 100, color: COLORS.green },
    ];

    return segments.map((segment, index) => {
      const angle = ((segment.position / 100) * 360) - 90;
      const radian = (angle * Math.PI) / 180;
      const indicatorRadius = radius + actualStrokeWidth + 4;
      const x = actualSize / 2 + Math.cos(radian) * indicatorRadius;
      const y = actualSize / 2 + Math.sin(radian) * indicatorRadius;

      return (
        <View
          key={index}
          style={[
            styles.segmentIndicator,
            {
              position: 'absolute',
              left: x - 3,
              top: y - 3,
              backgroundColor: segment.color,
            },
          ]}
        />
      );
    });
  };

  // Render center content
  const renderCenterContent = () => {
    return (
      <View style={styles.centerContainer}>
        {centerIcon && (
          <Text style={[styles.centerIcon, { fontSize: sizeConfig.iconSize }]}>
            {centerIcon}
          </Text>
        )}
        {showPercentage && !centerIcon && (
          <Text
            style={[
              styles.percentageText,
              {
                fontSize: sizeConfig.fontSize,
                color: currentColor,
              },
            ]}
          >
            {Math.round(normalizedProgress)}%
          </Text>
        )}
        {label && (
          <Text
            style={[
              styles.labelText,
              { fontSize: sizeConfig.labelSize },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </View>
    );
  };

  // Render breakdown modal content (for detailed view)
  const renderBreakdown = () => {
    if (!breakdown || breakdown.length === 0) return null;

    return (
      <View style={styles.breakdownContainer}>
        {breakdown.map((item, index) => (
          <View key={index} style={styles.breakdownItem}>
            <View
              style={[
                styles.breakdownDot,
                { backgroundColor: item.color || currentColor },
              ]}
            />
            <Text style={styles.breakdownLabel}>{item.label}</Text>
            <Text style={styles.breakdownValue}>
              {item.value}/{item.total}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const content = (
    <View
      style={[styles.container, { width: actualSize, height: actualSize }]}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={progressAccessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(normalizedProgress),
      }}
    >
      {/* Pulse effect at 100% */}
      {pulseAt100 && normalizedProgress >= 100 && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: actualSize,
              height: actualSize,
              borderRadius: actualSize / 2,
              borderColor: currentColor,
              borderWidth: actualStrokeWidth / 2,
            },
            animatedPulseStyle,
          ]}
        />
      )}

      <Svg width={actualSize} height={actualSize} style={styles.svg}>
        {/* Gradient definition */}
        {useGradient && gradientColors && (
          <Defs>
            <LinearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={gradientColors.start} />
              <Stop offset="100%" stopColor={gradientColors.end} />
            </LinearGradient>
          </Defs>
        )}

        {/* Background track */}
        <Circle
          cx={actualSize / 2}
          cy={actualSize / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={actualStrokeWidth}
          fill="transparent"
        />

        {/* Progress arc */}
        <AnimatedCircle
          cx={actualSize / 2}
          cy={actualSize / 2}
          r={radius}
          stroke={useGradient ? 'url(#progressGradient)' : currentColor}
          strokeWidth={actualStrokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${actualSize / 2} ${actualSize / 2})`}
          animatedProps={animatedCircleProps}
        />
      </Svg>

      {/* Segment indicators */}
      {renderSegmentIndicators()}

      {/* Center content */}
      {renderCenterContent()}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} style={styles.pressable}>
        {content}
      </Pressable>
    );
  }

  return content;
}

/**
 * Compact version for inline use
 */
export function CircularProgressCompact({
  progress,
  size = 'small',
  ...props
}: Omit<CircularProgressProps, 'size'> & { size?: 'small' | 'medium' }) {
  return (
    <CircularProgress
      {...props}
      progress={progress}
      size={size}
      showPercentage={props.showPercentage ?? true}
      animated={props.animated ?? true}
    />
  );
}

/**
 * Progress ring with label on the right
 */
export interface LabeledProgressProps extends CircularProgressProps {
  title?: string;
  subtitle?: string;
}

export function LabeledCircularProgress({
  title,
  subtitle,
  ...props
}: LabeledProgressProps) {
  return (
    <View style={styles.labeledContainer}>
      <CircularProgress {...props} label={undefined} />
      <View style={styles.labeledContent}>
        {title && <Text style={styles.labeledTitle}>{title}</Text>}
        {subtitle && <Text style={styles.labeledSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
  },
  pulseRing: {
    position: 'absolute',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  centerIcon: {
    textAlign: 'center',
  },
  percentageText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  labelText: {
    color: '#8C8C8C',
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  segmentIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  breakdownContainer: {
    marginTop: 12,
    paddingHorizontal: 8,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 12,
    color: '#595959',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#262626',
  },
  // Labeled version styles
  labeledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labeledContent: {
    marginLeft: 12,
    flex: 1,
  },
  labeledTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  labeledSubtitle: {
    fontSize: 12,
    color: '#8C8C8C',
    marginTop: 2,
  },
});

export default CircularProgress;
