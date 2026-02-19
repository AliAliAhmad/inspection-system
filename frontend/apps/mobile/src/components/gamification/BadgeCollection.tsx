/**
 * BadgeCollection - Display grid of earned/available badges
 *
 * Shows all achievement badges with earned/locked states.
 * Used in profile and leaderboard screens.
 */
import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Dimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { AchievementBadge, BadgeType, BADGE_CONFIGS } from './AchievementBadge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BADGE_ITEM_WIDTH = (SCREEN_WIDTH - 48) / 3;

export interface BadgeData {
  type: BadgeType;
  earned: boolean;
  earnedAt?: string;
  progress?: number;
  target?: number;
  pointsAwarded?: number;
}

export interface BadgeCollectionProps {
  /** Array of badge data */
  badges: BadgeData[];
  /** Show earned badges only */
  earnedOnly?: boolean;
  /** Number of columns */
  columns?: 3 | 4;
  /** Badge size */
  badgeSize?: 'small' | 'medium';
  /** Show progress for unearned badges */
  showProgress?: boolean;
  /** Animate badges on mount */
  animateOnMount?: boolean;
  /** Enable badge details modal */
  enableDetails?: boolean;
}

interface BadgeItemProps {
  badge: BadgeData;
  index: number;
  showProgress: boolean;
  onPress: () => void;
  animate: boolean;
}

