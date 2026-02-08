/**
 * Maintenance Cycles API client
 */
import { getApiClient } from './client';
import type { ApiResponse } from '../types';
import type {
  MaintenanceCycle,
  CreateCyclePayload,
  UpdateCyclePayload,
} from '../types/work-plan.types';

interface CyclesListResponse {
  cycles: MaintenanceCycle[];
  count: number;
}

interface CycleResponse {
  cycle: MaintenanceCycle;
}

export interface CyclesListParams {
  cycle_type?: 'running_hours' | 'calendar';
  active_only?: boolean;
}

export const cyclesApi = {
  /**
   * List all maintenance cycles
   */
  list(params?: CyclesListParams) {
    return getApiClient().get<ApiResponse<CyclesListResponse>>('/api/cycles', { params });
  },

  /**
   * Get a single cycle by ID
   */
  get(cycleId: number) {
    return getApiClient().get<ApiResponse<CycleResponse>>(`/api/cycles/${cycleId}`);
  },

  /**
   * Create a new cycle (admin only)
   */
  create(payload: CreateCyclePayload) {
    return getApiClient().post<ApiResponse<CycleResponse>>('/api/cycles', payload);
  },

  /**
   * Update a cycle (admin only)
   */
  update(cycleId: number, payload: UpdateCyclePayload) {
    return getApiClient().put<ApiResponse<CycleResponse>>(`/api/cycles/${cycleId}`, payload);
  },

  /**
   * Delete a cycle (admin only, non-system only)
   */
  delete(cycleId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/cycles/${cycleId}`);
  },
};
