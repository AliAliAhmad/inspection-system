import { ApiResponse, Schedule } from '../types';
export interface CreateSchedulePayload {
    equipment_id: number;
    day_of_week: number;
    frequency: string;
    is_active?: boolean;
}
export declare const schedulesApi: {
    getToday(): Promise<import("axios").AxiosResponse<ApiResponse<Schedule[]>, any, {}>>;
    getWeekly(): Promise<import("axios").AxiosResponse<ApiResponse<Schedule[]>, any, {}>>;
    create(payload: CreateSchedulePayload): Promise<import("axios").AxiosResponse<ApiResponse<Schedule>, any, {}>>;
    remove(id: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=schedules.api.d.ts.map