import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Notification,
  NotificationPreference,
  NotificationGroup,
  NotificationRule,
  NotificationAnalytics,
  AISummary,
  NotificationSchedule,
  NotificationFilter,
  NotificationBulkAction,
  DoNotDisturbSchedule,
  NotificationTemplate,
  NotificationPriority,
} from '../types';

export interface NotificationListParams extends PaginationParams {
  unread_only?: boolean;
  priority?: NotificationPriority;
  type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  is_acknowledged?: boolean;
  group_key?: string;
}

export interface SnoozePayload {
  snooze_until: string;
}

export interface SchedulePayload {
  schedule_type: 'snooze' | 'reminder' | 'recurring';
  scheduled_for: string;
  repeat_pattern?: string;
}

export interface UpdatePreferencePayload {
  notification_type: string;
  channels?: {
    in_app?: boolean;
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
  is_enabled?: boolean;
  sound_type?: 'default' | 'chime' | 'urgent' | 'silent';
  digest_mode?: 'instant' | 'hourly' | 'daily' | 'weekly';
}

export interface CreateRulePayload {
  name: string;
  description?: string;
  trigger_type: 'threshold' | 'condition' | 'schedule';
  trigger_config: Record<string, unknown>;
  action_config: Record<string, unknown>;
  is_active?: boolean;
}

export interface UpdateRulePayload extends Partial<CreateRulePayload> {
  id: number;
}

export interface DoNotDisturbPayload {
  start_time: string;
  end_time: string;
  days_of_week: number[];
  allow_critical?: boolean;
}

export interface AnalyticsParams {
  date_from?: string;
  date_to?: string;
  group_by?: 'day' | 'week' | 'month';
}

export interface SearchParams {
  query: string;
  limit?: number;
}

export const notificationsApi = {
  // ============ Core Notifications ============
  list(params?: NotificationListParams) {
    return getApiClient().get<PaginatedResponse<Notification>>('/api/notifications', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Notification>>(`/api/notifications/${id}`);
  },

  markRead(id: number) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/read`);
  },

  markUnread(id: number) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/unread`);
  },

  markAllRead() {
    return getApiClient().post<ApiResponse>('/api/notifications/read-all');
  },

