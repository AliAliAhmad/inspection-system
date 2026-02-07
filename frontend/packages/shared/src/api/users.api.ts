import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  User,
  CreateUserPayload,
  UpdateUserPayload,
  ImportLog,
  RoleSwapLog,
  ImportResult,
} from '../types';

export interface UserListParams extends PaginationParams {
  role?: string;
  is_active?: boolean;
  search?: string;
}

export const usersApi = {
  list(params?: UserListParams) {
    return getApiClient().get<PaginatedResponse<User>>('/api/users', { params });
  },

  create(payload: CreateUserPayload) {
    return getApiClient().post<ApiResponse<User>>('/api/users', payload);
  },

  update(userId: number, payload: UpdateUserPayload) {
    return getApiClient().put<ApiResponse<User>>(`/api/users/${userId}`, payload);
  },

  remove(userId: number) {
    return getApiClient().delete<ApiResponse>(`/api/users/${userId}`);
  },

  // Import endpoints
  import(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ApiResponse<ImportResult>>('/api/users/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  downloadTemplate() {
    return getApiClient().get('/api/users/template', { responseType: 'blob' });
  },

  getImportHistory() {
    return getApiClient().get<ApiResponse<ImportLog[]>>('/api/users/import-history');
  },

  // Role swap endpoints
  swapRoles(userId: number) {
    return getApiClient().post<ApiResponse<User>>(`/api/users/${userId}/swap-roles`);
  },

  getSwapHistory(userId: number) {
    return getApiClient().get<ApiResponse<RoleSwapLog[]>>(`/api/users/${userId}/swap-history`);
  },
};
