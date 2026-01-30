import { useState, useEffect, useRef, useCallback } from 'react';
import { Notification } from '../types';

interface UseNotificationsOptions {
  /** Fetch function that returns notifications */
  fetchFn: () => Promise<{ notifications: Notification[]; unread_count: number }>;
  /** Polling interval in ms (default 30000) */
  interval?: number;
  /** Whether polling is enabled */
  enabled?: boolean;
}

export function useNotifications({ fetchFn, interval = 30000, enabled = true }: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchFn();
      setNotifications(result.notifications);
      setUnreadCount(result.unread_count);
    } catch {
      // Silently fail - notifications are non-critical
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    timerRef.current = setInterval(refresh, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, interval, refresh]);

  return { notifications, unreadCount, isLoading, refresh };
}
