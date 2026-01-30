import { ApiResponse, PaginatedResponse, PaginationParams, Leave, LeaveStatus, LeaveRequestPayload, User } from '../types';
export interface LeaveListParams extends PaginationParams {
    status?: LeaveStatus;
}
export interface LeaveApprovePayload {
    notes?: string;
}
export interface LeaveRejectPayload {
    rejection_reason?: string;
}
export interface CapacityInfo {
    shift: string;
    total: number;
    available: number;
    on_leave: number;
}
export declare const leavesApi: {
    list(params?: LeaveListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<Leave>, any, {}>>;
    request(payload: LeaveRequestPayload): Promise<import("axios").AxiosResponse<ApiResponse<Leave>, any, {}>>;
    approve(leaveId: number, payload?: LeaveApprovePayload): Promise<import("axios").AxiosResponse<ApiResponse<Leave>, any, {}>>;
    reject(leaveId: number, payload?: LeaveRejectPayload): Promise<import("axios").AxiosResponse<ApiResponse<Leave>, any, {}>>;
    getActive(): Promise<import("axios").AxiosResponse<ApiResponse<Leave[]>, any, {}>>;
    getCoverageCandidates(leaveId: number): Promise<import("axios").AxiosResponse<ApiResponse<User[]>, any, {}>>;
    assignCoverage(leaveId: number, userId: number): Promise<import("axios").AxiosResponse<ApiResponse<Leave>, any, {}>>;
    getCapacity(shift?: string): Promise<import("axios").AxiosResponse<ApiResponse<CapacityInfo[]>, any, {}>>;
};
//# sourceMappingURL=leaves.api.d.ts.map