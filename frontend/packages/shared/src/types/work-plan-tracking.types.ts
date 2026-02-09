/**
 * Work Plan Tracking & Performance Types
 * Covers job execution, daily reviews, ratings, carry-overs, and performance.
 */

// ─── Status Types ───────────────────────────────────────────────────

export type TrackingStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'incomplete' | 'not_started';
export type ShiftType = 'day' | 'night';
export type PauseReasonCategory = 'break' | 'waiting_for_materials' | 'urgent_task' | 'waiting_for_access' | 'other';
export type IncompleteReasonCategory = 'missing_parts' | 'equipment_not_accessible' | 'time_ran_out' | 'safety_concern' | 'other';
export type CarryOverReasonCategory = IncompleteReasonCategory | 'day_ended';
export type PauseRequestStatus = 'pending' | 'approved' | 'rejected';
export type TrackingReviewStatus = 'open' | 'partial' | 'submitted';
export type PerformancePeriod = 'daily' | 'weekly' | 'monthly';
export type HeatMapColor = 'green' | 'yellow' | 'red';

// ─── User Summary ───────────────────────────────────────────────────

export interface UserSummary {
  id: number;
  full_name: string;
  role?: string;
}

// ─── Job Tracking ───────────────────────────────────────────────────

export interface WorkPlanJobTracking {
  id: number;
  work_plan_job_id: number;
  status: TrackingStatus;
  shift_type: ShiftType;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  total_paused_minutes: number;
  actual_hours: number | null;
  is_carry_over: boolean;
  original_job_id: number | null;
  carry_over_count: number;
  completion_photo_id: number | null;
  completion_photo_url: string | null;
  work_notes: string | null;
  handover_voice_file_id: number | null;
  handover_voice_url: string | null;
  handover_transcription: string | null;
  engineer_handover_voice_file_id: number | null;
  engineer_handover_voice_url: string | null;
  engineer_handover_transcription: string | null;
  incomplete_reason_category: IncompleteReasonCategory | null;
  incomplete_reason_details: string | null;
  auto_flagged: boolean;
  auto_flagged_at: string | null;
  auto_flag_type: string | null;
  is_running: boolean;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Job Log ────────────────────────────────────────────────────────

export type LogEventType =
  | 'started' | 'paused' | 'resumed' | 'completed' | 'marked_incomplete'
  | 'carry_over_created' | 'auto_flagged' | 'rating_given' | 'rating_disputed'
  | 'rating_override' | 'pause_approved' | 'pause_rejected' | 'material_consumed'
  | 'engineer_override';

export interface WorkPlanJobLog {
  id: number;
  work_plan_job_id: number;
  user_id: number;
  user: UserSummary | null;
  event_type: LogEventType;
  event_data: Record<string, any> | null;
  notes: string | null;
  created_at: string;
}

// ─── Pause Request ──────────────────────────────────────────────────

export interface WorkPlanPauseRequest {
  id: number;
  work_plan_job_id: number;
  requested_by_id: number;
  requester: UserSummary | null;
  requested_at: string;
  reason_category: PauseReasonCategory;
  reason_details: string | null;
  status: PauseRequestStatus;
  reviewed_by_id: number | null;
  reviewer: UserSummary | null;
  reviewed_at: string | null;
  review_notes: string | null;
  resumed_at: string | null;
  duration_minutes: number | null;
  created_at: string;
}

// ─── Job Rating ─────────────────────────────────────────────────────

export interface WorkPlanJobRating {
  id: number;
  work_plan_job_id: number;
  user_id: number;
  user: UserSummary | null;
  is_lead: boolean;
  time_rating: number | null;
  effective_time_rating: number | null;
  time_rating_override: number | null;
  time_rating_override_reason: string | null;
  time_rating_override_approved: boolean | null;
  qc_rating: number | null;
  qc_reason: string | null;
  qc_voice_file_id: number | null;
  qc_voice_url: string | null;
  cleaning_rating: number | null;
  admin_bonus: number;
  admin_bonus_notes: string | null;
  points_earned: number;
  is_disputed: boolean;
  dispute_reason: string | null;
  dispute_resolved: boolean | null;
  dispute_resolution: string | null;
  rated_by_id: number | null;
  rated_at: string | null;
  created_at: string;
}

// ─── Daily Review ───────────────────────────────────────────────────

export interface WorkPlanDailyReview {
  id: number;
  engineer_id: number;
  engineer: UserSummary | null;
  date: string;
  shift_type: ShiftType;
  status: TrackingReviewStatus;
  opened_at: string | null;
  submitted_at: string | null;
  last_saved_at: string | null;
  total_jobs: number;
  approved_jobs: number;
  incomplete_jobs: number;
  not_started_jobs: number;
  carry_over_jobs: number;
  total_pause_requests: number;
  resolved_pause_requests: number;
  has_unresolved_pauses: boolean;
  can_submit: boolean;
  materials_reviewed: boolean;
  completion_rate: number;
  notes: string | null;
  reminders_sent: number;
  created_at: string;
}

// ─── Carry Over ─────────────────────────────────────────────────────

export interface WorkPlanCarryOver {
  id: number;
  original_job_id: number;
  new_job_id: number;
  reason_category: CarryOverReasonCategory;
  reason_details: string | null;
  worker_voice_file_id: number | null;
  worker_voice_url: string | null;
  worker_transcription: string | null;
  engineer_voice_file_id: number | null;
  engineer_voice_url: string | null;
  engineer_transcription: string | null;
  hours_spent_original: number | null;
  carried_over_by_id: number;
  carrier: UserSummary | null;
  carried_over_at: string;
  daily_review_id: number | null;
  created_at: string;
}

// ─── Performance ────────────────────────────────────────────────────

export interface WorkPlanPerformance {
  id: number;
  user_id: number;
  user: UserSummary | null;
  period_type: PerformancePeriod;
  period_start: string;
  period_end: string;
  total_jobs_assigned: number;
  total_jobs_completed: number;
  total_jobs_incomplete: number;
  total_jobs_not_started: number;
  total_jobs_carried_over: number;
  total_estimated_hours: number;
  total_actual_hours: number;
  avg_time_rating: number | null;
  avg_qc_rating: number | null;
  avg_cleaning_rating: number | null;
  completion_rate: number;
  time_efficiency: number | null;
  total_points_earned: number;
  current_streak_days: number;
  max_streak_days: number;
  total_pauses: number;
  total_pause_minutes: number;
  late_starts: number;
  materials_planned: number;
  materials_consumed: number;
  created_at: string;
}

// ─── API Payloads ───────────────────────────────────────────────────

export interface PauseJobPayload {
  reason_category: PauseReasonCategory;
  reason_details?: string;
}

export interface CompleteTrackingJobPayload {
  work_notes?: string;
  completion_photo_id?: number;
}

export interface IncompleteJobPayload {
  reason_category: IncompleteReasonCategory;
  reason_details?: string;
  handover_voice_file_id?: number;
  handover_transcription?: string;
}

export interface RateJobPayload {
  job_id: number;
  user_id: number;
  qc_rating?: number;
  qc_reason?: string;
  qc_voice_file_id?: number;
  cleaning_rating?: number;
}

export interface ConsumeaterialsPayload {
  materials: Array<{
    material_id: number;
    job_id: number;
    consumed: boolean;
  }>;
}

export interface CarryOverPayload {
  original_job_id: number;
  reason_category?: CarryOverReasonCategory;
  reason_details?: string;
  engineer_voice_file_id?: number;
  engineer_transcription?: string;
  reassign_to_ids?: number[];
}

export interface OverrideTimeRatingPayload {
  time_rating: number;
  reason: string;
}

export interface AdminBonusPayload {
  bonus: number;
  notes?: string;
}

export interface DisputePayload {
  reason: string;
}

// ─── API Response Types ─────────────────────────────────────────────

export interface TrackingResponse {
  status: string;
  tracking: WorkPlanJobTracking;
}

export interface JobTrackingDetailResponse {
  status: string;
  tracking: WorkPlanJobTracking | null;
  logs: WorkPlanJobLog[];
  pause_requests: WorkPlanPauseRequest[];
  ratings: WorkPlanJobRating[];
  carry_over_from: WorkPlanCarryOver | null;
  carry_over_to: WorkPlanCarryOver | null;
}

export interface DailyReviewResponse {
  status: string;
  review: WorkPlanDailyReview;
  jobs: Array<any & {
    tracking: WorkPlanJobTracking | null;
    ratings: WorkPlanJobRating[];
    pause_requests: WorkPlanPauseRequest[];
  }>;
}

export interface PerformanceResponse {
  status: string;
  performances: WorkPlanPerformance[];
  current_streak?: number;
  max_streak?: number;
}

export interface HeatMapDay {
  completion_rate: number;
  color: HeatMapColor;
  jobs_completed: number;
  jobs_assigned: number;
  avg_rating: number | null;
}

export interface HeatMapEntry {
  user: UserSummary;
  days: Record<string, HeatMapDay>;
}

export interface HeatMapResponse {
  status: string;
  heat_map: HeatMapEntry[];
  week_start: string;
  week_end: string;
}

export interface ComparisonEntry {
  user: UserSummary;
  periods: WorkPlanPerformance[];
  totals: {
    jobs_assigned: number;
    jobs_completed: number;
    estimated_hours: number;
    actual_hours: number;
    points: number;
    avg_time_rating: number | null;
    completion_rate: number;
  };
}

export interface ComparisonResponse {
  status: string;
  comparison: ComparisonEntry[];
  period: { start: string; end: string; type: PerformancePeriod };
}

// ─── Pause Reason Labels ────────────────────────────────────────────

export const PAUSE_REASON_LABELS: Record<PauseReasonCategory, string> = {
  break: 'Break',
  waiting_for_materials: 'Waiting for Materials',
  urgent_task: 'Called to Urgent Task',
  waiting_for_access: 'Waiting for Access',
  other: 'Other',
};

export const INCOMPLETE_REASON_LABELS: Record<IncompleteReasonCategory, string> = {
  missing_parts: 'Missing Parts',
  equipment_not_accessible: 'Equipment Not Accessible',
  time_ran_out: 'Time Ran Out',
  safety_concern: 'Safety Concern',
  other: 'Other',
};
