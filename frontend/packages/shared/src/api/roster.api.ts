import { getApiClient, getApiBaseUrl } from './client';
import { ApiResponse } from '../types';

export interface RosterWeekUser {
  id: number;
  full_name: string;
  role: string;
  specialization: string | null;
  is_on_leave: boolean;
  entries: Record<string, string>; // date string -> 'day'|'night'|'off'|'leave'
  annual_leave_balance: number;
  leave_used: number;
  leave_remaining: number;
}

export interface RosterWeekData {
  dates: string[];
  users: RosterWeekUser[];
}

export interface DayAvailabilityData {
  date: string;
  available: Array<{ id: number; full_name: string; role: string; specialization: string | null; shift: string }>;
  on_leave: Array<{ id: number; full_name: string; role: string; specialization: string | null }>;
  off: Array<{ id: number; full_name: string; role: string; specialization: string | null }>;
}

export interface UploadRosterResult {
  imported: number;
  users_processed: number;
  errors: string[];
}

export const rosterApi = {
  upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ApiResponse<UploadRosterResult>>(
      '/api/roster/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  getWeek(date?: string) {
    return getApiClient().get<ApiResponse<RosterWeekData>>(
      '/api/roster/week',
      { params: date ? { date } : undefined },
    );
  },

  getDayAvailability(date: string, shift?: string) {
    return getApiClient().get<ApiResponse<DayAvailabilityData>>(
      '/api/roster/day-availability',
      { params: { date, ...(shift ? { shift } : {}) } },
    );
  },

  getTemplateUrl() {
    return `${getApiBaseUrl()}/api/roster/template`;
  },

  getCoverageScore(date?: string) {
    return getApiClient().get<ApiResponse<CoverageScoreData>>(
      '/api/roster/coverage-score',
      { params: date ? { date } : undefined },
    );
  },

  getWorkload(date?: string, period: 'week' | 'month' = 'week') {
    return getApiClient().get<ApiResponse<WorkloadData>>(
      '/api/roster/workload',
      { params: { date, period } },
    );
  },

  suggestCoverage(userId: number, dateFrom: string, dateTo: string) {
    return getApiClient().post<ApiResponse<CoverageSuggestionData>>(
      '/api/roster/ai/suggest-coverage',
      { user_id: userId, date_from: dateFrom, date_to: dateTo },
    );
  },
};

export interface CoverageGapDetail {
  role: string;
  required: number;
  available: number;
  shortage: number;
}

export interface DailyCoverage {
  date: string;
  day_name: string;
  available: { inspector: number; specialist: number; engineer: number; total: number };
  on_leave: number;
  score: number;
  gaps: CoverageGapDetail[];
}

export interface CoverageScoreData {
  week_start: string;
  week_end: string;
  coverage_score: number;
  daily_coverage: DailyCoverage[];
  gaps: Array<{ date: string; day_name: string; gaps: CoverageGapDetail[] }>;
  recommendations: Array<{ type: string; message: string }>;
  summary: {
    total_users: number;
    days_with_gaps: number;
    understaffed_days: number;
  };
}

export interface WorkloadUser {
  user_id: number;
  full_name: string;
  role: string;
  specialization: string | null;
  scheduled_hours: number;
  job_count: number;
  overtime_hours: number;
  status: 'balanced' | 'overloaded' | 'underutilized';
  utilization: number;
}

export interface WorkloadData {
  period: 'week' | 'month';
  start_date: string;
  end_date: string;
  standard_hours: number;
  workload: WorkloadUser[];
  summary: {
    total_users: number;
    overloaded: number;
    underutilized: number;
    balanced: number;
    total_scheduled_hours: number;
    total_overtime_hours: number;
  };
}

export interface CoverageSuggestion {
  rank: number;
  user_id: number;
  full_name: string;
  role: string;
  specialization: string | null;
  match_score: number;
  working_days: number;
  off_days: number;
  is_best_match: boolean;
}

export interface CoverageSuggestionData {
  requesting_user: {
    id: number;
    full_name: string;
    role: string;
    specialization: string | null;
  };
  leave_period: {
    from: string;
    to: string;
    days: number;
  };
  suggestions: CoverageSuggestion[];
  total_candidates: number;
}
