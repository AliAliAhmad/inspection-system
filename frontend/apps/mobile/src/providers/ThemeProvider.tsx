/**
 * ThemeProvider
 *
 * Provides dark mode support with multiple modes:
 * - System: Follows device preference (Appearance API)
 * - Light: Always light mode
 * - Dark: Always dark mode
 * - Schedule: Auto-toggle based on time (sunset to sunrise)
 *
 * Features:
 * - Persists preference to AsyncStorage
 * - Updates StatusBar style automatically
 * - Schedule mode with configurable sunrise/sunset times
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Appearance, ColorSchemeName, AppState, AppStateStatus } from 'react-native';
import {
  ThemeMode,
  ThemePreferences,
  getThemePreferences,
  setThemePreferences,
  isNightTime,
} from '../storage/theme-storage';
import { ThemeColors, lightColors, darkColors } from '../theme/colors';

interface ThemeContextValue {
  // Current theme state
  isDark: boolean;
  colors: ThemeColors;

  // Theme mode management
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;

  // Schedule settings
  sunriseTime: number;
  sunsetTime: number;
  setSunriseTime: (minutes: number) => void;
  setSunsetTime: (minutes: number) => void;

  // Toggle function (cycles: system -> light -> dark -> schedule -> system)
  toggleTheme: () => void;

  // Loading state
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Check interval for schedule mode (every minute)
const SCHEDULE_CHECK_INTERVAL = 60000;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferencesState] = useState<ThemePreferences>({
    mode: 'system',
    sunriseTime: 360,
    sunsetTime: 1080,
  });
  const [systemColorScheme, setSystemColorScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );
  const [scheduleIsDark, setScheduleIsDark] = useState(false);

  // Load persisted preferences on mount
  useEffect(() => {
    async function loadPreferences() {
      const prefs = await getThemePreferences();
      setPreferencesState(prefs);

      // Initialize schedule dark state
      if (prefs.mode === 'schedule') {
        setScheduleIsDark(isNightTime(prefs.sunriseTime, prefs.sunsetTime));
      }

      setIsLoading(false);
    }
    loadPreferences();
  }, []);

  // Listen for system appearance changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemColorScheme(colorScheme);
    });

    return () => subscription.remove();
  }, []);

  // Handle app state changes for schedule mode recalculation
  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active' && preferences.mode === 'schedule') {
        setScheduleIsDark(isNightTime(preferences.sunriseTime, preferences.sunsetTime));
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [preferences.mode, preferences.sunriseTime, preferences.sunsetTime]);

  // Schedule mode: Check time periodically
  useEffect(() => {
    if (preferences.mode !== 'schedule') return;

    // Initial check
    setScheduleIsDark(isNightTime(preferences.sunriseTime, preferences.sunsetTime));

    // Set up interval for periodic checks
    const interval = setInterval(() => {
      setScheduleIsDark(isNightTime(preferences.sunriseTime, preferences.sunsetTime));
    }, SCHEDULE_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [preferences.mode, preferences.sunriseTime, preferences.sunsetTime]);

  // Calculate if dark mode should be active
  const isDark = useMemo(() => {
    switch (preferences.mode) {
      case 'light':
        return false;
      case 'dark':
        return true;
      case 'schedule':
        return scheduleIsDark;
      case 'system':
      default:
        return systemColorScheme === 'dark';
    }
  }, [preferences.mode, systemColorScheme, scheduleIsDark]);

  // Get the appropriate color palette
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);

  // Update preferences and persist
  const updatePreferences = useCallback(async (updates: Partial<ThemePreferences>) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...updates };
      setThemePreferences(updated);
      return updated;
    });
  }, []);

  const setMode = useCallback(
    (mode: ThemeMode) => {
      updatePreferences({ mode });
      if (mode === 'schedule') {
        setScheduleIsDark(isNightTime(preferences.sunriseTime, preferences.sunsetTime));
      }
    },
    [updatePreferences, preferences.sunriseTime, preferences.sunsetTime]
  );

  const setSunriseTime = useCallback(
    (minutes: number) => {
      updatePreferences({ sunriseTime: minutes });
    },
    [updatePreferences]
  );

  const setSunsetTime = useCallback(
    (minutes: number) => {
      updatePreferences({ sunsetTime: minutes });
    },
    [updatePreferences]
  );

  const toggleTheme = useCallback(() => {
    const modes: ThemeMode[] = ['system', 'light', 'dark', 'schedule'];
    const currentIndex = modes.indexOf(preferences.mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMode(modes[nextIndex]);
  }, [preferences.mode, setMode]);

  const value = useMemo(
    () => ({
      isDark,
      colors,
      mode: preferences.mode,
      setMode,
      sunriseTime: preferences.sunriseTime,
      sunsetTime: preferences.sunsetTime,
      setSunriseTime,
      setSunsetTime,
      toggleTheme,
      isLoading,
    }),
    [
      isDark,
      colors,
      preferences.mode,
      preferences.sunriseTime,
      preferences.sunsetTime,
      setMode,
      setSunriseTime,
      setSunsetTime,
      toggleTheme,
      isLoading,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return ctx;
}

export default ThemeProvider;
