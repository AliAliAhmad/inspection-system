import { ApiResponse } from '../types';
export interface LeaderboardParams {
    role?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
}
export interface LeaderboardEntry {
    user_id: number;
    full_name: string;
    employee_id: string;
    role: string;
    total_points: number;
    rank: number;
}
export declare const leaderboardsApi: {
    getOverall(params?: LeaderboardParams): Promise<import("axios").AxiosResponse<ApiResponse<LeaderboardEntry[]>, any, {}>>;
    getInspectors(params?: LeaderboardParams): Promise<import("axios").AxiosResponse<ApiResponse<LeaderboardEntry[]>, any, {}>>;
    getSpecialists(params?: LeaderboardParams): Promise<import("axios").AxiosResponse<ApiResponse<LeaderboardEntry[]>, any, {}>>;
    getEngineers(params?: LeaderboardParams): Promise<import("axios").AxiosResponse<ApiResponse<LeaderboardEntry[]>, any, {}>>;
    getQualityEngineers(params?: LeaderboardParams): Promise<import("axios").AxiosResponse<ApiResponse<LeaderboardEntry[]>, any, {}>>;
};
//# sourceMappingURL=leaderboards.api.d.ts.map