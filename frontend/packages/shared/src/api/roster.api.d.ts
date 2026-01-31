import { ApiResponse } from '../types';
export interface RosterWeekUser {
    id: number;
    full_name: string;
    role: string;
    specialization: string | null;
    is_on_leave: boolean;
    entries: Record<string, string>;
}
export interface RosterWeekData {
    dates: string[];
    users: RosterWeekUser[];
}
export interface DayAvailabilityData {
    date: string;
    available: Array<{
        id: number;
        full_name: string;
        role: string;
        specialization: string | null;
        shift: string;
    }>;
    on_leave: Array<{
        id: number;
        full_name: string;
        role: string;
        specialization: string | null;
    }>;
    off: Array<{
        id: number;
        full_name: string;
        role: string;
        specialization: string | null;
    }>;
}
export interface UploadRosterResult {
    imported: number;
    users_processed: number;
    errors: string[];
}
export declare const rosterApi: {
    upload(file: File): Promise<import("axios").AxiosResponse<ApiResponse<UploadRosterResult>, any, {}>>;
    getWeek(date?: string): Promise<import("axios").AxiosResponse<ApiResponse<RosterWeekData>, any, {}>>;
    getDayAvailability(date: string, shift?: string): Promise<import("axios").AxiosResponse<ApiResponse<DayAvailabilityData>, any, {}>>;
};
//# sourceMappingURL=roster.api.d.ts.map