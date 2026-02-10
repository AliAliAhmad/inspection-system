import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface StatCardProps {
  label: string;
  value: number | string;
  color?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  subtitle?: string;
}

export function StatCard({
  label,
  value,
  color = '#1976D2',
  icon,
  trend,
  trendValue,
  onPress,
  size = 'medium',
  subtitle,
}: StatCardProps) {
  const sizeStyles = {
    small: { minWidth: 70, padding: 8 },
    medium: { minWidth: 80, padding: 12 },
    large: { minWidth: 100, padding: 16 },
  };

  const valueSizes = {
    small: 18,
    medium: 22,
    large: 28,
  };

  const content = (
    <View style={[styles.container, sizeStyles[size]]}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.value, { color, fontSize: valueSizes[size] }]}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {subtitle && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      {trend && trendValue && (
        <View style={styles.trendRow}>
          <Text
            style={[
              styles.trendIcon,
              { color: trend === 'up' ? '#4CAF50' : trend === 'down' ? '#E53935' : '#757575' },
            ]}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </Text>
          <Text
            style={[
              styles.trendValue,
              { color: trend === 'up' ? '#4CAF50' : trend === 'down' ? '#E53935' : '#757575' },
            ]}
          >
            {trendValue}
          </Text>
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  icon: {
    fontSize: 16,
    marginBottom: 4,
  },
  value: {
    fontWeight: 'bold',
  },
  label: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10,
    color: '#9E9E9E',
    marginTop: 1,
    textAlign: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  trendIcon: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  trendValue: {
    fontSize: 10,
    marginLeft: 2,
  },
});

export default StatCard;
