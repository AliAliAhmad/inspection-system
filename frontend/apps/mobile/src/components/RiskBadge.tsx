/**
 * RiskBadge - Reusable risk level badge
 *
 * Displays a colored badge for risk levels (critical, high, medium, low)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface RiskBadgeProps {
  level: 'critical' | 'high' | 'medium' | 'low';
  size?: 'small' | 'medium';
}

const RISK_COLORS = {
  critical: '#ff4d4f',
  high: '#fa8c16',
  medium: '#faad14',
  low: '#52c41a',
};

const RISK_LABELS = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export function RiskBadge({ level, size = 'medium' }: RiskBadgeProps) {
  const backgroundColor = RISK_COLORS[level];
  const label = RISK_LABELS[level];

  return (
    <View style={[styles.badge, { backgroundColor }, size === 'small' && styles.badgeSmall]}>
      <Text style={[styles.text, size === 'small' && styles.textSmall]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  textSmall: {
    fontSize: 9,
    fontWeight: '700',
  },
});

export default RiskBadge;
