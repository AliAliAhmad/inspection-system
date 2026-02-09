import { getApiClient } from './client';
import { ApiResponse } from '../types';
import {
  TrackingResponse,
  JobTrackingDetailResponse,
  DailyReviewResponse,
  PerformanceResponse,
  HeatMapResponse,
  ComparisonResponse,
  PauseJobPayload,
  CompleteTrackingJobPayload,
  IncompleteJobPayload,
  RateJobPayload,
  ConsumeaterialsPayload,
  CarryOverPayload,
  OverrideTimeRatingPayload,
  AdminBonusPayload,
  DisputePayload,
  WorkPlanJobRating,
  WorkPlanPauseRequest,
  WorkPlanDailyReview,
  WorkPlanCarryOver,
} from '../types/work-plan-tracking.types';

const BASE = '/api/work-plan-tracking';

export const workPlanTrackingApi = {
  // ─── Worker: Job Execution ──────────────────────────────────────

  startJob(jobId: number) {
    return getApiClient().post<TrackingResponse>(`${BASE}/jobs/${jobId}/start`);
  },

  pauseJob(jobId: number, payload: PauseJobPayload) {
    return getApiClient().post<TrackingResponse & { pause_request: WorkPlanPauseRequest }>(
      `${BASE}/jobs/${jobId}/pause`, payload
    );
  },

  resumeJob(jobId: number) {
    return getApiClient().post<TrackingResponse>(`${BASE}/jobs/${jobId}/resume`);
  },

  completeJob(jobId: number, payload: CompleteTrackingJobPayload) {
    return getApiClient().post<TrackingResponse>(`${BASE}/jobs/${jobId}/complete`, payload);
  },

  markIncomplete(jobId: number, payload: IncompleteJobPayload) {
    return getApiClient().post<TrackingResponse>(`${BASE}/jobs/${jobId}/incomplete`, payload);
  },

  getJobTracking(jobId: number) {
    return getApiClient().get<JobTrackingDetailResponse>(`${BASE}/jobs/${jobId}/tracking`);
  },

  // ─── Worker: My Jobs & Performance ──────────────────────────────

  getMyJobs(date?: string) {
    const params = date ? { date } : {};
    return getApiClient().get<ApiResponse & { jobs: any[]; count: number; date: string }>(
      `${BASE}/my-jobs`, { params }
    );
  },

  getMyPerformance(params?: { period?: string; start_date?: string; end_date?: string }) {
    return getApiClient().get<PerformanceResponse>(`${BASE}/my-performance`, { params });
  },

  // ─── Worker: Dispute ────────────────────────────────────────────

  disputeRating(ratingId: number, payload: DisputePayload) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/ratings/${ratingId}/dispute`, payload
    );
  },

  // ─── Engineer: Pause Management ─────────────────────────────────

  getPauseRequests(status?: string) {
    const params = status ? { status } : {};
    return getApiClient().get<ApiResponse & { pause_requests: WorkPlanPauseRequest[]; count: number }>(
      `${BASE}/pause-requests`, { params }
    );
  },

  approvePause(requestId: number, notes?: string) {
    return getApiClient().post<ApiResponse & { pause_request: WorkPlanPauseRequest }>(
      `${BASE}/pause-requests/${requestId}/approve`, { notes }
    );
  },

  rejectPause(requestId: number, notes?: string) {
    return getApiClient().post<ApiResponse & { pause_request: WorkPlanPauseRequest }>(
      `${BASE}/pause-requests/${requestId}/reject`, { notes }
    );
  },

  // ─── Engineer: Daily Review ─────────────────────────────────────

  getDailyReview(params?: { date?: string; shift?: string }) {
    return getApiClient().get<DailyReviewResponse>(`${BASE}/daily-review`, { params });
  },

  rateJob(reviewId: number, payload: RateJobPayload) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/daily-review/${reviewId}/rate-job`, payload
    );
  },

  consumeMaterials(reviewId: number, payload: ConsumeaterialsPayload) {
    return getApiClient().post<ApiResponse>(
      `${BASE}/daily-review/${reviewId}/consume-materials`, payload
    );
  },

  createCarryOver(reviewId: number, payload: CarryOverPayload) {
    return getApiClient().post<ApiResponse & { carry_over: WorkPlanCarryOver; new_job: any }>(
      `${BASE}/daily-review/${reviewId}/carry-over`, payload
    );
  },

  submitReview(reviewId: number) {
    return getApiClient().post<ApiResponse & { review: WorkPlanDailyReview }>(
      `${BASE}/daily-review/${reviewId}/submit`
    );
  },

  // ─── Engineer: Rating Override ──────────────────────────────────

  overrideTimeRating(ratingId: number, payload: OverrideTimeRatingPayload) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/ratings/${ratingId}/override-time`, payload
    );
  },

  // ─── Admin: Override Approval & Bonus ───────────────────────────

  approveOverride(ratingId: number, approved: boolean) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/ratings/${ratingId}/approve-override`, { approved }
    );
  },

  giveAdminBonus(ratingId: number, payload: AdminBonusPayload) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/ratings/${ratingId}/admin-bonus`, payload
    );
  },

  resolveDispute(ratingId: number, payload: { resolution: string; time_rating?: number; qc_rating?: number; cleaning_rating?: number }) {
    return getApiClient().post<ApiResponse & { rating: WorkPlanJobRating }>(
      `${BASE}/ratings/${ratingId}/resolve-dispute`, payload
    );
  },

  // ─── Performance & Reports ──────────────────────────────────────

  getPerformanceReport(params?: { period?: string; start_date?: string; end_date?: string; worker_id?: number }) {
    return getApiClient().get<PerformanceResponse>(`${BASE}/performance`, { params });
  },

  computePerformance(date?: string, period?: string) {
    return getApiClient().post<ApiResponse & { records_computed: number }>(
      `${BASE}/performance/compute`, { date, period }
    );
  },

  getPerformanceComparison(params: { period?: string; start_date: string; end_date: string }) {
    return getApiClient().get<ComparisonResponse>(`${BASE}/performance/comparison`, { params });
  },

  getHeatMap(weekStart?: string) {
    const params = weekStart ? { week_start: weekStart } : {};
    return getApiClient().get<HeatMapResponse>(`${BASE}/performance/heat-map`, { params });
  },

  getStreaks(workerId?: number) {
    const params = workerId ? { worker_id: workerId } : {};
    return getApiClient().get<ApiResponse & { user_id: number; current_streak: number; max_streak: number }>(
      `${BASE}/streaks`, { params }
    );
  },

  // ─── Admin: Auto-flag ───────────────────────────────────────────

  triggerAutoFlag(date?: string, shift?: string) {
    return getApiClient().post<ApiResponse & { flagged_count: number }>(
      `${BASE}/auto-flag`, { date, shift }
    );
  },
};
