/**
 * Notification Sounds Utility
 *
 * Uses React Native Vibration API for tactile feedback on new notifications.
 * - playChime():    short 200ms buzz for normal notifications
 * - playRingtone(): patterned vibration for job assignments (important)
 */
import { Vibration } from 'react-native';

/**
 * Short single-buzz vibration for normal notifications.
 */
export function playChime(): void {
  Vibration.vibrate(200);
}

/**
 * Longer patterned vibration for important notifications
 * (job assignments, inspection assignments).
 * Pattern: wait 0ms, buzz 300ms, pause 100ms, buzz 300ms
 */
export function playRingtone(): void {
  Vibration.vibrate([0, 300, 100, 300]);
}