function BadgeItem({ badge, index, showProgress, onPress, animate }: BadgeItemProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const config = BADGE_CONFIGS[badge.type];

  const progress = badge.progress && badge.target
    ? Math.round((badge.progress / badge.target) * 100)
    : null;

  return (
    <Pressable style={styles.badgeItem} onPress={onPress}>
      <AchievementBadge
        type={badge.type}
        size="medium"
        earned={badge.earned}
        showLabel={false}
        animate={animate && badge.earned}
        animationDelay={index * 100}
      />

      <Text
        style={[
          styles.badgeLabel,
          !badge.earned && styles.badgeLabelLocked,
        ]}
        numberOfLines={2}
      >
        {isArabic ? config.labelAr : config.label}
      </Text>

      {showProgress && !badge.earned && progress !== null && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress}%`, backgroundColor: config.color },
              ]}
            />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
        </View>
      )}
    </Pressable>
  );
}

interface BadgeDetailModalProps {
  badge: BadgeData | null;
  visible: boolean;
  onClose: () => void;
}

function BadgeDetailModal({ badge, visible, onClose }: BadgeDetailModalProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const backdropOpacity = useSharedValue(0);
  const modalScale = useSharedValue(0.9);

  React.useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      modalScale.value = withSpring(1, { damping: 15 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 150 });
      modalScale.value = withTiming(0.9, { duration: 150 });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
  }));

  if (!badge) return null;

  const config = BADGE_CONFIGS[badge.type];
  const progress = badge.progress && badge.target
    ? Math.round((badge.progress / badge.target) * 100)
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <Animated.View style={[styles.modalBackdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.modalContent, modalStyle]}>
          <AchievementBadge
            type={badge.type}
            size="large"
            earned={badge.earned}
            showLabel={false}
            animate={true}
            showGlow={badge.earned}
          />

          <Text style={styles.modalTitle}>
            {isArabic ? config.labelAr : config.label}
          </Text>

          {badge.earned ? (
            <>
              <View style={styles.earnedBadge}>
                <Text style={styles.earnedText}>
                  {'\u{2705}'} {t('leaderboard.earned')}
                </Text>
              </View>

              {badge.earnedAt && (
                <Text style={styles.earnedDate}>
                  {t('leaderboard.earned_on')} {new Date(badge.earnedAt).toLocaleDateString()}
                </Text>
              )}

              {badge.pointsAwarded && (
                <View style={styles.pointsContainer}>
                  <Text style={styles.pointsText}>
                    +{badge.pointsAwarded} {t('leaderboard.points')}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>
                  {'\u{1F512}'} {t('leaderboard.locked')}
                </Text>
              </View>

              {progress !== null && (
                <View style={styles.modalProgressContainer}>
                  <View style={styles.modalProgressBar}>
                    <View
                      style={[
                        styles.modalProgressFill,
                        { width: `${progress}%`, backgroundColor: config.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.modalProgressText}>
                    {badge.progress}/{badge.target} ({progress}%)
                  </Text>
                </View>
              )}
            </>
          )}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>
              {isArabic ? 'اغلاق' : 'Close'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function BadgeCollection({
  badges,
  earnedOnly = false,
  columns = 3,
  badgeSize = 'medium',
  showProgress = true,
  animateOnMount = true,
  enableDetails = true,
}: BadgeCollectionProps) {
  const { t, i18n } = useTranslation();
  const [selectedBadge, setSelectedBadge] = React.useState<BadgeData | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const filteredBadges = useMemo(() => {
    if (earnedOnly) {
      return badges.filter(b => b.earned);
    }
    // Sort: earned first, then by progress
    return [...badges].sort((a, b) => {
      if (a.earned && !b.earned) return -1;
      if (!a.earned && b.earned) return 1;
      const progressA = a.progress && a.target ? a.progress / a.target : 0;
      const progressB = b.progress && b.target ? b.progress / b.target : 0;
      return progressB - progressA;
    });
  }, [badges, earnedOnly]);

  const earnedCount = useMemo(
    () => badges.filter(b => b.earned).length,
    [badges]
  );

  const handleBadgePress = useCallback((badge: BadgeData) => {
    if (enableDetails) {
      setSelectedBadge(badge);
    }
  }, [enableDetails]);

  const handleCloseModal = useCallback(() => {
    setSelectedBadge(null);
  }, []);

  const itemWidth = (SCREEN_WIDTH - 32 - (columns - 1) * 12) / columns;

  return (
    <View style={styles.container}>
      {/* Summary header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {t('leaderboard.achievements')}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {earnedCount}/{badges.length}
          </Text>
        </View>
      </View>

      {/* Badges grid */}
      <View style={styles.grid}>
        {filteredBadges.map((badge, index) => (
          <View key={badge.type} style={[styles.gridItem, { width: itemWidth }]}>
            <BadgeItem
              badge={badge}
              index={index}
              showProgress={showProgress}
              onPress={() => handleBadgePress(badge)}
              animate={animateOnMount && mounted}
            />
          </View>
        ))}
      </View>

      {/* Empty state */}
      {filteredBadges.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u{1F3C5}'}</Text>
          <Text style={styles.emptyText}>
            {earnedOnly
              ? t('leaderboard.no_achievements')
              : t('leaderboard.no_data')
            }
          </Text>
        </View>
      )}

      {/* Detail modal */}
      {enableDetails && (
        <BadgeDetailModal
          badge={selectedBadge}
          visible={selectedBadge !== null}
          onClose={handleCloseModal}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e6f4ff',
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1677ff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  gridItem: {
    alignItems: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 80,
  },
  badgeLabelLocked: {
    color: '#999',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  progressBar: {
    width: 60,
    height: 3,
    backgroundColor: '#e0e0e0',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  progressText: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: SCREEN_WIDTH - 48,
    maxWidth: 320,
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.25)',
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginTop: 16,
    textAlign: 'center',
  },
  earnedBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#f6ffed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#52c41a',
  },
  earnedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#52c41a',
  },
  earnedDate: {
    marginTop: 8,
    fontSize: 13,
    color: '#666',
  },
  pointsContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fffbe6',
    borderRadius: 12,
  },
  pointsText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#faad14',
  },
  lockedBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  lockedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  modalProgressContainer: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
  },
  modalProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  modalProgressText: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  closeButton: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#1677ff',
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default BadgeCollection;
