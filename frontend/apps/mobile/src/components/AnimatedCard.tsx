/**
 * AnimatedCard - Card component with animations
 *
 * Features:
 * - Staggered list entry animation
 * - Swipe gestures with spring physics
 * - Delete with slide-out animation
 * - Expand/collapse smooth transitions
 * - Press scale animation
 */
import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, ViewStyle, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  Layout,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { lightTap, mediumTap, errorFeedback } from '../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

export interface AnimatedCardProps {
  /** Card content */
  children: React.ReactNode;
  /** Index for staggered animation */
  index?: number;
  /** Press handler */
  onPress?: () => void;
  /** Enable swipe to delete */
  swipeable?: boolean;
  /** Delete handler (when swiped) */
  onDelete?: () => void;
  /** Swipe left action */
  onSwipeLeft?: () => void;
  /** Swipe right action */
  onSwipeRight?: () => void;
  /** Left action label */
  leftActionLabel?: string;
  /** Right action label */
  rightActionLabel?: string;
  /** Left action color */
  leftActionColor?: string;
  /** Right action color */
  rightActionColor?: string;
  /** Enable expand/collapse */
  expandable?: boolean;
  /** Expanded content */
  expandedContent?: React.ReactNode;
  /** Custom style */
  style?: ViewStyle;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Stagger delay multiplier in ms */
  staggerDelay?: number;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.5,
};

export function AnimatedCard({
  children,
  index = 0,
  onPress,
  swipeable = false,
  onDelete,
  onSwipeLeft,
  onSwipeRight,
  leftActionLabel = 'Delete',
  rightActionLabel = 'Archive',
  leftActionColor = '#D32F2F',
  rightActionColor = '#388E3C',
  expandable = false,
  expandedContent,
  style,
  hapticEnabled = true,
  staggerDelay = 50,
}: AnimatedCardProps) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const expanded = useSharedValue(0);
  const expandedHeight = useSharedValue(0);
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Entry animation
  const entryDelay = index * staggerDelay;

  const handlePress = useCallback(() => {
    if (hapticEnabled) {
      lightTap();
    }

    if (expandable) {
      setIsExpanded(prev => !prev);
      expanded.value = withSpring(isExpanded ? 0 : 1, SPRING_CONFIG);
    }

    onPress?.();
  }, [hapticEnabled, expandable, onPress, expanded, isExpanded]);

  const handleSwipeComplete = useCallback((direction: 'left' | 'right') => {
    if (hapticEnabled) {
      if (direction === 'left') {
        errorFeedback();
      } else {
        mediumTap();
      }
    }

    if (direction === 'left') {
      onSwipeLeft?.() ?? onDelete?.();
    } else {
      onSwipeRight?.();
    }
  }, [hapticEnabled, onSwipeLeft, onSwipeRight, onDelete]);

  // Press gesture
  const pressGesture = Gesture.Tap()
    .onBegin(() => {
      scale.value = withSpring(0.98, SPRING_CONFIG);
    })
    .onFinalize(() => {
      scale.value = withSpring(1, SPRING_CONFIG);
    })
    .onEnd(() => {
      runOnJS(handlePress)();
    });

  // Swipe gesture
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (!swipeable) return;
      translateX.value = event.translationX;

      // Haptic feedback at threshold
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD && hapticEnabled) {
        runOnJS(lightTap)();
      }
    })
    .onEnd((event) => {
      if (!swipeable) return;

      if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withSpring(-SCREEN_WIDTH, SPRING_CONFIG);
        runOnJS(handleSwipeComplete)('left');
      } else if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withSpring(SCREEN_WIDTH, SPRING_CONFIG);
        runOnJS(handleSwipeComplete)('right');
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const gesture = swipeable
    ? Gesture.Race(swipeGesture, pressGesture)
    : pressGesture;

  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { translateX: translateX.value },
      ],
    };
  });

  const animatedExpandedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(
        expanded.value,
        [0, 1],
        [0, expandedHeight.value],
        Extrapolation.CLAMP
      ),
      opacity: expanded.value,
      overflow: 'hidden' as const,
    };
  });

  // Left action background
  const leftActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // Right action background
  const rightActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return (
    <Animated.View
      entering={SlideInRight.delay(entryDelay).springify().damping(20)}
      exiting={SlideOutLeft.springify().damping(20)}
      layout={Layout.springify()}
      style={styles.wrapper}
    >
      {/* Action backgrounds */}
      {swipeable && (
        <>
          <Animated.View
            style={[
              styles.actionBackground,
              styles.leftAction,
              { backgroundColor: leftActionColor },
              leftActionStyle,
            ]}
          >
            <Text style={styles.actionText}>{leftActionLabel}</Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.actionBackground,
              styles.rightAction,
              { backgroundColor: rightActionColor },
              rightActionStyle,
            ]}
          >
            <Text style={styles.actionText}>{rightActionLabel}</Text>
          </Animated.View>
        </>
      )}

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, animatedCardStyle, style]}>
          {children}

          {expandable && expandedContent && (
            <Animated.View style={animatedExpandedStyle}>
              <View
                onLayout={(e) => {
                  expandedHeight.value = e.nativeEvent.layout.height + 16;
                }}
                style={styles.expandedContent}
              >
                {expandedContent}
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginVertical: 6,
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  leftAction: {
    left: 0,
    right: 0,
    alignItems: 'flex-end',
  },
  rightAction: {
    left: 0,
    right: 0,
    alignItems: 'flex-start',
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
});

export default AnimatedCard;
