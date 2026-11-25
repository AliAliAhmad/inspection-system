/**
 * The planner's PRM overdue list — GET /api/prm-overdue (app/api/prm_overdue.py).
 *
 * Source: the planner's weekly PM-MES-WEEK mail, delivered by the courier as
 * PRM_Overdue.xlsx. These are the PLANNER's numbers; the app's own overdue
 * badge (overdue_value) is a different figure and is shown beside this one,
 * never merged with it (Ali, 2026-11-25). Planners (engineer/admin) only.
 */
import { getApiClient } from './client';
import type { ApiResponse } from '../types';

export interface PrmOverdueRow {
  equipment: string;            // 'TT058' — upper-case plant code
  functional_location: string | null;
  order: string | null;         // 12 digits, always text
  cycle_hours: number | null;   // service size, e.g. 500
  hours_overdue: number | null; // positive = hours past due
  planned_rh: number | null;
  sap_status: string | null;
  plan_week: number | null;
  plan_received: string | null; // 'YYYY-MM-DD HH:MM', Iraq local time
}

export interface PrmOverdueList {
  available: boolean;           // false = the courier never delivered the file
  plan_week: number | null;
  plan_received: string | null;
  plan_received_age_days: number | null;
  is_stale: boolean;            // mail older than 8 days
  file_received_at: string | null;
  rows: PrmOverdueRow[];        // most overdue first
}

export const prmOverdueApi = {
  get() {
    return getApiClient().get<ApiResponse<PrmOverdueList>>('/api/prm-overdue');
  },
};
