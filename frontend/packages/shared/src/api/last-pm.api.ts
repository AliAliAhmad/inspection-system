/**
 * When each machine last had a finished PM — GET /api/last-pm (app/api/last_pm.py).
 *
 * Rule 1 (Ali, 2026-11-27): among jobs with the same score, the machine with the
 * oldest last PM is planned first. Built nightly from IW39. Planners only.
 */
import { getApiClient } from './client';
import type { ApiResponse } from '../types';

export interface LastPmList {
  available: boolean;                  // false = the nightly sync has not built it yet
  written_at: string | null;
  by_machine: Record<string, string>;  // 'RS112' -> '2026-08-24'
}

export const lastPmApi = {
  get() {
    return getApiClient().get<ApiResponse<LastPmList>>('/api/last-pm');
  },
};
