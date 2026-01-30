import { getApiClient } from './client';
import { ApiResponse } from '../types';

export interface DashboardData {
  total_inspections: number;
  pending_defects: number;
  active_jobs: number;
  completion_rate: number;
  [key: string]: unknown;
}

export interface AdminDashboardData {
  users_count: number;
  equipment_count: number;
  inspections_today: number;
  open_defects: number;
  active_leaves: number;
  [key: string]: unknown;
}

export interface PauseAnalytics {
  total_pauses: number;
  average_duration_minutes: number;
  by_category: Record<string, number>;
  [key: string]: unknown;
}

export interface DefectAnalytics {
  total_defects: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  [key: string]: unknown;
}

export interface CapacityData {
  total_staff: number;
  available: number;
  on_leave: number;
  utilization_rate: number;
  [key: string]: unknown;
}

export const reportsApi = {
  getDashboard() {
    return getApiClient().get<ApiResponse<DashboardData>>('/api/reports/dashboard');
  },

  getAdminDashboard() {
    return getApiClient().get<ApiResponse<AdminDashboardData>>('/api/reports/admin-dashboard');
  },

  getPauseAnalytics() {
    return getApiClient().get<ApiResponse<PauseAnalytics>>('/api/reports/pause-analytics');
  },

  getDefectAnalytics() {
    return getApiClient().get<ApiResponse<DefectAnalytics>>('/api/reports/defect-analytics');
  },

  getCapacity() {
    return getApiClient().get<ApiResponse<CapacityData>>('/api/reports/capacity');
  },
};
