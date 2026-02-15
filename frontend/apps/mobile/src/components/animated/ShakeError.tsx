/**
 * ShakeError - Shake animation for errors/required fields
 *
 * Features:
 * - Horizontal shake animation
 * - Haptic feedback for errors
 * - Configurable intensity
 * - Respects reduceMotion accessibility setting
 */
import React, {
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';
import { View, StyleSheet, ViewStyle, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAccessibility } from '../../providers/AccessibilityProvider';

export type ShakeIntensity = 'light' | 'medium' | 'strong' | 'violent';

export interface ShakeErrorRef {
  shake: () => void;
  reset: () => void;
}

export interface ShakeErrorProps {
  /** Content to shake */
  children: React.ReactNode;
  /** Whether there's an error (triggers shake) */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Arabic error message */
  errorMessageAr?: string;
  /** Shake intensity */
  intensity?: ShakeIntensity;
  /** Number of shake cycles */
  shakeCycles?: number;
  /** Duration of each shake in ms */
  shakeDuration?: number;
  /** Enable haptic feedback */
  hapticEnabled?: boolean;
  /** Custom container style */
  style?: ViewStyle;
  /** Show error border */
  showErrorBorder?: boolean;
  /** Border color for errors */
  errorBorderColor?: string;
  /** Callback when shake completes */
  onShakeComplete?: () => void;
  /** Auto-shake when hasError changes to true */
  autoShake?: boolean;
}

const INTENSITY_CONFIG = {
  light: { distance: 4, haptic: 'Light' as const },
  medium: { distance: 8, haptic: 'Medium' as const },
  strong: { distance: 12, haptic: 'Heavy' as const },
  violent: { distance: 18, haptic: 'Heavy' as const },
};

export const ShakeError = forwardRef<ShakeErrorRef, ShakeErrorProps>(
  (
    {
      children,
      hasError = false,
      errorMessage,
      errorMessageAr,
      intensity = 'medium',
      shakeCycles = 3,
      shakeDuration = 50,
      hapticEnabled = true,
      style,
      showErrorBorder = true,
      errorBorderColor = '#ff4d4f',
      onShakeComplete,
      autoShake = true,
    },
    ref
  ) => {
    const { isReduceMotion } = useAccessibility();

    const translateX = useSharedValue(0);
    const borderOpacity = useSharedValue(0);
    const [isShaking, setIsShaking] = useState(false);

    const config = INTENSITY_CONFIG[intensity];

    const handleShakeComplete = useCallback(() => {
      setIsShaking(false);
      onShakeComplete?.();
    }, [onShakeComplete]);

    const triggerShake = useCallback(() => {
      if (isShaking) return;

      setIsShaking(true);

      // Haptic feedback
      if (hapticEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      if (isReduceMotion) {
        // For reduced motion, just show border flash
        if (showErrorBorder) {
          borderOpacity.value = withSequence(
            withTiming(1, { duration: 100 }),
            withTiming(0.5, { duration: 200 })
          );
        }
        handleShakeComplete();
        return;
      }

      // Build shake sequence
      const shakeSequence: number[] = [];
      for (let i = 0; i < shakeCycles; i++) {
        // Right
        shakeSequence.push(config.distance);
        // Left
        shakeSequence.push(-config.distance);
      }
      // Return to center
      shakeSequence.push(0);

      // Create animation
      const animations = shakeSequence.map((value, index) =>
        withTiming(value, {
          duration: shakeDuration,
          easing: index === shakeSequence.length - 1
            ? Easing.out(Easing.quad)
            : Easing.inOut(Easing.quad),
        })
      );

      translateX.value = withSequence(
        ...animations,
        withTiming(0, { duration: shakeDuration }, (finished) => {
          if (finished) {
            runOnJS(handleShakeComplete)();
          }
        })
      );

      // Error border animation
      if (showErrorBorder) {
        borderOpacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(0.7, { duration: shakeCycles * shakeDuration * 2 })
        );
      }
    }, [
      isShaking,
      isReduceMotion,
      hapticEnabled,
      shakeCycles,
      shakeDuration,
      showErrorBorder,
      config,
      handleShakeComplete,
    ]);

    const reset = useCallback(() => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      borderOpacity.value = withTiming(0, { duration: 200 });
      setIsShaking(false);
    }, []);

    useImperativeHandle(ref, () => ({
      shake: triggerShake,
      reset,
    }));

    // Auto-shake when error appears
    useEffect(() => {
      if (hasError && autoShake) {
        triggerShake();
      }

      if (hasError && showErrorBorder) {
        borderOpacity.value = withTiming(1, { duration: 200 });
      } else if (!hasError) {
        borderOpacity.value = withTiming(0, { duration: 200 });
      }
    }, [hasError, autoShake, showErrorBorder]);

    const animatedContainerStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const animatedBorderStyle = useAnimatedStyle(() => ({
      borderColor: errorBorderColor,
      borderWidth: 2,
      borderRadius: 8,
      opacity: borderOpacity.value,
    }));

    return (
      <View style={styles.wrapper}>
        <Animated.View style={[styles.container, animatedContainerStyle, style]}>
          {/* Error border overlay */}
          {showErrorBorder && (
            <Animated.View
              style={[StyleSheet.absoluteFill, animatedBorderStyle]}
              pointerEvents="none"
            />
          )}

          {children}
        </Animated.View>

        {/* Error message */}
        {hasError && errorMessage && (
          <Animated.Text
            entering={require('react-native-reanimated').FadeIn.duration(200)}
            style={[styles.errorText, { color: errorBorderColor }]}
          >
            {errorMessage}
          </Animated.Text>
        )}
      </View>
    );
  }
);

