import { ApiResponse, PaginatedResponse, PaginationParams, Equipment, CreateEquipmentPayload } from '../types';
export interface EquipmentListParams extends PaginationParams {
    status?: string;
    equipment_type?: string;
    search?: string;
}
export declare const equipmentApi: {
    list(params?: EquipmentListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<Equipment>, any, {}>>;
    get(id: number): Promise<import("axios").AxiosResponse<ApiResponse<Equipment>, any, {}>>;
    create(payload: CreateEquipmentPayload): Promise<import("axios").AxiosResponse<ApiResponse<Equipment>, any, {}>>;
    update(id: number, payload: Partial<CreateEquipmentPayload>): Promise<import("axios").AxiosResponse<ApiResponse<Equipment>, any, {}>>;
    remove(id: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=equipment.api.d.ts.map