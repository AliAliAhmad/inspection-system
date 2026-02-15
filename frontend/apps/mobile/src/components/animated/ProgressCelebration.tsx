/**
 * ProgressCelebration - Celebration animations at progress milestones
 *
 * Features:
 * - Mini celebration at 25%, 50%, 75% completion
 * - Full confetti at 100%
 * - Uses existing Confetti component
 * - Respects reduceMotion accessibility setting
 */
import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, Text, Dimensions, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  SlideInUp,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '../../providers/AccessibilityProvider';
import { Confetti, ConfettiRef } from '../gamification/Confetti';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type MilestoneType = '25' | '50' | '75' | '100';

export interface ProgressCelebrationRef {
  celebrate: (milestone: MilestoneType) => void;
  checkProgress: (current: number, total: number) => void;
}

export interface ProgressCelebrationProps {
  /** Current progress value (0-100) */
  progress?: number;
  /** Show celebration badges */
  showBadges?: boolean;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Callback when milestone is reached */
  onMilestoneReached?: (milestone: MilestoneType) => void;
  /** Custom style for the celebration container */
  style?: ViewStyle;
  /** Auto-trigger celebrations based on progress */
  autoTrigger?: boolean;
}

interface CelebrationParticle {
  id: number;
  emoji: string;
  x: number;
  delay: number;
}

const MILESTONE_CONFIG = {
  '25': {
    emoji: '\u{1F3C3}', // Running
    message: 'Great start!',
    messageAr: '\u{0628}\u{062F}\u{0627}\u{064A}\u{0629} \u{0631}\u{0627}\u{0626}\u{0639}\u{0629}!',
    color: '#1677ff',
    particles: 3,
  },
  '50': {
    emoji: '\u{1F525}', // Fire
    message: 'Halfway there!',
    messageAr: '\u{0646}\u{0635}\u{0641} \u{0627}\u{0644}\u{0637}\u{0631}\u{064A}\u{0642}!',
    color: '#faad14',
    particles: 5,
  },
  '75': {
    emoji: '\u{26A1}', // Lightning
    message: 'Almost done!',
    messageAr: '\u{0623}\u{0648}\u{0634}\u{0643}\u{062A} \u{0639}\u{0644}\u{0649} \u{0627}\u{0644}\u{0627}\u{0646}\u{062A}\u{0647}\u{0627}\u{0621}!',
    color: '#722ed1',
    particles: 7,
  },
  '100': {
    emoji: '\u{1F389}', // Party popper
    message: 'Complete!',
    messageAr: '\u{0645}\u{0643}\u{062A}\u{0645}\u{0644}!',
    color: '#52c41a',
    particles: 50, // Full confetti
  },
};

const PARTICLE_EMOJIS = [
  '\u{2B50}', // Star
  '\u{1F31F}', // Glowing star
  '\u{2728}', // Sparkles
  '\u{1F4AB}', // Dizzy
  '\u{1F38A}', // Confetti ball
];

function generateParticles(count: number): CelebrationParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: PARTICLE_EMOJIS[Math.floor(Math.random() * PARTICLE_EMOJIS.length)],
    x: Math.random() * SCREEN_WIDTH * 0.8 + SCREEN_WIDTH * 0.1,
    delay: Math.random() * 200,
  }));
}

interface ParticleProps {
  particle: CelebrationParticle;
  isVisible: boolean;
}

function CelebrationParticleComponent({ particle, isVisible }: ParticleProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(particle.x);
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isVisible) {
      // Start animation
      scale.value = withDelay(
        particle.delay,
        withSequence(
          withSpring(1.5, { damping: 8, stiffness: 300 }),
          withSpring(1, { damping: 15, stiffness: 200 })
        )
      );

      translateY.value = withDelay(
        particle.delay,
        withSequence(
          withSpring(-100, { damping: 10, stiffness: 150 }),
          withTiming(-200, { duration: 500, easing: Easing.in(Easing.quad) })
        )
      );

      translateX.value = withDelay(
        particle.delay,
        withTiming(particle.x + (Math.random() - 0.5) * 100, { duration: 800 })
      );

      rotate.value = withDelay(
        particle.delay,
        withTiming(Math.random() * 360, { duration: 800 })
      );

      opacity.value = withDelay(
        particle.delay,
        withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(500, withTiming(0, { duration: 300 }))
        )
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
      translateY.value = 0;
    }
  }, [isVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[styles.particle, animatedStyle]}>
      {particle.emoji}
    </Animated.Text>
  );
}

