import { getApiClient } from './client';
import { ApiResponse, PaginatedResponse, PaginationParams, Notification } from '../types';

export interface NotificationListParams extends PaginationParams {
  unread_only?: boolean;
}

export const notificationsApi = {
  list(params?: NotificationListParams) {
    return getApiClient().get<PaginatedResponse<Notification>>('/api/notifications', { params });
  },

  markRead(id: number) {
    return getApiClient().post<ApiResponse>(`/api/notifications/${id}/read`);
  },

  markAllRead() {
    return getApiClient().post<ApiResponse>('/api/notifications/read-all');
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/notifications/${id}`);
  },
};
