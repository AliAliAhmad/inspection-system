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
  sla_overdue?: boolean;
}

export interface AssignSpecialistPayload {
  specialist_ids: number[];
  category?: 'major' | 'minor';
  major_reason?: string;
}

export const defectsApi = {
  list(params?: DefectListParams) {
    return getApiClient().get<PaginatedResponse<Defect>>('/api/defects', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Defect>>(`/api/defects/${id}`);
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

  escalate(id: number, payload: { reason: string }) {
    return getApiClient().post<ApiResponse<Defect>>(`/api/defects/${id}/escalate`, payload);
  },

  updateSLA(id: number, payload: { new_deadline: string; reason?: string }) {
    return getApiClient().put<ApiResponse<Defect>>(`/api/defects/${id}/sla`, payload);
  },
};
