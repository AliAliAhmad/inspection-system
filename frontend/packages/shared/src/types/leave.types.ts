import { User } from './user.types';

// Legacy leave type for backward compatibility
export type LegacyLeaveType = 'sick' | 'annual' | 'emergency' | 'training' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

// Leave Type (Configurable)
export interface LeaveType {
  id: number;
  code: string;
  name: string;
  name_ar?: string;
  description?: string;
  color: string;
  icon?: string;
  requires_certificate: boolean;
  certificate_after_days: number;
  max_consecutive_days?: number;
  max_per_year?: number;
  advance_notice_days: number;
  is_paid: boolean;
  is_active: boolean;
  is_system: boolean;
}

// Leave Policy
export interface LeavePolicy {
  id: number;
  name: string;
  role?: string;
  min_tenure_months: number;
  annual_allowance: number;
  sick_allowance: number;
  emergency_allowance: number;
  carry_over_enabled: boolean;
  carry_over_max_days: number;
  carry_over_expiry_months: number;
  probation_months: number;
  probation_allowance: number;
  accrual_type: 'yearly' | 'monthly' | 'quarterly';
  accrual_rate?: number;
  negative_balance_allowed: boolean;
  negative_balance_max: number;
  is_active: boolean;
}

// Balance History
export interface LeaveBalanceHistory {
  id: number;
  user_id: number;
  leave_type_id?: number;
  leave_type?: LeaveType;
  change_type: 'accrual' | 'used' | 'adjustment' | 'carry_over' | 'expired' | 'encashment';
  amount: number;
  balance_before?: number;
  balance_after?: number;
  leave_id?: number;
  reason?: string;
  adjusted_by_id?: number;
  adjusted_by?: { id: number; full_name: string };
  created_at: string;
}

// Blackout Period
export interface LeaveBlackout {
  id: number;
  name: string;
  name_ar?: string;
  date_from: string;
  date_to: string;
  reason?: string;
  applies_to_roles?: string[];
  exception_user_ids?: number[];
  is_active: boolean;
  created_by_id?: number;
  created_at: string;
}

// Holiday Calendar
export interface LeaveCalendarDay {
  id: number;
  date: string;
  name: string;
  name_ar?: string;
  holiday_type: 'public' | 'religious' | 'company';
  is_working_day: boolean;
  year: number;
}

// Approval Level
export interface LeaveApprovalLevel {
  id: number;
  leave_id: number;
  level: number;
  approver_role?: string;
  approver_id?: number;
  approver?: { id: number; full_name: string };
  status: 'pending' | 'approved' | 'rejected';
  decision_at?: string;
  notes?: string;
}

// Compensatory Leave
export interface CompensatoryLeave {
  id: number;
  user_id: number;
  user?: { id: number; full_name: string };
  work_date: string;
  hours_worked: number;
  comp_days_earned: number;
  reason?: string;
  status: 'pending' | 'approved' | 'used' | 'expired';
  approved_by_id?: number;
  approved_at?: string;
  used_in_leave_id?: number;
  expires_at?: string;
  created_at: string;
}

// Leave Encashment
export interface LeaveEncashment {
  id: number;
  user_id: number;
  user?: { id: number; full_name: string };
  leave_type_id?: number;
  leave_type?: LeaveType;
  days_encashed: number;
  amount_per_day?: number;
  total_amount?: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  requested_at: string;
  approved_by_id?: number;
  approved_at?: string;
  paid_at?: string;
  notes?: string;
}

// Extended Leave
export interface Leave {
  id: number;
  user_id: number;
  user: User | null;
  leave_type: LegacyLeaveType;
  leave_type_id?: number;
  leave_type_obj?: LeaveType;
  other_reason: string | null;
  date_from: string;
  date_to: string;
  total_days: number;
  reason: string | null;
  scope: 'major_only' | 'full';
  status: LeaveStatus;
  approved_by_id: number | null;
  approved_at: string | null;
  rejection_reason: string | null;
  coverage_user_id: number | null;
  coverage_user: User | null;
  created_at: string;
  // Extended fields
  is_half_day?: boolean;
  half_day_period?: 'morning' | 'afternoon';
  requested_hours?: number;
  certificate_file_id?: number;
  cancellation_requested?: boolean;
  cancellation_reason?: string;
  cancelled_at?: string;
  extension_of_id?: number;
  approval_levels?: LeaveApprovalLevel[];
}

// Balance Detail
export interface LeaveBalanceDetail {
  total: number;
  used: number;
  pending: number;
  remaining: number;
  carry_over?: number;
  adjustments?: number;
}

export interface LeaveBalance {
  annual: LeaveBalanceDetail;
  sick: LeaveBalanceDetail;
  emergency: LeaveBalanceDetail;
  comp_off: LeaveBalanceDetail;
  [key: string]: LeaveBalanceDetail;
}

// Team Calendar Entry
export interface TeamCalendarEntry {
  date: string;
  leaves: Array<{
    user_id: number;
    user_name: string;
    leave_type: string;
    leave_type_color: string;
    status: string;
    scope?: string;
  }>;
  holidays: LeaveCalendarDay[];
}

// AI Types
export interface LeaveBurnoutRisk {
  user_id: number;
  user_name: string;
  risk_level: 'low' | 'medium' | 'high';
  factors: string[];
  recommendation: string;
  days_since_last_leave?: number;
}

