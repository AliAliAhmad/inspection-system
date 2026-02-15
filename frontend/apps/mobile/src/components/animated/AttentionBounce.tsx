/**
 * AttentionBounce - Bounce animation to draw user attention
 *
 * Features:
 * - Bounce animation for important buttons
 * - Draw user attention to CTAs
 * - Configurable intensity and timing
 * - Respects reduceMotion accessibility setting
 */
import React, {
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '../../providers/AccessibilityProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type BouncePattern = 'gentle' | 'energetic' | 'urgent' | 'subtle' | 'pulse';

export interface AttentionBounceRef {
  startBounce: () => void;
  stopBounce: () => void;
  bounce: () => void; // Single bounce
}

export interface AttentionBounceProps {
  /** Content to animate */
  children: React.ReactNode;
  /** Bounce pattern preset */
  pattern?: BouncePattern;
  /** Enable continuous bouncing */
  continuous?: boolean;
  /** Number of bounces (if not continuous) */
  bounceCount?: number;
  /** Delay between bounce sequences (ms) */
  repeatDelay?: number;
  /** Initial delay before starting (ms) */
  initialDelay?: number;
  /** Enable haptic on bounce */
  hapticEnabled?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Whether the bounce animation is active */
  isActive?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Auto-start bouncing */
  autoStart?: boolean;
  /** Bounce scale (1.0 = no scale) */
  bounceScale?: number;
  /** Bounce height in pixels */
  bounceHeight?: number;
}

const PATTERN_CONFIG = {
  gentle: {
    scale: 1.05,
    height: 8,
    damping: 15,
    stiffness: 180,
    duration: 300,
  },
  energetic: {
    scale: 1.15,
    height: 15,
    damping: 10,
    stiffness: 300,
    duration: 200,
  },
  urgent: {
    scale: 1.1,
    height: 12,
    damping: 8,
    stiffness: 400,
    duration: 150,
  },
  subtle: {
    scale: 1.02,
    height: 4,
    damping: 20,
    stiffness: 150,
    duration: 400,
  },
  pulse: {
    scale: 1.08,
    height: 0,
    damping: 12,
    stiffness: 200,
    duration: 250,
  },
};

export const AttentionBounce = forwardRef<AttentionBounceRef, AttentionBounceProps>(
  (
    {
      children,
      pattern = 'gentle',
      continuous = false,
      bounceCount = 3,
      repeatDelay = 2000,
      initialDelay = 0,
      hapticEnabled = false,
      onPress,
      isActive = true,
      style,
      autoStart = true,
      bounceScale,
      bounceHeight,
    },
    ref
  ) => {
    const { isReduceMotion } = useAccessibility();

    const config = PATTERN_CONFIG[pattern];
    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);
    const [isBouncing, setIsBouncing] = useState(false);

    const finalScale = bounceScale ?? config.scale;
    const finalHeight = bounceHeight ?? config.height;

    const triggerHaptic = useCallback(() => {
      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }, [hapticEnabled]);

    const singleBounce = useCallback(() => {
      if (isReduceMotion) return;

      // Scale bounce
      scale.value = withSequence(
        withSpring(finalScale, {
          damping: config.damping,
          stiffness: config.stiffness,
        }),
        withSpring(1, {
          damping: config.damping,
          stiffness: config.stiffness,
        })
      );

      // Vertical bounce (if height > 0)
      if (finalHeight > 0) {
        translateY.value = withSequence(
          withSpring(-finalHeight, {
            damping: config.damping,
            stiffness: config.stiffness,
          }),
          withSpring(0, {
            damping: config.damping + 5,
            stiffness: config.stiffness,
          })
        );
      }

      if (hapticEnabled) {
        triggerHaptic();
      }
    }, [isReduceMotion, finalScale, finalHeight, config, hapticEnabled, triggerHaptic]);

    const startBounce = useCallback(() => {
      if (isReduceMotion || isBouncing) return;

      setIsBouncing(true);

      const performBounce = () => {
        // Bounce animation
        scale.value = withSequence(
          withSpring(finalScale, {
            damping: config.damping,
            stiffness: config.stiffness,
          }),
          withSpring(1, {
            damping: config.damping,
            stiffness: config.stiffness,
          })
        );

        if (finalHeight > 0) {
          translateY.value = withSequence(
            withSpring(-finalHeight, {
              damping: config.damping,
              stiffness: config.stiffness,
            }),
            withSpring(0, {
              damping: config.damping + 5,
              stiffness: config.stiffness,
            })
          );
        }
      };

      if (continuous) {
        // Continuous bouncing with delay between sequences
        const bounceSequence = () => {
          for (let i = 0; i < bounceCount; i++) {
            setTimeout(() => {
              performBounce();
              if (hapticEnabled && i === 0) {
                triggerHaptic();
              }
            }, i * config.duration * 2);
          }
        };

        bounceSequence();

        // Set up repeat
        const intervalId = setInterval(bounceSequence, repeatDelay + bounceCount * config.duration * 2);

        return () => {
          clearInterval(intervalId);
          setIsBouncing(false);
        };
      } else {
        // Fixed number of bounces
        for (let i = 0; i < bounceCount; i++) {
          setTimeout(() => {
            performBounce();
            if (hapticEnabled && i === 0) {
              triggerHaptic();
            }
            if (i === bounceCount - 1) {
              setIsBouncing(false);
            }
          }, i * config.duration * 2);
        }
      }
    }, [
      isReduceMotion,
      isBouncing,
      continuous,
      bounceCount,
      repeatDelay,
      hapticEnabled,
      finalScale,
      finalHeight,
      config,
      triggerHaptic,
    ]);

    const stopBounce = useCallback(() => {
      cancelAnimation(scale);
      cancelAnimation(translateY);
      scale.value = withSpring(1, { damping: 20, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      setIsBouncing(false);
    }, []);

    useImperativeHandle(ref, () => ({
      startBounce,
      stopBounce,
      bounce: singleBounce,
    }));

    // Auto-start if enabled
    useEffect(() => {
      if (autoStart && isActive && !isReduceMotion) {
        const timeoutId = setTimeout(() => {
          startBounce();
        }, initialDelay);

        return () => {
          clearTimeout(timeoutId);
          stopBounce();
        };
      }
    }, [autoStart, isActive, initialDelay, isReduceMotion]);

    // Stop when inactive
    useEffect(() => {
      if (!isActive) {
        stopBounce();
      }
    }, [isActive, stopBounce]);

    const handlePress = useCallback(() => {
      stopBounce();
      singleBounce();
      onPress?.();
    }, [stopBounce, singleBounce, onPress]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: scale.value },
        { translateY: translateY.value },
      ],
    }));

    if (onPress) {
      return (
        <AnimatedPressable
          onPress={handlePress}
          style={[styles.container, animatedStyle, style]}
        >
          {children}
        </AnimatedPressable>
      );
    }

    return (
      <Animated.View style={[styles.container, animatedStyle, style]}>
        {children}
      </Animated.View>
    );
  }
);

