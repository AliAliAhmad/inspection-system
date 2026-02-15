/**
 * Haptics Utility
 *
 * Provides haptic feedback patterns for various user interactions.
 * Uses expo-haptics for native haptic feedback.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Check if haptics are available on the current device
 */
const isHapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Light tap feedback - used for selections, toggles
 */
export async function lightTap(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Medium tap feedback - used for button presses
 */
export async function mediumTap(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Heavy tap feedback - used for errors, warnings, destructive actions
 */
export async function heavyTap(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Success feedback - double tap pattern
 */
export async function successFeedback(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Warning feedback - single warning tap
 */
export async function warningFeedback(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Error feedback - error notification
 */
export async function errorFeedback(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Selection change feedback - very light feedback for selection changes
 */
export async function selectionFeedback(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.selectionAsync();
  } catch (e) {
    // Haptics not available on this device
  }
}

/**
 * Custom pattern feedback - play a sequence of haptics
 */
export async function patternFeedback(
  pattern: Array<'light' | 'medium' | 'heavy' | 'pause'>,
  pauseDuration: number = 100
): Promise<void> {
  if (!isHapticsAvailable) return;

  for (const item of pattern) {
    try {
      switch (item) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case 'pause':
          await new Promise(resolve => setTimeout(resolve, pauseDuration));
          break;
      }
      // Small delay between haptics for distinct feedback
      if (item !== 'pause') {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (e) {
      // Continue with pattern even if one haptic fails
    }
  }
}

/**
 * Common haptic patterns
 */
export const patterns = {
  /** Double success tap */
  doubleTap: () => patternFeedback(['light', 'light']),
  /** Triple tap for strong confirmation */
  tripleTap: () => patternFeedback(['light', 'light', 'light']),
  /** Building intensity for urgent actions */
  urgent: () => patternFeedback(['light', 'pause', 'medium', 'pause', 'heavy']),
  /** Countdown feel */
  countdown: () => patternFeedback(['heavy', 'pause', 'heavy', 'pause', 'heavy', 'pause', 'light']),
};

export default {
  lightTap,
  mediumTap,
  heavyTap,
  successFeedback,
  warningFeedback,
  errorFeedback,
  selectionFeedback,
  patternFeedback,
  patterns,
};