export interface LeavePatternAnalysis {
  frequent_days: string[];
  seasonal_peaks: string[];
  avg_duration: number;
  short_notice_rate: number;
  patterns: Array<{
    type: string;
    description: string;
    frequency: number;
  }>;
}

export interface LeaveWellnessScore {
  score: number;
  grade: string;
  factors: Array<{ name: string; impact: string }>;
  recommendations: string[];
}

export interface LeaveImpactAnalysis {
  affected_jobs: Array<{
    job_id: number;
    job_type: string;
    deadline?: string;
    risk: string;
  }>;
  team_coverage_gap: number;
  recommendations: string[];
}

// Request Payloads
export interface LeaveRequestPayload {
  user_id?: number;
  leave_type: LegacyLeaveType;
  leave_type_id?: number;
  date_from: string;
  date_to: string;
  reason: string;
  scope?: 'major_only' | 'full';
  coverage_user_id: number;
  is_half_day?: boolean;
  half_day_period?: 'morning' | 'afternoon';
  certificate_file_id?: number;
}

export interface CreateLeaveTypePayload {
  code: string;
  name: string;
  name_ar?: string;
  color?: string;
  icon?: string;
  requires_certificate?: boolean;
  certificate_after_days?: number;
  max_consecutive_days?: number;
  max_per_year?: number;
  advance_notice_days?: number;
  is_paid?: boolean;
}

export interface UpdateLeaveTypePayload extends Partial<CreateLeaveTypePayload> {
  is_active?: boolean;
}

export interface CreateLeavePolicyPayload {
  name: string;
  role?: string;
  min_tenure_months?: number;
  annual_allowance: number;
  sick_allowance: number;
  emergency_allowance: number;
  carry_over_enabled?: boolean;
  carry_over_max_days?: number;
  carry_over_expiry_months?: number;
  probation_months?: number;
  probation_allowance?: number;
  accrual_type?: 'yearly' | 'monthly' | 'quarterly';
  accrual_rate?: number;
  negative_balance_allowed?: boolean;
  negative_balance_max?: number;
}

export interface UpdateLeavePolicyPayload extends Partial<CreateLeavePolicyPayload> {
  is_active?: boolean;
}

export interface CreateBlackoutPayload {
  name: string;
  name_ar?: string;
  date_from: string;
  date_to: string;
  reason?: string;
  applies_to_roles?: string[];
  exception_user_ids?: number[];
}

export interface UpdateBlackoutPayload extends Partial<CreateBlackoutPayload> {
  is_active?: boolean;
}

export interface CreateHolidayPayload {
  date: string;
  name: string;
  name_ar?: string;
  holiday_type?: 'public' | 'religious' | 'company';
  is_working_day?: boolean;
}

export interface UpdateHolidayPayload extends Partial<CreateHolidayPayload> {}

export interface RequestCompOffPayload {
  user_id?: number;
  work_date: string;
  hours_worked: number;
  reason?: string;
}

export interface RequestEncashmentPayload {
  leave_type_id?: number;
  days: number;
}

export interface AdjustBalancePayload {
  leave_type_id?: number;
  amount: number;
  reason: string;
}

export interface LeaveCancellationPayload {
  reason: string;
}

export interface LeaveExtensionPayload {
  new_date_to: string;
  reason?: string;
}

// List Params
export interface LeaveListParams {
  page?: number;
  per_page?: number;
  status?: LeaveStatus;
  user_id?: number;
  leave_type?: LegacyLeaveType;
  leave_type_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface LeaveTypeListParams {
  page?: number;
  per_page?: number;
  is_active?: boolean;
}

export interface LeavePolicyListParams {
  page?: number;
  per_page?: number;
  is_active?: boolean;
  role?: string;
}

export interface LeaveBlackoutListParams {
  page?: number;
  per_page?: number;
  is_active?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface LeaveHolidayListParams {
  page?: number;
  per_page?: number;
  year?: number;
  holiday_type?: 'public' | 'religious' | 'company';
}

export interface CompOffListParams {
  page?: number;
  per_page?: number;
  status?: 'pending' | 'approved' | 'used' | 'expired';
  user_id?: number;
}

export interface EncashmentListParams {
  page?: number;
  per_page?: number;
  status?: 'pending' | 'approved' | 'paid' | 'rejected';
  user_id?: number;
}

export interface BalanceHistoryParams {
  page?: number;
  per_page?: number;
  leave_type_id?: number;
  change_type?: 'accrual' | 'used' | 'adjustment' | 'carry_over' | 'expired' | 'encashment';
  date_from?: string;
  date_to?: string;
}

export interface TeamCalendarParams {
  date_from: string;
  date_to: string;
  team_id?: number;
  include_holidays?: boolean;
}

// Bulk Operations
export interface BulkLeaveActionPayload {
  leave_ids: number[];
  action: 'approve' | 'reject';
  notes?: string;
  rejection_reason?: string;
}

export interface BulkLeaveActionResult {
  success_count: number;
  failed_count: number;
  results: Array<{
    leave_id: number;
    success: boolean;
    error?: string;
  }>;
}

// Analytics
export interface LeaveAnalytics {
  total_leaves: number;
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  avg_duration: number;
  by_type: Array<{
    leave_type: string;
    count: number;
    total_days: number;
  }>;
  by_month: Array<{
    month: string;
    count: number;
  }>;
}

export interface TeamLeaveAnalytics extends LeaveAnalytics {
  team_id?: number;
  team_name?: string;
  members_count: number;
  utilization_rate: number;
}
