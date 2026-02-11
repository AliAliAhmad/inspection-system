import { getApiClient } from './client';
import type {
  PerformanceGoal,
  PerformanceTrajectory,
  PerformanceSkillGap,
  BurnoutRisk,
  CoachingTip,
  PeerComparison,
  LearningPath,
} from '../types/performance-ai.types';
import type { ApiResponse } from '../types';

export const performanceApi = {
  // Trajectory & Analysis
  getTrajectory(userId: number, months?: number) {
    return getApiClient().get<ApiResponse<PerformanceTrajectory>>(
      `/api/performance/trajectory/${userId}`,
      { params: { months } }
    );
  },

  getSkillGaps(userId: number) {
    return getApiClient().get<ApiResponse<PerformanceSkillGap[]>>(`/api/performance/skill-gaps/${userId}`);
  },

  getBurnoutRisk(userId: number) {
    return getApiClient().get<ApiResponse<BurnoutRisk>>(`/api/performance/burnout-risk/${userId}`);
  },

  getCoachingTips(userId?: number) {
    const url = userId ? `/api/performance/coaching-tips/${userId}` : '/api/performance/coaching-tips';
    return getApiClient().get<ApiResponse<CoachingTip[]>>(url);
  },

  getPeerComparison(userId: number) {
    return getApiClient().get<ApiResponse<PeerComparison>>(`/api/performance/peer-comparison/${userId}`);
  },

  getLearningPath(userId: number) {
    return getApiClient().get<ApiResponse<LearningPath>>(`/api/performance/learning-path/${userId}`);
  },

  // Goals for current user (convenience methods)
  getMyGoals(params?: { status?: string }) {
    return getApiClient().get<ApiResponse<PerformanceGoal[]>>('/api/performance/my-goals', { params });
  },

  getMyRanking() {
    return getApiClient().get<ApiResponse<{ rank: number; total: number; percentile: number }>>('/api/performance/my-ranking');
  },

  // Goals CRUD
  listGoals(userId?: number) {
    return getApiClient().get<ApiResponse<PerformanceGoal[]>>('/api/performance/goals', {
      params: { user_id: userId },
    });
  },

  createGoal(data: { goal_type: string; target_value: number; end_date: string }) {
    return getApiClient().post<ApiResponse<PerformanceGoal>>('/api/performance/goals', data);
  },

  updateGoal(goalId: number, data: Partial<PerformanceGoal>) {
    return getApiClient().put<ApiResponse<PerformanceGoal>>(`/api/performance/goals/${goalId}`, data);
  },

  deleteGoal(goalId: number) {
    return getApiClient().delete<ApiResponse<{ success: boolean }>>(`/api/performance/goals/${goalId}`);
  },
};
