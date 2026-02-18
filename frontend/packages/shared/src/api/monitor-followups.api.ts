import { getApiClient } from './client';
import { ApiResponse } from '../types/api-response.types';
import {
  MonitorFollowup,
  ScheduleFollowupPayload,
  AvailableInspectorsResponse,
  FollowupDashboardStats,
  FollowupListParams,
} from '../types/monitor-followup.types';

export const monitorFollowupsApi = {
  list(params?: FollowupListParams) {
    return getApiClient().get<ApiResponse<MonitorFollowup[]>>('/api/monitor-followups', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<MonitorFollowup>>(`/api/monitor-followups/${id}`);
  },

  getPending() {
    return getApiClient().get<ApiResponse<MonitorFollowup[]>>('/api/monitor-followups/pending');
  },

  schedule(id: number, payload: ScheduleFollowupPayload) {
    return getApiClient().post<ApiResponse<MonitorFollowup>>(
      `/api/monitor-followups/${id}/schedule`,
      payload,
    );
  },

  getAvailableInspectors(params: { date: string; shift?: string; location?: string }) {
    return getApiClient().get<ApiResponse<AvailableInspectorsResponse>>(
      '/api/monitor-followups/available-inspectors',
      { params },
    );
  },

  getEquipmentHistory(equipmentId: number) {
    return getApiClient().get<ApiResponse<MonitorFollowup[]>>(
      `/api/monitor-followups/equipment/${equipmentId}/history`,
    );
  },

  getOverdue() {
    return getApiClient().get<ApiResponse<MonitorFollowup[]>>('/api/monitor-followups/overdue');
  },

  getDashboard() {
    return getApiClient().get<ApiResponse<FollowupDashboardStats>>('/api/monitor-followups/dashboard');
  },

  cancel(id: number) {
    return getApiClient().delete<ApiResponse<null>>(`/api/monitor-followups/${id}`);
  },
};
