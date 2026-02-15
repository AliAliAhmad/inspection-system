/**
 * MotivationalToast - Random encouraging messages after completion
 *
 * Shows contextual motivational messages based on performance.
 * Supports Arabic and English.
 */
import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Message categories with icons
export type MessageType =
  | 'completion'     // Task completed
  | 'streak'         // Streak maintained
  | 'milestone'      // Milestone reached
  | 'perfect'        // Perfect score
  | 'fast'           // Quick completion
  | 'quality'        // High quality work
  | 'improvement'    // Better than before
  | 'encouragement'; // General encouragement

interface MessageConfig {
  icon: string;
  color: string;
  bgColor: string;
}

const MESSAGE_CONFIGS: Record<MessageType, MessageConfig> = {
  completion: {
    icon: '\u{2705}', // Check mark
    color: '#52c41a',
    bgColor: '#f6ffed',
  },
  streak: {
    icon: '\u{1F525}', // Fire
    color: '#fa541c',
    bgColor: '#fff2e8',
  },
  milestone: {
    icon: '\u{1F3C6}', // Trophy
    color: '#faad14',
    bgColor: '#fffbe6',
  },
  perfect: {
    icon: '\u{1F31F}', // Glowing star
    color: '#722ed1',
    bgColor: '#f9f0ff',
  },
  fast: {
    icon: '\u{26A1}', // Lightning
    color: '#1677ff',
    bgColor: '#e6f4ff',
  },
  quality: {
    icon: '\u{1F48E}', // Diamond
    color: '#13c2c2',
    bgColor: '#e6fffb',
  },
  improvement: {
    icon: '\u{1F4C8}', // Chart up
    color: '#52c41a',
    bgColor: '#f6ffed',
  },
  encouragement: {
    icon: '\u{1F4AA}', // Muscle
    color: '#1677ff',
    bgColor: '#e6f4ff',
  },
};

// Motivational messages by type
const MESSAGES: Record<MessageType, { en: string[]; ar: string[] }> = {
  completion: {
    en: [
      'Task completed!',
      'Well done!',
      'Great job!',
      'Another one done!',
      'You crushed it!',
      'Excellent work!',
    ],
    ar: [
      'تم اكمال المهمة!',
      'احسنت!',
      'عمل رائع!',
      'مهمة اخرى مكتملة!',
      'عمل ممتاز!',
      'اداء متميز!',
    ],
  },
  streak: {
    en: [
      'Streak on fire!',
      'Keep the momentum!',
      'Consistency is key!',
      'You are unstoppable!',
      'Streak maintained!',
    ],
    ar: [
      'استمر على نفس الوتيرة!',
      'حافظ على الزخم!',
      'الاستمرارية هي المفتاح!',
      'لا يمكن ايقافك!',
      'تم الحفاظ على السلسلة!',
    ],
  },
  milestone: {
    en: [
      'Milestone reached!',
      'New achievement unlocked!',
      'You made history!',
      'Level up!',
      'Record breaker!',
    ],
    ar: [
      'تم تحقيق انجاز!',
      'انجاز جديد!',
      'صنعت التاريخ!',
      'ارتقيت للمستوى التالي!',
      'رقم قياسي جديد!',
    ],
  },
  perfect: {
    en: [
      'Perfect score!',
      'Flawless execution!',
      'Perfection achieved!',
      'Outstanding!',
      'Impeccable work!',
    ],
    ar: [
      'درجة مثالية!',
      'تنفيذ لا تشوبه شائبة!',
      'الكمال تحقق!',
      'استثنائي!',
      'عمل لا غبار عليه!',
    ],
  },
  fast: {
    en: [
      'Lightning fast!',
      'Speed demon!',
      'Quick work!',
      'Blazing speed!',
      'Time efficient!',
    ],
    ar: [
      'سريع كالبرق!',
      'سرعة خارقة!',
      'عمل سريع!',
      'انجاز فوري!',
      'كفاءة عالية!',
    ],
  },
  quality: {
    en: [
      'Quality champion!',
      'Excellence defined!',
      'Top-tier work!',
      'Premium quality!',
      'Gold standard!',
    ],
    ar: [
      'بطل الجودة!',
      'التميز بعينه!',
      'عمل من الطراز الاول!',
      'جودة ممتازة!',
      'المعيار الذهبي!',
    ],
  },
  improvement: {
    en: [
      'Better than before!',
      'Improving daily!',
      'Progress is power!',
      'Getting stronger!',
      'Growth mindset!',
    ],
    ar: [
      'افضل من قبل!',
      'تحسن يومي!',
      'التقدم قوة!',
      'تزداد قوة!',
      'عقلية النمو!',
    ],
  },
  encouragement: {
    en: [
      'Keep going!',
      'You got this!',
      'Stay focused!',
      'Almost there!',
      'Never give up!',
      'Believe in yourself!',
    ],
    ar: [
      'استمر!',
      'انت قادر!',
      'ابق مركزا!',
      'اوشكت على الوصول!',
      'لا تستسلم!',
      'ثق بنفسك!',
    ],
  },
};

