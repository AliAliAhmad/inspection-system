import { getApiClient } from './client';
import { ApiResponse } from '../types';
import { ShiftHandover, CreateHandoverPayload } from '../types/shift-handover.types';

export const shiftHandoverApi = {
  create(data: CreateHandoverPayload) {
    return getApiClient().post<ApiResponse<ShiftHandover>>('/api/shift-handover', data);
  },

  getLatest(shiftType?: string) {
    return getApiClient().get<ApiResponse<ShiftHandover | null>>('/api/shift-handover/latest', {
      params: shiftType ? { shift_type: shiftType } : undefined,
    });
  },

  getMyHandovers(page = 1, perPage = 10) {
    return getApiClient().get<ApiResponse<ShiftHandover[]>>('/api/shift-handover/my-handovers', {
      params: { page, per_page: perPage },
    });
  },

  getPending() {
    return getApiClient().get<ApiResponse<ShiftHandover[]>>('/api/shift-handover/pending');
  },

  getById(id: number) {
    return getApiClient().get<ApiResponse<ShiftHandover>>(`/api/shift-handover/${id}`);
  },

  acknowledge(id: number) {
    return getApiClient().post<ApiResponse<ShiftHandover>>(`/api/shift-handover/${id}/acknowledge`);
  },
};
