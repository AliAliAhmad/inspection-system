import { ApiResponse, PaginatedResponse, PaginationParams, QualityReview, ReviewStatus, RejectionCategory } from '../types';
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
export declare const qualityReviewsApi: {
    list(params?: QualityReviewListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<QualityReview>, any, {}>>;
    get(reviewId: number): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview>, any, {}>>;
    getPending(): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview[]>, any, {}>>;
    getOverdue(): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview[]>, any, {}>>;
    approve(reviewId: number, payload: ApprovePayload): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview>, any, {}>>;
    reject(reviewId: number, payload: RejectPayload): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview>, any, {}>>;
    validate(reviewId: number, payload: ValidatePayload): Promise<import("axios").AxiosResponse<ApiResponse<QualityReview>, any, {}>>;
};
//# sourceMappingURL=quality-reviews.api.d.ts.map