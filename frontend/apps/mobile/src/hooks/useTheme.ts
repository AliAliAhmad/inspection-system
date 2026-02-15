/**
 * useTheme Hook
 *
 * Provides access to theme colors and dark mode state.
 *
 * Usage:
 * ```tsx
 * import { useTheme } from '../hooks/useTheme';
 *
 * function MyComponent() {
 *   const { colors, isDark, toggle } = useTheme();
 *
 *   return (
 *     <View style={{ backgroundColor: colors.background }}>
 *       <Text style={{ color: colors.text }}>
 *         {isDark ? 'Dark Mode' : 'Light Mode'}
 *       </Text>
 *       <Button title="Toggle" onPress={toggle} />
 *     </View>
 *   );
 * }
 * ```
 */
import { useMemo } from 'react';
import { StyleSheet, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { useThemeContext } from '../providers/ThemeProvider';
import { ThemeColors } from '../theme/colors';

export interface UseThemeReturn {
  // Current theme colors
  colors: ThemeColors;

  // Is dark mode currently active
  isDark: boolean;

  // Toggle through theme modes
  toggle: () => void;

  // Create theme-aware styles
  createStyles: <T extends StyleSheet.NamedStyles<T>>(
    factory: (colors: ThemeColors, isDark: boolean) => T
  ) => T;
}

export function useTheme(): UseThemeReturn {
  const { colors, isDark, toggleTheme } = useThemeContext();

  const createStyles = useMemo(() => {
    return <T extends StyleSheet.NamedStyles<T>>(
      factory: (colors: ThemeColors, isDark: boolean) => T
    ): T => {
      return StyleSheet.create(factory(colors, isDark));
    };
  }, [colors, isDark]);

  return useMemo(
    () => ({
      colors,
      isDark,
      toggle: toggleTheme,
      createStyles,
    }),
    [colors, isDark, toggleTheme, createStyles]
  );
}

/**
 * Create theme-aware styles outside of components
 *
 * Usage:
 * ```tsx
 * import { createThemedStyles } from '../hooks/useTheme';
 *
 * const useStyles = createThemedStyles((colors, isDark) => ({
 *   container: {
 *     backgroundColor: colors.background,
 *     padding: 16,
 *   },
 *   title: {
 *     color: colors.text,
 *     fontSize: 18,
 *   },
 * }));
 *
 * function MyComponent() {
 *   const styles = useStyles();
 *   return (
 *     <View style={styles.container}>
 *       <Text style={styles.title}>Hello</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors, isDark: boolean) => T
) {
  return function useStyles(): T {
    const { colors, isDark } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors, isDark)), [colors, isDark]);
  };
}

/**
 * Helper type for style objects that can be themed
 */
export type ThemedStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * Helper to conditionally apply styles based on theme
 */
export function themedValue<T>(isDark: boolean, lightValue: T, darkValue: T): T {
  return isDark ? darkValue : lightValue;
}

export default useTheme;