export const ProgressCelebration = forwardRef<ProgressCelebrationRef, ProgressCelebrationProps>(
  (
    {
      progress = 0,
      showBadges = true,
      hapticEnabled = true,
      onMilestoneReached,
      style,
      autoTrigger = true,
    },
    ref
  ) => {
    const { isReduceMotion } = useAccessibility();
    const confettiRef = useRef<ConfettiRef>(null);

    const [currentMilestone, setCurrentMilestone] = useState<MilestoneType | null>(null);
    const [particles, setParticles] = useState<CelebrationParticle[]>([]);
    const [showMessage, setShowMessage] = useState(false);

    const reachedMilestones = useRef<Set<number>>(new Set());
    const messageScale = useSharedValue(0);
    const messageOpacity = useSharedValue(0);

    const celebrate = useCallback(
      (milestone: MilestoneType) => {
        if (isReduceMotion) {
          // Minimal feedback for reduced motion
          if (hapticEnabled && milestone === '100') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          onMilestoneReached?.(milestone);
          return;
        }

        setCurrentMilestone(milestone);
        const config = MILESTONE_CONFIG[milestone];

        // Haptic feedback
        if (hapticEnabled) {
          if (milestone === '100') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }

        // Generate particles
        if (milestone === '100') {
          // Use full confetti for 100%
          confettiRef.current?.trigger();
        } else {
          // Mini celebration with particles
          setParticles(generateParticles(config.particles));
        }

        // Show message
        if (showBadges) {
          setShowMessage(true);
          messageScale.value = withSequence(
            withSpring(1.2, { damping: 8, stiffness: 400 }),
            withSpring(1, { damping: 15, stiffness: 200 })
          );
          messageOpacity.value = withTiming(1, { duration: 200 });

          // Hide message after delay
          setTimeout(() => {
            messageOpacity.value = withTiming(0, { duration: 300 });
            setTimeout(() => {
              setShowMessage(false);
              setParticles([]);
              setCurrentMilestone(null);
            }, 300);
          }, 1500);
        }

        onMilestoneReached?.(milestone);
      },
      [isReduceMotion, hapticEnabled, showBadges, onMilestoneReached]
    );

    const checkProgress = useCallback(
      (current: number, total: number) => {
        if (total <= 0 || !autoTrigger) return;

        const percentage = Math.round((current / total) * 100);

        // Check milestones
        const milestones: Array<{ threshold: number; type: MilestoneType }> = [
          { threshold: 25, type: '25' },
          { threshold: 50, type: '50' },
          { threshold: 75, type: '75' },
          { threshold: 100, type: '100' },
        ];

        for (const milestone of milestones) {
          if (
            percentage >= milestone.threshold &&
            !reachedMilestones.current.has(milestone.threshold)
          ) {
            reachedMilestones.current.add(milestone.threshold);
            celebrate(milestone.type);
            break; // Only celebrate one milestone at a time
          }
        }
      },
      [autoTrigger, celebrate]
    );

    // Auto-check progress when it changes
    useEffect(() => {
      if (autoTrigger && progress > 0) {
        const milestones: Array<{ threshold: number; type: MilestoneType }> = [
          { threshold: 25, type: '25' },
          { threshold: 50, type: '50' },
          { threshold: 75, type: '75' },
          { threshold: 100, type: '100' },
        ];

        for (const milestone of milestones) {
          if (
            progress >= milestone.threshold &&
            !reachedMilestones.current.has(milestone.threshold)
          ) {
            reachedMilestones.current.add(milestone.threshold);
            celebrate(milestone.type);
            break;
          }
        }
      }
    }, [progress, autoTrigger, celebrate]);

    // Reset milestones when progress resets
    useEffect(() => {
      if (progress === 0) {
        reachedMilestones.current.clear();
      }
    }, [progress]);

    useImperativeHandle(ref, () => ({
      celebrate,
      checkProgress,
    }));

    const animatedMessageStyle = useAnimatedStyle(() => ({
      transform: [{ scale: messageScale.value }],
      opacity: messageOpacity.value,
    }));

    const config = currentMilestone ? MILESTONE_CONFIG[currentMilestone] : null;

    return (
      <View style={[styles.container, style]} pointerEvents="none">
        {/* Full confetti for 100% */}
        <Confetti ref={confettiRef} enableHaptics={false} />

        {/* Mini particles */}
        {particles.map((particle) => (
          <CelebrationParticleComponent
            key={particle.id}
            particle={particle}
            isVisible={true}
          />
        ))}

        {/* Milestone message */}
        {showMessage && config && !isReduceMotion && (
          <Animated.View
            entering={ZoomIn.springify().damping(15)}
            exiting={FadeOut.duration(200)}
            style={[
              styles.messageContainer,
              { backgroundColor: config.color },
              animatedMessageStyle,
            ]}
          >
            <Text style={styles.messageEmoji}>{config.emoji}</Text>
            <Text style={styles.messageText}>{config.message}</Text>
          </Animated.View>
        )}
      </View>
    );
  }
);

