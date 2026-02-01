import type { Notification } from '../types/notification.types';
/**
 * Derive the frontend route for a notification based on its type, related data, and the user's role.
 * Returns null if no meaningful route can be determined.
 */
export declare function getNotificationRoute(notification: Notification, userRole: string): string | null;
/**
 * Map notification type to a React Navigation screen name for mobile.
 * Returns { screen, params } or null.
 */
export declare function getNotificationMobileRoute(notification: Notification, userRole: string): {
    screen: string;
    params?: Record<string, any>;
} | null;
//# sourceMappingURL=notification-routes.d.ts.map