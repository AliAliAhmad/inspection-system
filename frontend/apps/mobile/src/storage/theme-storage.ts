/**
 * Theme Storage
 *
 * Persists theme preferences using AsyncStorage.
 * Handles theme mode (system, light, dark, schedule) and schedule times.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark' | 'schedule';

export interface ThemePreferences {
  mode: ThemeMode;
  // For schedule mode: sunset/sunrise auto-toggle times (in minutes from midnight)
  sunriseTime: number; // Default: 6:00 AM = 360
  sunsetTime: number;  // Default: 6:00 PM = 1080
}

const THEME_STORAGE_KEY = '@inspection_theme_preferences';

const DEFAULT_PREFERENCES: ThemePreferences = {
  mode: 'system',
  sunriseTime: 360,  // 6:00 AM
  sunsetTime: 1080,  // 6:00 PM
};

export async function getThemePreferences(): Promise<ThemePreferences> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn('Failed to load theme preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

export async function setThemePreferences(prefs: Partial<ThemePreferences>): Promise<void> {
  try {
    const current = await getThemePreferences();
    const updated = { ...current, ...prefs };
    await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save theme preferences:', error);
  }
}

export async function clearThemePreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear theme preferences:', error);
  }
}

/**
 * Converts minutes from midnight to a time string (HH:MM)
 */
export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Converts a time string (HH:MM) to minutes from midnight
 */
export function timeStringToMinutes(timeString: string): number {
  const [hours, mins] = timeString.split(':').map(Number);
  return hours * 60 + mins;
}

/**
 * Checks if the current time is within the dark period (sunset to sunrise)
 */
export function isNightTime(sunriseTime: number, sunsetTime: number): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // If sunset is before sunrise (overnight), dark mode is active between sunset and midnight, or midnight and sunrise
  if (sunsetTime > sunriseTime) {
    // Normal case: sunset at 18:00, sunrise at 06:00
    // Dark is when currentMinutes >= sunset OR currentMinutes < sunrise
    return currentMinutes >= sunsetTime || currentMinutes < sunriseTime;
  } else {
    // Edge case: sunset at 22:00, sunrise at 05:00
    return currentMinutes >= sunsetTime && currentMinutes < sunriseTime;
  }
}
