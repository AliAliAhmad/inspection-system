import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  Leave,
  LeaveStatus,
  LeaveRequestPayload,
  User,
  LeaveType,
  LeavePolicy,
  LeaveBalanceHistory,
  LeaveBlackout,
  LeaveCalendarDay,
  CompensatoryLeave,
  LeaveEncashment,
  LeaveBalance,
  TeamCalendarEntry,
  LeaveBurnoutRisk,
  LeavePatternAnalysis,
  LeaveWellnessScore,
  LeaveImpactAnalysis,
  CreateLeaveTypePayload,
  UpdateLeaveTypePayload,
  CreateLeavePolicyPayload,
  UpdateLeavePolicyPayload,
  CreateBlackoutPayload,
  UpdateBlackoutPayload,
  CreateHolidayPayload,
  UpdateHolidayPayload,
  RequestCompOffPayload,
  RequestEncashmentPayload,
  AdjustBalancePayload,
  LeaveCancellationPayload,
  LeaveExtensionPayload,
  LeaveListParams,
  LeaveTypeListParams,
  LeavePolicyListParams,
  LeaveBlackoutListParams,
  LeaveHolidayListParams,
  CompOffListParams,
  EncashmentListParams,
  BalanceHistoryParams,
  TeamCalendarParams,
  BulkLeaveActionPayload,
  BulkLeaveActionResult,
  LeaveAnalytics,
  TeamLeaveAnalytics,
} from '../types';

export interface LeaveApprovePayload {
  notes?: string;
}

export interface LeaveRejectPayload {
  rejection_reason?: string;
}

export interface CapacityInfo {
  shift: string;
  total: number;
  available: number;
  on_leave: number;
}

export interface LeaveBalanceData {
  total_balance: number;
  used: number;
  remaining: number;
  leaves: any[];
}