AttentionBounce.displayName = 'AttentionBounce';

// ============================================================================
// Preset Components
// ============================================================================

export interface CTABounceButtonProps {
  /** Button content */
  children: React.ReactNode;
  /** Press handler */
  onPress: () => void;
  /** Bounce pattern */
  pattern?: BouncePattern;
  /** Custom style */
  style?: ViewStyle;
  /** Disabled state */
  disabled?: boolean;
}

export function CTABounceButton({
  children,
  onPress,
  pattern = 'energetic',
  style,
  disabled = false,
}: CTABounceButtonProps) {
  return (
    <AttentionBounce
      pattern={pattern}
      continuous
      bounceCount={2}
      repeatDelay={3000}
      initialDelay={1000}
      onPress={disabled ? undefined : onPress}
      isActive={!disabled}
      style={StyleSheet.flatten([styles.ctaButton, disabled && styles.disabled, style])}
    >
      {children}
    </AttentionBounce>
  );
}

// ============================================================================
// Notification Dot with Bounce
// ============================================================================

export interface BouncingDotProps {
  /** Dot color */
  color?: string;
  /** Dot size */
  size?: number;
  /** Whether the dot is visible */
  visible?: boolean;
  /** Position */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function BouncingDot({
  color = '#ff4d4f',
  size = 10,
  visible = true,
  position = 'top-right',
}: BouncingDotProps) {
  const { isReduceMotion } = useAccessibility();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (visible && !isReduceMotion) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 400, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 400, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(scale);
      scale.value = 1;
    }

    return () => {
      cancelAnimation(scale);
    };
  }, [visible, isReduceMotion]);

  const getPositionStyle = () => {
    switch (position) {
      case 'top-right':
        return { top: -size / 3, right: -size / 3 };
      case 'top-left':
        return { top: -size / 3, left: -size / 3 };
      case 'bottom-right':
        return { bottom: -size / 3, right: -size / 3 };
      case 'bottom-left':
        return { bottom: -size / 3, left: -size / 3 };
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        getPositionStyle(),
        animatedStyle,
      ]}
    />
  );
}

// ============================================================================
// Icon Bounce (for navigation icons, etc.)
// ============================================================================

export interface IconBounceProps {
  /** Icon content */
  children: React.ReactNode;
  /** Trigger bounce on this value change */
  triggerValue?: any;
  /** Custom style */
  style?: ViewStyle;
}

export function IconBounce({ children, triggerValue, style }: IconBounceProps) {
  const { isReduceMotion } = useAccessibility();
  const scale = useSharedValue(1);
  const prevValue = React.useRef(triggerValue);

  useEffect(() => {
    if (triggerValue !== prevValue.current && !isReduceMotion) {
      scale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 400 }),
        withSpring(1, { damping: 15, stiffness: 200 })
      );
    }
    prevValue.current = triggerValue;
  }, [triggerValue, isReduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {},
  ctaButton: {
    // Styles are applied by children
  },
  disabled: {
    opacity: 0.5,
  },
  dot: {
    position: 'absolute',
    zIndex: 10,
  },
});

export default AttentionBounce;
