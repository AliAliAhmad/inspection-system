import { useState, useEffect, useRef, useCallback } from 'react';
export function useNotifications({ fetchFn, interval = 30000, enabled = true }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const timerRef = useRef();
    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const result = await fetchFn();
            setNotifications(result.notifications);
            setUnreadCount(result.unread_count);
        }
        catch {
            // Silently fail - notifications are non-critical
        }
        finally {
            setIsLoading(false);
        }
    }, [fetchFn]);
    useEffect(() => {
        if (!enabled)
            return;
        refresh();
        timerRef.current = setInterval(refresh, interval);
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
        };
    }, [enabled, interval, refresh]);
    return { notifications, unreadCount, isLoading, refresh };
}
//# sourceMappingURL=useNotifications.js.map