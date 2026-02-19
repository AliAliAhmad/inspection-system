/**
 * CelebrationModal - Full-screen celebration for major milestones
 *
 * Shows animated stars/sparkles with motivational message.
 * Supports Arabic and English.
 */
import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Share,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Sparkle colors
const SPARKLE_COLORS = ['#faad14', '#fadb14', '#fff566', '#fffbe6', '#ffd666'];
const NUM_SPARKLES = 20;

// Motivational messages
const MOTIVATIONAL_MESSAGES = {
  en: [
    'Outstanding work!',
    'You are a superstar!',
    'Keep up the amazing work!',
    'Excellence achieved!',
    'You are on fire!',
    'Incredible performance!',
    'Champion material!',
    'Making history!',
  ],
  ar: [
    'عمل رائع!',
    'انت نجم!',
    'استمر في العمل المذهل!',
    'تم تحقيق التميز!',
    'اداء استثنائي!',
    'اداء لا يصدق!',
    'صانع التاريخ!',
    'بطل حقيقي!',
  ],
};

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

function generateSparkles(): Sparkle[] {
  return Array.from({ length: NUM_SPARKLES }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: Math.random() * SCREEN_HEIGHT * 0.7,
    size: 4 + Math.random() * 8,
    color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
    delay: Math.random() * 1000,
    duration: 800 + Math.random() * 600,
  }));
}

interface SparkleProps {
  sparkle: Sparkle;
  isVisible: boolean;
}

function SparkleComponent({ sparkle, isVisible }: SparkleProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isVisible) {
      // Twinkling animation
      scale.value = withDelay(
        sparkle.delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: sparkle.duration / 2, easing: Easing.out(Easing.ease) }),
            withTiming(0.3, { duration: sparkle.duration / 2, easing: Easing.in(Easing.ease) })
          ),
          -1,
          true
        )
      );

      opacity.value = withDelay(
        sparkle.delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: sparkle.duration / 2 }),
            withTiming(0.4, { duration: sparkle.duration / 2 })
          ),
          -1,
          true
        )
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
    }
  }, [isVisible, sparkle]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.sparkle,
        {
          left: sparkle.x,
          top: sparkle.y,
          width: sparkle.size,
          height: sparkle.size,
          backgroundColor: sparkle.color,
          boxShadow: `0px 0px 8px ${sparkle.color}cc`,
        },
        animatedStyle,
      ]}
    />
  );
}

export interface CelebrationModalProps {
  /** Whether modal is visible */
  visible: boolean;
  /** Close handler */
  onClose: () => void;
  /** Achievement title */
  title: string;
  /** Achievement title in Arabic */
  titleAr?: string;
  /** Achievement description */
  description?: string;
  /** Achievement description in Arabic */
  descriptionAr?: string;
  /** Achievement icon */
  icon?: string;
  /** Points earned */
  pointsEarned?: number;
  /** Show share button */
  showShareButton?: boolean;
  /** Share message */
  shareMessage?: string;
  /** Auto close after ms (0 = don't auto close) */
  autoCloseAfter?: number;
}

