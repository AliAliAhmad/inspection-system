import { getApiClient } from './client';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
} from '../types';
import type {
  RunningHoursData,
  RunningHoursSummary,
  RunningHoursReading,
  ServiceInterval,
  CreateRunningHoursReadingPayload,
  UpdateServiceIntervalPayload,
  ResetServicePayload,
  ServiceDueEquipment,
  RunningHoursAlert,
  RunningHoursHistory,
} from '../types/running-hours.types';

export interface RunningHoursListParams extends PaginationParams {
  status?: 'ok' | 'approaching' | 'overdue';
  location?: string;
  equipment_type?: string;
  assigned_engineer_id?: number;
  sort_by?: 'urgency' | 'hours' | 'name' | 'status';
  sort_order?: 'asc' | 'desc';
  search?: string;
}

export const runningHoursApi = {
  // ============================================
  // RUNNING HOURS ENDPOINTS
  // ============================================

  /** Get running hours data for specific equipment */
  getRunningHours(equipmentId: number) {
    return getApiClient().get<ApiResponse<RunningHoursData>>(
      `/api/equipment/${equipmentId}/running-hours`
    );
  },

  /** Update running hours (record new meter reading) */
  updateRunningHours(equipmentId: number, payload: CreateRunningHoursReadingPayload) {
    return getApiClient().post<ApiResponse<RunningHoursReading>>(
      `/api/equipment/${equipmentId}/running-hours`,
      payload
    );
  },

  /** Get running hours history for equipment */
  getRunningHoursHistory(equipmentId: number, params?: { days?: number; limit?: number }) {
    return getApiClient().get<ApiResponse<RunningHoursHistory>>(
      `/api/equipment/${equipmentId}/running-hours/history`,
      { params }
    );
  },

  // ============================================
  // SERVICE INTERVAL ENDPOINTS
  // ============================================

  /** Get service interval settings for equipment */
  getServiceInterval(equipmentId: number) {
    return getApiClient().get<ApiResponse<ServiceInterval>>(
      `/api/equipment/${equipmentId}/service-interval`
    );
  },

  /** Update service interval settings (admin only) */
  updateServiceInterval(equipmentId: number, payload: UpdateServiceIntervalPayload) {
    return getApiClient().patch<ApiResponse<ServiceInterval>>(
      `/api/equipment/${equipmentId}/service-interval`,
      payload
    );
  },

  /** Reset service hours after maintenance */
  resetService(equipmentId: number, payload: ResetServicePayload) {
    return getApiClient().post<ApiResponse<ServiceInterval>>(
      `/api/equipment/${equipmentId}/service-interval/reset`,
      payload
    );
  },

  // ============================================
  // DASHBOARD ENDPOINTS
  // ============================================

  /** Get list of all equipment with running hours data */
  listRunningHours(params?: RunningHoursListParams) {
    return getApiClient().get<PaginatedResponse<RunningHoursData>>(
      '/api/equipment/running-hours',
      { params }
    );
  },

  /** Get summary of running hours status across all equipment */
  getRunningHoursSummary() {
    return getApiClient().get<ApiResponse<RunningHoursSummary>>(
      '/api/equipment/running-hours/summary'
    );
  },

  /** Get equipment approaching or overdue for service */
  getServiceDue(params?: { status?: 'approaching' | 'overdue'; limit?: number }) {
    return getApiClient().get<ApiResponse<ServiceDueEquipment[]>>(
      '/api/equipment/service-due',
      { params }
    );
  },

  // ============================================
  // ALERTS ENDPOINTS
  // ============================================

  /** Get running hours related alerts */
  getAlerts(params?: { acknowledged?: boolean; severity?: string; limit?: number }) {
    return getApiClient().get<ApiResponse<RunningHoursAlert[]>>(
      '/api/equipment/running-hours/alerts',
      { params }
    );
  },

  /** Acknowledge an alert */
  acknowledgeAlert(alertId: number) {
    return getApiClient().put<ApiResponse<RunningHoursAlert>>(
      `/api/equipment/running-hours/alerts/${alertId}/acknowledge`
    );
  },

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /** Bulk update running hours for multiple equipment */
  bulkUpdateRunningHours(
    updates: Array<{ equipment_id: number; hours: number; notes?: string }>
  ) {
    return getApiClient().post<
      ApiResponse<{ updated: number; errors: Array<{ equipment_id: number; error: string }> }>
    >('/api/equipment/running-hours/bulk-update', { updates });
  },

  /** Export running hours report */
  exportReport(params?: { format?: 'csv' | 'xlsx'; status?: string }) {
    return getApiClient().get('/api/equipment/running-hours/export', {
      params,
      responseType: 'blob',
    });
  },
};
