import { ApiResponse, PaginatedResponse, PaginationParams, Notification } from '../types';
export interface NotificationListParams extends PaginationParams {
    unread_only?: boolean;
}
export declare const notificationsApi: {
    list(params?: NotificationListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<Notification>, any, {}>>;
    markRead(id: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
    markAllRead(): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
    remove(id: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=notifications.api.d.ts.map