export function CelebrationModal({
  visible,
  onClose,
  title,
  titleAr,
  description,
  descriptionAr,
  icon = '\u{1F3C6}', // Trophy
  pointsEarned,
  showShareButton = true,
  shareMessage,
  autoCloseAfter = 0,
}: CelebrationModalProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const [sparkles] = useState(generateSparkles);
  const [motivationalMessage] = useState(
    () => {
      const messages = isArabic ? MOTIVATIONAL_MESSAGES.ar : MOTIVATIONAL_MESSAGES.en;
      return messages[Math.floor(Math.random() * messages.length)];
    }
  );

  // Animation values
  const backdropOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.5);
  const contentOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const iconRotate = useSharedValue(-20);
  const titleTranslateY = useSharedValue(30);
  const titleOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(50);
  const buttonsOpacity = useSharedValue(0);
  const pointsScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Backdrop fade in
      backdropOpacity.value = withTiming(1, { duration: 300 });

      // Content scale in
      contentScale.value = withSpring(1, {
        damping: 12,
        stiffness: 120,
        mass: 0.8,
      });
      contentOpacity.value = withTiming(1, { duration: 200 });

      // Icon animation
      iconScale.value = withDelay(
        200,
        withSequence(
          withSpring(1.2, { damping: 8, stiffness: 200 }),
          withSpring(1, { damping: 10 })
        )
      );
      iconRotate.value = withDelay(
        200,
        withSequence(
          withTiming(10, { duration: 150 }),
          withTiming(-5, { duration: 150 }),
          withSpring(0, { damping: 10 })
        )
      );

      // Title animation
      titleTranslateY.value = withDelay(
        400,
        withSpring(0, { damping: 15 })
      );
      titleOpacity.value = withDelay(
        400,
        withTiming(1, { duration: 300 })
      );

      // Points animation
      if (pointsEarned) {
        pointsScale.value = withDelay(
          600,
          withSequence(
            withSpring(1.3, { damping: 8, stiffness: 200 }),
            withSpring(1, { damping: 10 })
          )
        );
      }

      // Buttons animation
      buttonsTranslateY.value = withDelay(
        800,
        withSpring(0, { damping: 15 })
      );
      buttonsOpacity.value = withDelay(
        800,
        withTiming(1, { duration: 300 })
      );

      // Auto close
      if (autoCloseAfter > 0) {
        const timer = setTimeout(onClose, autoCloseAfter);
        return () => clearTimeout(timer);
      }
    } else {
      // Reset animations
      backdropOpacity.value = 0;
      contentScale.value = 0.5;
      contentOpacity.value = 0;
      iconScale.value = 0;
      iconRotate.value = -20;
      titleTranslateY.value = 30;
      titleOpacity.value = 0;
      buttonsTranslateY.value = 50;
      buttonsOpacity.value = 0;
      pointsScale.value = 0;
    }
  }, [visible, autoCloseAfter, onClose, pointsEarned]);

  const handleShare = useCallback(async () => {
    try {
      const message = shareMessage || (isArabic
        ? `حققت ${title}! ${pointsEarned ? `+${pointsEarned} نقطة` : ''}`
        : `I achieved ${title}! ${pointsEarned ? `+${pointsEarned} points` : ''}`
      );
      await Share.share({ message });
    } catch (error) {
      // Handle error silently
    }
  }, [title, pointsEarned, shareMessage, isArabic]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
    opacity: contentOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleTranslateY.value }],
    opacity: titleOpacity.value,
  }));

  const pointsStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pointsScale.value }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: buttonsTranslateY.value }],
    opacity: buttonsOpacity.value,
  }));

  const displayTitle = isArabic && titleAr ? titleAr : title;
  const displayDescription = isArabic && descriptionAr ? descriptionAr : description;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          {/* Sparkles */}
          {sparkles.map((sparkle) => (
            <SparkleComponent
              key={sparkle.id}
              sparkle={sparkle}
              isVisible={visible}
            />
          ))}
        </Animated.View>

        {/* Content */}
        <Animated.View style={[styles.content, contentStyle]}>
          {/* Icon */}
          <Animated.Text style={[styles.icon, iconStyle]}>
            {icon}
          </Animated.Text>

          {/* Title */}
          <Animated.View style={titleStyle}>
            <Text style={styles.title}>{displayTitle}</Text>

            {displayDescription && (
              <Text style={styles.description}>{displayDescription}</Text>
            )}

            <Text style={styles.motivational}>{motivationalMessage}</Text>
          </Animated.View>

          {/* Points */}
          {pointsEarned !== undefined && pointsEarned > 0 && (
            <Animated.View style={[styles.pointsContainer, pointsStyle]}>
              <Text style={styles.pointsText}>+{pointsEarned}</Text>
              <Text style={styles.pointsLabel}>
                {isArabic ? 'نقطة' : 'points'}
              </Text>
            </Animated.View>
          )}

          {/* Buttons */}
          <Animated.View style={[styles.buttons, buttonsStyle]}>
            {showShareButton && (
              <Pressable style={styles.shareButton} onPress={handleShare}>
                <Text style={styles.shareButtonText}>
                  {isArabic ? 'مشاركة' : 'Share'} {'\u{1F4E4}'}
                </Text>
              </Pressable>
            )}

            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>
                {isArabic ? 'متابعة' : 'Continue'}
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  sparkle: {
    position: 'absolute',
    borderRadius: 999,
    // Note: shadow glow uses dynamic sparkle.color set via inline style + boxShadow
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 340,
  },
  icon: {
    fontSize: 80,
    marginBottom: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#e0e0e0',
    textAlign: 'center',
    marginBottom: 8,
  },
  motivational: {
    fontSize: 18,
    color: '#faad14',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  pointsContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(250, 173, 20, 0.2)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#faad14',
  },
  pointsText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#faad14',
  },
  pointsLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#faad14',
    marginLeft: 8,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: 32,
    gap: 12,
  },
  shareButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#1677ff',
    borderRadius: 12,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

export default CelebrationModal;
