import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface JobStatsCardProps {
  value: number | string;
  label: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendLabel?: string;
  onPress?: () => void;
  variant?: 'compact' | 'full';
  color?: string;
  backgroundColor?: string;
  subtitle?: string;
  loading?: boolean;
}

const DEFAULT_COLORS = {
  primary: '#1976D2',
  success: '#4CAF50',
  danger: '#E53935',
  neutral: '#757575',
};

export function JobStatsCard({
  value,
  label,
  icon,
  trend,
  trendValue,
  trendLabel,
  onPress,
  variant = 'full',
  color = DEFAULT_COLORS.primary,
  backgroundColor,
  subtitle,
  loading = false,
}: JobStatsCardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up': return DEFAULT_COLORS.success;
      case 'down': return DEFAULT_COLORS.danger;
      default: return DEFAULT_COLORS.neutral;
    }
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return '^';
      case 'down': return 'v';
      default: return '-';
    }
  };

  const isCompact = variant === 'compact';

  const content = (
    <View
      style={[
        styles.container,
        isCompact ? styles.containerCompact : styles.containerFull,
        backgroundColor && { backgroundColor },
      ]}
    >
      {/* Icon */}
      {icon && !isCompact && (
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          <Text style={[styles.iconText, { color }]}>{icon}</Text>
        </View>
      )}

      {/* Main Content */}
      <View style={[styles.contentContainer, isCompact && styles.contentContainerCompact]}>
        {icon && isCompact && (
          <Text style={[styles.iconCompact, { color }]}>{icon}</Text>
        )}

        {loading ? (
          <View style={styles.loadingPlaceholder}>
            <View style={[styles.loadingBar, { backgroundColor: color, opacity: 0.3 }]} />
          </View>
        ) : (
          <Text
            style={[
              styles.value,
              isCompact ? styles.valueCompact : styles.valueFull,
              { color },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}

        <Text
          style={[styles.label, isCompact && styles.labelCompact]}
          numberOfLines={1}
        >
          {label}
        </Text>

        {subtitle && !isCompact && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Trend Indicator */}
      {trend && trendValue && (
        <View style={[styles.trendContainer, isCompact && styles.trendContainerCompact]}>
          <View style={styles.trendRow}>
            <Text style={[styles.trendIcon, { color: getTrendColor() }]}>
              {getTrendIcon()}
            </Text>
            <Text style={[styles.trendValue, { color: getTrendColor() }]}>
              {trendValue}
            </Text>
          </View>
          {trendLabel && !isCompact && (
            <Text style={styles.trendLabel} numberOfLines={1}>
              {trendLabel}
            </Text>
          )}
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

// Helper component for a row of stats
export interface JobStatsRowProps {
  stats: JobStatsCardProps[];
  variant?: 'compact' | 'full';
}

export function JobStatsRow({ stats, variant = 'compact' }: JobStatsRowProps) {
  return (
    <View style={styles.statsRow}>
      {stats.map((stat, index) => (
        <View key={index} style={styles.statsRowItem}>
          <JobStatsCard {...stat} variant={variant} />
        </View>
      ))}
    </View>
  );
}

// Helper component for a grid of stats
export interface JobStatsGridProps {
  stats: JobStatsCardProps[];
  columns?: 2 | 3 | 4;
  variant?: 'compact' | 'full';
}

export function JobStatsGrid({ stats, columns = 2, variant = 'full' }: JobStatsGridProps) {
  return (
    <View style={styles.statsGrid}>
      {stats.map((stat, index) => (
        <View
          key={index}
          style={[
            styles.statsGridItem,
            { width: `${100 / columns - 2}%` },
          ]}
        >
          <JobStatsCard {...stat} variant={variant} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  containerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    minWidth: 80,
  },
  containerFull: {
    padding: 16,
    minWidth: 140,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 18,
  },
  iconCompact: {
    fontSize: 14,
    marginRight: 8,
  },
  contentContainer: {
    flex: 1,
  },
  contentContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  value: {
    fontWeight: 'bold',
  },
  valueFull: {
    fontSize: 28,
    marginBottom: 4,
  },
  valueCompact: {
    fontSize: 18,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    color: '#757575',
  },
  labelCompact: {
    fontSize: 11,
  },
  subtitle: {
    fontSize: 11,
    color: '#9E9E9E',
    marginTop: 2,
  },
  trendContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  trendContainerCompact: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
    marginLeft: 8,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendIcon: {
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 2,
  },
  trendValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendLabel: {
    fontSize: 10,
    color: '#9E9E9E',
    marginTop: 2,
  },
  loadingPlaceholder: {
    height: 28,
    justifyContent: 'center',
    marginBottom: 4,
  },
  loadingBar: {
    width: '60%',
    height: 20,
    borderRadius: 4,
  },
  // Stats Row styles
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statsRowItem: {
    flex: 1,
  },
  // Stats Grid styles
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statsGridItem: {
    marginBottom: 8,
  },
});

export default JobStatsCard;
