/**
 * Accessibility Storage
 *
 * Persists accessibility preferences using AsyncStorage.
 * Handles high contrast, text scaling, reduce motion, and other a11y settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TextScale = 1 | 1.25 | 1.5 | 2;

export interface AccessibilityPreferences {
  // High Contrast Mode
  highContrastEnabled: boolean;
  boldTextEnabled: boolean;
  removeDecorativeElements: boolean;

  // Text Scaling
  textScale: TextScale;
  respectSystemFontSize: boolean;

  // Motion & Animation
  reduceMotionEnabled: boolean;

  // Focus & Navigation
  enhancedFocusIndicators: boolean;

  // Screen Reader
  screenReaderOptimized: boolean;
}

const ACCESSIBILITY_STORAGE_KEY = '@inspection_accessibility_preferences';

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  highContrastEnabled: false,
  boldTextEnabled: false,
  removeDecorativeElements: false,
  textScale: 1,
  respectSystemFontSize: true,
  reduceMotionEnabled: false,
  enhancedFocusIndicators: false,
  screenReaderOptimized: false,
};

export async function getAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  try {
    const stored = await AsyncStorage.getItem(ACCESSIBILITY_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to load accessibility preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

export async function setAccessibilityPreferences(
  prefs: Partial<AccessibilityPreferences>
): Promise<void> {
  try {
    const current = await getAccessibilityPreferences();
    const updated = { ...current, ...prefs };
    await AsyncStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save accessibility preferences:', error);
  }
}

export async function resetAccessibilityPreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACCESSIBILITY_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to reset accessibility preferences:', error);
  }
}

export { DEFAULT_PREFERENCES as DEFAULT_ACCESSIBILITY_PREFERENCES };
