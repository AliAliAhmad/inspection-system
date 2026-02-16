import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useWindowDimensions,
  TouchableOpacity,
  useColorScheme,
  I18nManager,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';

// ─── Types ───────────────────────────────────────────────────

type AlertSeverity = 'critical' | 'warning' | 'info' | 'success';

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  messageAr?: string;
  source?: string;
  timestamp: Date;
  screen?: string;
}

// ─── Severity config ─────────────────────────────────────────

const SEVERITY = {
  critical: { color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)', darkBg: 'rgba(255,77,79,0.18)', icon: '!!' },
  warning:  { color: '#faad14', bg: 'rgba(250,173,20,0.08)', darkBg: 'rgba(250,173,20,0.15)', icon: '!' },
  info:     { color: '#1890ff', bg: 'rgba(24,144,255,0.06)', darkBg: 'rgba(24,144,255,0.12)', icon: 'i' },
  success:  { color: '#52c41a', bg: 'rgba(82,196,26,0.06)', darkBg: 'rgba(82,196,26,0.12)', icon: '\u2713' },
};

// ─── Screens where banner is hidden ──────────────────────────

const HIDDEN_SCREENS = ['WorkPlan', 'WorkPlanOverview', 'WorkPlanJobDetail', 'UnassignedJobs'];

// ─── Mock alerts (replace with real API) ─────────────────────

function getMockAlerts(): AlertItem[] {
  const now = new Date();
  return [
    {
      id: '1',
      severity: 'critical',
      message: 'Pump P-2204 vibration exceeds threshold',
      messageAr: '\u0627\u0647\u062A\u0632\u0627\u0632 \u0627\u0644\u0645\u0636\u062E\u0629 P-2204 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062F',
      source: 'Equipment',
      timestamp: new Date(now.getTime() - 2 * 60000),
    },
    {
      id: '6',
      severity: 'critical',
      message: 'Safety valve SV-3302 failed pressure test',
      messageAr: '\u0635\u0645\u0627\u0645 \u0627\u0644\u0623\u0645\u0627\u0646 SV-3302 \u0641\u0634\u0644 \u0641\u064A \u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0636\u063A\u0637',
      source: 'Safety',
      timestamp: new Date(now.getTime() - 5 * 60000),
    },
    {
      id: '2',
      severity: 'warning',
      message: '3 inspections overdue for East Berth',
      messageAr: '3 \u0641\u062D\u0648\u0635\u0627\u062A \u0645\u062A\u0623\u062E\u0631\u0629 \u0641\u064A \u0627\u0644\u0631\u0635\u064A\u0641 \u0627\u0644\u0634\u0631\u0642\u064A',
      source: 'Inspections',
      timestamp: new Date(now.getTime() - 8 * 60000),
    },
    {
      id: '5',
      severity: 'warning',
      message: 'Generator G-101 approaching service interval (4,850/5,000 hrs)',
      messageAr: '\u0627\u0644\u0645\u0648\u0644\u062F G-101 \u064A\u0642\u062A\u0631\u0628 \u0645\u0646 \u0641\u062A\u0631\u0629 \u0627\u0644\u0635\u064A\u0627\u0646\u0629',
      source: 'Running Hours',
      timestamp: new Date(now.getTime() - 45 * 60000),
    },
    {
      id: '3',
      severity: 'info',
      message: 'Ahmed K. completed 12 inspections today',
      messageAr: '\u0623\u062D\u0645\u062F \u0643. \u0623\u0643\u0645\u0644 12 \u0641\u062D\u0635\u0627\u064B \u0627\u0644\u064A\u0648\u0645',
      source: 'Performance',
      timestamp: new Date(now.getTime() - 15 * 60000),
    },
    {
      id: '4',
      severity: 'success',
      message: 'Weekly target reached: 94% completion',
      messageAr: '\u0647\u062F\u0641 \u0627\u0644\u0623\u0633\u0628\u0648\u0639: 94% \u0625\u0643\u0645\u0627\u0644',
      source: 'KPI',
      timestamp: new Date(now.getTime() - 30 * 60000),
    },
    {
      id: '7',
      severity: 'info',
      message: 'New work plan published for Week 8',
      messageAr: '\u062A\u0645 \u0646\u0634\u0631 \u062E\u0637\u0629 \u0639\u0645\u0644 \u062C\u062F\u064A\u062F\u0629 \u0644\u0644\u0623\u0633\u0628\u0648\u0639 8',
      source: 'Work Plan',
      timestamp: new Date(now.getTime() - 60 * 60000),
    },
  ];
}

