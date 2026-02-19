/**
 * Accessible Components
 *
 * A collection of accessible UI components that follow WCAG 2.1 AA guidelines.
 * Includes proper accessibility labels, hints, roles, and VoiceOver/TalkBack support.
 */
import React, { forwardRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  TextInput,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ImageStyle,
  AccessibilityRole,
  AccessibilityState,
  TextInputProps,
  ImageSourcePropType,
  Pressable,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../../providers/AccessibilityProvider';
import { useLanguage } from '../../providers/LanguageProvider';

// ============================================================================
// Accessible Touchable Button
// ============================================================================

interface AccessibleButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
  // Accessibility
  accessibilityLabel: string;
  accessibilityLabelAr?: string;
  accessibilityHint?: string;
  accessibilityHintAr?: string;
}

export function AccessibleButton({
  onPress,
  children,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityLabelAr,
  accessibilityHint,
  accessibilityHintAr,
}: AccessibleButtonProps) {
  const { language } = useLanguage();
  const { colors, preferences } = useAccessibility();
  const isArabic = language === 'ar';

  const label = isArabic && accessibilityLabelAr ? accessibilityLabelAr : accessibilityLabel;
  const hint = isArabic && accessibilityHintAr ? accessibilityHintAr : accessibilityHint;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        preferences.enhancedFocusIndicators && styles.enhancedFocus,
        style,
      ]}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      activeOpacity={0.7}
    >
      {children}
    </TouchableOpacity>
  );
}

// ============================================================================
// Accessible Link
// ============================================================================

interface AccessibleLinkProps {
  onPress: () => void;
  text: string;
  textAr?: string;
  style?: TextStyle;
  accessibilityHint?: string;
  accessibilityHintAr?: string;
}

export function AccessibleLink({
  onPress,
  text,
  textAr,
  style,
  accessibilityHint,
  accessibilityHintAr,
}: AccessibleLinkProps) {
  const { language } = useLanguage();
  const { colors, scaledFontSize, isBoldText } = useAccessibility();
  const isArabic = language === 'ar';

  const displayText = isArabic && textAr ? textAr : text;
  const hint = isArabic && accessibilityHintAr ? accessibilityHintAr : accessibilityHint;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessible={true}
      accessibilityRole="link"
      accessibilityLabel={displayText}
      accessibilityHint={hint}
    >
      <Text
        style={[
          styles.link,
          {
            color: colors.primary,
            fontSize: scaledFontSize(16),
            fontWeight: isBoldText ? 'bold' : '600',
            textDecorationLine: 'underline',
          },
          style,
        ]}
      >
        {displayText}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// Accessible Image
// ============================================================================

interface AccessibleImageProps {
  source: ImageSourcePropType;
  alt: string;
  altAr?: string;
  style?: ImageStyle;
  decorative?: boolean;
}

export function AccessibleImage({
  source,
  alt,
  altAr,
  style,
  decorative = false,
}: AccessibleImageProps) {
  const { language } = useLanguage();
  const { preferences } = useAccessibility();
  const isArabic = language === 'ar';

  // Don't render decorative images when removeDecorativeElements is enabled
  if (decorative && preferences.removeDecorativeElements) {
    return null;
  }

  const description = isArabic && altAr ? altAr : alt;

  return (
    <Image
      source={source}
      style={style}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : description}
    />
  );
}

// ============================================================================
// Accessible Text Input
// ============================================================================

interface AccessibleTextInputProps extends Omit<TextInputProps, 'accessibilityLabel'> {
  label: string;
  labelAr?: string;
  hint?: string;
  hintAr?: string;
  error?: string;
  errorAr?: string;
  containerStyle?: ViewStyle;
}

