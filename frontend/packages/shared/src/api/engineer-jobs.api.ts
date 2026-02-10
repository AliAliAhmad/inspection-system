import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  EngineerJob,
  PauseLog,
  CreateEngineerJobPayload,
  PauseCategory,
  EngineerJobStats,
  EngineerPerformance,
  EngineerAIInsight,
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

export interface EngineerPauseRequestPayload {
  reason_category: PauseCategory;
  reason_details?: string;
}

export interface EngineerStatsParams {
  engineer_id?: number;
  period?: string;
}

export interface VoiceNoteResponse {
  id: number;
  job_id: number;
  file_url: string;
  transcription?: string;
  created_at: string;
}

export interface LocationUpdateResponse {
  job_id: number;
  latitude: number;
  longitude: number;
  updated_at: string;
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

  requestPause(jobId: number, payload: EngineerPauseRequestPayload) {
    return getApiClient().post<ApiResponse<PauseLog>>(
      `/api/engineer-jobs/${jobId}/pause`,
      payload,
    );
  },

  getPauseHistory(jobId: number) {
    return getApiClient().get<ApiResponse<PauseLog[]>>(
      `/api/engineer-jobs/${jobId}/pause-history`,
    );
  },

  getStats(params?: EngineerStatsParams) {
    return getApiClient().get<ApiResponse<EngineerJobStats>>('/api/engineer-jobs/stats', {
      params,
    });
  },

  getPerformance(engineerId?: number) {
    return getApiClient().get<ApiResponse<EngineerPerformance>>('/api/engineer-jobs/performance', {
      params: engineerId ? { engineer_id: engineerId } : undefined,
    });
  },

  async addVoiceNote(jobId: number, audioFile: File) {
    const formData = new FormData();
    formData.append('audio', audioFile);
    return getApiClient().post<ApiResponse<VoiceNoteResponse>>(
      `/api/engineer-jobs/${jobId}/voice-note`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  updateLocation(jobId: number, latitude: number, longitude: number) {
    return getApiClient().post<ApiResponse<LocationUpdateResponse>>(
      `/api/engineer-jobs/${jobId}/location`,
      { latitude, longitude },
    );
  },

  getAIInsights() {
    return getApiClient().get<ApiResponse<EngineerAIInsight[]>>('/api/engineer-jobs/ai-insights');
  },
};
