import { ApiResponse, PaginatedResponse, PaginationParams, EngineerJob, CreateEngineerJobPayload } from '../types';
export interface EngineerJobListParams extends PaginationParams {
    status?: string;
    engineer_id?: number;
}
export interface EngineerPlannedTimePayload {
    planned_time_days?: number;
    planned_time_hours?: number;
}
export interface EngineerCompletePayload {
    work_notes?: string;
    completion_status?: string;
}
export declare const engineerJobsApi: {
    list(params?: EngineerJobListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<EngineerJob>, any, {}>>;
    get(jobId: number): Promise<import("axios").AxiosResponse<ApiResponse<EngineerJob>, any, {}>>;
    create(payload: CreateEngineerJobPayload): Promise<import("axios").AxiosResponse<ApiResponse<EngineerJob>, any, {}>>;
    enterPlannedTime(jobId: number, payload: EngineerPlannedTimePayload): Promise<import("axios").AxiosResponse<ApiResponse<EngineerJob>, any, {}>>;
    start(jobId: number): Promise<import("axios").AxiosResponse<ApiResponse<EngineerJob>, any, {}>>;
    complete(jobId: number, payload: EngineerCompletePayload): Promise<import("axios").AxiosResponse<ApiResponse<EngineerJob>, any, {}>>;
};
//# sourceMappingURL=engineer-jobs.api.d.ts.map