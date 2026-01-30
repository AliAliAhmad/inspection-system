import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  QualityReview,
  ReviewStatus,
  RejectionCategory,
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
};
