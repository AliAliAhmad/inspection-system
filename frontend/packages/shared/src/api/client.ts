import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { ITokenStorage } from '../utils/token-storage';

let apiClient: AxiosInstance;
let tokenStorage: ITokenStorage;
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else if (token) resolve(token);
  });
  failedQueue = [];
}

/**
 * Initialize the API client.
 * Must be called once at app startup with the appropriate token storage.
 */
export function initApiClient(baseURL: string, storage: ITokenStorage): AxiosInstance {
  tokenStorage = storage;

  apiClient = axios.create({
    baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // Request interceptor: attach token + language, handle FormData
  apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const token = await tokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Don't set Content-Type for FormData - let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  });

  // Response interceptor: handle 401 with token refresh
  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // Skip token refresh for auth endpoints (login, register, refresh)
      const isAuthEndpoint = originalRequest.url?.includes('/api/auth/');

      if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(apiClient(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await tokenStorage.getRefreshToken();
          if (!refreshToken) throw new Error('No refresh token');

          const { data } = await axios.post(`${apiClient.defaults.baseURL}/api/auth/refresh`, null, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          });

          const newToken = data.access_token;
          await tokenStorage.setAccessToken(newToken);
          processQueue(null, newToken);

          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          await tokenStorage.clear();
          // Redirect to login - handled by auth provider
          window?.dispatchEvent?.(new Event('auth:logout'));
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );

  return apiClient;
}

/**
 * Set the Accept-Language header for all requests.
 */
export function setLanguage(lang: 'en' | 'ar') {
  if (apiClient) {
    apiClient.defaults.headers['Accept-Language'] = lang;
  }
}

/**
 * Get the initialized API client.
 */
export function getApiClient(): AxiosInstance {
  if (!apiClient) throw new Error('API client not initialized. Call initApiClient() first.');
  return apiClient;
}

/**
 * Get the API base URL.
 */
export function getApiBaseUrl(): string {
  if (!apiClient) throw new Error('API client not initialized. Call initApiClient() first.');
  return apiClient.defaults.baseURL || '';
}

export { apiClient };
