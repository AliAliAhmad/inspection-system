import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  LayoutChangeEvent,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { ChecklistItem } from '@inspection/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// Types
// ============================================================================

export interface AssemblyTab {
  id: string;
  name: string;
  nameAr: string;
  questionIds: number[];
  completedCount: number;
  totalCount: number;
}

export interface AssemblyGroup {
  assembly: string;
  assemblyAr?: string;
  startIndex: number;
  endIndex: number;
  count: number;
  answeredCount: number;
  failedCount: number;
  icon?: string;
}

export interface AssemblyTabsProps {
  groups: AssemblyGroup[];
  currentIndex: number;
  onSelectGroup: (group: AssemblyGroup, groupIndex: number) => void;
  onJumpToIncomplete?: () => void;
  isArabic?: boolean;
  inspectionId?: number | string;
}

export interface SwipeableAssemblyTabsProps {
  tabs: AssemblyTab[];
  activeTabIndex: number;
  onTabChange: (index: number) => void;
  renderContent: (tab: AssemblyTab, index: number) => React.ReactNode;
  isArabic?: boolean;
  inspectionId?: number | string;
}

// ============================================================================
// Assembly Icons
// ============================================================================

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
  default: '*',
};

function getAssemblyIcon(assembly: string): string {
  const key = assembly.toLowerCase();
  for (const [keyword, icon] of Object.entries(ASSEMBLY_ICONS)) {
    if (key.includes(keyword)) {
      return icon;
    }
  }
  return assembly.charAt(0).toUpperCase() || ASSEMBLY_ICONS.default;
}

function getCompletionColor(percentage: number): string {
  if (percentage === 100) return '#4CAF50';
  if (percentage >= 75) return '#8BC34A';
  if (percentage >= 50) return '#FFC107';
  if (percentage >= 25) return '#FF9800';
  return '#E0E0E0';
}

