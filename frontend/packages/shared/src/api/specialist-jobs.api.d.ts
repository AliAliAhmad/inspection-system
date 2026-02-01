import { ApiResponse, PaginatedResponse, PaginationParams, SpecialistJob, PauseLog } from '../types';
export interface SpecialistJobListParams extends PaginationParams {
    status?: string;
    specialist_id?: number;
}
export interface CompleteJobPayload {
    work_notes?: string;
    completion_status?: 'pass' | 'incomplete';
}
export interface PauseRequestPayload {
    reason_category: 'parts' | 'duty_finish' | 'tools' | 'manpower' | 'oem' | 'error_record' | 'other';
    reason_details?: string;
}
export declare const specialistJobsApi: {
    list(params?: SpecialistJobListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<SpecialistJob>, any, {}>>;
    get(jobId: number): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    enterPlannedTime(jobId: number, hours: number): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    start(jobId: number, plannedTimeHours?: number): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    wrongFinding(jobId: number, reason: string, photoPath: string): Promise<import("axios").AxiosResponse<ApiResponse<{
        job: SpecialistJob;
        defect: unknown;
    }>, any, {}>>;
    complete(jobId: number, payload: CompleteJobPayload): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    markIncomplete(jobId: number, reason: string): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    requestPause(jobId: number, payload: PauseRequestPayload): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog>, any, {}>>;
    getPauseHistory(jobId: number): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog[]>, any, {}>>;
    uploadCleaning(jobId: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
    adminForcePause(jobId: number, reason?: string): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog>, any, {}>>;
    adminCleaningRating(jobId: number, rating: number): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    adminBonus(jobId: number, bonus: number): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob>, any, {}>>;
    getPendingPauses(): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog[]>, any, {}>>;
    approvePause(pauseId: number): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog>, any, {}>>;
    denyPause(pauseId: number): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog>, any, {}>>;
    resumeJob(pauseId: number): Promise<import("axios").AxiosResponse<ApiResponse<PauseLog>, any, {}>>;
    getStalledJobs(): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob[]>, any, {}>>;
    requestTakeover(jobId: number, reason?: string): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
    getPendingPlannedTime(): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob[]>, any, {}>>;
    getActiveJobs(): Promise<import("axios").AxiosResponse<ApiResponse<SpecialistJob[]>, any, {}>>;
};
//# sourceMappingURL=specialist-jobs.api.d.ts.map