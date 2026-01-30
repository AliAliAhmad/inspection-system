import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  User,
  CreateUserPayload,
  UpdateUserPayload,
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
};
