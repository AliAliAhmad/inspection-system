import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  FinalAssessment,
  Verdict,
} from '../types';

export interface AssessmentListParams extends PaginationParams {
  status?: string;
  equipment_id?: number;
}

export interface VerdictPayload {
  verdict: Verdict;
  urgent_reason?: string;
}

export interface AdminResolvePayload {
  final_status: Verdict;
  admin_decision_notes?: string;
}

export const assessmentsApi = {
  list(params?: AssessmentListParams) {
    return getApiClient().get<PaginatedResponse<FinalAssessment>>('/api/assessments', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<FinalAssessment>>(`/api/assessments/${id}`);
  },

  create(assignmentId: number) {
    return getApiClient().post<ApiResponse<FinalAssessment>>(
      `/api/assessments/create/${assignmentId}`,
    );
  },

  submitVerdict(id: number, payload: VerdictPayload) {
    return getApiClient().post<ApiResponse<FinalAssessment>>(
      `/api/assessments/${id}/verdict`,
      payload,
    );
  },

  adminResolve(id: number, payload: AdminResolvePayload) {
    return getApiClient().post<ApiResponse<FinalAssessment>>(
      `/api/assessments/${id}/admin-resolve`,
      payload,
    );
  },

  getPending() {
    return getApiClient().get<ApiResponse<FinalAssessment[]>>('/api/assessments/pending');
  },
};
