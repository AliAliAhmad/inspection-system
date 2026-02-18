import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface AssemblyTab {
  id: string;
  name: string;
  nameAr: string;
  questionIds: number[];
  completedCount: number;
  totalCount: number;
}

export interface AssemblyTabBarProps {
  tabs: AssemblyTab[];
  activeTabIndex: number;
  onTabPress: (index: number) => void;
  isArabic?: boolean;
}

// Assembly icons based on common categories
const ASSEMBLY_ICONS: Record<string, string> = {
  hull: 'H',
  engine: 'E',
  motor: 'M',
  hydraulic: 'Y',
  electrical: 'L',
  pneumatic: 'P',
  structural: 'S',
  safety: '!',
  control: 'C',
  transmission: 'T',
  brake: 'B',
  steering: 'W',
  suspension: 'U',
  cooling: 'O',
  fuel: 'F',
  exhaust: 'X',
  general: 'G',
  navigation: 'N',
  communication: 'M',
  auxiliary: 'A',
  deck: 'D',
  propulsion: 'R',
};

function getAssemblyIcon(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [keyword, icon] of Object.entries(ASSEMBLY_ICONS)) {
    if (lowerName.includes(keyword)) {
      return icon;
    }
  }
  return name.charAt(0).toUpperCase();
}

function getStatusColor(completedCount: number, totalCount: number): {
  bg: string;
  border: string;
  text: string;
  status: 'complete' | 'in-progress' | 'not-started';
} {
  if (totalCount === 0) {
    return { bg: '#F5F5F5', border: '#BDBDBD', text: '#757575', status: 'not-started' };
  }

  const percentage = (completedCount / totalCount) * 100;

  if (percentage === 100) {
    return { bg: '#E8F5E9', border: '#4CAF50', text: '#2E7D32', status: 'complete' };
  } else if (percentage > 0) {
    return { bg: '#FFF8E1', border: '#FFC107', text: '#F57C00', status: 'in-progress' };
  } else {
    return { bg: '#F5F5F5', border: '#BDBDBD', text: '#757575', status: 'not-started' };
  }
}

export function AssemblyTabBar({
  tabs,
  activeTabIndex,
  onTabPress,
  isArabic = false,
}: AssemblyTabBarProps) {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const indicatorWidthAnim = useRef(new Animated.Value(100)).current;

  // Store tab measurements
  const tabMeasurements = useRef<{ x: number; width: number }[]>([]);

  // Animate indicator when active tab changes
  useEffect(() => {
    const measurement = tabMeasurements.current[activeTabIndex];
    if (measurement) {
      Animated.parallel([
        Animated.spring(indicatorAnim, {
          toValue: measurement.x,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }),
        Animated.spring(indicatorWidthAnim, {
          toValue: measurement.width,
          useNativeDriver: false,
          friction: 8,
          tension: 100,
        }),
      ]).start();

      // Scroll to center active tab
      if (scrollViewRef.current) {
        const scrollTo = measurement.x - (SCREEN_WIDTH - measurement.width) / 2;
        scrollViewRef.current.scrollTo({
          x: Math.max(0, scrollTo),
          animated: true,
        });
      }
    }
  }, [activeTabIndex, indicatorAnim, indicatorWidthAnim]);

  const handleTabLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    tabMeasurements.current[index] = { x, width };

    // Initialize indicator position on first tab
    if (index === activeTabIndex) {
      indicatorAnim.setValue(x);
      indicatorWidthAnim.setValue(width);
    }
  }, [activeTabIndex, indicatorAnim, indicatorWidthAnim]);

  const handleTabPress = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress(index);
  }, [onTabPress]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          isArabic && styles.scrollContentRTL,
        ]}
      >
        {tabs.map((tab, index) => {
          const isActive = index === activeTabIndex;
          const colors = getStatusColor(tab.completedCount, tab.totalCount);
          const icon = getAssemblyIcon(tab.name);
          const tabName = isArabic && tab.nameAr ? tab.nameAr : tab.name;
          const incompleteCount = tab.totalCount - tab.completedCount;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? colors.bg : '#FAFAFA',
                  borderColor: isActive ? colors.border : '#E0E0E0',
                },
              ]}
              onPress={() => handleTabPress(index)}
              onLayout={(e) => handleTabLayout(index, e)}
              activeOpacity={0.7}
            >
              {/* Icon circle */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isActive ? colors.border : '#E0E0E0',
                  },
                ]}
              >
                {colors.status === 'complete' ? (
                  <Text style={styles.iconText}>V</Text>
                ) : (
                  <Text style={styles.iconText}>{icon}</Text>
                )}
              </View>

              {/* Tab content */}
              <View style={styles.tabContent}>
                <Text
                  style={[
                    styles.tabName,
                    isActive && { color: colors.text, fontWeight: '700' },
                  ]}
                  numberOfLines={1}
                >
                  {tabName}
                </Text>
                <Text style={styles.tabProgress}>
                  {tab.completedCount}/{tab.totalCount}
                </Text>
              </View>

              {/* Mini progress bar */}
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: tab.totalCount > 0
                        ? `${(tab.completedCount / tab.totalCount) * 100}%`
                        : '0%',
                      backgroundColor: colors.border,
                    },
                  ]}
                />
              </View>

              {/* Incomplete badge */}
              {incompleteCount > 0 && colors.status !== 'not-started' && (
                <View style={styles.incompleteBadge}>
                  <Text style={styles.incompleteBadgeText}>{incompleteCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Animated indicator */}
        <Animated.View
          style={[
            styles.indicator,
            {
              transform: [{ translateX: indicatorAnim }],
              width: indicatorWidthAnim,
            },
          ]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    gap: 10,
  },
  scrollContentRTL: {
    flexDirection: 'row-reverse',
  },
  tab: {
    minWidth: 110,
    maxWidth: 150,
    borderRadius: 12,
    borderWidth: 2,
    padding: 10,
    alignItems: 'center',
    position: 'relative',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  tabContent: {
    alignItems: 'center',
    marginBottom: 6,
  },
  tabName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#424242',
    textAlign: 'center',
  },
  tabProgress: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
    marginTop: 2,
  },
  progressBarContainer: {
    width: '100%',
    height: 3,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  incompleteBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF5722',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  incompleteBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    backgroundColor: '#1976D2',
    borderRadius: 2,
  },
});

export default AssemblyTabBar;
