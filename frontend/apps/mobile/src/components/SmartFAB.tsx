/**
 * SmartFAB - Context-Aware Floating Action Button
 * Features:
 * - Context-aware actions based on current screen
 * - Expandable menu with sub-actions
 * - Drag to reposition
 * - Long-press to access settings
 * - Haptic feedback
 * - Smooth animations (scale, rotate icon)
 * - Pulse animation for important actions
 * - Can be hidden via settings (fab_enabled toggle)
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  PanResponder,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useFABContext, FABAction, JobExecutionState } from '../hooks/useFABContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Colors
const COLORS = {
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  purple: '#722ed1',
  cyan: '#13c2c2',
  shadow: '#000',
  backdrop: 'rgba(0, 0, 0, 0.3)',
  white: '#fff',
  labelBg: 'rgba(0, 0, 0, 0.8)',
};

// Constants
const FAB_SIZE = 64;
const ACTION_SIZE = 48;
const EDGE_PADDING = 20;
const BOTTOM_OFFSET = 100;
const ACTION_SPACING = 70;
const LONG_PRESS_DURATION = 500;

interface SmartFABProps {
  // Job execution specific props
  jobState?: JobExecutionState;
  onStartJob?: () => void;
  onPauseJob?: () => void;
  onResumeJob?: () => void;
  onCompleteJob?: () => void;

  // Inspection specific
  onTakePhoto?: () => void;

  // Chat specific
  onNewMessage?: () => void;

  // Job list specific
  onFilter?: () => void;
  onSearch?: () => void;

  // Override visibility
  forceHide?: boolean;

  // Custom position
  initialPosition?: { x: number; y: number };
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SmartFAB(props: SmartFABProps) {
  const {
    jobState,
    onStartJob,
    onPauseJob,
    onResumeJob,
    onCompleteJob,
    onTakePhoto,
    onNewMessage,
    onFilter,
    onSearch,
    forceHide = false,
    initialPosition,
  } = props;

  const { i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isArabic = i18n.language === 'ar';

  // Get context-aware actions
  const {
    contextType,
    actions,
    mainAction,
    isEnabled,
    mainColor,
    mainIcon,
  } = useFABContext({
    jobState,
    onStartJob,
    onPauseJob,
    onResumeJob,
    onCompleteJob,
    onTakePhoto,
    onNewMessage,
    onFilter,
    onSearch,
  });

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated values using Reanimated 2
  const menuProgress = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const positionX = useSharedValue(initialPosition?.x ?? SCREEN_WIDTH - FAB_SIZE - EDGE_PADDING);
  const positionY = useSharedValue(initialPosition?.y ?? SCREEN_HEIGHT - FAB_SIZE - BOTTOM_OFFSET);

  // Pulse animation for important actions
  useEffect(() => {
    if (mainAction?.pulse) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // Infinite
        true
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1);
    }
  }, [mainAction?.pulse]);

  // Toggle menu
  const toggleMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toValue = isOpen ? 0 : 1;

    menuProgress.value = withSpring(toValue, {
      damping: 15,
      stiffness: 150,
    });

    rotation.value = withTiming(toValue, { duration: 200 });

    setIsOpen(!isOpen);
  }, [isOpen]);

  // Handle action press
  const handleActionPress = useCallback((action: FABAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Close menu first
    menuProgress.value = withTiming(0, { duration: 150 });
    rotation.value = withTiming(0, { duration: 150 });
    setIsOpen(false);

    // Execute action after brief delay
    setTimeout(() => {
      action.onPress();
    }, 100);
  }, []);

  // Handle main FAB press
  const handleMainPress = useCallback(() => {
    if (isDragging) return;

    if (actions.length > 0) {
      toggleMenu();
    } else if (mainAction) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      mainAction.onPress();
    }
  }, [isDragging, actions, mainAction, toggleMenu]);

  // Long press to open settings
  const handleLongPress = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    navigation.navigate('ToolkitSettings');
  }, [navigation]);

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Start dragging if moved more than 10px
        return Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsDragging(true);
        scale.value = withSpring(0.95);

        // Cancel long press timer
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      },
      onPanResponderMove: (_, gestureState) => {
        // Update position with bounds checking
        const newX = Math.max(
          EDGE_PADDING,
          Math.min(SCREEN_WIDTH - FAB_SIZE - EDGE_PADDING, positionX.value + gestureState.dx)
        );
        const newY = Math.max(
          BOTTOM_OFFSET,
          Math.min(SCREEN_HEIGHT - FAB_SIZE - BOTTOM_OFFSET, positionY.value + gestureState.dy)
        );

        positionX.value = newX;
        positionY.value = newY;
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        scale.value = withSpring(1);

        // Snap to nearest edge
        const currentX = positionX.value + gestureState.dx;
        const snapToRight = currentX > SCREEN_WIDTH / 2;

        positionX.value = withSpring(
          snapToRight ? SCREEN_WIDTH - FAB_SIZE - EDGE_PADDING : EDGE_PADDING
        );

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  // Press in handler for long press detection
  const handlePressIn = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      handleLongPress();
    }, LONG_PRESS_DURATION);
  }, [handleLongPress]);

  // Press out handler to cancel long press
  const handlePressOut = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Animated styles for main FAB
  const mainFABStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: positionX.value },
        { translateY: positionY.value },
        { scale: scale.value * pulseScale.value },
      ],
    };
  });

  // Animated styles for rotation
  const iconRotationStyle = useAnimatedStyle(() => {
    const rotate = interpolate(rotation.value, [0, 1], [0, 45]);
    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  });

  // Animated styles for action buttons
  const createActionStyle = (index: number) => {
    return useAnimatedStyle(() => {
      const translateY = interpolate(
        menuProgress.value,
        [0, 1],
        [0, -(ACTION_SPACING * (index + 1))]
      );
      const scaleValue = interpolate(
        menuProgress.value,
        [0, 0.5, 1],
        [0, 0.5, 1]
      );
      const opacity = menuProgress.value;

      return {
        transform: [{ translateY }, { scale: scaleValue }],
        opacity,
      };
    });
  };

  // Backdrop animated style
  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: menuProgress.value * 0.3,
      pointerEvents: menuProgress.value > 0.5 ? 'auto' : 'none',
    };
  });

  // Don't render if disabled or force hidden
  if (!isEnabled || forceHide) {
    return null;
  }

  return (
    <>
      {/* Backdrop for closing menu */}
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Pressable style={styles.backdropPressable} onPress={toggleMenu} />
      </Animated.View>

      {/* FAB Container */}
      <Animated.View
        style={[styles.fabContainer, mainFABStyle]}
        {...panResponder.panHandlers}
      >
        {/* Action buttons */}
        {actions.map((action, index) => {
          const actionStyle = createActionStyle(index);
          return (
            <Animated.View
              key={action.id}
              style={[styles.actionContainer, actionStyle]}
            >
              <TouchableOpacity
                style={styles.actionLabelContainer}
                onPress={() => handleActionPress(action)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionLabel}>
                  {isArabic ? action.labelAr : action.label}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: action.color }]}
                onPress={() => handleActionPress(action)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {/* Main FAB */}
        <Pressable
          style={[styles.mainButton, { backgroundColor: mainColor }]}
          onPress={handleMainPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Animated.Text style={[styles.mainIcon, iconRotationStyle]}>
            {isOpen ? '+' : mainIcon}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.backdrop,
    zIndex: 998,
  },
  backdropPressable: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    zIndex: 999,
    alignItems: 'flex-end',
  },
  mainButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainIcon: {
    fontSize: 28,
    color: COLORS.white,
  },
  actionContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    right: 0,
    bottom: 0,
  },
  actionButton: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginLeft: 8,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabelContainer: {
    backgroundColor: COLORS.labelBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },
});

// Export types for external usage
export type { FABAction, JobExecutionState };
