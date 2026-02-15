/**
 * SuccessPulse - Pulse animation for button feedback
 *
 * Features:
 * - Pulse animation on button press (Pass/Fail selection)
 * - Brief scale up + glow effect
 * - Haptic feedback included
 * - Respects reduceMotion accessibility setting
 */
import React, { useCallback, useImperativeHandle, forwardRef, useRef } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Pressable,
  Text,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '../../providers/AccessibilityProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PulseType = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface SuccessPulseRef {
  pulse: () => void;
}

export interface SuccessPulseProps {
  /** Content to wrap */
  children: React.ReactNode;
  /** Type of pulse effect */
  type?: PulseType;
  /** Press handler */
  onPress?: () => void;
  /** Whether the button is selected/active */
  isSelected?: boolean;
  /** Disable interactions */
  disabled?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Scale amount for pulse (default 1.08) */
  pulseScale?: number;
  /** Duration of pulse animation in ms */
  pulseDuration?: number;
  /** Show glow effect */
  showGlow?: boolean;
  /** Glow intensity (0-1) */
  glowIntensity?: number;
}

const PULSE_COLORS = {
  success: {
    primary: '#52c41a',
    glow: 'rgba(82, 196, 26, 0.4)',
    background: 'rgba(82, 196, 26, 0.1)',
    selected: 'rgba(82, 196, 26, 0.2)',
  },
  error: {
    primary: '#ff4d4f',
    glow: 'rgba(255, 77, 79, 0.4)',
    background: 'rgba(255, 77, 79, 0.1)',
    selected: 'rgba(255, 77, 79, 0.2)',
  },
  warning: {
    primary: '#faad14',
    glow: 'rgba(250, 173, 20, 0.4)',
    background: 'rgba(250, 173, 20, 0.1)',
    selected: 'rgba(250, 173, 20, 0.2)',
  },
  info: {
    primary: '#1677ff',
    glow: 'rgba(22, 119, 255, 0.4)',
    background: 'rgba(22, 119, 255, 0.1)',
    selected: 'rgba(22, 119, 255, 0.2)',
  },
  neutral: {
    primary: '#8c8c8c',
    glow: 'rgba(140, 140, 140, 0.4)',
    background: 'rgba(140, 140, 140, 0.1)',
    selected: 'rgba(140, 140, 140, 0.2)',
  },
};

const SPRING_CONFIG = {
  damping: 12,
  stiffness: 400,
  mass: 0.5,
};

export const SuccessPulse = forwardRef<SuccessPulseRef, SuccessPulseProps>(
  (
    {
      children,
      type = 'success',
      onPress,
      isSelected = false,
      disabled = false,
      style,
      hapticEnabled = true,
      pulseScale = 1.08,
      pulseDuration = 200,
      showGlow = true,
      glowIntensity = 0.5,
    },
    ref
  ) => {
    const { isReduceMotion } = useAccessibility();
    const colors = PULSE_COLORS[type];

    const scale = useSharedValue(1);
    const glowOpacity = useSharedValue(0);
    const borderWidth = useSharedValue(isSelected ? 2 : 0);
    const backgroundColor = useSharedValue(isSelected ? 1 : 0);

    // Update selection state
    React.useEffect(() => {
      if (isReduceMotion) {
        borderWidth.value = isSelected ? 2 : 0;
        backgroundColor.value = isSelected ? 1 : 0;
      } else {
        borderWidth.value = withSpring(isSelected ? 2 : 0, SPRING_CONFIG);
        backgroundColor.value = withTiming(isSelected ? 1 : 0, { duration: 200 });
      }
    }, [isSelected, isReduceMotion]);

    const triggerPulse = useCallback(() => {
      if (isReduceMotion) {
        // Skip animation but still provide feedback
        if (hapticEnabled) {
          if (type === 'success') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else if (type === 'error') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        }
        return;
      }

      // Haptic feedback
      if (hapticEnabled) {
        if (type === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (type === 'error') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (type === 'warning') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }

      // Scale pulse
      scale.value = withSequence(
        withSpring(pulseScale, {
          damping: 8,
          stiffness: 500,
        }),
        withSpring(1, SPRING_CONFIG)
      );

      // Glow pulse
      if (showGlow) {
        glowOpacity.value = withSequence(
          withTiming(glowIntensity, {
            duration: pulseDuration * 0.3,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(0, {
            duration: pulseDuration * 0.7,
            easing: Easing.in(Easing.quad),
          })
        );
      }
    }, [type, hapticEnabled, isReduceMotion, pulseScale, pulseDuration, showGlow, glowIntensity]);

    // Expose pulse method via ref
    useImperativeHandle(ref, () => ({
      pulse: triggerPulse,
    }));

    const handlePress = useCallback(() => {
      if (disabled) return;
      triggerPulse();
      onPress?.();
    }, [disabled, triggerPulse, onPress]);

    const animatedContainerStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      borderWidth: borderWidth.value,
      borderColor: colors.primary,
      backgroundColor: interpolateColor(
        backgroundColor.value,
        [0, 1],
        ['transparent', colors.selected]
      ),
    }));

    const animatedGlowStyle = useAnimatedStyle(() => ({
      opacity: glowOpacity.value,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glowOpacity.value,
      shadowRadius: 20,
      elevation: glowOpacity.value * 10,
    }));

    return (
      <View style={styles.wrapper}>
        {/* Glow layer */}
        {showGlow && (
          <Animated.View
            style={[
              styles.glowLayer,
              { backgroundColor: colors.glow },
              animatedGlowStyle,
            ]}
            pointerEvents="none"
          />
        )}

        <AnimatedPressable
          onPress={handlePress}
          disabled={disabled}
          style={[
            styles.container,
            animatedContainerStyle,
            disabled && styles.disabled,
            style,
          ]}
        >
          {children}
        </AnimatedPressable>
      </View>
    );
  }
);

