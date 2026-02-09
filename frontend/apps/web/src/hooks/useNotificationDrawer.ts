import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  notificationsApi,
  Notification,
  NotificationGroup,
  NotificationFilter,
  NotificationListParams,
  getNotificationRoute,
} from '@inspection/shared';

export interface UseNotificationDrawerOptions {
  userRole?: string;
  pollInterval?: number;
  initialFilters?: NotificationFilter;
}

export interface UseNotificationDrawerReturn {
  // State
  isOpen: boolean;
  notifications: Notification[];
  groups: NotificationGroup[];
  unreadCount: number;
  priorityCounts: Record<string, number>;
  isLoading: boolean;
  filters: NotificationFilter;
  viewMode: 'list' | 'grouped';
  activeTab: 'all' | 'unread' | 'critical' | 'mentions';

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setFilters: (filters: NotificationFilter) => void;
  setViewMode: (mode: 'list' | 'grouped') => void;
  setActiveTab: (tab: 'all' | 'unread' | 'critical' | 'mentions') => void;
  refresh: () => void;

  // Notification actions
  markRead: (id: number) => void;
  markAllRead: () => void;
  acknowledge: (id: number) => void;
  snooze: (id: number, until: string) => void;
  cancelSnooze: (id: number) => void;
  viewNotification: (notification: Notification) => void;

  // Loading states
  isMarkingRead: boolean;
  isMarkingAllRead: boolean;
  isAcknowledging: boolean;
  isSnoozing: boolean;
}

export function useNotificationDrawer({
  userRole = 'user',
  pollInterval = 30000,
  initialFilters = {},
}: UseNotificationDrawerOptions = {}): UseNotificationDrawerReturn {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Local state
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<NotificationFilter>(initialFilters);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'critical' | 'mentions'>('all');

  // Build query params
  const getQueryParams = useCallback((): NotificationListParams => {
    const params: NotificationListParams = { per_page: 50 };

    switch (activeTab) {
      case 'unread':
        params.unread_only = true;
        break;
      case 'critical':
        params.priority = 'critical';
        break;
    }

    if (filters.search) params.search = filters.search;
    if (filters.types?.length) params.type = filters.types[0];
    if (filters.priorities?.length) params.priority = filters.priorities[0];
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;

    return params;
  }, [activeTab, filters]);

  // Fetch notifications
  const {
    data: notificationsData,
    isLoading: isLoadingNotifications,
    refetch: refetchNotifications,
  } = useQuery({
    queryKey: ['notifications', 'drawer', activeTab, filters],
    queryFn: () => notificationsApi.list(getQueryParams()).then((r) => r.data),
    enabled: isOpen,
    refetchInterval: isOpen ? pollInterval : false,
  });

  // Fetch groups (when in grouped mode)
  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['notifications', 'groups', filters],
    queryFn: () => notificationsApi.listGroups(getQueryParams()).then((r) => r.data),
    enabled: isOpen && viewMode === 'grouped',
  });

  // Fetch unread counts
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data),
    refetchInterval: pollInterval,
  });

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      message.success('All notifications marked as read');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, until }: { id: number; until: string }) =>
      notificationsApi.snooze(id, { snooze_until: until }),
    onSuccess: () => {
      message.success('Notification snoozed');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const cancelSnoozeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.cancelSnooze(id),
    onSuccess: () => {
      message.success('Snooze cancelled');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Derived data
  const notifications: Notification[] = notificationsData?.data || [];
  const groups: NotificationGroup[] = groupsData?.data || [];
  const unreadCount = unreadCountData?.data?.count || 0;
  const priorityCounts = unreadCountData?.data?.by_priority || {};

  // Actions
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const refresh = useCallback(() => {
    refetchNotifications();
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  }, [refetchNotifications, queryClient]);

  const viewNotification = useCallback(
    (notification: Notification) => {
      if (!notification.is_read) {
        markReadMutation.mutate(notification.id);
      }
      const route = getNotificationRoute(notification, userRole);
      if (route) {
        close();
        navigate(route);
      }
    },
    [userRole, markReadMutation, navigate, close]
  );

  // Keyboard shortcut to toggle drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + N to toggle notifications
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return {
    // State
    isOpen,
    notifications,
    groups,
    unreadCount,
    priorityCounts,
    isLoading: isLoadingNotifications || isLoadingGroups,
    filters,
    viewMode,
    activeTab,

    // Actions
    open,
    close,
    toggle,
    setFilters,
    setViewMode,
    setActiveTab,
    refresh,

    // Notification actions
    markRead: (id) => markReadMutation.mutate(id),
    markAllRead: () => markAllReadMutation.mutate(),
    acknowledge: (id) => acknowledgeMutation.mutate(id),
    snooze: (id, until) => snoozeMutation.mutate({ id, until }),
    cancelSnooze: (id) => cancelSnoozeMutation.mutate(id),
    viewNotification,

    // Loading states
    isMarkingRead: markReadMutation.isPending,
    isMarkingAllRead: markAllReadMutation.isPending,
    isAcknowledging: acknowledgeMutation.isPending,
    isSnoozing: snoozeMutation.isPending,
  };
}

export default useNotificationDrawer;
