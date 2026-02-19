/**
 * CardFlip - 3D flip animation for cards
 *
 * Features:
 * - Flip animation when completing a question
 * - Front = question, Back = answered state
 * - 3D flip effect with perspective
 * - Respects reduceMotion accessibility setting
 */
import React, {
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, ViewStyle, Dimensions, Text, TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
  Easing,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '../../providers/AccessibilityProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface CardFlipRef {
  flip: () => void;
  flipTo: (side: 'front' | 'back') => void;
  reset: () => void;
}

export interface CardFlipProps {
  /** Front content (question) */
  frontContent: React.ReactNode;
  /** Back content (answered state) */
  backContent: React.ReactNode;
  /** Whether the card is flipped (showing back) */
  isFlipped?: boolean;
  /** Animation duration in ms */
  duration?: number;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Callback when flip completes */
  onFlipComplete?: (isFlipped: boolean) => void;
  /** Card width */
  width?: number | string;
  /** Card height */
  height?: number | string;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom front style */
  frontStyle?: ViewStyle;
  /** Custom back style */
  backStyle?: ViewStyle;
  /** Flip direction: horizontal or vertical */
  flipDirection?: 'horizontal' | 'vertical';
  /** Perspective depth */
  perspective?: number;
  /** Use spring physics */
  useSpring?: boolean;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 150,
  mass: 1,
};

