import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  SpecialistJob,
  PauseLog,
  IncompleteReason,
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
  reason_category: 'parts' | 'duty_finish' | 'tools' | 'manpower' | 'oem' | 'error_record' | 'other';
  reason_details?: string;
}

export interface IncompletePayload {
  reason: IncompleteReason;
  notes?: string;
}

export interface SpecialistJobStats {
  by_status: Record<string, number>;
  today: {
    assigned: number;
    completed: number;
    in_progress: number;
  };
  active: {
    total: number;
    assigned: number;
    in_progress: number;
    paused: number;
  };
  incomplete: {
    total: number;
    unacknowledged: number;
  };
  week: {
    completed: number;
    total: number;
  };
  month: {
    completed: number;
  };
  averages: {
    completion_time_hours: number;
    time_rating: number;
    qc_rating: number;
    cleaning_rating: number;
  };
  pending_qc: number;
  overdue_count: number;
  by_category: Record<string, number>;
  top_performers: Array<{
    id: number;
    name: string;
    completed: number;
    avg_rating: number;
  }>;
  specialist_workload: Array<{
    id: number;
    name: string;
    active_jobs: number;
  }>;
  daily_trend: Array<{
    date: string;
    day_name: string;
    created: number;
    completed: number;
  }>;
}

export interface MySpecialistStats {
  today: {
    pending_time: number;
    assigned: number;
    in_progress: number;
    completed: number;
    paused: number;
  };
  week: {
    completed: number;
    total: number;
  };
  month: {
    completed: number;
    total: number;
  };
  averages: {
    completion_time_hours: number;
    time_rating: number;
    qc_rating: number;
    cleaning_rating: number;
  };
  total_points: number;
  incomplete_count: number;
  daily_trend: Array<{
    date: string;
    day_name: string;
    completed: number;
  }>;
}

export interface AITimeEstimate {
  estimated_hours: number;
  confidence: 'low' | 'medium' | 'high';
  range: {
    min: number;
    max: number;
  };
  based_on: {
    sample_size: number;
    category: string | null;
    equipment_type: string | null;
  };
  suggestions: Array<{
    hours: number;
    label: string;
  }>;
}

export interface PartsPrediction {
  part_name: string;
  frequency_percent: number;
  confidence: 'low' | 'medium' | 'high';
  used_in_jobs: number;
}

export interface AIPartsPredictionResponse {
  predictions: PartsPrediction[];
  based_on: {
    sample_size: number;
    category: string | null;
    equipment_type: string | null;
  };
  note: string;
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
      { planned_time_hours: hours },
    );
  },

  start(jobId: number, plannedTimeHours?: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/start`,
      plannedTimeHours ? { planned_time_hours: plannedTimeHours } : {},
    );
  },

  wrongFinding(jobId: number, reason: string, photoPath: string) {
    return getApiClient().post<ApiResponse<{ job: SpecialistJob; defect: unknown }>>(
      `/api/jobs/${jobId}/wrong-finding`,
      { reason, photo_path: photoPath },
    );
  },

  complete(jobId: number, payload: CompleteJobPayload) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/complete`,
      payload,
    );
  },

  markIncomplete(jobId: number, payload: IncompletePayload) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/incomplete`,
      payload,
    );
  },

  getIncompleteJobs(acknowledged?: boolean) {
    const params = acknowledged !== undefined ? { acknowledged: String(acknowledged) } : {};
    return getApiClient().get<ApiResponse<SpecialistJob[]>>('/api/jobs/incomplete', { params });
  },

  acknowledgeIncomplete(jobId: number) {
    return getApiClient().post<ApiResponse<SpecialistJob>>(
      `/api/jobs/${jobId}/admin/acknowledge-incomplete`,
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

  // Stats endpoint for admin dashboard
  getStats() {
    return getApiClient().get<ApiResponse<SpecialistJobStats>>('/api/jobs/stats');
  },

  // Personal stats for specialist
  getMyStats() {
    return getApiClient().get<ApiResponse<MySpecialistStats>>('/api/jobs/my-stats');
  },

  // AI-powered time estimation
  getAITimeEstimate(jobId?: number, defectId?: number) {
    return getApiClient().post<ApiResponse<AITimeEstimate>>('/api/jobs/ai-estimate-time', {
      job_id: jobId,
      defect_id: defectId,
    });
  },

  // AI-powered parts prediction
  getAIPredictParts(jobId?: number, defectId?: number) {
    return getApiClient().post<ApiResponse<AIPartsPredictionResponse>>('/api/jobs/ai-predict-parts', {
      job_id: jobId,
      defect_id: defectId,
    });
  },
};
