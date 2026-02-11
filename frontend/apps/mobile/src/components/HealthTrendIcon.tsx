/**
 * HealthTrendIcon - Arrow icon for trend direction
 *
 * Displays a colored arrow indicating health trend (improving, stable, degrading)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface HealthTrendIconProps {
  trend: 'improving' | 'stable' | 'degrading';
}

const TREND_CONFIG = {
  improving: {
    arrow: '↑',
    color: '#4CAF50',
  },
  stable: {
    arrow: '→',
    color: '#757575',
  },
  degrading: {
    arrow: '↓',
    color: '#F44336',
  },
};

export function HealthTrendIcon({ trend }: HealthTrendIconProps) {
  const config = TREND_CONFIG[trend];

  return (
    <View style={styles.container}>
      <Text style={[styles.arrow, { color: config.color }]}>{config.arrow}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
  },
});

export default HealthTrendIcon;