export const AccessibleTextInput = forwardRef<TextInput, AccessibleTextInputProps>(
  (
    {
      label,
      labelAr,
      hint,
      hintAr,
      error,
      errorAr,
      containerStyle,
      style,
      ...props
    },
    ref
  ) => {
    const { language } = useLanguage();
    const { colors, scaledFontSize, isBoldText, isHighContrast } = useAccessibility();
    const isArabic = language === 'ar';

    const displayLabel = isArabic && labelAr ? labelAr : label;
    const displayHint = isArabic && hintAr ? hintAr : hint;
    const displayError = isArabic && errorAr ? errorAr : error;

    const accessibilityLabel = error
      ? `${displayLabel}, ${displayError}`
      : displayLabel;

    return (
      <View style={containerStyle}>
        <Text
          style={[
            styles.inputLabel,
            {
              color: colors.text,
              fontSize: scaledFontSize(14),
              fontWeight: isBoldText ? 'bold' : '600',
            },
          ]}
          accessibilityRole="text"
        >
          {displayLabel}
        </Text>
        <TextInput
          ref={ref}
          style={[
            styles.input,
            {
              borderColor: error ? colors.error : colors.border,
              borderWidth: isHighContrast ? 2 : 1,
              color: colors.text,
              fontSize: scaledFontSize(16),
              backgroundColor: colors.surface,
            },
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          accessible={true}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={displayHint}
          accessibilityState={{ disabled: props.editable === false }}
          {...props}
        />
        {error && (
          <Text
            style={[
              styles.errorText,
              {
                color: colors.error,
                fontSize: scaledFontSize(12),
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {displayError}
          </Text>
        )}
      </View>
    );
  }
);

// ============================================================================
// Accessible Status Badge
// ============================================================================

interface AccessibleStatusBadgeProps {
  status: string;
  statusAr?: string;
  type: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  style?: ViewStyle;
  announceChange?: boolean;
}

export function AccessibleStatusBadge({
  status,
  statusAr,
  type,
  style,
  announceChange = false,
}: AccessibleStatusBadgeProps) {
  const { language } = useLanguage();
  const { colors, scaledFontSize, isBoldText, announceForAccessibility } = useAccessibility();
  const isArabic = language === 'ar';

  const displayStatus = isArabic && statusAr ? statusAr : status;

  React.useEffect(() => {
    if (announceChange) {
      announceForAccessibility(`Status: ${displayStatus}`);
    }
  }, [displayStatus, announceChange, announceForAccessibility]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return colors.success + '20';
      case 'warning':
        return colors.warning + '20';
      case 'error':
        return colors.error + '20';
      case 'info':
        return colors.info + '20';
      default:
        return colors.border;
    }
  };

  const getTextColor = () => {
    switch (type) {
      case 'success':
        return colors.success;
      case 'warning':
        return colors.warning;
      case 'error':
        return colors.error;
      case 'info':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: getBackgroundColor() },
        style,
      ]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={displayStatus}
      accessibilityLiveRegion={announceChange ? 'polite' : 'none'}
    >
      <Text
        style={{
          color: getTextColor(),
          fontSize: scaledFontSize(12),
          fontWeight: isBoldText ? 'bold' : '600',
        }}
      >
        {displayStatus}
      </Text>
    </View>
  );
}

// ============================================================================
// Accessible Card (for inspection items, jobs, etc.)
// ============================================================================

interface AccessibleCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  title: string;
  titleAr?: string;
  subtitle?: string;
  subtitleAr?: string;
  style?: ViewStyle;
}

export function AccessibleCard({
  children,
  onPress,
  title,
  titleAr,
  subtitle,
  subtitleAr,
  style,
}: AccessibleCardProps) {
  const { language } = useLanguage();
  const { colors, preferences } = useAccessibility();
  const isArabic = language === 'ar';

  const displayTitle = isArabic && titleAr ? titleAr : title;
  const displaySubtitle = isArabic && subtitleAr ? subtitleAr : subtitle;

  const accessibilityLabel = displaySubtitle
    ? `${displayTitle}, ${displaySubtitle}`
    : displayTitle;

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderWidth: preferences.highContrastEnabled ? 2 : 1,
    borderColor: colors.border,
    borderRadius: preferences.removeDecorativeElements ? 4 : 12,
    padding: 16,
    ...(preferences.removeDecorativeElements
      ? {}
      : {
          boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
          elevation: 2,
        }),
    ...style,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={cardStyle}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={
          isArabic
            ? 'اضغط مرتين للفتح'
            : 'Double tap to open'
        }
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={cardStyle}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

// ============================================================================
// Accessible Header
// ============================================================================

interface AccessibleHeaderProps {
  title: string;
  titleAr?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  style?: TextStyle;
}

export function AccessibleHeader({
  title,
  titleAr,
  level = 1,
  style,
}: AccessibleHeaderProps) {
  const { language } = useLanguage();
  const { colors, scaledFontSize, isBoldText } = useAccessibility();
  const isArabic = language === 'ar';

  const displayTitle = isArabic && titleAr ? titleAr : title;

  const getFontSize = () => {
    switch (level) {
      case 1:
        return 28;
      case 2:
        return 24;
      case 3:
        return 20;
      case 4:
        return 18;
      case 5:
        return 16;
      case 6:
        return 14;
      default:
        return 24;
    }
  };

  return (
    <Text
      style={[
        {
          color: colors.text,
          fontSize: scaledFontSize(getFontSize()),
          fontWeight: 'bold',
        },
        style,
      ]}
      accessibilityRole="header"
      accessibilityLabel={displayTitle}
    >
      {displayTitle}
    </Text>
  );
}

// ============================================================================
// Screen Reader Announcement Component
// ============================================================================

interface ScreenReaderAnnouncementProps {
  message: string;
  messageAr?: string;
  type?: 'assertive' | 'polite';
}

export function ScreenReaderAnnouncement({
  message,
  messageAr,
  type = 'polite',
}: ScreenReaderAnnouncementProps) {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const displayMessage = isArabic && messageAr ? messageAr : message;

  return (
    <View
      accessible={true}
      accessibilityLiveRegion={type}
      style={styles.srOnly}
    >
      <Text>{displayMessage}</Text>
    </View>
  );
}

// ============================================================================
// Keyboard Shortcut Handler (for tablets)
// ============================================================================

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  action: () => void;
  description: string;
  descriptionAr?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

// Note: Full keyboard shortcut support requires expo-keyboard or similar
// This is a placeholder hook structure
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  // Implementation would use expo-keyboard or react-native-keycommand
  // For now, this is a structural placeholder
  return {
    shortcuts,
    enabled,
  };
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhancedFocus: {
    // Focus styles are applied dynamically
  },
  link: {
    paddingVertical: 4,
  },
  inputLabel: {
    marginBottom: 6,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  errorText: {
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    opacity: 0,
  },
});

export default {
  AccessibleButton,
  AccessibleLink,
  AccessibleImage,
  AccessibleTextInput,
  AccessibleStatusBadge,
  AccessibleCard,
  AccessibleHeader,
  ScreenReaderAnnouncement,
  useKeyboardShortcuts,
};
