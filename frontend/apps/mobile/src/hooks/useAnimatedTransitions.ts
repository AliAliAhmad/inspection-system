/**
 * useAnimatedTransitions - Hook for managing animated transitions
 *
 * Provides animation utilities that respect reduceMotion accessibility setting.
 */
import { useCallback, useMemo } from 'react';
import {
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  SharedValue,
  AnimationCallback,
} from 'react-native-reanimated';
import { useAccessibility } from '../providers/AccessibilityProvider';

export interface SpringConfig {
  damping?: number;
  stiffness?: number;
  mass?: number;
}

export interface TimingConfig {
  duration?: number;
  easing?: any; // Easing function from reanimated
}

export interface AnimationPresets {
  spring: {
    gentle: SpringConfig;
    bouncy: SpringConfig;
    stiff: SpringConfig;
    default: SpringConfig;
  };
  timing: {
    fast: TimingConfig;
    normal: TimingConfig;
    slow: TimingConfig;
  };
}

const DEFAULT_PRESETS: AnimationPresets = {
  spring: {
    gentle: { damping: 25, stiffness: 150, mass: 1 },
    bouncy: { damping: 10, stiffness: 300, mass: 0.5 },
    stiff: { damping: 30, stiffness: 400, mass: 0.8 },
    default: { damping: 20, stiffness: 200, mass: 0.8 },
  },
  timing: {
    fast: { duration: 150, easing: Easing.out(Easing.quad) },
    normal: { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) },
    slow: { duration: 500, easing: Easing.inOut(Easing.quad) },
  },
};

export interface UseAnimatedTransitionsResult {
  /** Whether reduce motion is enabled */
  isReduceMotion: boolean;

  /** Animation presets */
  presets: AnimationPresets;

  /** Create a spring animation (skips animation if reduce motion) */
  animateSpring: <T extends number>(
    sharedValue: SharedValue<T>,
    toValue: T,
    config?: SpringConfig | keyof AnimationPresets['spring'],
    callback?: AnimationCallback
  ) => void;

  /** Create a timing animation (skips animation if reduce motion) */
  animateTiming: <T extends number>(
    sharedValue: SharedValue<T>,
    toValue: T,
    config?: TimingConfig | keyof AnimationPresets['timing'],
    callback?: AnimationCallback
  ) => void;

  /** Create a sequence animation */
  animateSequence: <T extends number>(
    sharedValue: SharedValue<T>,
    animations: Array<{ value: T; type: 'spring' | 'timing'; config?: any }>
  ) => void;

  /** Get duration adjusted for reduce motion */
  getAdjustedDuration: (duration: number) => number;

  /** Get animation value - instant if reduce motion, animated otherwise */
  getAnimatedValue: <T>(
    value: T,
    animatedValue: T,
    useAnimation?: boolean
  ) => T;
}

