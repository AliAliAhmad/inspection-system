/**
 * ProgressRing - Circular progress indicator for goals
 *
 * Displays progress as a circular ring with percentage.
 * Used primarily for goal progress visualization.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface ProgressRingProps {
  /** Progress value from 0-100 */
  progress: number;
  /** Size of the ring in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Primary color for the progress */
  color?: string;
  /** Background track color */
  trackColor?: string;
  /** Show percentage in center */
  showPercentage?: boolean;
  /** Custom center content */
  centerContent?: React.ReactNode;
  /** Animate the progress */
  animated?: boolean;
}

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = '#1976D2',
  trackColor = '#E0E0E0',
  showPercentage = true,
  centerContent,
  animated = false,
}: ProgressRingProps) {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalizedProgress / 100) * circumference;

  // Determine color based on progress
  const getProgressColor = () => {
    if (color) return color;
    if (normalizedProgress >= 100) return '#4CAF50';
    if (normalizedProgress >= 75) return '#8BC34A';
    if (normalizedProgress >= 50) return '#FF9800';
    if (normalizedProgress >= 25) return '#FF5722';
    return '#F44336';
  };

  const progressColor = getProgressColor();

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Center content */}
      <View style={styles.centerContainer}>
        {centerContent || (
          showPercentage && (
            <Text
              style={[
                styles.percentage,
                {
                  fontSize: size < 48 ? 10 : size < 72 ? 14 : 18,
                  color: progressColor,
                },
              ]}
            >
              {Math.round(normalizedProgress)}%
            </Text>
          )
        )}
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
  svg: {
    position: 'absolute',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontWeight: '700',
  },
});

export default ProgressRing;
