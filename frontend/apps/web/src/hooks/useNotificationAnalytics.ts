import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { notificationsApi, NotificationAnalytics, NotificationPriority } from '@inspection/shared';

export interface DateRange {
  start: Dayjs;
  end: Dayjs;
}

export interface UseNotificationAnalyticsOptions {
  defaultDateRange?: DateRange;
  defaultGroupBy?: 'day' | 'week' | 'month';
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseNotificationAnalyticsReturn {
  // Data
  analytics: NotificationAnalytics | null;
  isLoading: boolean;
  error: Error | null;

  // Filters
  dateRange: DateRange;
  groupBy: 'day' | 'week' | 'month';

  // Actions
  setDateRange: (range: DateRange) => void;
  setGroupBy: (groupBy: 'day' | 'week' | 'month') => void;
  refresh: () => void;

  // Preset date ranges
  setToday: () => void;
  setThisWeek: () => void;
  setThisMonth: () => void;
  setLast7Days: () => void;
  setLast30Days: () => void;
  setLast90Days: () => void;

  // Computed data
  readRate: number;
  avgResponseTimeMinutes: number;
  totalNotifications: number;
  criticalCount: number;
  urgentCount: number;
  topType: string | null;
  peakHour: number | null;

  // Chart data helpers
  priorityChartData: Array<{ name: string; value: number; color: string }>;
  typeChartData: Array<{ name: string; value: number }>;
  hourlyChartData: Array<{ hour: string; count: number }>;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

export function useNotificationAnalytics({
  defaultDateRange,
  defaultGroupBy = 'day',
  autoRefresh = false,
  refreshInterval = 60000,
}: UseNotificationAnalyticsOptions = {}): UseNotificationAnalyticsReturn {
  // State
  const [dateRange, setDateRange] = useState<DateRange>(
    defaultDateRange || {
      start: dayjs().subtract(30, 'day'),
      end: dayjs(),
    }
  );
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>(defaultGroupBy);

  // Fetch analytics
  const {
    data: analyticsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'notifications',
      'analytics',
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
      groupBy,
    ],
    queryFn: () =>
      notificationsApi
        .getAnalytics({
          date_from: dateRange.start.toISOString(),
          date_to: dateRange.end.toISOString(),
          group_by: groupBy,
        })
        .then((r) => r.data),
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  const analytics: NotificationAnalytics | null = analyticsData?.data || null;

  // Preset date range setters
  const setToday = useCallback(() => {
    setDateRange({
      start: dayjs().startOf('day'),
      end: dayjs().endOf('day'),
    });
  }, []);

  const setThisWeek = useCallback(() => {
    setDateRange({
      start: dayjs().startOf('week'),
      end: dayjs().endOf('week'),
    });
  }, []);

  const setThisMonth = useCallback(() => {
    setDateRange({
      start: dayjs().startOf('month'),
      end: dayjs().endOf('month'),
    });
  }, []);

  const setLast7Days = useCallback(() => {
    setDateRange({
      start: dayjs().subtract(7, 'day'),
      end: dayjs(),
    });
  }, []);

  const setLast30Days = useCallback(() => {
    setDateRange({
      start: dayjs().subtract(30, 'day'),
      end: dayjs(),
    });
  }, []);

  const setLast90Days = useCallback(() => {
    setDateRange({
      start: dayjs().subtract(90, 'day'),
      end: dayjs(),
    });
  }, []);

  // Computed values
  const readRate = analytics?.read_rate || 0;
  const avgResponseTimeMinutes = analytics?.avg_response_time || 0;
  const totalNotifications = analytics?.total_sent || 0;
  const criticalCount = analytics?.by_priority?.critical || 0;
  const urgentCount = analytics?.by_priority?.urgent || 0;

  const topType = useMemo(() => {
    if (!analytics?.by_type) return null;
    const entries = Object.entries(analytics.by_type);
    if (entries.length === 0) return null;
    return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  }, [analytics]);

  const peakHour = useMemo(() => {
    if (!analytics?.hourly_distribution || analytics.hourly_distribution.length === 0) {
      return null;
    }
    return analytics.hourly_distribution.reduce((a, b) => (b.count > a.count ? b : a)).hour;
  }, [analytics]);

  // Chart data
  const priorityChartData = useMemo(() => {
    if (!analytics?.by_priority) return [];
    return Object.entries(analytics.by_priority).map(([priority, count]) => ({
      name: priority.charAt(0).toUpperCase() + priority.slice(1),
      value: count,
      color: PRIORITY_COLORS[priority as NotificationPriority] || '#8c8c8c',
    }));
  }, [analytics]);

  const typeChartData = useMemo(() => {
    if (!analytics?.by_type) return [];
    return Object.entries(analytics.by_type)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, value]) => ({
        name: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value,
      }));
  }, [analytics]);

  const hourlyChartData = useMemo(() => {
    if (!analytics?.hourly_distribution) return [];
    return analytics.hourly_distribution.map((item) => ({
      hour: `${item.hour.toString().padStart(2, '0')}:00`,
      count: item.count,
    }));
  }, [analytics]);

  return {
    // Data
    analytics,
    isLoading,
    error: error as Error | null,

    // Filters
    dateRange,
    groupBy,

    // Actions
    setDateRange,
    setGroupBy,
    refresh: refetch,

    // Preset date ranges
    setToday,
    setThisWeek,
    setThisMonth,
    setLast7Days,
    setLast30Days,
    setLast90Days,

    // Computed data
    readRate,
    avgResponseTimeMinutes,
    totalNotifications,
    criticalCount,
    urgentCount,
    topType,
    peakHour,

    // Chart data helpers
    priorityChartData,
    typeChartData,
    hourlyChartData,
  };
}

export default useNotificationAnalytics;
