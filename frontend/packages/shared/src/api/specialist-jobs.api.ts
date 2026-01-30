import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  SpecialistJob,
  PauseLog,
} from '../types';

export interface SpecialistJobListParams extends PaginationParams {
  status?: string;
  specialist_id?: number;
}

export interface CompleteJobPayload {
  work_notes?: string;
  completion_status?: 'pass' | 'incomplete';
}

export interface PauseRequestPayload {
  reason_category: 'parts' | 'duty_finish' | 'tools' | 'manpower' | 'oem' | 'other';
  reason_details?: string;
}

export const specialistJobsApi = {
  list(params?: SpecialistJobListParams) {
    return getApiClient().get<PaginatedResponse<SpecialistJob>>('/api/jobs', { params });
  },

  get(jobId: number) {
    return getApiClient().get<ApiResponse<SpecialistJob>>(`/api/jobs/${jobId}`);
  },

  enterPlannedTime(jobId: number, hours: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/planned-time`,
      { hours },
    );
  },

  start(jobId: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(`/api/jobs/${jobId}/start`);
  },

  complete(jobId: number, payload: CompleteJobPayload) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/complete`,
      payload,
    );
  },

  markIncomplete(jobId: number, reason: string) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/incomplete`,
      { reason },
    );
  },

  requestPause(jobId: number, payload: PauseRequestPayload) {
    return getApiClient().post<ApiResponse<PauseLog>>(
      `/api/jobs/${jobId}/pause`,
      payload,
    );
  },

  getPauseHistory(jobId: number) {
    return getApiClient().get<ApiResponse<PauseLog[]>>(`/api/jobs/${jobId}/pause-history`);
  },

  uploadCleaning(jobId: number) {
    return getApiClient().post<ApiResponse>(`/api/jobs/${jobId}/cleaning`);
  },

  adminForcePause(jobId: number, reason?: string) {
    return getApiClient().post<ApiResponse<PauseLog>>(
      `/api/jobs/${jobId}/admin/force-pause`,
      { reason },
    );
  },

  adminCleaningRating(jobId: number, rating: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/admin/cleaning-rating`,
      { rating },
    );
  },

  adminBonus(jobId: number, bonus: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/admin/bonus`,
      { bonus },
    );
  },

  getPendingPauses() {
    return getApiClient().get<ApiResponse<PauseLog[]>>('/api/jobs/pauses/pending');
  },

  approvePause(pauseId: number) {
    return getApiClient().post<ApiResponse<PauseLog>>(`/api/jobs/pauses/${pauseId}/approve`);
  },

  denyPause(pauseId: number) {
    return getApiClient().post<ApiResponse<PauseLog>>(`/api/jobs/pauses/${pauseId}/deny`);
  },

  resumeJob(pauseId: number) {
    return getApiClient().post<ApiResponse<PauseLog>>(`/api/jobs/pauses/${pauseId}/resume`);
  },

  getStalledJobs() {
    return getApiClient().get<ApiResponse<SpecialistJob[]>>('/api/jobs/stalled');
  },

  requestTakeover(jobId: number, reason?: string) {
    return getApiClient().post<ApiResponse>(
      `/api/jobs/${jobId}/takeover`,
      { reason },
    );
  },

  getPendingPlannedTime() {
    return getApiClient().get<ApiResponse<SpecialistJob[]>>('/api/jobs/pending-planned-time');
  },

  getActiveJobs() {
    return getApiClient().get<ApiResponse<SpecialistJob[]>>('/api/jobs/active');
  },
};
