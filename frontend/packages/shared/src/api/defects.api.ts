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

export interface QuickReportPayload {
  type: 'equipment' | 'safety';
  severity?: string;
  equipment_id?: number;
  description?: string;
  photo_url?: string;
  voice_note_url?: string;
  voice_transcription?: string;
  hazard_type?: string;
  location?: string;
  category?: string;
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

  createQuickReport(payload: QuickReportPayload) {
    return getApiClient().post<ApiResponse<Defect>>('/api/quick-reports', payload);
  },

  listQuickReports(params?: { type?: 'equipment' | 'safety' | 'all'; page?: number; per_page?: number }) {
    return getApiClient().get<PaginatedResponse<Defect>>('/api/quick-reports', { params });
  },
};
