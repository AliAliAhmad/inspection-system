import { ApiResponse, PaginatedResponse, PaginationParams, Inspection, AnswerPayload, InspectionProgress } from '../types';
export interface InspectionListParams extends PaginationParams {
    status?: string;
    technician_id?: number;
    equipment_id?: number;
}
export interface StartInspectionPayload {
    equipment_id: number;
    template_id: number;
}
export interface ReviewPayload {
    result: 'pass' | 'fail' | 'incomplete';
    notes?: string;
}
export declare const inspectionsApi: {
    list(params?: InspectionListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<Inspection>, any, {}>>;
    get(id: number): Promise<import("axios").AxiosResponse<ApiResponse<Inspection>, any, {}>>;
    start(payload: StartInspectionPayload): Promise<import("axios").AxiosResponse<ApiResponse<Inspection>, any, {}>>;
    answerQuestion(id: number, payload: AnswerPayload): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
    getProgress(id: number): Promise<import("axios").AxiosResponse<ApiResponse<InspectionProgress>, any, {}>>;
    submit(id: number): Promise<import("axios").AxiosResponse<ApiResponse<Inspection>, any, {}>>;
    review(id: number, payload: ReviewPayload): Promise<import("axios").AxiosResponse<ApiResponse<Inspection>, any, {}>>;
    remove(id: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=inspections.api.d.ts.map