ProgressCelebration.displayName = 'ProgressCelebration';

// ============================================================================
// Mini Badge (shows current progress milestone)
// ============================================================================

export interface ProgressBadgeProps {
  /** Current progress (0-100) */
  progress: number;
  /** Size of the badge */
  size?: 'small' | 'medium' | 'large';
  /** Show percentage */
  showPercentage?: boolean;
  /** Custom style */
  style?: ViewStyle;
}

export function ProgressBadge({
  progress,
  size = 'medium',
  showPercentage = true,
  style,
}: ProgressBadgeProps) {
  const { isReduceMotion } = useAccessibility();
  const scale = useSharedValue(1);

  const getMilestoneInfo = () => {
    if (progress >= 100) return MILESTONE_CONFIG['100'];
    if (progress >= 75) return MILESTONE_CONFIG['75'];
    if (progress >= 50) return MILESTONE_CONFIG['50'];
    if (progress >= 25) return MILESTONE_CONFIG['25'];
    return null;
  };

  const milestone = getMilestoneInfo();
  const prevProgress = useRef(progress);

  useEffect(() => {
    // Pulse when crossing a milestone
    const crossedMilestone =
      (prevProgress.current < 25 && progress >= 25) ||
      (prevProgress.current < 50 && progress >= 50) ||
      (prevProgress.current < 75 && progress >= 75) ||
      (prevProgress.current < 100 && progress >= 100);

    if (crossedMilestone && !isReduceMotion) {
      scale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 200 })
      );
    }

    prevProgress.current = progress;
  }, [progress, isReduceMotion]);

  const sizes = {
    small: { container: 32, emoji: 16, text: 10 },
    medium: { container: 44, emoji: 20, text: 12 },
    large: { container: 56, emoji: 28, text: 14 },
  };

  const sizeConfig = sizes[size];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!milestone) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          width: sizeConfig.container,
          height: sizeConfig.container,
          backgroundColor: milestone.color + '20',
          borderColor: milestone.color,
        },
        animatedStyle,
        style,
      ]}
    >
      <Text style={{ fontSize: sizeConfig.emoji }}>{milestone.emoji}</Text>
      {showPercentage && (
        <Text
          style={[
            styles.badgeText,
            { fontSize: sizeConfig.text, color: milestone.color },
          ]}
        >
          {Math.round(progress)}%
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    fontSize: 24,
    top: '50%',
  },
  messageContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  messageEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  messageText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  badge: {
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontWeight: '700',
    marginTop: 2,
  },
});

export default ProgressCelebration;
