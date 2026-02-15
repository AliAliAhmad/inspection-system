/**
 * SwipeableJobCard - Swipeable card with haptic feedback
 *
 * Features:
 * - Swipe right: Start/Complete job (Green)
 * - Swipe left: Pause job (Yellow)
 * - Full swipe: Confirm action
 * - Partial swipe: Preview action
 * - Haptic feedback at threshold
 */
import React, { useCallback, ReactNode } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 100;
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.4;

export type SwipeAction = 'start' | 'complete' | 'pause' | 'resume';

export interface SwipeableJobCardProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightAction?: {
    label: string;
    color: string;
    icon?: string;
  };
  leftAction?: {
    label: string;
    color: string;
    icon?: string;
  };
  disabled?: boolean;
  onPress?: () => void;
  enableRightSwipe?: boolean;
  enableLeftSwipe?: boolean;
}

const DEFAULT_RIGHT_ACTION = {
  label: 'Start',
  color: '#52c41a', // Green
  icon: '>',
};

const DEFAULT_LEFT_ACTION = {
  label: 'Pause',
  color: '#faad14', // Yellow
  icon: '||',
};

export function SwipeableJobCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightAction = DEFAULT_RIGHT_ACTION,
  leftAction = DEFAULT_LEFT_ACTION,
  disabled = false,
  onPress,
  enableRightSwipe = true,
  enableLeftSwipe = true,
}: SwipeableJobCardProps) {
  const haptics = useHaptics();

  const translateX = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const hasReachedThreshold = useSharedValue(false);
  const isActive = useSharedValue(false);

  const triggerHapticThreshold = useCallback(() => {
    haptics.swipeThresholdFeedback();
  }, [haptics]);

  const triggerHapticAction = useCallback(() => {
    haptics.actionFeedback();
  }, [haptics]);

  const triggerHapticSuccess = useCallback(() => {
    haptics.successFeedback();
  }, [haptics]);

  const handleSwipeRight = useCallback(() => {
    if (onSwipeRight) {
      triggerHapticSuccess();
      onSwipeRight();
    }
  }, [onSwipeRight, triggerHapticSuccess]);

  const handleSwipeLeft = useCallback(() => {
    if (onSwipeLeft) {
      triggerHapticAction();
      onSwipeLeft();
    }
  }, [onSwipeLeft, triggerHapticAction]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-10, 10])
    .onStart(() => {
      isActive.value = true;
      cardScale.value = withSpring(0.98);
    })
    .onUpdate((event) => {
      // Constrain swipe based on enabled directions
      let newTranslateX = event.translationX;

      if (!enableRightSwipe && newTranslateX > 0) {
        newTranslateX = 0;
      }
      if (!enableLeftSwipe && newTranslateX < 0) {
        newTranslateX = 0;
      }

      translateX.value = newTranslateX;

      // Check threshold for haptic feedback
      const absTranslate = Math.abs(newTranslateX);
      if (absTranslate >= SWIPE_THRESHOLD && !hasReachedThreshold.value) {
        hasReachedThreshold.value = true;
        runOnJS(triggerHapticThreshold)();
      } else if (absTranslate < SWIPE_THRESHOLD && hasReachedThreshold.value) {
        hasReachedThreshold.value = false;
      }
    })
    .onEnd((event) => {
      isActive.value = false;
      cardScale.value = withSpring(1);
      hasReachedThreshold.value = false;

      const translationX = event.translationX;

      // Full swipe right
      if (translationX > FULL_SWIPE_THRESHOLD && enableRightSwipe && onSwipeRight) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
          translateX.value = withSpring(0);
        });
        runOnJS(handleSwipeRight)();
      }
      // Full swipe left
      else if (translationX < -FULL_SWIPE_THRESHOLD && enableLeftSwipe && onSwipeLeft) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
          translateX.value = withSpring(0);
        });
        runOnJS(handleSwipeLeft)();
      }
      // Spring back
      else {
        translateX.value = withSpring(0, {
          damping: 15,
          stiffness: 150,
        });
      }
    });

  // Card animated style
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-FULL_SWIPE_THRESHOLD, 0, FULL_SWIPE_THRESHOLD],
      [-5, 0, 5],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { rotate: `${rotation}deg` },
        { scale: cardScale.value },
      ],
    };
  });

  // Right action background animated style
  const rightActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD, FULL_SWIPE_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD, FULL_SWIPE_THRESHOLD],
      [0.8, 1, 1.1],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Left action background animated style
  const leftActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-FULL_SWIPE_THRESHOLD, -SWIPE_THRESHOLD, 0],
      [1, 0.5, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      translateX.value,
      [-FULL_SWIPE_THRESHOLD, -SWIPE_THRESHOLD, 0],
      [1.1, 1, 0.8],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Threshold indicator style
  const rightThresholdStyle = useAnimatedStyle(() => {
    const isAtThreshold = translateX.value >= SWIPE_THRESHOLD;
    return {
      opacity: isAtThreshold ? 1 : 0,
      transform: [{ scale: isAtThreshold ? 1 : 0.5 }],
    };
  });

  const leftThresholdStyle = useAnimatedStyle(() => {
    const isAtThreshold = translateX.value <= -SWIPE_THRESHOLD;
    return {
      opacity: isAtThreshold ? 1 : 0,
      transform: [{ scale: isAtThreshold ? 1 : 0.5 }],
    };
  });

  return (
    <View style={styles.container}>
      {/* Right swipe action background (appears on left) */}
      {enableRightSwipe && (
        <Animated.View style={[styles.actionContainer, styles.rightAction, rightActionStyle]}>
          <View style={[styles.actionContent, { backgroundColor: rightAction.color }]}>
            <Text style={styles.actionIcon}>{rightAction.icon || '>'}</Text>
            <Text style={styles.actionLabel}>{rightAction.label}</Text>
            <Animated.View style={[styles.thresholdIndicator, rightThresholdStyle]}>
              <Text style={styles.thresholdText}>Release to confirm</Text>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* Left swipe action background (appears on right) */}
      {enableLeftSwipe && (
        <Animated.View style={[styles.actionContainer, styles.leftAction, leftActionStyle]}>
          <View style={[styles.actionContent, { backgroundColor: leftAction.color }]}>
            <Text style={styles.actionIcon}>{leftAction.icon || '||'}</Text>
            <Text style={styles.actionLabel}>{leftAction.label}</Text>
            <Animated.View style={[styles.thresholdIndicator, leftThresholdStyle]}>
              <Text style={styles.thresholdText}>Release to confirm</Text>
            </Animated.View>
          </View>
        </Animated.View>
      )}

      {/* Main card content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, cardAnimatedStyle]}>
          {onPress ? (
            <TouchableOpacity
              onPress={onPress}
              activeOpacity={0.9}
              style={styles.cardTouchable}
            >
              {children}
            </TouchableOpacity>
          ) : (
            children
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    position: 'relative',
  },
  actionContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  rightAction: {
    left: 0,
    alignItems: 'flex-start',
  },
  leftAction: {
    right: 0,
    alignItems: 'flex-end',
  },
  actionContent: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    height: '100%',
  },
  actionIcon: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  thresholdIndicator: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  thresholdText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTouchable: {
    width: '100%',
  },
});

export default SwipeableJobCard;
