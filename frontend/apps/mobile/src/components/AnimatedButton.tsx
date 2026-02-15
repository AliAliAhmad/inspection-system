/**
 * AnimatedButton - Enhanced button with animations and haptic feedback
 *
 * Features:
 * - Scale animation on press (0.95)
 * - Ripple effect on touch
 * - Color transition on state changes
 * - Loading spinner integration
 * - Haptic feedback
 */
import React, { useCallback } from 'react';
import {
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import { mediumTap, lightTap, errorFeedback } from '../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface AnimatedButtonProps {
  /** Button text */
  title: string;
  /** Press handler */
  onPress: () => void;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Loading state */
  loading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Icon to show before text */
  icon?: string;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom text style */
  textStyle?: TextStyle;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Full width button */
  fullWidth?: boolean;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 400,
  mass: 0.5,
};

const COLORS = {
  primary: { bg: '#1976D2', text: '#FFFFFF', pressed: '#1565C0' },
  secondary: { bg: '#757575', text: '#FFFFFF', pressed: '#616161' },
  danger: { bg: '#D32F2F', text: '#FFFFFF', pressed: '#C62828' },
  success: { bg: '#388E3C', text: '#FFFFFF', pressed: '#2E7D32' },
  outline: { bg: 'transparent', text: '#1976D2', pressed: 'rgba(25,118,210,0.1)' },
  ghost: { bg: 'transparent', text: '#424242', pressed: 'rgba(0,0,0,0.05)' },
};

const SIZES = {
  small: { height: 36, paddingHorizontal: 12, fontSize: 13, iconSize: 14 },
  medium: { height: 44, paddingHorizontal: 20, fontSize: 15, iconSize: 16 },
  large: { height: 52, paddingHorizontal: 28, fontSize: 17, iconSize: 18 },
};

export function AnimatedButton({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
  hapticEnabled = true,
  fullWidth = false,
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const colors = COLORS[variant];
  const sizeConfig = SIZES[size];

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, SPRING_CONFIG);
    pressed.value = withTiming(1, { duration: 100 });
    if (hapticEnabled) {
      runOnJS(lightTap)();
    }
  }, [hapticEnabled, scale, pressed]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
    pressed.value = withTiming(0, { duration: 200 });
  }, [scale, pressed]);

  const handlePress = useCallback(() => {
    if (loading || disabled) return;
    if (hapticEnabled) {
      if (variant === 'danger') {
        errorFeedback();
      } else {
        mediumTap();
      }
    }
    onPress();
  }, [loading, disabled, hapticEnabled, variant, onPress]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      pressed.value,
      [0, 1],
      [colors.bg, colors.pressed]
    );

    return {
      transform: [{ scale: scale.value }],
      backgroundColor: variant === 'outline' || variant === 'ghost'
        ? interpolateColor(pressed.value, [0, 1], ['transparent', colors.pressed])
        : backgroundColor,
      opacity: disabled ? 0.5 : 1,
    };
  });

  const isOutlineOrGhost = variant === 'outline' || variant === 'ghost';
  const borderStyle = variant === 'outline' ? { borderWidth: 1.5, borderColor: colors.text } : {};

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.container,
        {
          height: sizeConfig.height,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          backgroundColor: colors.bg,
        },
        borderStyle,
        fullWidth && styles.fullWidth,
        animatedContainerStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isOutlineOrGhost ? colors.text : colors.text}
        />
      ) : (
        <>
          {icon && (
            <Text
              style={[
                styles.icon,
                { fontSize: sizeConfig.iconSize, color: colors.text },
              ]}
            >
              {icon}
            </Text>
          )}
          <Text
            style={[
              styles.text,
              { fontSize: sizeConfig.fontSize, color: colors.text },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  icon: {
    marginRight: 6,
  },
});

export default AnimatedButton;