ShakeError.displayName = 'ShakeError';

// ============================================================================
// Required Field Wrapper
// ============================================================================

export interface RequiredFieldProps {
  /** Field content */
  children: React.ReactNode;
  /** Whether the field has an error */
  hasError?: boolean;
  /** Error message */
  errorMessage?: string;
  /** Field label */
  label?: string;
  /** Required indicator */
  required?: boolean;
  /** Custom style */
  style?: ViewStyle;
}

export function RequiredField({
  children,
  hasError = false,
  errorMessage,
  label,
  required = true,
  style,
}: RequiredFieldProps) {
  return (
    <View style={[styles.fieldWrapper, style]}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {required && <Text style={styles.requiredStar}>*</Text>}
        </View>
      )}

      <ShakeError
        hasError={hasError}
        errorMessage={errorMessage}
        showErrorBorder
      >
        {children}
      </ShakeError>
    </View>
  );
}

// ============================================================================
// Form Validation Error
// ============================================================================

export interface ValidationErrorProps {
  /** Error message */
  message: string;
  /** Arabic message */
  messageAr?: string;
  /** Whether to show the error */
  visible?: boolean;
  /** Custom style */
  style?: ViewStyle;
}

export function ValidationError({
  message,
  messageAr,
  visible = true,
  style,
}: ValidationErrorProps) {
  const { isReduceMotion } = useAccessibility();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-10);

  useEffect(() => {
    if (visible) {
      if (isReduceMotion) {
        opacity.value = 1;
        translateY.value = 0;
      } else {
        opacity.value = withSpring(1, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
      }
    } else {
      opacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(-10, { duration: 150 });
    }
  }, [visible, isReduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.validationError, animatedStyle, style]}>
      <Text style={styles.validationErrorIcon}>\u26A0</Text>
      <Text style={styles.validationErrorText}>{message}</Text>
    </Animated.View>
  );
}

// ============================================================================
// Shake Group (for form sections)
// ============================================================================

export interface ShakeGroupRef {
  shakeAll: () => void;
  shakeField: (fieldId: string) => void;
}

export interface ShakeGroupProps {
  /** Child fields (must have ShakeError components) */
  children: React.ReactNode;
  /** Field errors map */
  errors?: Record<string, string>;
  /** Custom style */
  style?: ViewStyle;
}

// Note: This is a context-based implementation for coordinating shakes
export const ShakeGroupContext = React.createContext<{
  registerField: (id: string, ref: ShakeErrorRef) => void;
  unregisterField: (id: string) => void;
} | null>(null);

export const ShakeGroup = forwardRef<ShakeGroupRef, ShakeGroupProps>(
  ({ children, errors = {}, style }, ref) => {
    const fieldsRef = React.useRef<Map<string, ShakeErrorRef>>(new Map());

    const registerField = useCallback((id: string, fieldRef: ShakeErrorRef) => {
      fieldsRef.current.set(id, fieldRef);
    }, []);

    const unregisterField = useCallback((id: string) => {
      fieldsRef.current.delete(id);
    }, []);

    const shakeAll = useCallback(() => {
      fieldsRef.current.forEach((fieldRef) => {
        fieldRef.shake();
      });
    }, []);

    const shakeField = useCallback((fieldId: string) => {
      const fieldRef = fieldsRef.current.get(fieldId);
      fieldRef?.shake();
    }, []);

    useImperativeHandle(ref, () => ({
      shakeAll,
      shakeField,
    }));

    // Shake fields with errors
    useEffect(() => {
      Object.keys(errors).forEach((fieldId) => {
        if (errors[fieldId]) {
          shakeField(fieldId);
        }
      });
    }, [errors, shakeField]);

    const contextValue = React.useMemo(
      () => ({ registerField, unregisterField }),
      [registerField, unregisterField]
    );

    return (
      <ShakeGroupContext.Provider value={contextValue}>
        <View style={style}>{children}</View>
      </ShakeGroupContext.Provider>
    );
  }
);

ShakeGroup.displayName = 'ShakeGroup';

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  container: {
    position: 'relative',
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  fieldWrapper: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  requiredStar: {
    color: '#ff4d4f',
    fontSize: 14,
    marginLeft: 2,
  },
  validationError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff2f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ff4d4f',
  },
  validationErrorIcon: {
    fontSize: 14,
    marginRight: 8,
    color: '#ff4d4f',
  },
  validationErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#cf1322',
  },
});

export default ShakeError;
