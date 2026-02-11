/**
 * RiskGauge - Mini risk gauge component
 *
 * Displays a risk score as a colored gauge/bar or circular indicator.
 * Supports different display modes: bar, circle, or badge.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface RiskGaugeProps {
  /** Risk score from 0-100 */
  score: number;
  /** Display mode */
  mode?: 'bar' | 'circle' | 'badge';
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Show label text */
  showLabel?: boolean;
  /** Custom label */
  label?: string;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RiskInfo {
  level: RiskLevel;
  color: string;
  bgColor: string;
  label: string;
}

function getRiskInfo(score: number): RiskInfo {
  if (score >= 80) {
    return { level: 'critical', color: '#C62828', bgColor: '#FFCDD2', label: 'Critical' };
  }
  if (score >= 60) {
    return { level: 'high', color: '#E65100', bgColor: '#FFE0B2', label: 'High' };
  }
  if (score >= 40) {
    return { level: 'medium', color: '#F57F17', bgColor: '#FFF9C4', label: 'Medium' };
  }
  return { level: 'low', color: '#2E7D32', bgColor: '#C8E6C9', label: 'Low' };
}

const SIZES = {
  small: { bar: 4, circle: 32, fontSize: 10, labelSize: 9 },
  medium: { bar: 6, circle: 48, fontSize: 14, labelSize: 11 },
  large: { bar: 8, circle: 64, fontSize: 18, labelSize: 13 },
};

export function RiskGauge({
  score,
  mode = 'bar',
  size = 'medium',
  showLabel = true,
  label,
}: RiskGaugeProps) {
  const riskInfo = useMemo(() => getRiskInfo(score), [score]);
  const sizeConfig = SIZES[size];

  if (mode === 'badge') {
    return (
      <View style={[styles.badge, { backgroundColor: riskInfo.bgColor }]}>
        <Text style={[styles.badgeScore, { color: riskInfo.color, fontSize: sizeConfig.fontSize }]}>
          {score}
        </Text>
        {showLabel && (
          <Text style={[styles.badgeLabel, { color: riskInfo.color, fontSize: sizeConfig.labelSize }]}>
            {label || riskInfo.label}
          </Text>
        )}
      </View>
    );
  }

  if (mode === 'circle') {
    const circleSize = sizeConfig.circle;
    const strokeWidth = size === 'small' ? 3 : size === 'medium' ? 4 : 5;
    const radius = (circleSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;

    return (
      <View style={[styles.circleContainer, { width: circleSize, height: circleSize }]}>
        {/* Background circle */}
        <View
          style={[
            styles.circleBackground,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              borderWidth: strokeWidth,
              borderColor: '#E0E0E0',
            },
          ]}
        />
        {/* Progress arc - simplified as a colored overlay */}
        <View
          style={[
            styles.circleProgress,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              borderWidth: strokeWidth,
              borderColor: riskInfo.color,
              borderTopColor: score >= 25 ? riskInfo.color : 'transparent',
              borderRightColor: score >= 50 ? riskInfo.color : 'transparent',
              borderBottomColor: score >= 75 ? riskInfo.color : 'transparent',
              borderLeftColor: score >= 100 ? riskInfo.color : 'transparent',
              transform: [{ rotate: '-45deg' }],
            },
          ]}
        />
        {/* Center content */}
        <View style={styles.circleCenter}>
          <Text style={[styles.circleScore, { color: riskInfo.color, fontSize: sizeConfig.fontSize }]}>
            {score}
          </Text>
        </View>
      </View>
    );
  }

  // Bar mode (default)
  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <Text style={[styles.barScore, { color: riskInfo.color }]}>{score}</Text>
        {showLabel && (
          <Text style={[styles.barLabel, { color: riskInfo.color }]}>
            {label || riskInfo.label}
          </Text>
        )}
      </View>
      <View style={[styles.barTrack, { height: sizeConfig.bar }]}>
        <View
          style={[
            styles.barFill,
            {
              width: `${score}%`,
              backgroundColor: riskInfo.color,
              height: sizeConfig.bar,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Badge mode
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  badgeScore: {
    fontWeight: '700',
  },
  badgeLabel: {
    fontWeight: '600',
  },

  // Circle mode
  circleContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBackground: {
    position: 'absolute',
  },
  circleProgress: {
    position: 'absolute',
  },
  circleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleScore: {
    fontWeight: '700',
  },

  // Bar mode
  barContainer: {
    width: '100%',
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  barScore: {
    fontSize: 14,
    fontWeight: '700',
  },
  barLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  barTrack: {
    width: '100%',
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 4,
  },
});

export default RiskGauge;