  acknowledge(id: number) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/acknowledge`);
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/notifications/${id}`);
  },

  // ============ Bulk Operations ============
  bulkAction(payload: NotificationBulkAction) {
    return getApiClient().post<ApiResponse>('/api/notifications/bulk', payload);
  },

  bulkMarkRead(ids: number[]) {
    return getApiClient().post<ApiResponse>('/api/notifications/bulk', {
      action: 'mark_read',
      notification_ids: ids,
    });
  },

  bulkDelete(ids: number[]) {
    return getApiClient().post<ApiResponse>('/api/notifications/bulk', {
      action: 'delete',
      notification_ids: ids,
    });
  },

  // ============ Snooze & Schedule ============
  snooze(id: number, payload: SnoozePayload) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/snooze`, payload);
  },

  cancelSnooze(id: number) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/cancel-snooze`);
  },

  schedule(id: number, payload: SchedulePayload) {
    return getApiClient().post<ApiResponse<NotificationSchedule>>(
      `/api/notifications/${id}/schedule`,
      payload
    );
  },

  listSchedules() {
    return getApiClient().get<ApiResponse<NotificationSchedule[]>>('/api/notifications/schedules');
  },

  cancelSchedule(scheduleId: number) {
    return getApiClient().delete<ApiResponse>(`/api/notifications/schedules/${scheduleId}`);
  },

  // ============ Groups ============
  listGroups(params?: NotificationListParams) {
    return getApiClient().get<PaginatedResponse<NotificationGroup>>('/api/notifications/groups', {
      params,
    });
  },

  getGroup(groupKey: string) {
    return getApiClient().get<ApiResponse<NotificationGroup>>(
      `/api/notifications/groups/${groupKey}`
    );
  },

  markGroupRead(groupKey: string) {
    return getApiClient().post<ApiResponse>(`/api/notifications/groups/${groupKey}/read`);
  },

  // ============ Preferences ============
  getPreferences() {
    return getApiClient().get<ApiResponse<NotificationPreference[]>>(
      '/api/notifications/preferences'
    );
  },

  updatePreference(payload: UpdatePreferencePayload) {
    return getApiClient().put<ApiResponse<NotificationPreference>>(
      '/api/notifications/preferences',
      payload
    );
  },

  resetPreferences() {
    return getApiClient().post<ApiResponse>('/api/notifications/preferences/reset');
  },

  // ============ Do Not Disturb ============
  getDndSchedule() {
    return getApiClient().get<ApiResponse<DoNotDisturbSchedule>>('/api/notifications/dnd');
  },

  setDndSchedule(payload: DoNotDisturbPayload) {
    return getApiClient().post<ApiResponse<DoNotDisturbSchedule>>(
      '/api/notifications/dnd',
      payload
    );
  },

  deleteDndSchedule() {
    return getApiClient().delete<ApiResponse>('/api/notifications/dnd');
  },

  // ============ AI Endpoints ============
  getAISummary() {
    return getApiClient().get<ApiResponse<AISummary>>('/api/notifications/ai/summary');
  },

  getAIPrioritized() {
    return getApiClient().get<ApiResponse<Notification[]>>('/api/notifications/ai/prioritize');
  },

  naturalLanguageSearch(params: SearchParams) {
    return getApiClient().get<ApiResponse<Notification[]>>('/api/notifications/ai/search', {
      params,
    });
  },

  getSuggestedActions(id: number) {
    return getApiClient().get<ApiResponse<{ actions: string[] }>>(
      `/api/notifications/${id}/ai/suggest-actions`
    );
  },

  // ============ Analytics ============
  getAnalytics(params?: AnalyticsParams) {
    return getApiClient().get<ApiResponse<NotificationAnalytics>>(
      '/api/notifications/analytics',
      { params }
    );
  },

  getResponseTimeStats(params?: AnalyticsParams) {
    return getApiClient().get<
      ApiResponse<{
        avg_response_time: number;
        median_response_time: number;
        by_priority: Record<string, number>;
      }>
    >('/api/notifications/analytics/response-time', { params });
  },

  // ============ Rules Management (Admin) ============
  listRules() {
    return getApiClient().get<ApiResponse<NotificationRule[]>>('/api/notifications/rules');
  },

  getRule(id: number) {
    return getApiClient().get<ApiResponse<NotificationRule>>(`/api/notifications/rules/${id}`);
  },

  createRule(payload: CreateRulePayload) {
    return getApiClient().post<ApiResponse<NotificationRule>>(
      '/api/notifications/rules',
      payload
    );
  },

  updateRule(id: number, payload: Partial<CreateRulePayload>) {
    return getApiClient().put<ApiResponse<NotificationRule>>(
      `/api/notifications/rules/${id}`,
      payload
    );
  },

  deleteRule(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/notifications/rules/${id}`);
  },

  toggleRule(id: number, is_active: boolean) {
    return getApiClient().patch<ApiResponse<NotificationRule>>(
      `/api/notifications/rules/${id}/toggle`,
      { is_active }
    );
  },

  // ============ Templates (Admin) ============
  listTemplates() {
    return getApiClient().get<ApiResponse<NotificationTemplate[]>>('/api/notifications/templates');
  },

  getTemplate(id: number) {
    return getApiClient().get<ApiResponse<NotificationTemplate>>(
      `/api/notifications/templates/${id}`
    );
  },

  // ============ Stats ============
  getUnreadCount() {
    return getApiClient().get<ApiResponse<{ count: number; by_priority: Record<string, number> }>>(
      '/api/notifications/unread-count'
    );
  },

  getCriticalCount() {
    return getApiClient().get<ApiResponse<{ count: number }>>('/api/notifications/critical-count');
  },

  getMentions() {
    return getApiClient().get<PaginatedResponse<Notification>>('/api/notifications/mentions');
  },
};
