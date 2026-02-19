/**
 * High Contrast Mode Component
 *
 * Provides high contrast styling wrapper that can be toggled in settings.
 * Increases contrast ratios, enables bold text option, and removes decorative elements.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../../providers/AccessibilityProvider';
import { useLanguage } from '../../providers/LanguageProvider';

interface HighContrastWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Wrapper component that applies high contrast styles to children
 */
export function HighContrastWrapper({ children, style }: HighContrastWrapperProps) {
  const { isHighContrast, colors, preferences } = useAccessibility();

  const containerStyle: ViewStyle = {
    backgroundColor: colors.background,
    ...(preferences.removeDecorativeElements && {
      boxShadow: 'none',
      elevation: 0,
      borderRadius: 0,
    }),
    ...style,
  };

  return <View style={containerStyle}>{children}</View>;
}

interface HighContrastTextProps {
  children: React.ReactNode;
  style?: TextStyle;
  variant?: 'primary' | 'secondary' | 'muted' | 'error' | 'success';
  numberOfLines?: number;
  // Accessibility props
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'text' | 'header' | 'link';
}

/**
 * Text component with high contrast support
 */
export function HighContrastText({
  children,
  style,
  variant = 'primary',
  numberOfLines,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'text',
}: HighContrastTextProps) {
  const { colors, isBoldText, scaledFontSize } = useAccessibility();

  const getColor = () => {
    switch (variant) {
      case 'secondary':
        return colors.textSecondary;
      case 'muted':
        return colors.textMuted;
      case 'error':
        return colors.error;
      case 'success':
        return colors.success;
      default:
        return colors.text;
    }
  };

  const textStyle: TextStyle = {
    color: getColor(),
    fontWeight: isBoldText ? 'bold' : (style?.fontWeight || 'normal'),
    fontSize: style?.fontSize ? scaledFontSize(style.fontSize as number) : undefined,
    ...style,
  };

  return (
    <Text
      style={textStyle}
      numberOfLines={numberOfLines}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Text>
  );
}

interface HighContrastSurfaceProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  // Accessibility
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'none' | 'button' | 'link' | 'image' | 'text';
}

/**
 * Surface/Card component with high contrast support
 */
export function HighContrastSurface({
  children,
  style,
  elevated = false,
  accessible,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: HighContrastSurfaceProps) {
  const { colors, isHighContrast, preferences } = useAccessibility();

  const surfaceStyle: ViewStyle = {
    backgroundColor: elevated ? colors.surfaceElevated : colors.surface,
    borderWidth: isHighContrast ? 2 : 1,
    borderColor: colors.border,
    ...(preferences.removeDecorativeElements
      ? {
          boxShadow: 'none',
          elevation: 0,
          borderRadius: 4,
        }
      : {
          borderRadius: 12,
          boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
          elevation: elevated ? 4 : 2,
        }),
    padding: 16,
    ...style,
  };

  return (
    <View
      style={surfaceStyle}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </View>
  );
}

interface HighContrastButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * Button component with high contrast and accessibility support
 */
export function HighContrastButton({
  onPress,
  title,
  variant = 'primary',
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: HighContrastButtonProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { colors, isHighContrast, isBoldText, scaledFontSize, preferences } = useAccessibility();

  const getBackgroundColor = () => {
    if (disabled) return colors.textMuted;
    switch (variant) {
      case 'secondary':
        return colors.surface;
      case 'danger':
        return colors.error;
      default:
        return colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.surface;
    switch (variant) {
      case 'secondary':
        return colors.primary;
      default:
        return colors.textOnPrimary;
    }
  };

  const buttonStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderWidth: variant === 'secondary' || isHighContrast ? 2 : 0,
    borderColor: variant === 'secondary' ? colors.primary : colors.border,
    borderRadius: preferences.removeDecorativeElements ? 4 : 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? 0.7 : 1,
    ...style,
  };

  const textStyle: TextStyle = {
    color: getTextColor(),
    fontSize: scaledFontSize(16),
    fontWeight: isBoldText ? 'bold' : '600',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={buttonStyle}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      <Text style={textStyle}>{title}</Text>
    </TouchableOpacity>
  );
}

interface HighContrastToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  description?: string;
  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * Toggle/Switch component with high contrast and accessibility support
 */
export function HighContrastToggle({
  value,
  onValueChange,
  label,
  description,
  accessibilityLabel,
  accessibilityHint,
}: HighContrastToggleProps) {
  const { colors, isBoldText, scaledFontSize, isHighContrast } = useAccessibility();

  return (
    <View
      style={styles.toggleContainer}
      accessible={true}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint || description}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.toggleTextContainer}>
        <Text
          style={[
            styles.toggleLabel,
            {
              color: colors.text,
              fontWeight: isBoldText ? 'bold' : '600',
              fontSize: scaledFontSize(16),
            },
          ]}
        >
          {label}
        </Text>
        {description && (
          <Text
            style={[
              styles.toggleDescription,
              {
                color: colors.textSecondary,
                fontSize: scaledFontSize(13),
              },
            ]}
          >
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: colors.border,
          true: isHighContrast ? colors.primaryDark : colors.primary,
        }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

interface FocusIndicatorProps {
  focused: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Focus indicator wrapper for keyboard navigation
 */
export function FocusIndicator({ focused, children, style }: FocusIndicatorProps) {
  const { colors, preferences } = useAccessibility();

  const focusStyle: ViewStyle = focused && preferences.enhancedFocusIndicators
    ? {
        borderWidth: 3,
        borderColor: colors.borderFocused,
        borderStyle: 'solid',
      }
    : {};

  return <View style={[focusStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
  },
  toggleDescription: {
    marginTop: 4,
    fontSize: 13,
  },
});

export default {
  HighContrastWrapper,
  HighContrastText,
  HighContrastSurface,
  HighContrastButton,
  HighContrastToggle,
  FocusIndicator,
};
