import { getApiClient } from './client';
import { ApiResponse } from '../types';

export interface InspectionRoutine {
  id: number;
  name: string;
  name_ar: string | null;
  asset_types: string[];
  template_id: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateRoutinePayload {
  name: string;
  name_ar?: string;
  asset_types: string[];
  template_id: number;
}

export const inspectionRoutinesApi = {
  list() {
    return getApiClient().get<ApiResponse<InspectionRoutine[]>>('/api/inspection-routines');
  },
  create(payload: CreateRoutinePayload) {
    return getApiClient().post<ApiResponse<InspectionRoutine>>('/api/inspection-routines', payload);
  },
  update(id: number, payload: Partial<CreateRoutinePayload & { is_active: boolean }>) {
    return getApiClient().put<ApiResponse<InspectionRoutine>>(`/api/inspection-routines/${id}`, payload);
  },
  delete(id: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/inspection-routines/${id}`);
  },
};
