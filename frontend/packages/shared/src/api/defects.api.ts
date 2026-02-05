import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Defect,
  DefectStatus,
  DefectSeverity,
} from '../types';

export interface DefectListParams extends PaginationParams {
  status?: DefectStatus;
  severity?: DefectSeverity;
  equipment_id?: number;
}

export interface AssignSpecialistPayload {
  specialist_id: number;
  category?: 'major' | 'minor';
  major_reason?: string;
}

export const defectsApi = {
  list(params?: DefectListParams) {
    return getApiClient().get<PaginatedResponse<Defect>>('/api/defects', { params });
  },

  resolve(id: number) {
    return getApiClient().post<ApiResponse<Defect>>(`/api/defects/${id}/resolve`);
  },

  close(id: number) {
    return getApiClient().post<ApiResponse<Defect>>(`/api/defects/${id}/close`);
  },

  assignSpecialist(id: number, payload: AssignSpecialistPayload) {
    return getApiClient().post<ApiResponse<any>>(`/api/defects/${id}/assign-specialist`, payload);
  },
};
