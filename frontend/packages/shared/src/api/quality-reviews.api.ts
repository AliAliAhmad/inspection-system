import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  QualityReview,
  ReviewStatus,
  RejectionCategory,
  QualityReviewStats,
  SLAReport,
  QualityTrend,
  ReviewTemplate,
} from '../types';

export interface QualityReviewListParams extends PaginationParams {
  status?: ReviewStatus;
}

export interface ApprovePayload {
  notes?: string;
}

export interface RejectPayload {
  rejection_reason: string;
  rejection_category: RejectionCategory;
  notes?: string;
  evidence_notes?: string;
}

export interface ValidatePayload {
  admin_validation: 'valid' | 'wrong';
  admin_validation_notes?: string;
}

export interface QualityReviewStatsParams {
  period?: string;
}

export interface CreateTemplatePayload {
  name: string;
  category: string;
  response_text: string;
  is_approval: boolean;
}

export interface AIAnalysisResult {
  patterns: Array<{ pattern: string; frequency: number; severity: string }>;
  recommendations: string[];
  predicted_rejection_rate: number;
  high_risk_areas: string[];
}

export const qualityReviewsApi = {
  list(params?: QualityReviewListParams) {
    return getApiClient().get<PaginatedResponse<QualityReview>>('/api/quality-reviews', { params });
  },

  get(reviewId: number) {
    return getApiClient().get<ApiResponse<QualityReview>>(`/api/quality-reviews/${reviewId}`);
  },

  getPending() {
    return getApiClient().get<ApiResponse<QualityReview[]>>('/api/quality-reviews/pending');
  },

  getOverdue() {
    return getApiClient().get<ApiResponse<QualityReview[]>>('/api/quality-reviews/overdue');
  },

  approve(reviewId: number, payload: ApprovePayload) {
    return getApiClient().post<ApiResponse<QualityReview>>(
      `/api/quality-reviews/${reviewId}/approve`,
      payload,
    );
  },

  reject(reviewId: number, payload: RejectPayload) {
    return getApiClient().post<ApiResponse<QualityReview>>(
      `/api/quality-reviews/${reviewId}/reject`,
      payload,
    );
  },

  validate(reviewId: number, payload: ValidatePayload) {
    return getApiClient().post<ApiResponse<QualityReview>>(
      `/api/quality-reviews/${reviewId}/validate`,
      payload,
    );
  },

  getStats(params?: QualityReviewStatsParams) {
    return getApiClient().get<ApiResponse<QualityReviewStats>>('/api/quality-reviews/stats', {
      params,
    });
  },

  getSLAReport(period?: string) {
    return getApiClient().get<ApiResponse<SLAReport>>('/api/quality-reviews/sla-report', {
      params: period ? { period } : undefined,
    });
  },

  getTrends(period?: string) {
    return getApiClient().get<ApiResponse<QualityTrend>>('/api/quality-reviews/trends', {
      params: period ? { period } : undefined,
    });
  },

  getTemplates() {
    return getApiClient().get<ApiResponse<ReviewTemplate[]>>('/api/quality-reviews/templates');
  },

  createTemplate(template: CreateTemplatePayload) {
    return getApiClient().post<ApiResponse<ReviewTemplate>>(
      '/api/quality-reviews/templates',
      template,
    );
  },

  getAIAnalysis() {
    return getApiClient().get<ApiResponse<AIAnalysisResult>>('/api/quality-reviews/ai-analysis');
  },
};
