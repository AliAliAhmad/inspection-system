import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  EngineerJob,
  CreateEngineerJobPayload,
} from '../types';

export interface EngineerJobListParams extends PaginationParams {
  status?: string;
  engineer_id?: number;
}

export interface EngineerPlannedTimePayload {
  planned_time_days?: number;
  planned_time_hours?: number;
}

export interface EngineerCompletePayload {
  work_notes?: string;
  completion_status?: string;
}

export const engineerJobsApi = {
  list(params?: EngineerJobListParams) {
    return getApiClient().get<PaginatedResponse<EngineerJob>>('/api/engineer-jobs', { params });
  },

  get(jobId: number) {
    return getApiClient().get<ApiResponse<EngineerJob>>(`/api/engineer-jobs/${jobId}`);
  },

  create(payload: CreateEngineerJobPayload) {
    return getApiClient().post<ApiResponse<EngineerJob>>('/api/engineer-jobs', payload);
  },

  enterPlannedTime(jobId: number, payload: EngineerPlannedTimePayload) {
    return getApiClient().post<ApiResponse<EngineerJob>>(
      `/api/engineer-jobs/${jobId}/planned-time`,
      payload,
    );
  },

  start(jobId: number) {
    return getApiClient().post<ApiResponse<EngineerJob>>(`/api/engineer-jobs/${jobId}/start`);
  },

  complete(jobId: number, payload: EngineerCompletePayload) {
    return getApiClient().post<ApiResponse<EngineerJob>>(
      `/api/engineer-jobs/${jobId}/complete`,
      payload,
    );
  },
};
