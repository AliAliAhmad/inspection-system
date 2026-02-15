/**
 * AchievementBadge - Displays achievement/milestone badges
 *
 * Badge designs for milestones:
 * - 10 inspections (Bronze)
 * - 50 inspections (Silver)
 * - 100 inspections (Gold)
 * - Perfect week (Star)
 * - 5-day streak (Flame)
 * - Quality champion (Diamond)
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Badge colors
const COLORS = {
  gold: '#faad14',
  silver: '#8c8c8c',
  bronze: '#d48806',
  diamond: '#13c2c2',
  flame: '#ff4d4f',
  star: '#fadb14',
  purple: '#722ed1',
  green: '#52c41a',
};

export type BadgeType =
  | 'bronze_inspector'      // 10 inspections
  | 'silver_inspector'      // 50 inspections
  | 'gold_inspector'        // 100 inspections
  | 'perfect_week'          // No rejects for a week
  | 'streak_5'              // 5-day streak
  | 'quality_champion'      // Quality champion
  | 'speed_demon'           // Fast completions
  | 'early_bird'            // Early starts
  | 'team_player';          // Team achievements

export interface BadgeConfig {
  icon: string;
  label: string;
  labelAr: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const BADGE_CONFIGS: Record<BadgeType, BadgeConfig> = {
  bronze_inspector: {
    icon: '\u{1F949}', // Bronze medal
    label: '10 Inspections',
    labelAr: '10 عمليات تفتيش',
    color: COLORS.bronze,
    bgColor: '#fffbe6',
    borderColor: COLORS.bronze,
  },
  silver_inspector: {
    icon: '\u{1F948}', // Silver medal
    label: '50 Inspections',
    labelAr: '50 عملية تفتيش',
    color: COLORS.silver,
    bgColor: '#fafafa',
    borderColor: COLORS.silver,
  },
  gold_inspector: {
    icon: '\u{1F947}', // Gold medal
    label: '100 Inspections',
    labelAr: '100 عملية تفتيش',
    color: COLORS.gold,
    bgColor: '#fffbe6',
    borderColor: COLORS.gold,
  },
  perfect_week: {
    icon: '\u{2B50}', // Star
    label: 'Perfect Week',
    labelAr: 'اسبوع مثالي',
    color: COLORS.star,
    bgColor: '#fffbe6',
    borderColor: COLORS.star,
  },
  streak_5: {
    icon: '\u{1F525}', // Fire
    label: '5-Day Streak',
    labelAr: 'سلسلة 5 ايام',
    color: COLORS.flame,
    bgColor: '#fff2f0',
    borderColor: COLORS.flame,
  },
  quality_champion: {
    icon: '\u{1F48E}', // Diamond
    label: 'Quality Champion',
    labelAr: 'بطل الجودة',
    color: COLORS.diamond,
    bgColor: '#e6fffb',
    borderColor: COLORS.diamond,
  },
  speed_demon: {
    icon: '\u{26A1}', // Lightning
    label: 'Speed Demon',
    labelAr: 'سريع البرق',
    color: COLORS.gold,
    bgColor: '#fffbe6',
    borderColor: COLORS.gold,
  },
  early_bird: {
    icon: '\u{1F426}', // Bird
    label: 'Early Bird',
    labelAr: 'الطائر المبكر',
    color: COLORS.green,
    bgColor: '#f6ffed',
    borderColor: COLORS.green,
  },
  team_player: {
    icon: '\u{1F91D}', // Handshake
    label: 'Team Player',
    labelAr: 'روح الفريق',
    color: COLORS.purple,
    bgColor: '#f9f0ff',
    borderColor: COLORS.purple,
  },
};

export interface AchievementBadgeProps {
  /** Type of badge to display */
  type: BadgeType;
  /** Size of the badge */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show the label */
  showLabel?: boolean;
  /** Whether badge is earned */
  earned?: boolean;
  /** Play entrance animation */
  animate?: boolean;
  /** Animation delay in ms */
  animationDelay?: number;
  /** Language for label */
  language?: 'en' | 'ar';
  /** Press handler */
  onPress?: () => void;
  /** Show glow effect for earned badges */
  showGlow?: boolean;
}

const SIZE_MAP = {
  small: { badge: 40, icon: 20, label: 10 },
  medium: { badge: 56, icon: 28, label: 12 },
  large: { badge: 72, icon: 36, label: 14 },
};

export function AchievementBadge({
  type,
  size = 'medium',
  showLabel = true,
  earned = true,
  animate = false,
  animationDelay = 0,
  language = 'en',
  onPress,
  showGlow = true,
}: AchievementBadgeProps) {
  const config = BADGE_CONFIGS[type];
  const sizeConfig = SIZE_MAP[size];

  // Animation values
  const scale = useSharedValue(animate ? 0 : 1);
  const rotation = useSharedValue(animate ? -30 : 0);
  const shimmerPosition = useSharedValue(-1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (animate && earned) {
      // Pop-in animation
      scale.value = withDelay(
        animationDelay,
        withSpring(1, {
          damping: 8,
          stiffness: 150,
          mass: 0.5,
        })
      );

      rotation.value = withDelay(
        animationDelay,
        withSequence(
          withTiming(15, { duration: 150, easing: Easing.out(Easing.ease) }),
          withTiming(-10, { duration: 150, easing: Easing.inOut(Easing.ease) }),
          withSpring(0, { damping: 10 })
        )
      );

      // Shimmer effect
      shimmerPosition.value = withDelay(
        animationDelay + 300,
        withTiming(2, { duration: 600, easing: Easing.inOut(Easing.ease) })
      );

      // Glow pulse
      if (showGlow) {
        glowOpacity.value = withDelay(
          animationDelay + 200,
          withSequence(
            withTiming(0.6, { duration: 200 }),
            withTiming(0, { duration: 800 })
          )
        );
      }

      // Haptic feedback
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }, animationDelay);
    }
  }, [animate, earned, animationDelay, showGlow]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [
      { scale: interpolate(glowOpacity.value, [0, 0.6], [1, 1.5], Extrapolation.CLAMP) },
    ],
  }));

  const label = language === 'ar' ? config.labelAr : config.label;

  const BadgeContent = (
    <View style={styles.badgeWrapper}>
      {/* Glow effect */}
      {showGlow && earned && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: sizeConfig.badge * 1.5,
              height: sizeConfig.badge * 1.5,
              borderRadius: sizeConfig.badge * 0.75,
              backgroundColor: config.color,
            },
            animatedGlowStyle,
          ]}
        />
      )}

      <Animated.View
        style={[
          styles.badge,
          {
            width: sizeConfig.badge,
            height: sizeConfig.badge,
            borderRadius: sizeConfig.badge / 2,
            backgroundColor: earned ? config.bgColor : '#f0f0f0',
            borderColor: earned ? config.borderColor : '#d9d9d9',
          },
          animatedBadgeStyle,
        ]}
      >
        <Text
          style={[
            styles.icon,
            {
              fontSize: sizeConfig.icon,
              opacity: earned ? 1 : 0.3,
            },
          ]}
        >
          {config.icon}
        </Text>
      </Animated.View>

      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              fontSize: sizeConfig.label,
              color: earned ? config.color : '#999',
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.pressable}>
        {BadgeContent}
      </Pressable>
    );
  }

  return BadgeContent;
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
  },
  badgeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    textAlign: 'center',
  },
  label: {
    marginTop: 6,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default AchievementBadge;
