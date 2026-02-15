import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, ViewStyle } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Colors for skeleton
const SKELETON_BASE = '#f0f0f0';
const SKELETON_HIGHLIGHT = '#e0e0e0';

// Shimmer animation component
function ShimmerOverlay() {
  const translateX = useRef(new Animated.Value(-SCREEN_WIDTH)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: SCREEN_WIDTH,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [translateX]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [{ translateX }],
        },
      ]}
    >
      <View style={styles.shimmerGradient} />
    </Animated.View>
  );
}

// Base skeleton block with shimmer
interface SkeletonBlockProps {
  width: number | string;
  height: number;
  style?: ViewStyle;
  borderRadius?: number;
}

function SkeletonBlock({ width, height, style, borderRadius = 8 }: SkeletonBlockProps) {
  return (
    <View
      style={[
        {
          width: width as number,
          height,
          backgroundColor: SKELETON_BASE,
          borderRadius,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <ShimmerOverlay />
    </View>
  );
}

// Circle skeleton (for avatars)
interface SkeletonCircleProps {
  size: number;
  style?: ViewStyle;
}

function SkeletonCircle({ size, style }: SkeletonCircleProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: SKELETON_BASE,
          borderRadius: size / 2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <ShimmerOverlay />
    </View>
  );
}

// ==================== SKELETON VARIANTS ====================

// Card Skeleton - for standard cards
export interface CardSkeletonProps {
  showAvatar?: boolean;
  lines?: number;
  style?: ViewStyle;
}

export function CardSkeleton({ showAvatar = false, lines = 3, style }: CardSkeletonProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        {showAvatar && <SkeletonCircle size={40} style={{ marginRight: 12 }} />}
        <View style={{ flex: 1 }}>
          <SkeletonBlock width="60%" height={18} />
          <SkeletonBlock width="40%" height={14} style={{ marginTop: 8 }} />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock
            key={i}
            width={i === lines - 1 ? '70%' : '100%'}
            height={14}
            style={{ marginTop: i === 0 ? 0 : 8 }}
          />
        ))}
      </View>
    </View>
  );
}

// List Skeleton - for list items
export interface ListSkeletonProps {
  count?: number;
  showAvatar?: boolean;
  showBadge?: boolean;
  style?: ViewStyle;
}

export function ListSkeleton({
  count = 5,
  showAvatar = true,
  showBadge = true,
  style,
}: ListSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.listItem}>
          {showAvatar && <SkeletonCircle size={48} style={{ marginRight: 12 }} />}
          <View style={{ flex: 1 }}>
            <View style={styles.listItemHeader}>
              <SkeletonBlock width="55%" height={16} />
              {showBadge && <SkeletonBlock width={60} height={22} borderRadius={11} />}
            </View>
            <SkeletonBlock width="75%" height={14} style={{ marginTop: 6 }} />
            <SkeletonBlock width="45%" height={12} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Detail Skeleton - for detail pages
export interface DetailSkeletonProps {
  showImage?: boolean;
  sections?: number;
  style?: ViewStyle;
}

export function DetailSkeleton({ showImage = true, sections = 3, style }: DetailSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      {showImage && (
        <SkeletonBlock
          width="100%"
          height={200}
          borderRadius={12}
          style={{ marginBottom: 16 }}
        />
      )}
      {/* Header */}
      <View style={styles.card}>
        <SkeletonBlock width="70%" height={24} />
        <View style={styles.row}>
          <SkeletonBlock width={80} height={28} borderRadius={14} style={{ marginTop: 12 }} />
          <SkeletonBlock width={80} height={28} borderRadius={14} style={{ marginTop: 12 }} />
        </View>
      </View>
      {/* Sections */}
      {Array.from({ length: sections }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width="40%" height={16} style={{ marginBottom: 12 }} />
          <SkeletonBlock width="100%" height={14} />
          <SkeletonBlock width="90%" height={14} style={{ marginTop: 8 }} />
          <SkeletonBlock width="75%" height={14} style={{ marginTop: 8 }} />
        </View>
      ))}
      {/* Action button */}
      <View style={styles.card}>
        <SkeletonBlock width="100%" height={48} borderRadius={8} />
      </View>
    </View>
  );
}

// Grid Skeleton - for grid layouts
export interface GridSkeletonProps {
  columns?: number;
  count?: number;
  itemHeight?: number;
  style?: ViewStyle;
}

export function GridSkeleton({
  columns = 2,
  count = 6,
  itemHeight = 120,
  style,
}: GridSkeletonProps) {
  const itemWidth = `${100 / columns - 3}%`;

  return (
    <View style={[styles.grid, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.gridItem, { width: itemWidth as any }]}>
          <SkeletonBlock width="100%" height={itemHeight - 48} borderRadius={8} />
          <SkeletonBlock width="80%" height={14} style={{ marginTop: 8 }} />
          <SkeletonBlock width="50%" height={12} style={{ marginTop: 4 }} />
        </View>
      ))}
    </View>
  );
}