export const CardFlip = forwardRef<CardFlipRef, CardFlipProps>(
  (
    {
      frontContent,
      backContent,
      isFlipped = false,
      duration = 400,
      hapticEnabled = true,
      onFlipComplete,
      width = '100%',
      height = 'auto',
      style,
      frontStyle,
      backStyle,
      flipDirection = 'horizontal',
      perspective = 1000,
      useSpring: useSpringAnimation = true,
    },
    ref
  ) => {
    const { isReduceMotion } = useAccessibility();

    const rotation = useSharedValue(isFlipped ? 180 : 0);
    const [showBack, setShowBack] = useState(isFlipped);

    const handleFlipComplete = useCallback(
      (flipped: boolean) => {
        setShowBack(flipped);
        onFlipComplete?.(flipped);
      },
      [onFlipComplete]
    );

    const triggerFlip = useCallback(() => {
      const targetRotation = rotation.value === 0 ? 180 : 0;
      const willShowBack = targetRotation === 180;

      if (hapticEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (isReduceMotion) {
        // Instant flip for reduced motion
        rotation.value = targetRotation;
        handleFlipComplete(willShowBack);
        return;
      }

      // Switch content at midpoint
      setTimeout(() => {
        setShowBack(willShowBack);
      }, (useSpringAnimation ? 200 : duration / 2));

      if (useSpringAnimation) {
        rotation.value = withSpring(targetRotation, SPRING_CONFIG, (finished) => {
          if (finished) {
            runOnJS(handleFlipComplete)(willShowBack);
          }
        });
      } else {
        rotation.value = withTiming(targetRotation, {
          duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }, (finished) => {
          if (finished) {
            runOnJS(handleFlipComplete)(willShowBack);
          }
        });
      }
    }, [isReduceMotion, hapticEnabled, duration, useSpringAnimation, handleFlipComplete]);

    const flipTo = useCallback(
      (side: 'front' | 'back') => {
        const targetRotation = side === 'back' ? 180 : 0;

        if (rotation.value === targetRotation) return;

        if (hapticEnabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        if (isReduceMotion) {
          rotation.value = targetRotation;
          setShowBack(side === 'back');
          onFlipComplete?.(side === 'back');
          return;
        }

        // Switch content at midpoint
        setTimeout(() => {
          setShowBack(side === 'back');
        }, (useSpringAnimation ? 200 : duration / 2));

        if (useSpringAnimation) {
          rotation.value = withSpring(targetRotation, SPRING_CONFIG, (finished) => {
            if (finished) {
              runOnJS(handleFlipComplete)(side === 'back');
            }
          });
        } else {
          rotation.value = withTiming(targetRotation, {
            duration,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          }, (finished) => {
            if (finished) {
              runOnJS(handleFlipComplete)(side === 'back');
            }
          });
        }
      },
      [isReduceMotion, hapticEnabled, duration, useSpringAnimation, handleFlipComplete]
    );

    const reset = useCallback(() => {
      rotation.value = 0;
      setShowBack(false);
    }, []);

    // Sync with external isFlipped prop
    useEffect(() => {
      flipTo(isFlipped ? 'back' : 'front');
    }, [isFlipped, flipTo]);

    useImperativeHandle(ref, () => ({
      flip: triggerFlip,
      flipTo,
      reset,
    }));

    // Front face animation
    const animatedFrontStyle = useAnimatedStyle(() => {
      const rotateValue = interpolate(
        rotation.value,
        [0, 180],
        [0, 180],
        Extrapolation.CLAMP
      );

      const opacity = interpolate(
        rotation.value,
        [0, 90, 180],
        [1, 0, 0],
        Extrapolation.CLAMP
      );

      if (flipDirection === 'horizontal') {
        return {
          opacity,
          transform: [
            { perspective: perspective },
            { rotateY: `${rotateValue}deg` },
          ],
          backfaceVisibility: 'hidden' as const,
        };
      } else {
        return {
          opacity,
          transform: [
            { perspective: perspective },
            { rotateX: `${rotateValue}deg` },
          ],
          backfaceVisibility: 'hidden' as const,
        };
      }
    });

    // Back face animation
    const animatedBackStyle = useAnimatedStyle(() => {
      const rotateValue = interpolate(
        rotation.value,
        [0, 180],
        [180, 360],
        Extrapolation.CLAMP
      );

      const opacity = interpolate(
        rotation.value,
        [0, 90, 180],
        [0, 0, 1],
        Extrapolation.CLAMP
      );

      if (flipDirection === 'horizontal') {
        return {
          opacity,
          transform: [
            { perspective: perspective },
            { rotateY: `${rotateValue}deg` },
          ],
          backfaceVisibility: 'hidden' as const,
        };
      } else {
        return {
          opacity,
          transform: [
            { perspective: perspective },
            { rotateX: `${rotateValue}deg` },
          ],
          backfaceVisibility: 'hidden' as const,
        };
      }
    });

    return (
      <View
        style={[
          styles.container,
          { width: width as any, height: height as any },
          style,
        ]}
      >
        {/* Front face */}
        <Animated.View
          style={[
            styles.face,
            styles.frontFace,
            frontStyle,
            animatedFrontStyle,
          ]}
        >
          {frontContent}
        </Animated.View>

        {/* Back face */}
        <Animated.View
          style={[
            styles.face,
            styles.backFace,
            backStyle,
            animatedBackStyle,
          ]}
        >
          {backContent}
        </Animated.View>
      </View>
    );
  }
);

CardFlip.displayName = 'CardFlip';

// ============================================================================
// Question Card with Flip
// ============================================================================

export interface QuestionFlipCardProps {
  /** Question content */
  question: React.ReactNode;
  /** Answered content (shown when answered) */
  answeredContent: React.ReactNode;
  /** Whether the question has been answered */
  isAnswered?: boolean;
  /** Answer status for visual feedback */
  answerStatus?: 'pass' | 'fail' | 'na' | null;
  /** Press handler */
  onPress?: () => void;
  /** Custom style */
  style?: ViewStyle;
}

export function QuestionFlipCard({
  question,
  answeredContent,
  isAnswered = false,
  answerStatus = null,
  onPress,
  style,
}: QuestionFlipCardProps) {
  const getBackgroundColor = () => {
    switch (answerStatus) {
      case 'pass':
        return '#f6ffed';
      case 'fail':
        return '#fff2f0';
      case 'na':
        return '#fafafa';
      default:
        return '#ffffff';
    }
  };

  const getBorderColor = () => {
    switch (answerStatus) {
      case 'pass':
        return '#52c41a';
      case 'fail':
        return '#ff4d4f';
      case 'na':
        return '#d9d9d9';
      default:
        return '#e8e8e8';
    }
  };

  return (
    <CardFlip
      isFlipped={isAnswered}
      frontContent={
        <View style={styles.questionCard}>{question}</View>
      }
      backContent={
        <View
          style={[
            styles.answeredCard,
            {
              backgroundColor: getBackgroundColor(),
              borderColor: getBorderColor(),
            },
          ]}
        >
          {answeredContent}
        </View>
      }
      style={style}
      duration={300}
    />
  );
}

// ============================================================================
// Flip Button
// ============================================================================

export interface FlipButtonProps {
  /** Front label */
  frontLabel: string;
  /** Back label */
  backLabel: string;
  /** Whether to show back side */
  showBack?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Custom style */
  style?: ViewStyle;
}

export function FlipButton({
  frontLabel,
  backLabel,
  showBack = false,
  onPress,
  style,
}: FlipButtonProps) {
  const { isReduceMotion } = useAccessibility();
  const rotation = useSharedValue(showBack ? 180 : 0);

  useEffect(() => {
    if (isReduceMotion) {
      rotation.value = showBack ? 180 : 0;
    } else {
      rotation.value = withSpring(showBack ? 180 : 0, SPRING_CONFIG);
    }
  }, [showBack, isReduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 500 },
      { rotateX: `${rotation.value}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.flipButton, animatedStyle, style]}>
      <Text style={styles.flipButtonContent}>
        {showBack ? backLabel : frontLabel}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  face: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  frontFace: {
    zIndex: 2,
  },
  backFace: {
    zIndex: 1,
  },
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 3,
    minHeight: 100,
  },
  answeredCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1677ff',
    borderRadius: 8,
  },
  flipButtonContent: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default CardFlip;
