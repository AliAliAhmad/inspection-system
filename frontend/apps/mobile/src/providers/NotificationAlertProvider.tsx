/**
 * NotificationAlertProvider
 *
 * Mirrors the web's useNotificationAlerts hook for React Native.
 *
 * Behaviour:
 * - Polls every 15 s for new unread notifications (only when user is logged in)
 * - On first load, records existing IDs without alerting
 * - For each genuinely new notification:
 *     1. Shows an in-app toast banner (NotificationToast)
 *     2. Vibrates: short buzz for normal, pattern for job assignments
 *     3. Updates the app badge count via expo-notifications
 * - Tapping a toast navigates to the relevant screen
 * - Toasts auto-dismiss after 6 seconds
 * - Does NOT show toasts when the NotificationsScreen is focused
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import {
  notificationsApi,
  Notification,
  getNotificationMobileRoute,
} from '@inspection/shared';
import { useAuth } from './AuthProvider';
import { navigationRef } from '../navigation/navigationRef';
import NotificationToast from '../components/NotificationToast';
import { playChime, playRingtone } from '../utils/notification-sounds';

// --- Constants ---

const JOB_ASSIGNMENT_TYPES = new Set([
  'specialist_job_assigned',
  'engineer_job_created',
  'inspection_assigned',
]);

// Screen names that indicate the user is already viewing notifications
const NOTIFICATIONS_SCREEN_NAMES = new Set([
  'Notifications',
  'NotificationsScreen',
]);

// --- Context ---

interface NotificationAlertContextValue {
  /** Number of unread notifications from last poll */
  unreadCount: number;
}

const NotificationAlertContext = createContext<NotificationAlertContextValue>({
  unreadCount: 0,
});

export function useNotificationAlertContext() {
  return useContext(NotificationAlertContext);
}

// --- Provider ---

interface Props {
  children: React.ReactNode;
}

export function NotificationAlertProvider({ children }: Props) {
  const { user, isAuthenticated } = useAuth();

  // Track notification IDs we've already shown toasts for
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initialLoadRef = useRef(true);

  // Active toasts (queue)
  const [visibleToasts, setVisibleToasts] = useState<Notification[]>([]);

  // --- Polling ---
  const { data } = useQuery({
    queryKey: ['notifications', 'alerts'],
    queryFn: () =>
      notificationsApi
        .list({ unread_only: true, per_page: 5 })
        .then((r) => r.data),
    refetchInterval: 15_000,
    enabled: isAuthenticated && !!user,
  });

  // --- Check if user is on the Notifications screen ---
  const isOnNotificationsScreen = useCallback((): boolean => {
    try {
      const route = navigationRef.getCurrentRoute();
      if (route && NOTIFICATIONS_SCREEN_NAMES.has(route.name)) return true;
    } catch {
      // navigationRef may not be ready yet
    }
    return false;
  }, []);

  // --- Navigate on toast press ---
  const handleToastPress = useCallback(
    (notification: Notification) => {
      // Remove from visible list first
      setVisibleToasts((prev) => prev.filter((t) => t.id !== notification.id));

      if (!user) return;

      const route = getNotificationMobileRoute(notification, user.role);
      if (route && navigationRef.isReady()) {
        navigationRef.navigate(route.screen as any, route.params);
      }
    },
    [user],
  );

  // --- Dismiss toast ---
  const handleToastDismiss = useCallback((id: number) => {
    setVisibleToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // --- Detect new notifications ---
  useEffect(() => {
    if (!data?.data || !user) return;

    const notifications: Notification[] = data.data;
    const currentIds = new Set(notifications.map((n) => n.id));

    // On first load just record IDs without firing alerts
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      seenIdsRef.current = currentIds;
      return;
    }

    // Check if on notifications screen
    const onNotifScreen = isOnNotificationsScreen();

    let hasJobAssignment = false;
    let hasOtherNew = false;
    const newToasts: Notification[] = [];

    for (const n of notifications) {
      if (!seenIdsRef.current.has(n.id)) {
        if (JOB_ASSIGNMENT_TYPES.has(n.type)) {
          hasJobAssignment = true;
        } else {
          hasOtherNew = true;
        }

        if (!onNotifScreen) {
          newToasts.push(n);
        }
      }
    }

    // Show toasts (max 3 visible at once)
    if (newToasts.length > 0) {
      setVisibleToasts((prev) => {
        const combined = [...newToasts, ...prev];
        return combined.slice(0, 3);
      });
    }

    // Vibrate
    if (hasJobAssignment) {
      playRingtone();
    } else if (hasOtherNew) {
      playChime();
    }

    seenIdsRef.current = currentIds;
  }, [data, user, isOnNotificationsScreen]);

  // --- Update badge count ---
  useEffect(() => {
    const total = (data as any)?.pagination?.total ?? 0;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [data]);

  // --- Reset when user logs out ---
  useEffect(() => {
    if (!isAuthenticated) {
      seenIdsRef.current = new Set();
      initialLoadRef.current = true;
      setVisibleToasts([]);
      Notifications.setBadgeCountAsync(0).catch(() => {});
    }
  }, [isAuthenticated]);

  const unreadCount = (data as any)?.pagination?.total ?? 0;

  const contextValue = useMemo<NotificationAlertContextValue>(
    () => ({ unreadCount }),
    [unreadCount],
  );

  return (
    <NotificationAlertContext.Provider value={contextValue}>
      {children}

      {/* Toast overlay — rendered above everything */}
      {visibleToasts.length > 0 && (
        <View style={styles.toastContainer} pointerEvents="box-none">
          {visibleToasts.map((notification, index) => (
            <View
              key={notification.id}
              style={{ marginTop: index * 90 }}
              pointerEvents="box-none"
            >
              <NotificationToast
                notification={notification}
                onDismiss={handleToastDismiss}
                onPress={handleToastPress}
              />
            </View>
          ))}
        </View>
      )}
    </NotificationAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
});
