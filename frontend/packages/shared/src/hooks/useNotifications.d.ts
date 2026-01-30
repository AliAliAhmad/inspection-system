import { Notification } from '../types';
interface UseNotificationsOptions {
    /** Fetch function that returns notifications */
    fetchFn: () => Promise<{
        notifications: Notification[];
        unread_count: number;
    }>;
    /** Polling interval in ms (default 30000) */
    interval?: number;
    /** Whether polling is enabled */
    enabled?: boolean;
}
export declare function useNotifications({ fetchFn, interval, enabled }: UseNotificationsOptions): {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    refresh: () => Promise<void>;
};
export {};
//# sourceMappingURL=useNotifications.d.ts.map