export const leavesApi = {
  // =====================
  // Core Leave Operations
  // =====================

  list(params?: LeaveListParams) {
    return getApiClient().get<PaginatedResponse<Leave>>('/api/leaves', { params });
  },

  get(leaveId: number) {
    return getApiClient().get<ApiResponse<Leave>>(`/api/leaves/${leaveId}`);
  },

  request(payload: LeaveRequestPayload) {
    return getApiClient().post<ApiResponse<Leave>>('/api/leaves', payload);
  },

  update(leaveId: number, payload: Partial<LeaveRequestPayload>) {
    return getApiClient().put<ApiResponse<Leave>>(`/api/leaves/${leaveId}`, payload);
  },

  delete(leaveId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/${leaveId}`);
  },

  approve(leaveId: number, payload?: LeaveApprovePayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/approve`,
      payload,
    );
  },

  reject(leaveId: number, payload?: LeaveRejectPayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/reject`,
      payload,
    );
  },

  requestCancellation(leaveId: number, payload: LeaveCancellationPayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/cancel`,
      payload,
    );
  },

  approveCancellation(leaveId: number) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/cancel/approve`,
    );
  },

  rejectCancellation(leaveId: number, payload?: { reason?: string }) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/cancel/reject`,
      payload,
    );
  },

  extend(leaveId: number, payload: LeaveExtensionPayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/extend`,
      payload,
    );
  },

  getActive() {
    return getApiClient().get<ApiResponse<Leave[]>>('/api/leaves/active');
  },

  getMyLeaves(params?: LeaveListParams) {
    return getApiClient().get<PaginatedResponse<Leave>>('/api/leaves/my', { params });
  },

  getPending(params?: LeaveListParams) {
    return getApiClient().get<PaginatedResponse<Leave>>('/api/leaves/pending', { params });
  },

  // Bulk Operations
  bulkAction(payload: BulkLeaveActionPayload) {
    return getApiClient().post<ApiResponse<BulkLeaveActionResult>>(
      '/api/leaves/bulk',
      payload,
    );
  },

  // =====================
  // Coverage
  // =====================

  getCoverageCandidates(leaveId: number) {
    return getApiClient().get<ApiResponse<User[]>>(
      `/api/leaves/${leaveId}/coverage/candidates`,
    );
  },

  assignCoverage(leaveId: number, userId: number) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/coverage/assign`,
      { user_id: userId },
    );
  },

  // =====================
  // Capacity & Calendar
  // =====================

  getCapacity(shift?: string) {
    return getApiClient().get<ApiResponse<CapacityInfo[]>>(
      '/api/leaves/capacity',
      { params: shift ? { shift } : undefined },
    );
  },

  getTeamCalendar(params: TeamCalendarParams) {
    return getApiClient().get<ApiResponse<TeamCalendarEntry[]>>(
      '/api/leaves/calendar/team',
      { params },
    );
  },

  getMyCalendar(params: { date_from: string; date_to: string }) {
    return getApiClient().get<ApiResponse<TeamCalendarEntry[]>>(
      '/api/leaves/calendar/my',
      { params },
    );
  },

  // =====================
  // Balance Management
  // =====================

  getBalance(userId: number) {
    return getApiClient().get<ApiResponse<LeaveBalanceData>>(`/api/leaves/user/${userId}/balance`);
  },

  getDetailedBalance(userId: number) {
    return getApiClient().get<ApiResponse<LeaveBalance>>(`/api/leaves/user/${userId}/balance/detailed`);
  },

  getMyBalance() {
    return getApiClient().get<ApiResponse<LeaveBalance>>('/api/leaves/balance/my');
  },

  addDays(userId: number, days: number, reason: string) {
    return getApiClient().post<ApiResponse<{ annual_leave_balance: number }>>(`/api/leaves/user/${userId}/add-days`, { days, reason });
  },

  adjustBalance(userId: number, payload: AdjustBalancePayload) {
    return getApiClient().post<ApiResponse<LeaveBalance>>(
      `/api/leaves/user/${userId}/balance/adjust`,
      payload,
    );
  },

  getBalanceHistory(userId: number, params?: BalanceHistoryParams) {
    return getApiClient().get<PaginatedResponse<LeaveBalanceHistory>>(
      `/api/leaves/user/${userId}/balance/history`,
      { params },
    );
  },

  getMyBalanceHistory(params?: BalanceHistoryParams) {
    return getApiClient().get<PaginatedResponse<LeaveBalanceHistory>>(
      '/api/leaves/balance/history/my',
      { params },
    );
  },

  // =====================
  // Leave Types
  // =====================

  listLeaveTypes(params?: LeaveTypeListParams) {
    return getApiClient().get<PaginatedResponse<LeaveType>>('/api/leaves/types', { params });
  },

  getLeaveType(typeId: number) {
    return getApiClient().get<ApiResponse<LeaveType>>(`/api/leaves/types/${typeId}`);
  },

  createLeaveType(payload: CreateLeaveTypePayload) {
    return getApiClient().post<ApiResponse<LeaveType>>('/api/leaves/types', payload);
  },

  updateLeaveType(typeId: number, payload: UpdateLeaveTypePayload) {
    return getApiClient().put<ApiResponse<LeaveType>>(`/api/leaves/types/${typeId}`, payload);
  },

  deleteLeaveType(typeId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/types/${typeId}`);
  },

  // =====================
  // Leave Policies
  // =====================

  listPolicies(params?: LeavePolicyListParams) {
    return getApiClient().get<PaginatedResponse<LeavePolicy>>('/api/leaves/policies', { params });
  },

  getPolicy(policyId: number) {
    return getApiClient().get<ApiResponse<LeavePolicy>>(`/api/leaves/policies/${policyId}`);
  },

  createPolicy(payload: CreateLeavePolicyPayload) {
    return getApiClient().post<ApiResponse<LeavePolicy>>('/api/leaves/policies', payload);
  },

  updatePolicy(policyId: number, payload: UpdateLeavePolicyPayload) {
    return getApiClient().put<ApiResponse<LeavePolicy>>(`/api/leaves/policies/${policyId}`, payload);
  },

  deletePolicy(policyId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/policies/${policyId}`);
  },

  getMyPolicy() {
    return getApiClient().get<ApiResponse<LeavePolicy>>('/api/leaves/policies/my');
  },

  // =====================
  // Blackout Periods
  // =====================

  listBlackouts(params?: LeaveBlackoutListParams) {
    return getApiClient().get<PaginatedResponse<LeaveBlackout>>('/api/leaves/blackouts', { params });
  },

  getBlackout(blackoutId: number) {
    return getApiClient().get<ApiResponse<LeaveBlackout>>(`/api/leaves/blackouts/${blackoutId}`);
  },

  createBlackout(payload: CreateBlackoutPayload) {
    return getApiClient().post<ApiResponse<LeaveBlackout>>('/api/leaves/blackouts', payload);
  },

  updateBlackout(blackoutId: number, payload: UpdateBlackoutPayload) {
    return getApiClient().put<ApiResponse<LeaveBlackout>>(`/api/leaves/blackouts/${blackoutId}`, payload);
  },

  deleteBlackout(blackoutId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/blackouts/${blackoutId}`);
  },

  checkBlackout(params: { date_from: string; date_to: string; user_id?: number }) {
    return getApiClient().get<ApiResponse<{ is_blackout: boolean; blackouts: LeaveBlackout[] }>>(
      '/api/leaves/blackouts/check',
      { params },
    );
  },

  // =====================
  // Holidays
  // =====================

  listHolidays(params?: LeaveHolidayListParams) {
    return getApiClient().get<PaginatedResponse<LeaveCalendarDay>>('/api/leaves/holidays', { params });
  },

  getHoliday(holidayId: number) {
    return getApiClient().get<ApiResponse<LeaveCalendarDay>>(`/api/leaves/holidays/${holidayId}`);
  },

  createHoliday(payload: CreateHolidayPayload) {
    return getApiClient().post<ApiResponse<LeaveCalendarDay>>('/api/leaves/holidays', payload);
  },

  updateHoliday(holidayId: number, payload: UpdateHolidayPayload) {
    return getApiClient().put<ApiResponse<LeaveCalendarDay>>(`/api/leaves/holidays/${holidayId}`, payload);
  },

  deleteHoliday(holidayId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/holidays/${holidayId}`);
  },

  getUpcomingHolidays(params?: { count?: number }) {
    return getApiClient().get<ApiResponse<LeaveCalendarDay[]>>(
      '/api/leaves/holidays/upcoming',
      { params },
    );
  },

  // =====================
  // Compensatory Leave (Comp-Off)
  // =====================

  listCompOffs(params?: CompOffListParams) {
    return getApiClient().get<PaginatedResponse<CompensatoryLeave>>('/api/leaves/comp-off', { params });
  },

  getCompOff(compOffId: number) {
    return getApiClient().get<ApiResponse<CompensatoryLeave>>(`/api/leaves/comp-off/${compOffId}`);
  },

  requestCompOff(payload: RequestCompOffPayload) {
    return getApiClient().post<ApiResponse<CompensatoryLeave>>('/api/leaves/comp-off', payload);
  },

  approveCompOff(compOffId: number) {
    return getApiClient().post<ApiResponse<CompensatoryLeave>>(`/api/leaves/comp-off/${compOffId}/approve`);
  },

  rejectCompOff(compOffId: number, payload?: { reason?: string }) {
    return getApiClient().post<ApiResponse<CompensatoryLeave>>(
      `/api/leaves/comp-off/${compOffId}/reject`,
      payload,
    );
  },

  getMyCompOffs(params?: CompOffListParams) {
    return getApiClient().get<PaginatedResponse<CompensatoryLeave>>('/api/leaves/comp-off/my', { params });
  },

  getAvailableCompOffs() {
    return getApiClient().get<ApiResponse<CompensatoryLeave[]>>('/api/leaves/comp-off/available');
  },

  // =====================
  // Leave Encashment
  // =====================

  listEncashments(params?: EncashmentListParams) {
    return getApiClient().get<PaginatedResponse<LeaveEncashment>>('/api/leaves/encashment', { params });
  },

  getEncashment(encashmentId: number) {
    return getApiClient().get<ApiResponse<LeaveEncashment>>(`/api/leaves/encashment/${encashmentId}`);
  },

  requestEncashment(payload: RequestEncashmentPayload) {
    return getApiClient().post<ApiResponse<LeaveEncashment>>('/api/leaves/encashment', payload);
  },

  approveEncashment(encashmentId: number) {
    return getApiClient().post<ApiResponse<LeaveEncashment>>(`/api/leaves/encashment/${encashmentId}/approve`);
  },

  rejectEncashment(encashmentId: number, payload?: { reason?: string }) {
    return getApiClient().post<ApiResponse<LeaveEncashment>>(
      `/api/leaves/encashment/${encashmentId}/reject`,
      payload,
    );
  },

  markEncashmentPaid(encashmentId: number) {
    return getApiClient().post<ApiResponse<LeaveEncashment>>(`/api/leaves/encashment/${encashmentId}/paid`);
  },

  getMyEncashments(params?: EncashmentListParams) {
    return getApiClient().get<PaginatedResponse<LeaveEncashment>>('/api/leaves/encashment/my', { params });
  },

  getEncashmentEligibility() {
    return getApiClient().get<ApiResponse<{ eligible: boolean; max_days: number; reason?: string }>>(
      '/api/leaves/encashment/eligibility',
    );
  },

  // =====================
  // Analytics & Reports
  // =====================

  getAnalytics(params?: { date_from?: string; date_to?: string }) {
    return getApiClient().get<ApiResponse<LeaveAnalytics>>('/api/leaves/analytics', { params });
  },

  getTeamAnalytics(params?: { team_id?: number; date_from?: string; date_to?: string }) {
    return getApiClient().get<ApiResponse<TeamLeaveAnalytics>>('/api/leaves/analytics/team', { params });
  },

  getUserAnalytics(userId: number, params?: { date_from?: string; date_to?: string }) {
    return getApiClient().get<ApiResponse<LeaveAnalytics>>(
      `/api/leaves/analytics/user/${userId}`,
      { params },
    );
  },

  // =====================
  // AI-Powered Insights
  // =====================

  getBurnoutRisks(params?: { team_id?: number }) {
    return getApiClient().get<ApiResponse<LeaveBurnoutRisk[]>>('/api/leaves/ai/burnout-risks', { params });
  },

  getPatternAnalysis(userId: number) {
    return getApiClient().get<ApiResponse<LeavePatternAnalysis>>(
      `/api/leaves/ai/patterns/${userId}`,
    );
  },

  getMyPatterns() {
    return getApiClient().get<ApiResponse<LeavePatternAnalysis>>('/api/leaves/ai/patterns/my');
  },

  getWellnessScore(userId: number) {
    return getApiClient().get<ApiResponse<LeaveWellnessScore>>(
      `/api/leaves/ai/wellness/${userId}`,
    );
  },

  getMyWellnessScore() {
    return getApiClient().get<ApiResponse<LeaveWellnessScore>>('/api/leaves/ai/wellness/my');
  },

  analyzeLeaveImpact(leaveId: number) {
    return getApiClient().get<ApiResponse<LeaveImpactAnalysis>>(
      `/api/leaves/${leaveId}/impact`,
    );
  },

  previewLeaveImpact(payload: { date_from: string; date_to: string; user_id?: number }) {
    return getApiClient().post<ApiResponse<LeaveImpactAnalysis>>(
      '/api/leaves/impact/preview',
      payload,
    );
  },

  getAiRecommendations(params?: { user_id?: number }) {
    return getApiClient().get<ApiResponse<{ recommendations: string[] }>>(
      '/api/leaves/ai/recommendations',
      { params },
    );
  },

  // =====================
  // Validation & Utilities
  // =====================

  validateLeaveRequest(payload: LeaveRequestPayload) {
    return getApiClient().post<ApiResponse<{ valid: boolean; errors: string[]; warnings: string[] }>>(
      '/api/leaves/validate',
      payload,
    );
  },

  calculateWorkingDays(params: { date_from: string; date_to: string; exclude_holidays?: boolean }) {
    return getApiClient().get<ApiResponse<{ working_days: number; holidays: number; weekends: number }>>(
      '/api/leaves/calculate-days',
      { params },
    );
  },

  getLeaveSettings() {
    return getApiClient().get<ApiResponse<{
      max_advance_days: number;
      min_notice_days: number;
      allow_half_day: boolean;
      allow_hourly: boolean;
      require_certificate_days: number;
    }>>('/api/leaves/settings');
  },

  updateLeaveSettings(payload: {
    max_advance_days?: number;
    min_notice_days?: number;
    allow_half_day?: boolean;
    allow_hourly?: boolean;
    require_certificate_days?: number;
  }) {
    return getApiClient().put<ApiResponse<void>>('/api/leaves/settings', payload);
  },

  // =====================
  // Additional API Methods for Components
  // =====================

  // Get leave balance (detailed version)
  getLeaveBalance(userId: number) {
    return getApiClient().get<ApiResponse<{ balance: LeaveBalance }>>(`/api/leaves/user/${userId}/balance`);
  },

  // List leave policies
  listLeavePolicies(params?: LeavePolicyListParams) {
    return getApiClient().get<ApiResponse<{ policies: LeavePolicy[] }>>('/api/leaves/policies', { params });
  },

  // Create leave policy
  createLeavePolicy(payload: CreateLeavePolicyPayload) {
    return getApiClient().post<ApiResponse<LeavePolicy>>('/api/leaves/policies', payload);
  },

  // Update leave policy
  updateLeavePolicy(policyId: number, payload: UpdateLeavePolicyPayload) {
    return getApiClient().put<ApiResponse<LeavePolicy>>(`/api/leaves/policies/${policyId}`, payload);
  },

  // Delete leave policy
  deleteLeavePolicy(policyId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/leaves/policies/${policyId}`);
  },

  // Get AI insights (combined endpoint)
  getAIInsights(params?: { user_id?: number; team_id?: number }) {
    return getApiClient().get<ApiResponse<{
      burnout_risks: LeaveBurnoutRisk[];
      patterns: LeavePatternAnalysis | null;
      wellness_score: LeaveWellnessScore | null;
      recommendations: string[];
      coverage_suggestions: string[];
    }>>('/api/leaves/ai/insights', { params });
  },

  // Get leave impact
  getLeaveImpact(leaveId: number) {
    return getApiClient().get<ApiResponse<{ impact: LeaveImpactAnalysis }>>(`/api/leaves/${leaveId}/impact`);
  },

  // Request encashment (user-scoped)
  requestEncashmentForUser(userId: number, payload: RequestEncashmentPayload) {
    return getApiClient().post<ApiResponse<LeaveEncashment>>(`/api/leaves/user/${userId}/encashment`, payload);
  },

  // Parse natural language leave request
  parseNaturalLanguage(text: string) {
    return getApiClient().post<ApiResponse<{
      parsed: {
        leave_type: string;
        date_from: string;
        date_to: string;
        reason: string;
        confidence: number;
        parsed_entities: Array<{ type: string; value: string; confidence: number }>;
      };
    }>>('/api/leaves/ai/parse', { text });
  },
};
