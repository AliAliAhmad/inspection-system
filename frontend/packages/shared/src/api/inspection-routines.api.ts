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

export interface UploadScheduleResult {
  created: number;
  equipment_processed: number;
  errors: string[];
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
  uploadSchedule(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ApiResponse<UploadScheduleResult>>(
      '/api/inspection-routines/upload-schedule',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
};
