import { getApiClient } from './client';
import { ApiResponse } from '../types';
import {
  LeaderboardEntry,
  UserStats,
  LeaderboardAchievement,
  Challenge,
  PointHistoryEntry,
  AIInsight,
  RankPrediction,
  StreakInfo,
  TierInfo,
  PointBreakdown,
  HistoricalData,
  CreateChallengePayload,
  AwardPointsPayload,
} from '../types/leaderboard.types';

export interface LeaderboardParams {
  role?: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  limit?: number;
}

export interface HistoricalParams {
  userId?: number;
  period?: string;
  days?: number;
}

export interface PointHistoryParams {
  page?: number;
  limit?: number;
}

export const leaderboardsApi = {
  // Existing endpoints
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

  // New endpoints
  getMyRank() {
    return getApiClient().get<ApiResponse<LeaderboardEntry>>('/api/leaderboards/my-rank');
  },

  getUserStats(userId: number) {
    return getApiClient().get<ApiResponse<UserStats>>(`/api/leaderboards/users/${userId}/stats`);
  },

  getTeamLeaderboard() {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>('/api/leaderboards/team');
  },

  getHistorical(params: HistoricalParams) {
    return getApiClient().get<ApiResponse<HistoricalData[]>>('/api/leaderboards/historical', { params });
  },

  // Achievements
  getAchievements() {
    return getApiClient().get<ApiResponse<LeaderboardAchievement[]>>('/api/leaderboards/achievements');
  },

  getAchievement(id: number) {
    return getApiClient().get<ApiResponse<LeaderboardAchievement>>(`/api/leaderboards/achievements/${id}`);
  },

  getRecentAchievements() {
    return getApiClient().get<ApiResponse<LeaderboardAchievement[]>>('/api/leaderboards/achievements/recent');
  },

  // Challenges
  getChallenges() {
    return getApiClient().get<ApiResponse<Challenge[]>>('/api/leaderboards/challenges');
  },

  getChallenge(id: number) {
    return getApiClient().get<ApiResponse<Challenge>>(`/api/leaderboards/challenges/${id}`);
  },

  joinChallenge(id: number) {
    return getApiClient().post<ApiResponse<{ success: boolean }>>(`/api/leaderboards/challenges/${id}/join`);
  },

  leaveChallenge(id: number) {
    return getApiClient().post<ApiResponse<{ success: boolean }>>(`/api/leaderboards/challenges/${id}/leave`);
  },

  createChallenge(data: CreateChallengePayload) {
    return getApiClient().post<ApiResponse<Challenge>>('/api/leaderboards/challenges', data);
  },

  // Streaks
  getMyStreak() {
    return getApiClient().get<ApiResponse<StreakInfo>>('/api/leaderboards/streaks/me');
  },

  getStreakLeaderboard() {
    return getApiClient().get<ApiResponse<LeaderboardEntry[]>>('/api/leaderboards/streaks');
  },

  // Points
  getPointHistory(params?: PointHistoryParams) {
    return getApiClient().get<ApiResponse<{ items: PointHistoryEntry[]; total: number }>>('/api/leaderboards/points/history', { params });
  },

  getPointBreakdown(period?: string) {
    return getApiClient().get<ApiResponse<PointBreakdown[]>>('/api/leaderboards/points/breakdown', { params: { period } });
  },

  awardPoints(data: AwardPointsPayload) {
    return getApiClient().post<ApiResponse<{ success: boolean; new_total: number }>>('/api/leaderboards/points/award', data);
  },

  // AI
  getAIInsights() {
    return getApiClient().get<ApiResponse<AIInsight[]>>('/api/leaderboards/ai/insights');
  },

  getAITips() {
    return getApiClient().get<ApiResponse<string[]>>('/api/leaderboards/ai/tips');
  },

  getRankPrediction() {
    return getApiClient().get<ApiResponse<RankPrediction>>('/api/leaderboards/ai/predict-rank');
  },

  getSuggestedChallenges() {
    return getApiClient().get<ApiResponse<Challenge[]>>('/api/leaderboards/ai/suggested-challenges');
  },

  queryNaturalLanguage(query: string) {
    return getApiClient().post<ApiResponse<{ answer: string; data?: unknown }>>('/api/leaderboards/ai/query', { query });
  },

  getAnomalies() {
    return getApiClient().get<ApiResponse<AIInsight[]>>('/api/leaderboards/ai/anomalies');
  },

  // Levels
  getMyLevel() {
    return getApiClient().get<ApiResponse<{ level: number; xp: number; xp_to_next: number }>>('/api/leaderboards/levels/me');
  },

  getTierInfo() {
    return getApiClient().get<ApiResponse<TierInfo[]>>('/api/leaderboards/tiers');
  },
};