SuccessPulse.displayName = 'SuccessPulse';

// ============================================================================
// Preset Components
// ============================================================================

export interface PassFailButtonProps {
  /** Whether this is a Pass button (true) or Fail button (false) */
  isPass: boolean;
  /** Whether this option is selected */
  isSelected?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Button label (optional, defaults to Pass/Fail) */
  label?: string;
  /** Custom style */
  style?: ViewStyle;
  /** Custom text style */
  textStyle?: TextStyle;
  /** Disabled state */
  disabled?: boolean;
}

export function PassFailButton({
  isPass,
  isSelected = false,
  onPress,
  label,
  style,
  textStyle,
  disabled = false,
}: PassFailButtonProps) {
  const type: PulseType = isPass ? 'success' : 'error';
  const colors = PULSE_COLORS[type];
  const defaultLabel = isPass ? 'Pass' : 'Fail';

  return (
    <SuccessPulse
      type={type}
      isSelected={isSelected}
      onPress={onPress}
      disabled={disabled}
      style={StyleSheet.flatten([styles.passFailButton, style])}
    >
      <View style={[styles.passFailContent, isSelected && { backgroundColor: colors.background }]}>
        <Text
          style={[
            styles.passFailIcon,
            { color: colors.primary },
          ]}
        >
          {isPass ? '\u2713' : '\u2717'}
        </Text>
        <Text
          style={[
            styles.passFailLabel,
            { color: isSelected ? colors.primary : '#595959' },
            textStyle,
          ]}
        >
          {label || defaultLabel}
        </Text>
      </View>
    </SuccessPulse>
  );
}

// ============================================================================
// Rating Button (1-5 stars or similar)
// ============================================================================

export interface RatingPulseButtonProps {
  /** Rating value */
  value: number;
  /** Maximum rating */
  maxValue?: number;
  /** Whether this rating is selected */
  isSelected?: boolean;
  /** Press handler */
  onPress?: () => void;
  /** Custom style */
  style?: ViewStyle;
}

export function RatingPulseButton({
  value,
  maxValue = 5,
  isSelected = false,
  onPress,
  style,
}: RatingPulseButtonProps) {
  // Determine color based on rating value
  const getType = (): PulseType => {
    const ratio = value / maxValue;
    if (ratio >= 0.8) return 'success';
    if (ratio >= 0.6) return 'info';
    if (ratio >= 0.4) return 'warning';
    return 'error';
  };

  return (
    <SuccessPulse
      type={getType()}
      isSelected={isSelected}
      onPress={onPress}
      style={StyleSheet.flatten([styles.ratingButton, style])}
      pulseScale={1.15}
    >
      <Text style={[styles.ratingText, isSelected && styles.ratingTextSelected]}>
        {value}
      </Text>
    </SuccessPulse>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  glowLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  passFailButton: {
    minWidth: 100,
    minHeight: 60,
  },
  passFailContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  passFailIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  passFailLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  ratingButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#595959',
  },
  ratingTextSelected: {
    color: '#1677ff',
  },
});

export default SuccessPulse;
