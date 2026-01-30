import { getApiClient } from './client';
import { ApiResponse, AuthResponse, User } from '../types';

export const authApi = {
  login(credentials: { username: string; password: string }) {
    return getApiClient().post<AuthResponse>('/api/auth/login', credentials);
  },

  refresh() {
    return getApiClient().post<AuthResponse>('/api/auth/refresh');
  },

  getProfile() {
    return getApiClient().get<ApiResponse<User>>('/api/auth/me');
  },

  logout() {
    return getApiClient().post<ApiResponse>('/api/auth/logout');
  },
};
