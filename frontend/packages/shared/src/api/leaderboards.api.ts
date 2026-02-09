import { getApiClient } from './client';
import { ApiResponse } from '../types';

export interface LeaderboardParams {
  role?: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
}

export interface LeaderboardEntry {
  user_id: number;
  full_name: string;
  employee_id?: string;
  role_id?: string;
  role: string;
  total_points: number;
  points?: number;
  rank: number;
  specialization?: string;
}

export const leaderboardsApi = {
  getOverall(params?: LeaderboardParams) {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>('/api/leaderboards', { params });
  },

  getInspectors(params?: LeaderboardParams) {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>(
      '/api/leaderboards/inspectors',
      { params },
    );
  },

  getSpecialists(params?: LeaderboardParams) {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>(
      '/api/leaderboards/specialists',
      { params },
    );
  },

  getEngineers(params?: LeaderboardParams) {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>(
      '/api/leaderboards/engineers',
      { params },
    );
  },

  getQualityEngineers(params?: LeaderboardParams) {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>(
      '/api/leaderboards/quality-engineers',
      { params },
    );
  },
};
