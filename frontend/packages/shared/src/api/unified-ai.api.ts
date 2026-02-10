/**
 * Unified AI API Client
 * Provides AI-powered features for Approvals, Quality Reviews, and Inspection Routines.
 */

import { apiClient } from './client';
import type { ApiResponse } from '../types/api-response.types';
import type {
  RiskResult,
  AnomalyResult,
  PredictionResult,
  Recommendation,
  Trend,
  ComprehensiveAnalysis,
} from '../types/ai-base.types';

// ============================================================================
// TYPES
// ============================================================================

export type ApprovalType = 'leave' | 'pause' | 'takeover' | 'bonus';

export interface AutoApproveCheckResult {
  can_auto_approve: boolean;
  risk_score: number;
  risk_level: string;
  threshold: number;
  recommendations?: Recommendation[];
  error?: string;
}

export interface BulkEvaluateItem {
  type: ApprovalType;
  id: number;
}

export interface BulkEvaluateResult {
  type: ApprovalType;
  id: number;
  can_auto_approve?: boolean;
  risk_score?: number;
  risk_level?: string;
  error?: string;
}

export interface BulkEvaluateResponse {
  results: BulkEvaluateResult[];
  summary: {
    total: number;
    can_auto_approve: number;
    needs_review: number;
  };
}

export interface QualityReviewBulkEvaluateResponse {
  results: Array<{
    review_id: number;
    can_auto_approve?: boolean;
    risk_score?: number;
    risk_level?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    can_auto_approve: number;
    needs_review: number;
  };
}

export interface AIDashboardStats {
  approvals: {
    pending_leaves: number;
    auto_approvable_estimate: number;
  };
  quality_reviews: {
    pending_reviews: number;
    auto_approvable_estimate: number;
  };
  inspection_routines: {
    active_routines: number;
    high_risk_count: number;
  };
  generated_at: string;
}

// ============================================================================
// APPROVAL AI API
// ============================================================================

export const approvalAIApi = {
  /**
   * Get risk score for an approval request.
   */
  getRisk: (type: ApprovalType, entityId: number) =>
    apiClient.get<ApiResponse<RiskResult>>(
      `/api/ai/approvals/${type}/${entityId}/risk`
    ),

  /**
   * Check if an approval can be auto-approved.
   */
  checkAutoApprove: (type: ApprovalType, entityId: number, threshold?: number) =>
    apiClient.get<ApiResponse<AutoApproveCheckResult>>(
      `/api/ai/approvals/${type}/${entityId}/auto-approve-check`,
      { params: { threshold } }
    ),

  /**
   * Detect anomalies in approval patterns.
   */
  getAnomalies: (type: ApprovalType, entityId: number, lookbackDays?: number) =>
    apiClient.get<ApiResponse<AnomalyResult>>(
      `/api/ai/approvals/${type}/${entityId}/anomalies`,
      { params: { lookback_days: lookbackDays } }
    ),

  /**
   * Get predictions for an approval request.
   */
  getPredictions: (type: ApprovalType, entityId: number) =>
    apiClient.get<ApiResponse<PredictionResult>>(
      `/api/ai/approvals/${type}/${entityId}/predictions`
    ),

  /**
   * Get AI recommendations for an approval decision.
   */
  getRecommendations: (type: ApprovalType, entityId: number, max?: number) =>
    apiClient.get<ApiResponse<Recommendation[]>>(
      `/api/ai/approvals/${type}/${entityId}/recommendations`,
      { params: { max } }
    ),

  /**
   * Get comprehensive AI analysis for an approval.
   */
  getFullAnalysis: (type: ApprovalType, entityId: number) =>
    apiClient.get<ApiResponse<ComprehensiveAnalysis>>(
      `/api/ai/approvals/${type}/${entityId}/analysis`
    ),

  /**
   * Evaluate multiple approvals for auto-approval eligibility.
   */
  bulkEvaluate: (items: BulkEvaluateItem[], threshold?: number) =>
    apiClient.post<ApiResponse<BulkEvaluateResponse>>(
      '/api/ai/approvals/bulk-evaluate',
      { items, threshold }
    ),
};

// ============================================================================
// QUALITY REVIEW AI API
// ============================================================================

export const qualityReviewAIApi = {
  /**
   * Get risk score for a quality review.
   */
  getRisk: (reviewId: number) =>
    apiClient.get<ApiResponse<RiskResult>>(
      `/api/ai/quality-reviews/${reviewId}/risk`
    ),

  /**
   * Check if a quality review can be auto-approved.
   */
  checkAutoApprove: (reviewId: number, threshold?: number) =>
    apiClient.get<ApiResponse<AutoApproveCheckResult>>(
      `/api/ai/quality-reviews/${reviewId}/auto-approve-check`,
      { params: { threshold } }
    ),

  /**
   * Get predictions for a quality review.
   */
  getPredictions: (reviewId: number) =>
    apiClient.get<ApiResponse<PredictionResult>>(
      `/api/ai/quality-reviews/${reviewId}/predictions`
    ),

  /**
   * Get trend analysis for quality reviews.
   */
  getTrends: (reviewId: number, period?: 'monthly' | 'weekly' | 'daily') =>
    apiClient.get<ApiResponse<Trend[]>>(
      `/api/ai/quality-reviews/${reviewId}/trends`,
      { params: { period } }
    ),

  /**
   * Get comprehensive AI analysis for a quality review.
   */
  getFullAnalysis: (reviewId: number) =>
    apiClient.get<ApiResponse<ComprehensiveAnalysis>>(
      `/api/ai/quality-reviews/${reviewId}/analysis`
    ),

  /**
   * Evaluate multiple quality reviews for auto-approval eligibility.
   */
  bulkEvaluate: (reviewIds: number[], threshold?: number) =>
    apiClient.post<ApiResponse<QualityReviewBulkEvaluateResponse>>(
      '/api/ai/quality-reviews/bulk-evaluate',
      { review_ids: reviewIds, threshold }
    ),
};

// ============================================================================
// INSPECTION ROUTINE AI API
// ============================================================================

export const inspectionRoutineAIApi = {
  /**
   * Get compliance risk for an inspection routine.
   */
  getComplianceRisk: (routineId: number) =>
    apiClient.get<ApiResponse<RiskResult>>(
      `/api/ai/inspection-routines/${routineId}/compliance-risk`
    ),

  /**
   * Predict completion rate for an inspection routine.
   */
  predictCompletion: (routineId: number, days?: number) =>
    apiClient.get<ApiResponse<PredictionResult>>(
      `/api/ai/inspection-routines/${routineId}/predict-completion`,
      { params: { days } }
    ),

  /**
   * Get comprehensive AI analysis for an inspection routine.
   */
  getFullAnalysis: (routineId: number) =>
    apiClient.get<ApiResponse<ComprehensiveAnalysis>>(
      `/api/ai/inspection-routines/${routineId}/analysis`
    ),
};

// ============================================================================
// DASHBOARD API
// ============================================================================

export const aiDashboardApi = {
  /**
   * Get AI dashboard statistics.
   */
  getStats: () =>
    apiClient.get<ApiResponse<AIDashboardStats>>('/api/ai/dashboard/stats'),
};

// ============================================================================
// UNIFIED EXPORT
// ============================================================================

export const unifiedAIApi = {
  approvals: approvalAIApi,
  qualityReviews: qualityReviewAIApi,
  inspectionRoutines: inspectionRoutineAIApi,
  dashboard: aiDashboardApi,
};

export default unifiedAIApi;
