import { ApiResponse, PaginatedResponse, PaginationParams, FinalAssessment, Verdict } from '../types';
export interface AssessmentListParams extends PaginationParams {
    status?: string;
    equipment_id?: number;
}
export interface VerdictPayload {
    verdict: Verdict;
    urgent_reason?: string;
}
export interface AdminResolvePayload {
    final_status: Verdict;
    admin_decision_notes?: string;
}
export declare const assessmentsApi: {
    list(params?: AssessmentListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<FinalAssessment>, any, {}>>;
    get(id: number): Promise<import("axios").AxiosResponse<ApiResponse<FinalAssessment>, any, {}>>;
    create(assignmentId: number): Promise<import("axios").AxiosResponse<ApiResponse<FinalAssessment>, any, {}>>;
    submitVerdict(id: number, payload: VerdictPayload): Promise<import("axios").AxiosResponse<ApiResponse<FinalAssessment>, any, {}>>;
    adminResolve(id: number, payload: AdminResolvePayload): Promise<import("axios").AxiosResponse<ApiResponse<FinalAssessment>, any, {}>>;
    getPending(): Promise<import("axios").AxiosResponse<ApiResponse<FinalAssessment[]>, any, {}>>;
};
//# sourceMappingURL=assessments.api.d.ts.map