import { getApiClient } from './client';
import type {
  RatingSuggestion,
  RatingBiasResult,
  FeedbackSummary,
  IncompleteJobPrediction,
  TimeAccuracyAnalysis,
} from '../types/daily-review-ai.types';
import type { ApiResponse } from '../types';

export const dailyReviewAIApi = {
  suggestRatings(reviewId: number) {
    return getApiClient().get<ApiResponse<RatingSuggestion[]>>(
      `/api/work-plan-tracking/${reviewId}/ai/suggest-ratings`
    );
  },

  applyAIRatings(
    reviewId: number,
    overrides?: Record<string, { qc_rating?: number; cleaning_rating?: number }>
  ) {
    return getApiClient().post<ApiResponse<{ success: boolean; ratings_applied: number }>>(
      `/api/work-plan-tracking/${reviewId}/ai/auto-rate`,
      { overrides }
    );
  },

  checkBias(engineerId: number, days?: number) {
    return getApiClient().get<ApiResponse<RatingBiasResult>>(
      `/api/work-plan-tracking/ai/bias-check/${engineerId}`,
      { params: { days } }
    );
  },

  getFeedbackSummary(userId: number, period?: string) {
    return getApiClient().get<ApiResponse<FeedbackSummary>>(
      `/api/work-plan-tracking/ai/feedback-summary/${userId}`,
      { params: { period } }
    );
  },

  predictIncomplete(date?: string) {
    return getApiClient().get<ApiResponse<IncompleteJobPrediction[]>>(
      '/api/work-plan-tracking/ai/predict-incomplete',
      { params: { date } }
    );
  },

  analyzeTimeAccuracy(days?: number) {
    return getApiClient().get<ApiResponse<TimeAccuracyAnalysis>>(
      '/api/work-plan-tracking/ai/time-accuracy',
      { params: { days } }
    );
  },
};
