import { ApiResponse, PaginatedResponse, PaginationParams, User, CreateUserPayload, UpdateUserPayload } from '../types';
export interface UserListParams extends PaginationParams {
    role?: string;
    is_active?: boolean;
    search?: string;
}
export declare const usersApi: {
    list(params?: UserListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<User>, any, {}>>;
    create(payload: CreateUserPayload): Promise<import("axios").AxiosResponse<ApiResponse<User>, any, {}>>;
    update(userId: number, payload: UpdateUserPayload): Promise<import("axios").AxiosResponse<ApiResponse<User>, any, {}>>;
    remove(userId: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=users.api.d.ts.map