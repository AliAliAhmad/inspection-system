/**
 * SlideTransition - Slide in/out animations for screen transitions
 *
 * Features:
 * - Configurable direction: left, right, up, down
 * - Configurable duration
 * - Respects reduceMotion accessibility setting
 * - Spring-based physics for natural feel
 */
import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, ViewStyle, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useAccessibility } from '../../providers/AccessibilityProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type SlideDirection = 'left' | 'right' | 'up' | 'down';

export interface SlideTransitionProps {
  /** Content to animate */
  children: React.ReactNode;
  /** Direction to slide in from */
  direction?: SlideDirection;
  /** Whether the content is visible */
  visible?: boolean;
  /** Animation duration in ms */
  duration?: number;
  /** Delay before animation starts */
  delay?: number;
  /** Use spring physics instead of timing */
  useSpring?: boolean;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Custom container style */
  style?: ViewStyle;
  /** Spring damping (lower = more bouncy) */
  springDamping?: number;
  /** Spring stiffness */
  springStiffness?: number;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.8,
};

export function SlideTransition({
  children,
  direction = 'right',
  visible = true,
  duration = 300,
  delay = 0,
  useSpring: useSpringAnimation = true,
  onAnimationComplete,
  style,
  springDamping = SPRING_CONFIG.damping,
  springStiffness = SPRING_CONFIG.stiffness,
}: SlideTransitionProps) {
  const { isReduceMotion } = useAccessibility();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const getInitialPosition = useCallback(() => {
    switch (direction) {
      case 'left':
        return { x: -SCREEN_WIDTH, y: 0 };
      case 'right':
        return { x: SCREEN_WIDTH, y: 0 };
      case 'up':
        return { x: 0, y: -SCREEN_HEIGHT };
      case 'down':
        return { x: 0, y: SCREEN_HEIGHT };
      default:
        return { x: SCREEN_WIDTH, y: 0 };
    }
  }, [direction]);

  const handleAnimationComplete = useCallback(() => {
    if (onAnimationComplete) {
      onAnimationComplete();
    }
  }, [onAnimationComplete]);

  useEffect(() => {
    // If reduce motion is enabled, just show/hide instantly
    if (isReduceMotion) {
      translateX.value = 0;
      translateY.value = 0;
      opacity.value = visible ? 1 : 0;
      if (onAnimationComplete) {
        handleAnimationComplete();
      }
      return;
    }

    const { x: initialX, y: initialY } = getInitialPosition();

    if (visible) {
      // Slide in
      if (delay > 0) {
        translateX.value = initialX;
        translateY.value = initialY;
        opacity.value = 0;

        setTimeout(() => {
          if (useSpringAnimation) {
            translateX.value = withSpring(0, {
              damping: springDamping,
              stiffness: springStiffness,
            });
            translateY.value = withSpring(0, {
              damping: springDamping,
              stiffness: springStiffness,
            }, (finished) => {
              if (finished) {
                runOnJS(handleAnimationComplete)();
              }
            });
          } else {
            translateX.value = withTiming(0, {
              duration,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });
            translateY.value = withTiming(0, {
              duration,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }, (finished) => {
              if (finished) {
                runOnJS(handleAnimationComplete)();
              }
            });
          }
          opacity.value = withTiming(1, { duration: duration * 0.3 });
        }, delay);
      } else {
        // Start from initial position
        translateX.value = initialX;
        translateY.value = initialY;
        opacity.value = 0;

        // Animate to center
        requestAnimationFrame(() => {
          if (useSpringAnimation) {
            translateX.value = withSpring(0, {
              damping: springDamping,
              stiffness: springStiffness,
            });
            translateY.value = withSpring(0, {
              damping: springDamping,
              stiffness: springStiffness,
            }, (finished) => {
              if (finished) {
                runOnJS(handleAnimationComplete)();
              }
            });
          } else {
            translateX.value = withTiming(0, {
              duration,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            });
            translateY.value = withTiming(0, {
              duration,
              easing: Easing.bezier(0.25, 0.1, 0.25, 1),
            }, (finished) => {
              if (finished) {
                runOnJS(handleAnimationComplete)();
              }
            });
          }
          opacity.value = withTiming(1, { duration: duration * 0.3 });
        });
      }
    } else {
      // Slide out (reverse direction)
      const exitX = -initialX;
      const exitY = -initialY;

      if (useSpringAnimation) {
        translateX.value = withSpring(exitX, {
          damping: springDamping * 1.5, // More damping for exit
          stiffness: springStiffness,
        });
        translateY.value = withSpring(exitY, {
          damping: springDamping * 1.5,
          stiffness: springStiffness,
        }, (finished) => {
          if (finished) {
            runOnJS(handleAnimationComplete)();
          }
        });
      } else {
        translateX.value = withTiming(exitX, {
          duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        });
        translateY.value = withTiming(exitY, {
          duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }, (finished) => {
          if (finished) {
            runOnJS(handleAnimationComplete)();
          }
        });
      }
      opacity.value = withTiming(0, { duration: duration * 0.7 });
    }
  }, [visible, direction, isReduceMotion, duration, delay, useSpringAnimation, springDamping, springStiffness]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

// ============================================================================
// Preset Transitions
// ============================================================================

export interface SlideInProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
  onAnimationComplete?: () => void;
}

export function SlideInLeft({ children, delay = 0, style, onAnimationComplete }: SlideInProps) {
  return (
    <SlideTransition direction="left" delay={delay} style={style} onAnimationComplete={onAnimationComplete}>
      {children}
    </SlideTransition>
  );
}

export function SlideInRight({ children, delay = 0, style, onAnimationComplete }: SlideInProps) {
  return (
    <SlideTransition direction="right" delay={delay} style={style} onAnimationComplete={onAnimationComplete}>
      {children}
    </SlideTransition>
  );
}

export function SlideInUp({ children, delay = 0, style, onAnimationComplete }: SlideInProps) {
  return (
    <SlideTransition direction="up" delay={delay} style={style} onAnimationComplete={onAnimationComplete}>
      {children}
    </SlideTransition>
  );
}

export function SlideInDown({ children, delay = 0, style, onAnimationComplete }: SlideInProps) {
  return (
    <SlideTransition direction="down" delay={delay} style={style} onAnimationComplete={onAnimationComplete}>
      {children}
    </SlideTransition>
  );
}

// ============================================================================
// Question Transition (optimized for inspection questions)
// ============================================================================

export interface QuestionTransitionProps {
  children: React.ReactNode;
  /** Current question index */
  questionIndex: number;
  /** Previous question index (to determine direction) */
  previousIndex?: number;
  /** Animation duration */
  duration?: number;
  style?: ViewStyle;
}

export function QuestionTransition({
  children,
  questionIndex,
  previousIndex = 0,
  duration = 250,
  style,
}: QuestionTransitionProps) {
  const { isReduceMotion } = useAccessibility();
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isReduceMotion) {
      translateX.value = 0;
      opacity.value = 1;
      scale.value = 1;
      return;
    }

    // Determine direction based on navigation
    const goingForward = questionIndex > previousIndex;
    const initialX = goingForward ? SCREEN_WIDTH * 0.3 : -SCREEN_WIDTH * 0.3;

    translateX.value = initialX;
    opacity.value = 0;
    scale.value = 0.95;

    translateX.value = withSpring(0, {
      damping: 25,
      stiffness: 300,
    });
    opacity.value = withTiming(1, { duration: duration * 0.5 });
    scale.value = withSpring(1, { damping: 20, stiffness: 200 });
  }, [questionIndex, isReduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SlideTransition;
