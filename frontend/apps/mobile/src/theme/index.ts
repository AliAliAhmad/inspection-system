/**
 * Theme Module
 *
 * Export all theme-related utilities, colors, and types.
 */

// Colors and types
export {
  lightColors,
  darkColors,
  getRoleColor,
  type ThemeColors,
} from './colors';

// Theme-aware style helpers
export {
  createThemedStyles,
  themedValue,
  type ThemedStyle,
} from '../hooks/useTheme';
