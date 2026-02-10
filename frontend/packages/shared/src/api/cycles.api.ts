/**
 * Maintenance Cycles API client
 */
import { getApiClient, getApiBaseUrl } from './client';
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

export interface CycleAnalyticsData {
  cycle_id: number;
  cycle_name: string;
  cycle_type: 'running_hours' | 'calendar';
  total_linked_items: number;
  linked_templates: number;
  linked_jobs: number;
  linked_equipment: number;
  jobs_completed: number;
  jobs_pending: number;
  avg_completion_time_hours: number | null;
  effectiveness_score: number | null;
  last_used_date: string | null;
}

export interface CycleImpactData {
  cycle_id: number;
  cycle_name: string;
  can_delete: boolean;
  deletion_warnings: string[];
  affected_items: {
    templates: number;
    active_jobs: number;
    completed_jobs: number;
    equipment: number;
  };
  recommended_action: string;
}

export interface LinkedItem {
  id: number;
  name: string;
  type: 'template' | 'job' | 'equipment';
  status: string;
  created_at: string;
}

export interface LinkedItemsData {
  items: LinkedItem[];
  total: number;
  page: number;
  per_page: number;
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

  /**
   * Get the URL for downloading the cycles import template
   */
  getTemplateUrl() {
    return `${getApiBaseUrl()}/api/cycles/template`;
  },

  /**
   * Get analytics for a specific cycle
   */
  getAnalytics(cycleId: number) {
    return getApiClient().get<ApiResponse<CycleAnalyticsData>>(`/api/cycles/${cycleId}/analytics`);
  },

  /**
   * Get impact analysis before edit/delete
   */
  getImpact(cycleId: number) {
    return getApiClient().get<ApiResponse<CycleImpactData>>(`/api/cycles/${cycleId}/impact`);
  },

  /**
   * Get linked items for a cycle (paginated)
   */
  getLinkedItems(cycleId: number, params?: { page?: number; per_page?: number; type?: 'template' | 'job' | 'equipment' }) {
    return getApiClient().get<ApiResponse<LinkedItemsData>>(`/api/cycles/${cycleId}/linked`, { params });
  },
};
