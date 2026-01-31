import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Inspection,
  AnswerPayload,
  InspectionProgress,
} from '../types';

export interface InspectionListParams extends PaginationParams {
  status?: string;
  technician_id?: number;
  equipment_id?: number;
}

export interface StartInspectionPayload {
  equipment_id: number;
  template_id: number;
}

export interface ReviewPayload {
  result: 'pass' | 'fail' | 'incomplete';
  notes?: string;
}

export const inspectionsApi = {
  list(params?: InspectionListParams) {
    return getApiClient().get<PaginatedResponse<Inspection>>('/api/inspections', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Inspection>>(`/api/inspections/${id}`);
  },

  getByAssignment(assignmentId: number) {
    return getApiClient().get<ApiResponse<Inspection>>(`/api/inspections/by-assignment/${assignmentId}`);
  },

  start(payload: StartInspectionPayload) {
    return getApiClient().post<ApiResponse<Inspection>>('/api/inspections/start', payload);
  },

  answerQuestion(id: number, payload: AnswerPayload) {
    return getApiClient().post<ApiResponse>(`/api/inspections/${id}/answer`, payload);
  },

  getProgress(id: number) {
    return getApiClient().get<ApiResponse<InspectionProgress>>(`/api/inspections/${id}/progress`);
  },

  submit(id: number) {
    return getApiClient().post<ApiResponse<Inspection>>(`/api/inspections/${id}/submit`);
  },

  review(id: number, payload: ReviewPayload) {
    return getApiClient().post<ApiResponse<Inspection>>(`/api/inspections/${id}/review`, payload);
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/inspections/${id}`);
  },
};
