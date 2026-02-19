/**
 * NotificationToast
 *
 * Floating toast banner that slides in from the top of the screen
 * when a new in-app notification arrives. Styled with a priority
 * colour bar on the left, title, message preview, relative time,
 * dismiss button, and a visual countdown bar.
 *
 * - Auto-dismisses after 6 seconds.
 * - Tapping the toast navigates to the relevant screen.
 * - The countdown bar shrinks to indicate remaining time.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Notification, NotificationPriority } from '@inspection/shared';
import { timeAgo } from '@inspection/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOAST_WIDTH = SCREEN_WIDTH - 24;
const AUTO_DISMISS_MS = 6000;

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  info: '#1677ff',
  warning: '#fa8c16',
  urgent: '#f5222d',
  critical: '#eb2f96',
};

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (id: number) => void;
  onPress: (notification: Notification) => void;
}

export default function NotificationToast({
  notification,
  onDismiss,
  onPress,
}: NotificationToastProps) {
  const insets = useSafeAreaInsets();

  // Slide-in animation
  const slideAnim = useRef(new Animated.Value(-200)).current;
  // Countdown bar width (1 -> 0)
  const countdownAnim = useRef(new Animated.Value(1)).current;
  // Timer ref for auto-dismiss
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onDismiss(notification.id);
    });
  }, [slideAnim, onDismiss, notification.id]);

  useEffect(() => {
    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();

    // Countdown bar animation
    Animated.timing(countdownAnim, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      useNativeDriver: false,
    }).start();

    // Auto dismiss
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slideAnim, countdownAnim, dismiss]);

  const handlePress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Slide out, then navigate
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onPress(notification);
    });
  }, [slideAnim, notification, onPress]);

  const handleDismissPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    dismiss();
  }, [dismiss]);

  const priorityColor = PRIORITY_COLORS[notification.priority] || PRIORITY_COLORS.info;
  const topOffset = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        style={styles.touchable}
      >
        {/* Priority colour bar */}
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

        <View style={styles.content}>
          {/* Header row: title + dismiss */}
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {notification.title}
            </Text>
            <TouchableOpacity
              onPress={handleDismissPress}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.dismissBtn}
            >
              <Text style={styles.dismissText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Message preview */}
          <Text style={styles.message} numberOfLines={1} ellipsizeMode="tail">
            {notification.message}
          </Text>

          {/* Time */}
          <Text style={styles.time}>{timeAgo(notification.created_at)}</Text>
        </View>
      </TouchableOpacity>

      {/* Countdown bar */}
      <Animated.View
        style={[
          styles.countdown,
          {
            backgroundColor: priorityColor,
            width: countdownAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    width: TOAST_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 9999,
    elevation: 12,
    ...Platform.select({
      ios: {
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  touchable: {
    flexDirection: 'row',
  },
  priorityBar: {
    width: 5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#999',
  },
  message: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  time: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  countdown: {
    height: 3,
  },
});