// ─── Time helper ─────────────────────────────────────────────

function timeAgo(date: Date, isAr: boolean): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return isAr ? '\u0627\u0644\u0622\u0646' : 'now';
  if (mins < 60) return isAr ? `${mins}\u062F` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return isAr ? `${hrs}\u0633` : `${hrs}h`;
}

// ─── Tablet Ticker (scrolling, full ticker for tablets) ──────

function TabletTicker({ items, isDark, isAr }: { items: AlertItem[]; isDark: boolean; isAr: boolean }) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    const totalWidth = items.length * 320;
    Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -totalWidth,
        duration: items.length * 8000,
        useNativeDriver: true,
      }),
    ).start();
  }, [items.length]);

  const hasCritical = items.some(i => i.severity === 'critical');

  return (
    <View style={[
      styles.tabletContainer,
      { backgroundColor: isDark ? '#1a1a1a' : '#fff', borderBottomColor: isDark ? '#303030' : '#f0f0f0' },
      hasCritical && { borderBottomColor: 'rgba(255,77,79,0.25)' },
    ]}>
      {/* LIVE label */}
      <View style={[styles.liveLabel, { backgroundColor: isDark ? '#262626' : '#fafafa', borderRightColor: isDark ? '#303030' : '#f0f0f0' }]}>
        <View style={[styles.liveDot, hasCritical && styles.liveDotCritical]} />
        <Text style={[styles.liveLabelText, { color: isDark ? 'rgba(255,255,255,0.85)' : '#262626' }]}>
          {isAr ? '\u0645\u0628\u0627\u0634\u0631' : 'LIVE'}
        </Text>
      </View>

      {/* Scrolling area */}
      <View style={styles.scrollArea}>
        <Animated.View style={[styles.scrollTrack, { transform: [{ translateX: scrollAnim }] }]}>
          {[...items, ...items].map((item, idx) => {
            const cfg = SEVERITY[item.severity];
            return (
              <View key={`${item.id}-${idx}`} style={styles.tickerItem}>
                <View style={[styles.severityDot, { backgroundColor: cfg.color }]} />
                {item.source && (
                  <View style={[styles.sourceTag, { backgroundColor: isDark ? cfg.darkBg : cfg.bg }]}>
                    <Text style={[styles.sourceText, { color: cfg.color }]}>{item.source}</Text>
                  </View>
                )}
                <Text
                  style={[styles.itemMessage, { color: isDark ? 'rgba(255,255,255,0.8)' : '#434343' }]}
                  numberOfLines={1}
                >
                  {isAr && item.messageAr ? item.messageAr : item.message}
                </Text>
                <Text style={[styles.itemTime, { color: isDark ? 'rgba(255,255,255,0.35)' : '#bfbfbf' }]}>
                  {timeAgo(item.timestamp, isAr)}
                </Text>
                <View style={[styles.itemDivider, { backgroundColor: isDark ? '#303030' : '#e8e8e8' }]} />
              </View>
            );
          })}
        </Animated.View>
      </View>

      {/* Count */}
      <View style={[styles.countBadge, { backgroundColor: isDark ? '#262626' : '#fafafa', borderLeftColor: isDark ? '#303030' : '#f0f0f0' }]}>
        <Text style={[styles.countText, { color: hasCritical ? '#ff4d4f' : isDark ? 'rgba(255,255,255,0.5)' : '#8c8c8c' }]}>
          {items.length}
        </Text>
      </View>
    </View>
  );
}

// ─── Phone Alert (critical-only popup, auto-dismiss) ─────────