export interface MotivationalToastProps {
  /** Whether toast is visible */
  visible: boolean;
  /** Type of message to show */
  type?: MessageType;
  /** Custom message (overrides random selection) */
  customMessage?: string;
  /** Duration to show in ms */
  duration?: number;
  /** Position of toast */
  position?: 'top' | 'bottom';
  /** Callback when toast hides */
  onHide?: () => void;
  /** Points earned to display */
  pointsEarned?: number;
}

export function MotivationalToast({
  visible,
  type = 'completion',
  customMessage,
  duration = 2500,
  position = 'top',
  onHide,
  pointsEarned,
}: MotivationalToastProps) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  const config = MESSAGE_CONFIGS[type];
  const messages = MESSAGES[type][isArabic ? 'ar' : 'en'];
  const message = customMessage || messages[Math.floor(Math.random() * messages.length)];

  // Animation values
  const translateY = useSharedValue(position === 'top' ? -100 : 100);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const iconRotate = useSharedValue(-15);

  const hideToast = useCallback(() => {
    if (onHide) onHide();
  }, [onHide]);

  useEffect(() => {
    if (visible) {
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Slide in
      translateY.value = withSpring(0, { damping: 15, stiffness: 120 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 12 });

      // Icon bounce
      iconRotate.value = withSequence(
        withTiming(15, { duration: 150 }),
        withTiming(-10, { duration: 150 }),
        withSpring(0, { damping: 8 })
      );

      // Auto hide
      const timer = setTimeout(() => {
        translateY.value = withTiming(position === 'top' ? -100 : 100, {
          duration: 300,
          easing: Easing.in(Easing.ease),
        });
        opacity.value = withTiming(0, { duration: 200 });
        scale.value = withTiming(0.8, { duration: 300 });

        // Call onHide after animation
        setTimeout(hideToast, 300);
      }, duration);

      return () => clearTimeout(timer);
    } else {
      translateY.value = position === 'top' ? -100 : 100;
      opacity.value = 0;
      scale.value = 0.8;
    }
  }, [visible, duration, position, hideToast]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        position === 'top' ? styles.topPosition : styles.bottomPosition,
        containerStyle,
      ]}
      pointerEvents="none"
    >
      <View style={[styles.toast, { backgroundColor: config.bgColor, borderColor: config.color }]}>
        <Animated.Text style={[styles.icon, iconStyle]}>
          {config.icon}
        </Animated.Text>

        <View style={styles.textContainer}>
          <Text style={[styles.message, { color: config.color }]}>
            {message}
          </Text>

          {pointsEarned !== undefined && pointsEarned > 0 && (
            <Text style={[styles.points, { color: config.color }]}>
              +{pointsEarned} {isArabic ? 'نقطة' : 'pts'}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    paddingHorizontal: 16,
  },
  topPosition: {
    top: 60,
  },
  bottomPosition: {
    bottom: 100,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    maxWidth: SCREEN_WIDTH - 32,
  },
  icon: {
    fontSize: 24,
    marginRight: 10,
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  message: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  points: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    opacity: 0.8,
  },
});

export default MotivationalToast;