export function useAnimatedTransitions(): UseAnimatedTransitionsResult {
  const { isReduceMotion } = useAccessibility();

  const animateSpring = useCallback(
    <T extends number>(
      sharedValue: SharedValue<T>,
      toValue: T,
      config?: SpringConfig | keyof AnimationPresets['spring'],
      callback?: AnimationCallback
    ) => {
      if (isReduceMotion) {
        sharedValue.value = toValue;
        callback?.(true);
        return;
      }

      const springConfig =
        typeof config === 'string'
          ? DEFAULT_PRESETS.spring[config]
          : config ?? DEFAULT_PRESETS.spring.default;

      sharedValue.value = withSpring(toValue, springConfig, callback);
    },
    [isReduceMotion]
  );

  const animateTiming = useCallback(
    <T extends number>(
      sharedValue: SharedValue<T>,
      toValue: T,
      config?: TimingConfig | keyof AnimationPresets['timing'],
      callback?: AnimationCallback
    ) => {
      if (isReduceMotion) {
        sharedValue.value = toValue;
        callback?.(true);
        return;
      }

      const timingConfig =
        typeof config === 'string'
          ? DEFAULT_PRESETS.timing[config]
          : config ?? DEFAULT_PRESETS.timing.normal;

      sharedValue.value = withTiming(toValue, timingConfig, callback);
    },
    [isReduceMotion]
  );

  const animateSequence = useCallback(
    <T extends number>(
      sharedValue: SharedValue<T>,
      animations: Array<{ value: T; type: 'spring' | 'timing'; config?: any }>
    ) => {
      if (isReduceMotion) {
        // Just set to final value
        const lastAnimation = animations[animations.length - 1];
        if (lastAnimation) {
          sharedValue.value = lastAnimation.value;
        }
        return;
      }

      const animationFunctions = animations.map(({ value, type, config }) => {
        if (type === 'spring') {
          return withSpring(value, config ?? DEFAULT_PRESETS.spring.default);
        } else {
          return withTiming(value, config ?? DEFAULT_PRESETS.timing.normal);
        }
      });

      sharedValue.value = withSequence(...animationFunctions);
    },
    [isReduceMotion]
  );

  const getAdjustedDuration = useCallback(
    (duration: number): number => {
      if (isReduceMotion) {
        return 0;
      }
      return duration;
    },
    [isReduceMotion]
  );

  const getAnimatedValue = useCallback(
    <T>(value: T, animatedValue: T, useAnimation: boolean = true): T => {
      if (isReduceMotion || !useAnimation) {
        return value;
      }
      return animatedValue;
    },
    [isReduceMotion]
  );

  const result = useMemo(
    () => ({
      isReduceMotion,
      presets: DEFAULT_PRESETS,
      animateSpring,
      animateTiming,
      animateSequence,
      getAdjustedDuration,
      getAnimatedValue,
    }),
    [
      isReduceMotion,
      animateSpring,
      animateTiming,
      animateSequence,
      getAdjustedDuration,
      getAnimatedValue,
    ]
  );

  return result;
}

// ============================================================================
// Animation Utilities
// ============================================================================

/**
 * Create a pulse animation that respects reduce motion
 */
export function createPulseAnimation(
  scale: SharedValue<number>,
  isReduceMotion: boolean,
  config?: { pulseScale?: number; duration?: number }
) {
  const { pulseScale = 1.1, duration = 200 } = config ?? {};

  if (isReduceMotion) {
    scale.value = 1;
    return;
  }

  scale.value = withSequence(
    withSpring(pulseScale, { damping: 10, stiffness: 400 }),
    withSpring(1, { damping: 15, stiffness: 200 })
  );
}

/**
 * Create a shake animation that respects reduce motion
 */
export function createShakeAnimation(
  translateX: SharedValue<number>,
  isReduceMotion: boolean,
  config?: { intensity?: number; cycles?: number; duration?: number }
) {
  const { intensity = 8, cycles = 3, duration = 50 } = config ?? {};

  if (isReduceMotion) {
    translateX.value = 0;
    return;
  }

  const shakes: number[] = [];
  for (let i = 0; i < cycles; i++) {
    shakes.push(intensity, -intensity);
  }
  shakes.push(0);

  const animations = shakes.map((value) =>
    withTiming(value, { duration, easing: Easing.inOut(Easing.quad) })
  );

  translateX.value = withSequence(...animations);
}

/**
 * Create a bounce animation that respects reduce motion
 */
export function createBounceAnimation(
  translateY: SharedValue<number>,
  isReduceMotion: boolean,
  config?: { bounceHeight?: number }
) {
  const { bounceHeight = 10 } = config ?? {};

  if (isReduceMotion) {
    translateY.value = 0;
    return;
  }

  translateY.value = withSequence(
    withSpring(-bounceHeight, { damping: 8, stiffness: 400 }),
    withSpring(0, { damping: 12, stiffness: 200 })
  );
}

/**
 * Create a fade animation that respects reduce motion
 */
export function createFadeAnimation(
  opacity: SharedValue<number>,
  visible: boolean,
  isReduceMotion: boolean,
  config?: { duration?: number }
) {
  const { duration = 200 } = config ?? {};
  const targetOpacity = visible ? 1 : 0;

  if (isReduceMotion) {
    opacity.value = targetOpacity;
    return;
  }

  opacity.value = withTiming(targetOpacity, {
    duration,
    easing: Easing.out(Easing.quad),
  });
}

export default useAnimatedTransitions;
