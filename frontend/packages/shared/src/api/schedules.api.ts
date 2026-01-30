import { getApiClient } from './client';
import { ApiResponse, Schedule } from '../types';

export interface CreateSchedulePayload {
  equipment_id: number;
  day_of_week: number;
  frequency: string;
  is_active?: boolean;
}

export const schedulesApi = {
  getToday() {
    return getApiClient().get<ApiResponse<Schedule[]>>('/api/schedules/today');
  },

  getWeekly() {
    return getApiClient().get<ApiResponse<Schedule[]>>('/api/schedules/weekly');
  },

  create(payload: CreateSchedulePayload) {
    return getApiClient().post<ApiResponse<Schedule>>('/api/schedules', payload);
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/schedules/${id}`);
  },
};
