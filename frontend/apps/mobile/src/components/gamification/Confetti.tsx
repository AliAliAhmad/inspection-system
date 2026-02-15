/**
 * Confetti - Celebration confetti animation
 *
 * Triggers colorful confetti explosion on inspection submit or achievements.
 * Uses react-native-reanimated for smooth animations.
 */
import React, { useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Confetti colors - celebration theme
const CONFETTI_COLORS = [
  '#faad14', // Gold
  '#1677ff', // Primary blue
  '#52c41a', // Success green
  '#ff4d4f', // Red
  '#722ed1', // Purple
  '#eb2f96', // Pink
  '#13c2c2', // Cyan
  '#fa8c16', // Orange
];

const NUM_CONFETTI_PIECES = 50;

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  shape: 'square' | 'circle' | 'rectangle';
  delay: number;
  duration: number;
  horizontalVelocity: number;
}

function generateConfettiPieces(): ConfettiPiece[] {
  return Array.from({ length: NUM_CONFETTI_PIECES }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: -50 - Math.random() * 100,
    rotation: Math.random() * 360,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 8 + Math.random() * 8,
    shape: (['square', 'circle', 'rectangle'] as const)[Math.floor(Math.random() * 3)],
    delay: Math.random() * 300,
    duration: 2000 + Math.random() * 1000,
    horizontalVelocity: (Math.random() - 0.5) * 200,
  }));
}

interface ConfettiPieceProps {
  piece: ConfettiPiece;
  isAnimating: boolean;
}

function ConfettiPieceComponent({ piece, isAnimating }: ConfettiPieceProps) {
  const translateY = useSharedValue(piece.y);
  const translateX = useSharedValue(piece.x);
  const rotate = useSharedValue(piece.rotation);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0);

  useEffect(() => {
    if (isAnimating) {
      // Scale in
      scale.value = withDelay(
        piece.delay,
        withTiming(1, { duration: 150, easing: Easing.out(Easing.back(2)) })
      );

      // Fall down with swing
      translateY.value = withDelay(
        piece.delay,
        withTiming(SCREEN_HEIGHT + 100, {
          duration: piece.duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );

      // Horizontal drift
      translateX.value = withDelay(
        piece.delay,
        withTiming(piece.x + piece.horizontalVelocity, {
          duration: piece.duration,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        })
      );

      // Continuous rotation
      rotate.value = withDelay(
        piece.delay,
        withTiming(piece.rotation + 720 + Math.random() * 360, {
          duration: piece.duration,
          easing: Easing.linear,
        })
      );

      // Fade out near the bottom
      opacity.value = withDelay(
        piece.delay + piece.duration * 0.7,
        withTiming(0, { duration: piece.duration * 0.3 })
      );
    } else {
      // Reset
      translateY.value = piece.y;
      translateX.value = piece.x;
      rotate.value = piece.rotation;
      opacity.value = 1;
      scale.value = 0;
    }
  }, [isAnimating, piece]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const getShapeStyle = () => {
    switch (piece.shape) {
      case 'circle':
        return { borderRadius: piece.size / 2 };
      case 'rectangle':
        return { width: piece.size * 0.6, height: piece.size * 1.4 };
      default:
        return {};
    }
  };

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
        },
        getShapeStyle(),
        animatedStyle,
      ]}
    />
  );
}

export interface ConfettiRef {
  trigger: () => void;
}

export interface ConfettiProps {
  /** Whether to enable haptic feedback */
  enableHaptics?: boolean;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Custom number of confetti pieces */
  numPieces?: number;
}

export const Confetti = forwardRef<ConfettiRef, ConfettiProps>(
  ({ enableHaptics = true, onAnimationComplete, numPieces }, ref) => {
    const [isAnimating, setIsAnimating] = useState(false);
    const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

    const triggerAnimation = useCallback(() => {
      if (isAnimating) return;

      // Generate new pieces
      const newPieces = generateConfettiPieces();
      if (numPieces && numPieces !== NUM_CONFETTI_PIECES) {
        newPieces.length = Math.min(numPieces, NUM_CONFETTI_PIECES);
      }
      setPieces(newPieces);
      setIsAnimating(true);

      // Haptic feedback
      if (enableHaptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Reset after animation
      setTimeout(() => {
        setIsAnimating(false);
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      }, 3500);
    }, [isAnimating, enableHaptics, onAnimationComplete, numPieces]);

    useImperativeHandle(ref, () => ({
      trigger: triggerAnimation,
    }));

    if (!isAnimating && pieces.length === 0) {
      return null;
    }

    return (
      <View style={styles.container} pointerEvents="none">
        {pieces.map((piece) => (
          <ConfettiPieceComponent
            key={piece.id}
            piece={piece}
            isAnimating={isAnimating}
          />
        ))}
      </View>
    );
  }
);

Confetti.displayName = 'Confetti';

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
});

export default Confetti;
