import { ApiResponse } from '../types';
export interface InspectionRoutine {
    id: number;
    name: string;
    name_ar: string | null;
    asset_types: string[];
    template_id: number;
    is_active: boolean;
    created_at: string;
}
export interface CreateRoutinePayload {
    name: string;
    name_ar?: string;
    asset_types: string[];
    template_id: number;
}
export interface UploadScheduleResult {
    created: number;
    equipment_processed: number;
    errors: string[];
}
export declare const inspectionRoutinesApi: {
    list(): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRoutine[]>, any, {}>>;
    create(payload: CreateRoutinePayload): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRoutine>, any, {}>>;
    update(id: number, payload: Partial<CreateRoutinePayload & {
        is_active: boolean;
    }>): Promise<import("axios").AxiosResponse<ApiResponse<InspectionRoutine>, any, {}>>;
    delete(id: number): Promise<import("axios").AxiosResponse<ApiResponse<void>, any, {}>>;
    uploadSchedule(file: File): Promise<import("axios").AxiosResponse<ApiResponse<UploadScheduleResult>, any, {}>>;
};
//# sourceMappingURL=inspection-routines.api.d.ts.map