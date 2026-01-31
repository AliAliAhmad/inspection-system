import { getApiClient } from './client';
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
};