// Dashboard Skeleton - for dashboard pages with stats
export interface DashboardSkeletonProps {
  statsCount?: number;
  showChart?: boolean;
  listCount?: number;
  style?: ViewStyle;
}

export function DashboardSkeleton({
  statsCount = 4,
  showChart = true,
  listCount = 3,
  style,
}: DashboardSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Title */}
      <SkeletonBlock width="60%" height={24} style={{ marginBottom: 16 }} />
      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {Array.from({ length: statsCount }).map((_, i) => (
          <View key={i} style={styles.statCard}>
            <SkeletonBlock width="40%" height={28} />
            <SkeletonBlock width="60%" height={14} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
      {/* Chart placeholder */}
      {showChart && (
        <View style={styles.card}>
          <SkeletonBlock width="50%" height={16} style={{ marginBottom: 12 }} />
          <SkeletonBlock width="100%" height={180} borderRadius={8} />
        </View>
      )}
      {/* Recent items */}
      <View style={styles.card}>
        <SkeletonBlock width="40%" height={16} style={{ marginBottom: 12 }} />
        {Array.from({ length: listCount }).map((_, i) => (
          <View key={i} style={[styles.listItem, { paddingHorizontal: 0 }]}>
            <SkeletonCircle size={36} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <SkeletonBlock width="70%" height={14} />
              <SkeletonBlock width="40%" height={12} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Form Skeleton - for form pages
export interface FormSkeletonProps {
  fields?: number;
  style?: ViewStyle;
}

export function FormSkeleton({ fields = 4, style }: FormSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.card}>
        {Array.from({ length: fields }).map((_, i) => (
          <View key={i} style={{ marginBottom: i === fields - 1 ? 0 : 20 }}>
            <SkeletonBlock width="30%" height={14} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="100%" height={48} borderRadius={8} />
          </View>
        ))}
      </View>
      {/* Submit button */}
      <SkeletonBlock width="100%" height={52} borderRadius={8} style={{ marginTop: 16 }} />
    </View>
  );
}

// Job Card Skeleton - specific for job/inspection cards
export interface JobCardSkeletonProps {
  count?: number;
  style?: ViewStyle;
}

export function JobCardSkeleton({ count = 3, style }: JobCardSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.jobCard}>
          <View style={styles.jobCardHeader}>
            <View style={{ flex: 1 }}>
              <SkeletonBlock width="50%" height={16} />
              <SkeletonBlock width="70%" height={20} style={{ marginTop: 4 }} />
            </View>
            <SkeletonBlock width={70} height={24} borderRadius={12} />
          </View>
          <View style={styles.jobCardBody}>
            <View style={styles.jobCardInfo}>
              <SkeletonCircle size={16} />
              <SkeletonBlock width={80} height={14} style={{ marginLeft: 8 }} />
            </View>
            <View style={styles.jobCardInfo}>
              <SkeletonCircle size={16} />
              <SkeletonBlock width={100} height={14} style={{ marginLeft: 8 }} />
            </View>
          </View>
          <View style={styles.jobCardFooter}>
            <SkeletonBlock width={90} height={36} borderRadius={8} />
            <SkeletonBlock width={90} height={36} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

// Inspection Checklist Skeleton
export interface ChecklistSkeletonProps {
  count?: number;
  style?: ViewStyle;
}

export function ChecklistSkeleton({ count = 5, style }: ChecklistSkeletonProps) {
  return (
    <View style={[styles.container, style]}>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <SkeletonBlock width="30%" height={12} />
        <SkeletonBlock width="100%" height={6} borderRadius={3} style={{ marginTop: 8 }} />
      </View>
      {/* Checklist items */}
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.checklistItem}>
          <View style={{ flex: 1 }}>
            <SkeletonBlock width="15%" height={12} />
            <SkeletonBlock width="85%" height={16} style={{ marginTop: 4 }} />
            <SkeletonBlock width="60%" height={14} style={{ marginTop: 4 }} />
          </View>
          <View style={styles.checklistActions}>
            <SkeletonBlock width={44} height={44} borderRadius={22} />
            <SkeletonBlock width={44} height={44} borderRadius={22} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
  },
  listItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
  },
  gridItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  shimmerGradient: {
    width: '100%',
    height: '100%',
    backgroundColor: SKELETON_HIGHLIGHT,
    opacity: 0.5,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  jobCardBody: {
    marginTop: 12,
    gap: 8,
  },
  jobCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  progressContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  checklistActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
  },
});

export default {
  Card: CardSkeleton,
  List: ListSkeleton,
  Detail: DetailSkeleton,
  Grid: GridSkeleton,
  Dashboard: DashboardSkeleton,
  Form: FormSkeleton,
  JobCard: JobCardSkeleton,
  Checklist: ChecklistSkeleton,
};
