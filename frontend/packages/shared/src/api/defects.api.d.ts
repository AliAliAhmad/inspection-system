import { ApiResponse, PaginatedResponse, PaginationParams, Defect, DefectStatus, DefectSeverity } from '../types';
export interface DefectListParams extends PaginationParams {
    status?: DefectStatus;
    severity?: DefectSeverity;
}
export declare const defectsApi: {
    list(params?: DefectListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<Defect>, any, {}>>;
    resolve(id: number): Promise<import("axios").AxiosResponse<ApiResponse<Defect>, any, {}>>;
    close(id: number): Promise<import("axios").AxiosResponse<ApiResponse<Defect>, any, {}>>;
};
//# sourceMappingURL=defects.api.d.ts.map