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

  // Summary endpoint
  getSummary(userId: number) {
    return getApiClient().get<ApiResponse<{
      user_id: number;
      trajectory: PerformanceTrajectory;
      skill_gaps: PerformanceSkillGap[];
      burnout_risk: BurnoutRisk;
      goals: PerformanceGoal[];
      coaching_tips: CoachingTip[];
      insights: Array<{ id: string; type: string; title: string; description: string }>;
    }>>(`/api/performance/summary/${userId}`);
  },

  // Intervention endpoints
  suggestLeave(data: { user_id: number; days: number; reason?: string }) {
    return getApiClient().post<ApiResponse<{
      leave: { id: number; status: string; date_from: string; date_to: string };
      burnout_risk: BurnoutRisk;
      recommendation: { title: string; description: string };
    }>>('/api/performance/interventions/leave', data);
  },

  reduceWorkload(data: { user_id: number; reduction_percentage: number; target_user_id?: number }) {
    return getApiClient().post<ApiResponse<{
      user_id: number;
      user_name: string;
      jobs_reassigned: Array<{ job_id: number; from_user_id: number; to_user_id: number; to_user_name: string }>;
      reduction_percentage: number;
      burnout_risk: BurnoutRisk;
      recommendation: { title: string; description: string };
    }>>('/api/performance/interventions/workload', data);
  },
};
