/**
 * The planners' daily equipment availability — GET /api/eqt-availability
 * (app/api/eqt_availability.py). Rule 2 (Ali, 2026-11-27).
 *
 * Source: the planners' "Equipment Availability" mail, delivered by the courier
 * as EQT_Availability.xlsx. Shown on the board only for now — the planner does
 * not skip anything because of it yet. Planners (engineer/admin) only.
 */
import { getApiClient } from './client';
import type { ApiResponse } from '../types';

export interface EqtAvailabilityRow {
  equipment: string;                 // 'FL302' — upper-case plant code
  available: boolean;                // parked counts as available (Ali)
  stop_type: 'WAITING_PARTS' | 'IN_PROGRESS' | 'OTHER' | null;  // null when available
  reason: string | null;             // as written in the mail
  mail_received: string | null;      // 'YYYY-MM-DD HH:MM', Iraq time
}

export interface EqtAvailabilityList {
  available: boolean;                // false = the courier never delivered the file
  mail_received: string | null;
  mail_age_days: number | null;
  is_stale: boolean;                 // mail older than 3 days
  file_received_at: string | null;
  machines: number;
  not_available_count: number;
  rows: EqtAvailabilityRow[];        // stopped machines first
}

export const eqtAvailabilityApi = {
  get() {
    return getApiClient().get<ApiResponse<EqtAvailabilityList>>('/api/eqt-availability');
  },
};
