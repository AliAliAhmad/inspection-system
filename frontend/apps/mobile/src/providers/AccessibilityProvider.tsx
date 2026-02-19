/**
 * Accessibility Provider
 *
 * Provides accessibility context and settings throughout the app.
 * Handles high contrast, text scaling, reduce motion, and screen reader support.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  AccessibilityInfo,
  useColorScheme,
  PixelRatio,
  Appearance,
} from 'react-native';
import {
  AccessibilityPreferences,
  TextScale,
  getAccessibilityPreferences,
  setAccessibilityPreferences,
  resetAccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '../storage/accessibility-storage';

export interface AccessibilityContextValue {
  // Preferences
  preferences: AccessibilityPreferences;
  updatePreferences: (prefs: Partial<AccessibilityPreferences>) => Promise<void>;
  resetPreferences: () => Promise<void>;

  // Computed values
  isHighContrast: boolean;
  isBoldText: boolean;
  textScale: TextScale;
  isReduceMotion: boolean;
  isScreenReaderActive: boolean;
  fontScale: number;

  // Theme colors (high contrast aware)
  colors: AccessibilityColors;

  // Helper functions
  scaledFontSize: (baseSize: number) => number;
  getAccessibilityLabel: (enLabel: string, arLabel?: string, isArabic?: boolean) => string;
  announceForAccessibility: (message: string) => void;
}

export interface AccessibilityColors {
  // Text
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;

  // Backgrounds
  background: string;
  surface: string;
  surfaceElevated: string;

  // Primary
  primary: string;
  primaryDark: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // Borders
  border: string;
  borderFocused: string;

  // Overlay
  overlay: string;
}

// Standard colors
const STANDARD_COLORS: AccessibilityColors = {
  text: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  textOnPrimary: '#ffffff',

  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',

  primary: '#1677ff',
  primaryDark: '#0958d9',

  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1677ff',

  border: '#d9d9d9',
  borderFocused: '#1677ff',

  overlay: 'rgba(0, 0, 0, 0.45)',
};

// High contrast colors (WCAG AAA compliant)
const HIGH_CONTRAST_COLORS: AccessibilityColors = {
  text: '#000000',
  textSecondary: '#000000',
  textMuted: '#333333',
  textOnPrimary: '#ffffff',

  background: '#ffffff',
  surface: '#ffffff',
  surfaceElevated: '#f0f0f0',

  primary: '#0050a0',
  primaryDark: '#003870',

  success: '#006400',
  warning: '#8b4513',
  error: '#b22222',
  info: '#0050a0',

  border: '#000000',
  borderFocused: '#0050a0',

  overlay: 'rgba(0, 0, 0, 0.7)',
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(
    DEFAULT_ACCESSIBILITY_PREFERENCES
  );
  const [isScreenReaderActive, setIsScreenReaderActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      const prefs = await getAccessibilityPreferences();
      setPreferences(prefs);
      setIsLoading(false);
    };
    loadPreferences();
  }, []);

  // Listen for screen reader changes
  useEffect(() => {
    const checkScreenReader = async () => {
      const isActive = await AccessibilityInfo.isScreenReaderEnabled();
      setIsScreenReaderActive(isActive);
    };

    checkScreenReader();

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (isActive) => {
        setIsScreenReaderActive(isActive);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Listen for reduce motion preference
  useEffect(() => {
    const checkReduceMotion = async () => {
      const isReduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      if (isReduceMotion && !preferences.reduceMotionEnabled) {
        setPreferences((prev) => ({ ...prev, reduceMotionEnabled: true }));
      }
    };

    checkReduceMotion();

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (isEnabled) => {
        if (isEnabled) {
          setPreferences((prev) => ({ ...prev, reduceMotionEnabled: true }));
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [preferences.reduceMotionEnabled]);

  // Update preferences - use functional setState to avoid dependency on preferences
  const updatePreferences = useCallback(
    async (newPrefs: Partial<AccessibilityPreferences>) => {
      setPreferences((prev) => ({ ...prev, ...newPrefs }));
      await setAccessibilityPreferences(newPrefs);
    },
    []
  );

  // Reset preferences
  const resetPreferences = useCallback(async () => {
    setPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES);
    await resetAccessibilityPreferences();
  }, []);

  // Computed values
  const isHighContrast = preferences.highContrastEnabled;
  const isBoldText = preferences.boldTextEnabled;
  const textScale = preferences.textScale;
  const isReduceMotion = preferences.reduceMotionEnabled;

  // Get system font scale if respecting system settings
  const systemFontScale = preferences.respectSystemFontSize ? PixelRatio.getFontScale() : 1;
  const fontScale = textScale * systemFontScale;

  // Select colors based on high contrast mode
  const colors = isHighContrast ? HIGH_CONTRAST_COLORS : STANDARD_COLORS;

  // Helper: Scale font size
  const scaledFontSize = useCallback(
    (baseSize: number): number => {
      return Math.round(baseSize * fontScale);
    },
    [fontScale]
  );

  // Helper: Get accessibility label (supports Arabic)
  const getAccessibilityLabel = useCallback(
    (enLabel: string, arLabel?: string, isArabic: boolean = false): string => {
      if (isArabic && arLabel) {
        return arLabel;
      }
      return enLabel;
    },
    []
  );

  // Helper: Announce for screen readers
  const announceForAccessibility = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const value: AccessibilityContextValue = useMemo(
    () => ({
      preferences,
      updatePreferences,
      resetPreferences,
      isHighContrast,
      isBoldText,
      textScale,
      isReduceMotion,
      isScreenReaderActive,
      fontScale,
      colors,
      scaledFontSize,
      getAccessibilityLabel,
      announceForAccessibility,
    }),
    [
      preferences,
      updatePreferences,
      resetPreferences,
      isHighContrast,
      isBoldText,
      textScale,
      isReduceMotion,
      isScreenReaderActive,
      fontScale,
      colors,
      scaledFontSize,
      getAccessibilityLabel,
      announceForAccessibility,
    ]
  );

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}

export { AccessibilityContext };