function PhoneCriticalAlert({ items, isDark, isAr }: { items: AlertItem[]; isDark: boolean; isAr: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const criticalItems = items.filter(i => i.severity === 'critical' && !dismissed.has(i.id));

  useEffect(() => {
    if (criticalItems.length === 0) return;

    // Slide in
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss after 6 seconds, rotate to next
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -60, duration: 250, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setCurrentIndex(prev => (prev + 1) % criticalItems.length);
        slideAnim.setValue(-60);
        opacityAnim.setValue(0);
      });
    }, 6000);

    return () => clearTimeout(timer);
  }, [currentIndex, criticalItems.length]);

  const handleDismiss = useCallback(() => {
    if (criticalItems.length === 0) return;
    const current = criticalItems[currentIndex % criticalItems.length];
    if (!current) return;
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -60, duration: 200, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setDismissed(prev => new Set(prev).add(current.id));
      setCurrentIndex(prev => prev + 1);
      slideAnim.setValue(-60);
      opacityAnim.setValue(0);
    });
  }, [criticalItems, currentIndex]);

  if (criticalItems.length === 0) return null;
  const item = criticalItems[currentIndex % criticalItems.length];
  if (!item) return null;

  return (
    <Animated.View
      style={[
        styles.phoneContainer,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
          backgroundColor: isDark ? '#2a1215' : '#fff5f5',
          borderBottomColor: 'rgba(255,77,79,0.3)',
        },
      ]}
    >
      <View style={styles.phoneContent}>
        {/* Critical indicator */}
        <View style={styles.phoneCriticalDot} />

        {/* Source */}
        {item.source && (
          <View style={styles.phoneCriticalTag}>
            <Text style={styles.phoneCriticalTagText}>{item.source}</Text>
          </View>
        )}

        {/* Message */}
        <Text
          style={[styles.phoneMessage, { color: isDark ? 'rgba(255,255,255,0.9)' : '#434343' }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {isAr && item.messageAr ? item.messageAr : item.message}
        </Text>

        {/* Dismiss */}
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.phoneDismiss}>\u2715</Text>
        </TouchableOpacity>
      </View>

      {/* Multiple indicator */}
      {criticalItems.length > 1 && (
        <View style={styles.phoneMulti}>
          {criticalItems.map((_, i) => (
            <View
              key={i}
              style={[
                styles.phoneMultiDot,
                i === (currentIndex % criticalItems.length) && styles.phoneMultiDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main export ─────────────────────────────────────────────

export default function LiveAlertBanner() {
  const { width } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const isAr = I18nManager.isRTL;
  const isTablet = width >= 768;

  const [items, setItems] = useState<AlertItem[]>([]);

  // Get current screen name to hide on Work Planning
  const currentRoute = useNavigationState(state => {
    if (!state) return '';
    const route = state.routes[state.index];
    if (route.state) {
      const nested = route.state as any;
      const nestedRoute = nested.routes?.[nested.index];
      return nestedRoute?.name || route.name;
    }
    return route.name;
  });

  useEffect(() => {
    setItems(getMockAlerts());
    const interval = setInterval(() => setItems(getMockAlerts()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Hide on Work Planning screens
  if (HIDDEN_SCREENS.includes(currentRoute)) return null;
  if (items.length === 0) return null;

  // Sort: critical first
  const sorted = [...items].sort((a, b) => {
    const p: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    if (p[a.severity] !== p[b.severity]) return p[a.severity] - p[b.severity];
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  if (isTablet) {
    return <TabletTicker items={sorted} isDark={isDark} isAr={isAr} />;
  }

  return <PhoneCriticalAlert items={sorted} isDark={isDark} isAr={isAr} />;
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Tablet ticker ──
  tabletContainer: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  liveLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: '100%',
    borderRightWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#52c41a',
  },
  liveDotCritical: {
    backgroundColor: '#ff4d4f',
  },
  liveLabelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  scrollArea: {
    flex: 1,
    overflow: 'hidden',
    height: '100%',
  },
  scrollTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  tickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    height: '100%',
  },
  severityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sourceTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  sourceText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  itemMessage: {
    fontSize: 11.5,
    maxWidth: 240,
  },
  itemTime: {
    fontSize: 10,
  },
  itemDivider: {
    width: 1,
    height: 12,
    marginHorizontal: 10,
    opacity: 0.6,
  },
  countBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    height: '100%',
    borderLeftWidth: 1,
    minWidth: 32,
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Phone critical alert ──
  phoneContainer: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  phoneContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneCriticalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4d4f',
  },
  phoneCriticalTag: {
    backgroundColor: 'rgba(255,77,79,0.1)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  phoneCriticalTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ff4d4f',
    textTransform: 'uppercase',
  },
  phoneMessage: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  phoneDismiss: {
    fontSize: 13,
    color: '#bfbfbf',
    paddingLeft: 8,
  },
  phoneMulti: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  phoneMultiDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,77,79,0.25)',
  },
  phoneMultiDotActive: {
    backgroundColor: '#ff4d4f',
    width: 10,
  },
});
