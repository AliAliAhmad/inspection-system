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

export interface TodayJob {
  id: number;
  job_type: 'pm' | 'defect' | 'inspection';
  equipment_name: string;
  equipment_serial: string | null;
  estimated_hours: number;
  priority: string;
  status: string;
  team_count: number;
}

export interface TeamWorkload {
  user_id: number;
  name: string;
  hours: number;
  job_count: number;
  on_leave: boolean;
}

export interface JobsByDay {
  date: string;
  day_name: string;
  count: number;
  is_today: boolean;
}

export interface WorkPlanStats {
  has_plan: boolean;
  plan_id?: number;
  plan_status: 'draft' | 'published' | null;
  week_start: string;
  week_end: string;
  total_jobs: number;
  jobs_in_pool: number;
  scheduled_jobs: number;
  completed_jobs: number;
  in_progress_jobs: number;
  overdue_jobs: number;
  critical_jobs: number;
  today_jobs: TodayJob[];
  team_workload: TeamWorkload[];
  jobs_by_type: { pm: number; defect: number; inspection: number };
  jobs_by_day: JobsByDay[];
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

  getWorkPlanStats() {
    return getApiClient().get<ApiResponse<WorkPlanStats>>('/api/reports/work-plan-stats');
  },
};
