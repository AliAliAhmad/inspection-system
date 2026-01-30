import { ApiResponse } from '../types';
export interface DashboardData {
    total_inspections: number;
    pending_defects: number;
    active_jobs: number;
    completion_rate: number;
    [key: string]: unknown;
}
export interface AdminDashboardData {
    users_count: number;
    equipment_count: number;
    inspections_today: number;
    open_defects: number;
    active_leaves: number;
    [key: string]: unknown;
}
export interface PauseAnalytics {
    total_pauses: number;
    average_duration_minutes: number;
    by_category: Record<string, number>;
    [key: string]: unknown;
}
export interface DefectAnalytics {
    total_defects: number;
    by_severity: Record<string, number>;
    by_status: Record<string, number>;
    [key: string]: unknown;
}
export interface CapacityData {
    total_staff: number;
    available: number;
    on_leave: number;
    utilization_rate: number;
    [key: string]: unknown;
}
export declare const reportsApi: {
    getDashboard(): Promise<import("axios").AxiosResponse<ApiResponse<DashboardData>, any, {}>>;
    getAdminDashboard(): Promise<import("axios").AxiosResponse<ApiResponse<AdminDashboardData>, any, {}>>;
    getPauseAnalytics(): Promise<import("axios").AxiosResponse<ApiResponse<PauseAnalytics>, any, {}>>;
    getDefectAnalytics(): Promise<import("axios").AxiosResponse<ApiResponse<DefectAnalytics>, any, {}>>;
    getCapacity(): Promise<import("axios").AxiosResponse<ApiResponse<CapacityData>, any, {}>>;
};
//# sourceMappingURL=reports.api.d.ts.map