function getStatusColors(completedCount: number, totalCount: number): {
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

// ============================================================================
// AssemblyTabs Component (Original, enhanced)
// ============================================================================

export function AssemblyTabs({
  groups,
  currentIndex,
  onSelectGroup,
  onJumpToIncomplete,
  isArabic = false,
  inspectionId,
}: AssemblyTabsProps) {
  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [tabWidths, setTabWidths] = useState<Record<number, number>>({});
  const [tabPositions, setTabPositions] = useState<Record<number, number>>({});
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const indicatorWidthAnim = useRef(new Animated.Value(100)).current;

  // Find current assembly group
  const currentGroupIndex = useMemo(() => {
    return groups.findIndex(
      (g) => currentIndex >= g.startIndex && currentIndex <= g.endIndex
    );
  }, [groups, currentIndex]);

  // Save last active tab
  useEffect(() => {
    if (inspectionId && currentGroupIndex >= 0) {
      AsyncStorage.setItem(
        `inspection_${inspectionId}_last_tab`,
        String(currentGroupIndex)
      ).catch(() => {});
    }
  }, [inspectionId, currentGroupIndex]);

  // Scroll to current tab when it changes
  useEffect(() => {
    if (currentGroupIndex >= 0 && scrollViewRef.current) {
      const position = tabPositions[currentGroupIndex] || 0;
      const width = tabWidths[currentGroupIndex] || 100;
      const scrollTo = position - (SCREEN_WIDTH - width) / 2;

      scrollViewRef.current.scrollTo({
        x: Math.max(0, scrollTo),
        animated: true,
      });

      // Animate indicator
      Animated.parallel([
        Animated.spring(indicatorAnim, {
          toValue: position,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }),
        Animated.spring(indicatorWidthAnim, {
          toValue: width,
          useNativeDriver: false,
          friction: 8,
          tension: 100,
        }),
      ]).start();
    }
  }, [currentGroupIndex, tabPositions, tabWidths, indicatorAnim, indicatorWidthAnim]);

  const handleTabPress = useCallback((group: AssemblyGroup, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectGroup(group, index);
  }, [onSelectGroup]);

  const handleTabLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { width, x } = event.nativeEvent.layout;
    setTabWidths((prev) => ({ ...prev, [index]: width }));
    setTabPositions((prev) => ({ ...prev, [index]: x }));
  }, []);

  // Find first incomplete assembly
  const firstIncompleteIndex = useMemo(() => {
    return groups.findIndex((g) => g.answeredCount < g.count);
  }, [groups]);

  const handleJumpToIncomplete = useCallback(() => {
    if (firstIncompleteIndex >= 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const group = groups[firstIncompleteIndex];
      onJumpToIncomplete?.();
      onSelectGroup(group, firstIncompleteIndex);
    }
  }, [firstIncompleteIndex, groups, onSelectGroup, onJumpToIncomplete]);

  const totalAnswered = groups.reduce((sum, g) => sum + g.answeredCount, 0);
  const totalQuestions = groups.reduce((sum, g) => sum + g.count, 0);
  const overallProgress = totalQuestions > 0 ? (totalAnswered / totalQuestions) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Overall progress bar */}
      <View style={styles.overallProgressContainer}>
        <View style={styles.overallProgressBar}>
          <Animated.View
            style={[
              styles.overallProgressFill,
              {
                width: `${overallProgress}%`,
                backgroundColor: getCompletionColor(overallProgress),
              },
            ]}
          />
        </View>
        <Text style={styles.overallProgressText}>
          {totalAnswered}/{totalQuestions}
        </Text>
        {firstIncompleteIndex >= 0 && onJumpToIncomplete && (
          <TouchableOpacity
            style={styles.jumpIncompleteButton}
            onPress={handleJumpToIncomplete}
          >
            <Text style={styles.jumpIncompleteText}>
              {t('inspection.jumpToIncomplete', 'Skip')} {'>'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Assembly tabs */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollView}
        contentContainerStyle={[
          styles.tabsContent,
          isArabic && styles.tabsContentRTL,
        ]}
      >
        {groups.map((group, index) => {
          const isActive = index === currentGroupIndex;
          const completionPct = group.count > 0
            ? (group.answeredCount / group.count) * 100
            : 0;
          const isComplete = completionPct === 100;
          const hasFailed = group.failedCount > 0;
          const icon = getAssemblyIcon(group.assembly);
          const colors = getStatusColors(group.answeredCount, group.count);
          const incompleteCount = group.count - group.answeredCount;
          const tabName = isArabic && group.assemblyAr ? group.assemblyAr : group.assembly;

          return (
            <TouchableOpacity
              key={`${group.assembly}-${index}`}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? colors.bg : '#FAFAFA',
                  borderColor: isActive ? colors.border : '#E0E0E0',
                },
                isActive && styles.tabActive,
                isComplete && styles.tabComplete,
                hasFailed && !isComplete && styles.tabHasFailed,
              ]}
              onPress={() => handleTabPress(group, index)}
              onLayout={(e) => handleTabLayout(index, e)}
              activeOpacity={0.7}
            >
              <View style={styles.tabHeader}>
                <View
                  style={[
                    styles.iconContainer,
                    {
                      backgroundColor: isActive ? colors.border : '#E0E0E0',
                    },
                    isComplete && styles.iconContainerComplete,
                    hasFailed && !isComplete && styles.iconContainerFailed,
                  ]}
                >
                  <Text
                    style={[
                      styles.iconText,
                      (isComplete || isActive) && styles.iconTextActive,
                    ]}
                  >
                    {isComplete ? 'V' : icon}
                  </Text>
                </View>
                <View style={styles.tabInfo}>
                  <Text
                    style={[
                      styles.tabName,
                      isActive && { color: colors.text, fontWeight: '700' },
                    ]}
                    numberOfLines={1}
                  >
                    {tabName}
                  </Text>
                  <Text style={styles.tabCount}>
                    {group.answeredCount}/{group.count}
                  </Text>
                </View>
              </View>

              {/* Mini progress bar */}
              <View style={styles.miniProgressBar}>
                <View
                  style={[
                    styles.miniProgressFill,
                    {
                      width: `${completionPct}%`,
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

              {/* Failure indicator */}
              {hasFailed && (
                <View style={styles.failedBadge}>
                  <Text style={styles.failedBadgeText}>{group.failedCount} !</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Animated indicator line */}
        <Animated.View
          style={[
            styles.indicatorLine,
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

// ============================================================================
// SwipeableAssemblyTabs Component (with swipe navigation)
// ============================================================================

export function SwipeableAssemblyTabs({
  tabs,
  activeTabIndex,
  onTabChange,
  renderContent,
  isArabic = false,
  inspectionId,
}: SwipeableAssemblyTabsProps) {
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const [tabWidths, setTabWidths] = useState<Record<number, number>>({});
  const [tabPositions, setTabPositions] = useState<Record<number, number>>({});
  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const indicatorWidthAnim = useRef(new Animated.Value(100)).current;
  const scrollX = useRef(new Animated.Value(0)).current;

  // Restore last active tab
  useEffect(() => {
    const loadLastTab = async () => {
      if (inspectionId) {
        try {
          const lastTab = await AsyncStorage.getItem(
            `inspection_${inspectionId}_last_tab`
          );
          if (lastTab !== null) {
            const tabIndex = parseInt(lastTab, 10);
            if (tabIndex >= 0 && tabIndex < tabs.length) {
              onTabChange(tabIndex);
            }
          }
        } catch (error) {
          // Ignore errors
        }
      }
    };
    loadLastTab();
  }, [inspectionId, tabs.length]);

  // Save last active tab
  useEffect(() => {
    if (inspectionId && activeTabIndex >= 0) {
      AsyncStorage.setItem(
        `inspection_${inspectionId}_last_tab`,
        String(activeTabIndex)
      ).catch(() => {});
    }
  }, [inspectionId, activeTabIndex]);

  // Scroll to active tab in tab bar
  useEffect(() => {
    if (scrollViewRef.current && tabPositions[activeTabIndex] !== undefined) {
      const position = tabPositions[activeTabIndex];
      const width = tabWidths[activeTabIndex] || 100;
      const scrollTo = position - (SCREEN_WIDTH - width) / 2;

      scrollViewRef.current.scrollTo({
        x: Math.max(0, scrollTo),
        animated: true,
      });

      // Animate indicator
      Animated.parallel([
        Animated.spring(indicatorAnim, {
          toValue: position,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }),
        Animated.spring(indicatorWidthAnim, {
          toValue: width,
          useNativeDriver: false,
          friction: 8,
          tension: 100,
        }),
      ]).start();
    }
  }, [activeTabIndex, tabPositions, tabWidths, indicatorAnim, indicatorWidthAnim]);

  // Scroll pager to active tab
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: activeTabIndex,
        animated: true,
      });
    }
  }, [activeTabIndex]);

  const handleTabPress = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabChange(index);
  }, [onTabChange]);

  const handleTabLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    const { width, x } = event.nativeEvent.layout;
    setTabWidths((prev) => ({ ...prev, [index]: width }));
    setTabPositions((prev) => ({ ...prev, [index]: x }));
  }, []);

  const handleSwipeEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (newIndex !== activeTabIndex && newIndex >= 0 && newIndex < tabs.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onTabChange(newIndex);
    }
  }, [activeTabIndex, tabs.length, onTabChange]);

  const totalAnswered = tabs.reduce((sum, t) => sum + t.completedCount, 0);
  const totalQuestions = tabs.reduce((sum, t) => sum + t.totalCount, 0);
  const overallProgress = totalQuestions > 0 ? (totalAnswered / totalQuestions) * 100 : 0;

  // Find first incomplete tab
  const firstIncompleteIndex = useMemo(() => {
    return tabs.findIndex((t) => t.completedCount < t.totalCount);
  }, [tabs]);

  const handleJumpToIncomplete = useCallback(() => {
    if (firstIncompleteIndex >= 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onTabChange(firstIncompleteIndex);
    }
  }, [firstIncompleteIndex, onTabChange]);

  const renderTabItem = useCallback(({ item, index }: { item: AssemblyTab; index: number }) => {
    return (
      <View style={styles.pageContainer}>
        {renderContent(item, index)}
      </View>
    );
  }, [renderContent]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  return (
    <View style={styles.swipeableContainer}>
      {/* Overall progress bar */}
      <View style={styles.overallProgressContainer}>
        <View style={styles.overallProgressBar}>
          <Animated.View
            style={[
              styles.overallProgressFill,
              {
                width: `${overallProgress}%`,
                backgroundColor: getCompletionColor(overallProgress),
              },
            ]}
          />
        </View>
        <Text style={styles.overallProgressText}>
          {totalAnswered}/{totalQuestions}
        </Text>
        {firstIncompleteIndex >= 0 && (
          <TouchableOpacity
            style={styles.jumpIncompleteButton}
            onPress={handleJumpToIncomplete}
          >
            <Text style={styles.jumpIncompleteText}>
              {t('inspection.jumpToIncomplete', 'Skip')} {'>'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.tabsContent,
            isArabic && styles.tabsContentRTL,
          ]}
        >
          {tabs.map((tab, index) => {
            const isActive = index === activeTabIndex;
            const colors = getStatusColors(tab.completedCount, tab.totalCount);
            const icon = getAssemblyIcon(tab.name);
            const tabName = isArabic && tab.nameAr ? tab.nameAr : tab.name;
            const incompleteCount = tab.totalCount - tab.completedCount;

            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.swipeableTab,
                  {
                    backgroundColor: isActive ? colors.bg : '#FAFAFA',
                    borderColor: isActive ? colors.border : '#E0E0E0',
                  },
                ]}
                onPress={() => handleTabPress(index)}
                onLayout={(e) => handleTabLayout(index, e)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.swipeableIconCircle,
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

                <Text
                  style={[
                    styles.swipeableTabName,
                    isActive && { color: colors.text, fontWeight: '700' },
                  ]}
                  numberOfLines={1}
                >
                  {tabName}
                </Text>

                <Text style={styles.swipeableTabProgress}>
                  {tab.completedCount}/{tab.totalCount}
                </Text>

                {/* Mini progress bar */}
                <View style={styles.swipeableProgressBar}>
                  <View
                    style={[
                      styles.swipeableProgressFill,
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
                  <View style={styles.swipeableIncompleteBadge}>
                    <Text style={styles.incompleteBadgeText}>{incompleteCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {/* Animated indicator */}
          <Animated.View
            style={[
              styles.indicatorLine,
              {
                transform: [{ translateX: indicatorAnim }],
                width: indicatorWidthAnim,
              },
            ]}
          />
        </ScrollView>
      </View>

      {/* Swipeable content */}
      <FlatList
        ref={flatListRef}
        data={tabs}
        renderItem={renderTabItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleSwipeEnd}
        getItemLayout={getItemLayout}
        initialScrollIndex={activeTabIndex}
        onScrollToIndexFailed={() => {}}
        scrollEventThrottle={16}
        decelerationRate="fast"
        style={styles.pager}
      />
    </View>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create assembly groups from checklist items
 */
export function createAssemblyGroups(
  items: ChecklistItem[],
  getStatus: (itemId: number) => 'pass' | 'fail' | 'unanswered'
): AssemblyGroup[] {
  const groups: AssemblyGroup[] = [];
  let currentAssembly = '';
  let currentGroup: AssemblyGroup | null = null;

  items.forEach((item, index) => {
    const assembly = (item as any).assembly || (item as any).category || 'General';
    const assemblyAr = (item as any).assembly_ar || (item as any).category_ar;
    const status = getStatus(item.id);

    if (assembly !== currentAssembly) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentAssembly = assembly;
      currentGroup = {
        assembly,
        assemblyAr,
        startIndex: index,
        endIndex: index,
        count: 1,
        answeredCount: status !== 'unanswered' ? 1 : 0,
        failedCount: status === 'fail' ? 1 : 0,
      };
    } else if (currentGroup) {
      currentGroup.endIndex = index;
      currentGroup.count++;
      if (status !== 'unanswered') currentGroup.answeredCount++;
      if (status === 'fail') currentGroup.failedCount++;
    }
  });

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Create AssemblyTab array from checklist items grouped by category/assembly
 */
export function createAssemblyTabs(
  items: ChecklistItem[],
  getStatus: (itemId: number) => 'pass' | 'fail' | 'unanswered'
): AssemblyTab[] {
  const tabMap = new Map<string, AssemblyTab>();

  items.forEach((item) => {
    const assembly = (item as any).assembly || (item as any).category || 'General';
    const assemblyAr = (item as any).assembly_ar || (item as any).category_ar || assembly;
    const status = getStatus(item.id);

    if (!tabMap.has(assembly)) {
      tabMap.set(assembly, {
        id: assembly.toLowerCase().replace(/\s+/g, '-'),
        name: assembly,
        nameAr: assemblyAr,
        questionIds: [],
        completedCount: 0,
        totalCount: 0,
      });
    }

    const tab = tabMap.get(assembly)!;
    tab.questionIds.push(item.id);
    tab.totalCount++;
    if (status !== 'unanswered') {
      tab.completedCount++;
    }
  });

  return Array.from(tabMap.values());
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  swipeableContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  overallProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  overallProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  overallProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#757575',
    minWidth: 50,
    textAlign: 'right',
  },
  jumpIncompleteButton: {
    paddingHorizontal: 8,
  },
  jumpIncompleteText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },
  tabsScrollView: {
    maxHeight: 90,
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    gap: 10,
  },
  tabsContentRTL: {
    flexDirection: 'row-reverse',
  },
  tab: {
    minWidth: 110,
    maxWidth: 150,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    padding: 10,
    marginRight: 8,
    position: 'relative',
  },
  tabActive: {
    // Active styles applied via inline
  },
  tabComplete: {
    // Complete styles applied via inline
  },
  tabHasFailed: {
    // Failed styles applied via inline
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  iconContainerComplete: {
    backgroundColor: '#4CAF50',
  },
  iconContainerFailed: {
    backgroundColor: '#FF9800',
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  iconTextActive: {
    color: '#fff',
  },
  tabInfo: {
    flex: 1,
  },
  tabName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#424242',
  },
  tabCount: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  miniProgressBar: {
    height: 3,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: 3,
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
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  failedBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    backgroundColor: '#FF5722',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  failedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  indicatorLine: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    backgroundColor: '#1976D2',
    borderRadius: 2,
  },

  // Swipeable tab styles
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 8,
  },
  swipeableTab: {
    minWidth: 100,
    maxWidth: 130,
    borderRadius: 12,
    borderWidth: 2,
    padding: 8,
    alignItems: 'center',
    position: 'relative',
  },
  swipeableIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  swipeableTabName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
  },
  swipeableTabProgress: {
    fontSize: 10,
    color: '#757575',
    marginTop: 2,
  },
  swipeableProgressBar: {
    width: '100%',
    height: 3,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  swipeableProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  swipeableIncompleteBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FF5722',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  pager: {
    flex: 1,
  },
  pageContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});

export default AssemblyTabs;
