import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  FinalAssessment,
  Verdict,
} from '../types';
import { ScheduleFollowupPayload } from '../types/monitor-followup.types';

export interface AssessmentListParams extends PaginationParams {
  status?: string;
  equipment_id?: number;
}

export interface VerdictPayload {
  verdict: Verdict;
  monitor_reason?: string;
  stop_reason?: string;
  urgent_reason?: string; // Legacy
}

export interface EngineerVerdictPayload {
  verdict: Verdict;
  notes?: string;
  followup?: ScheduleFollowupPayload;
}

export interface AdminResolvePayload {
  decision: Verdict;
  notes?: string;
  followup?: ScheduleFollowupPayload;
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

  submitEngineerVerdict(id: number, payload: EngineerVerdictPayload) {
    return getApiClient().post<ApiResponse<FinalAssessment>>(
      `/api/assessments/${id}/engineer-verdict`,
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

  getEngineerPending() {
    return getApiClient().get<ApiResponse<FinalAssessment[]>>('/api/assessments/engineer-pending');
  },

  getAdminPending() {
    return getApiClient().get<ApiResponse<FinalAssessment[]>>('/api/assessments/admin-pending');
  },

  getSharedAnswers(assessmentId: number) {
    return getApiClient().get<ApiResponse<any[]>>(`/api/assessments/${assessmentId}/shared-answers`);
  },
};
