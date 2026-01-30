import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';

function SkeletonBlock({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as number, height, backgroundColor: '#e0e0e0', borderRadius: 8, opacity },
        style,
      ]}
    />
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <SkeletonBlock width="60%" height={18} />
          <SkeletonBlock width="40%" height={14} style={{ marginTop: 8 }} />
          <SkeletonBlock width="80%" height={14} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <SkeletonBlock width="70%" height={22} />
        <SkeletonBlock width="40%" height={16} style={{ marginTop: 12 }} />
      </View>
      <View style={styles.card}>
        <SkeletonBlock width="100%" height={14} />
        <SkeletonBlock width="90%" height={14} style={{ marginTop: 8 }} />
        <SkeletonBlock width="85%" height={14} style={{ marginTop: 8 }} />
        <SkeletonBlock width="95%" height={14} style={{ marginTop: 8 }} />
      </View>
      <View style={styles.card}>
        <SkeletonBlock width="100%" height={44} />
      </View>
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBlock width="60%" height={24} style={{ marginBottom: 16 }} />
      <View style={styles.grid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.statCard}>
            <SkeletonBlock width="50%" height={28} />
            <SkeletonBlock width="70%" height={14} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '47%', backgroundColor: '#fff', borderRadius: 12, padding: 16 },
});
