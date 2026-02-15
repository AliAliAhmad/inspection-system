/**
 * useHaptics Hook
 * Provides consistent haptic feedback patterns across the app
 *
 * Haptic Patterns:
 * - selection: Light tap for selections/highlights
 * - action: Medium tap for user actions
 * - success: Success notification
 * - error: Error notification
 * - warning: Warning notification
 * - swipeThreshold: Feedback when reaching swipe threshold
 * - dragStart: When starting a drag operation
 * - dragDrop: When completing a drag operation
 */
import { useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';

export type HapticPattern =
  | 'selection'
  | 'action'
  | 'success'
  | 'error'
  | 'warning'
  | 'swipeThreshold'
  | 'dragStart'
  | 'dragDrop'
  | 'longPress'
  | 'refresh';

interface UseHapticsOptions {
  enabled?: boolean;
}

interface UseHapticsResult {
  trigger: (pattern: HapticPattern) => void;
  selectionFeedback: () => void;
  actionFeedback: () => void;
  successFeedback: () => void;
  errorFeedback: () => void;
  warningFeedback: () => void;
  swipeThresholdFeedback: () => void;
  dragStartFeedback: () => void;
  dragDropFeedback: () => void;
  longPressFeedback: () => void;
  refreshFeedback: () => void;
}

export function useHaptics(options: UseHapticsOptions = {}): UseHapticsResult {
  const { enabled = true } = options;
  const lastTriggerTime = useRef<Record<string, number>>({});
  const MIN_INTERVAL = 50; // Minimum ms between haptic triggers

  const shouldTrigger = useCallback((pattern: string): boolean => {
    if (!enabled) return false;

    const now = Date.now();
    const lastTime = lastTriggerTime.current[pattern] || 0;

    if (now - lastTime < MIN_INTERVAL) {
      return false;
    }

    lastTriggerTime.current[pattern] = now;
    return true;
  }, [enabled]);

  const trigger = useCallback((pattern: HapticPattern) => {
    if (!shouldTrigger(pattern)) return;

    switch (pattern) {
      case 'selection':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      case 'action':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;

      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;

      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;

      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;

      case 'swipeThreshold':
        // Double light tap for threshold feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;

      case 'dragStart':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;

      case 'dragDrop':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;

      case 'longPress':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;

      case 'refresh':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;

      default:
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [shouldTrigger]);

  const selectionFeedback = useCallback(() => trigger('selection'), [trigger]);
  const actionFeedback = useCallback(() => trigger('action'), [trigger]);
  const successFeedback = useCallback(() => trigger('success'), [trigger]);
  const errorFeedback = useCallback(() => trigger('error'), [trigger]);
  const warningFeedback = useCallback(() => trigger('warning'), [trigger]);
  const swipeThresholdFeedback = useCallback(() => trigger('swipeThreshold'), [trigger]);
  const dragStartFeedback = useCallback(() => trigger('dragStart'), [trigger]);
  const dragDropFeedback = useCallback(() => trigger('dragDrop'), [trigger]);
  const longPressFeedback = useCallback(() => trigger('longPress'), [trigger]);
  const refreshFeedback = useCallback(() => trigger('refresh'), [trigger]);

  return {
    trigger,
    selectionFeedback,
    actionFeedback,
    successFeedback,
    errorFeedback,
    warningFeedback,
    swipeThresholdFeedback,
    dragStartFeedback,
    dragDropFeedback,
    longPressFeedback,
    refreshFeedback,
  };
}

export default useHaptics;
