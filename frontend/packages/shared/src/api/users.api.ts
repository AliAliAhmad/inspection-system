import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  User,
  CreateUserPayload,
  UpdateUserPayload,
  ImportLog,
  RoleSwapLog,
  ImportResult,
} from '../types';

export interface UserListParams extends PaginationParams {
  role?: string;
  is_active?: boolean;
  search?: string;
  shift?: string;
  specialization?: string;
}

export interface UserDashboardStats {
  total: number;
  active: number;
  inactive: number;
  on_leave: number;
  active_last_week: number;
  by_role: Record<string, number>;
  by_shift: Record<string, number>;
  by_specialization: Record<string, number>;
  top_performers: Array<{ id: number; name: string; role: string; points: number }>;
  workload: {
    inspectors: Array<{ id: number; name: string; active_tasks: number }>;
    specialists: Array<{ id: number; name: string; active_tasks: number }>;
  };
}

export interface UserWorkload {
  id: number;
  full_name: string;
  role: string;
  shift: string | null;
  specialization: string | null;
  active_tasks: number;
  completed_today: number;
  completed_week: number;
  utilization: number;
  status: 'available' | 'light' | 'optimal' | 'overloaded';
}

export interface WorkloadAnalysis {
  users: UserWorkload[];
  summary: {
    total_active_tasks: number;
    average_utilization: number;
    available_count: number;
    overloaded_count: number;
  };
}

export interface AISearchResult extends User {
  workload_status: string;
  active_tasks: number;
}

export interface BulkActionPayload {
  user_ids: number[];
  action: 'activate' | 'deactivate' | 'change_shift' | 'change_role' | 'change_specialization';
  value?: string;
}

export const usersApi = {
  list(params?: UserListParams) {
    return getApiClient().get<PaginatedResponse<User>>('/api/users', { params });
  },

  create(payload: CreateUserPayload) {
    return getApiClient().post<ApiResponse<User>>('/api/users', payload);
  },

  update(userId: number, payload: UpdateUserPayload) {
    return getApiClient().put<ApiResponse<User>>(`/api/users/${userId}`, payload);
  },

  remove(userId: number) {
    return getApiClient().delete<ApiResponse>(`/api/users/${userId}`);
  },

  // Import endpoints - accepts File (web) or { uri, type, name } (React Native)
  import(file: File | { uri: string; type: string; name: string }) {
    const formData = new FormData();
    formData.append('file', file as any);
    return getApiClient().post<ApiResponse<ImportResult>>(
      '/api/users/import',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },

  downloadTemplate() {
    return getApiClient().get('/api/users/template', { responseType: 'blob' });
  },

  getImportHistory() {
    return getApiClient().get<ApiResponse<ImportLog[]>>('/api/users/import-history');
  },

  // Role swap endpoints
  swapRoles(userId: number) {
    return getApiClient().post<ApiResponse<User>>(`/api/users/${userId}/swap-roles`);
  },

  getSwapHistory(userId: number) {
    return getApiClient().get<ApiResponse<RoleSwapLog[]>>(`/api/users/${userId}/swap-history`);
  },

  // Stats and analytics
  getStats() {
    return getApiClient().get<ApiResponse<UserDashboardStats>>('/api/users/stats');
  },

  getWorkloadAnalysis() {
    return getApiClient().get<ApiResponse<WorkloadAnalysis>>('/api/users/workload');
  },

  // AI-powered search
  aiSearch(query: string) {
    return getApiClient().post<ApiResponse<AISearchResult[]> & { query: string; filters_applied: Record<string, string>; count: number }>('/api/users/ai-search', { query });
  },

  // Bulk actions
  bulkAction(payload: BulkActionPayload) {
    return getApiClient().post<ApiResponse<{ updated_count: number; errors: string[] | null }>>('/api/users/bulk-action', payload);
  },

  // User activity and stats
  getUserActivity(userId: number, limit?: number) {
    return getApiClient().get<ApiResponse<{ user_id: number; activity: Array<{ id: string; type: string; title: string; description: string | null; timestamp: string; entityId: number }> }>>(`/api/users/${userId}/activity`, { params: { limit } });
  },

  getUserStats(userId: number) {
    return getApiClient().get<ApiResponse<{ user_id: number; stats: { inspections_completed: number; defects_found: number; jobs_completed: number; average_rating: number; points_earned: number; on_time_completion_rate: number; quality_score: number } }>>(`/api/users/${userId}/stats`);
  },

  // Export
  exportUsers(includeInactive = false) {
    return getApiClient().get('/api/users/export', {
      params: { include_inactive: includeInactive },
      responseType: 'blob'
    });
  },
};
