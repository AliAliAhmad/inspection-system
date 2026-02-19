import { getApiClient } from './client';
import { ApiResponse, AuthResponse, User } from '../types';

export const authApi = {
  login(credentials: { email: string; password: string }) {
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

  registerPushToken(token: string) {
    return getApiClient().post<ApiResponse>('/api/auth/push-token', { token });
  },

  removePushToken() {
    return getApiClient().delete<ApiResponse>('/api/auth/push-token');
  },
};
