export interface ApiResponse<T = unknown> {
  status: 'success' | 'error';
  message?: string;
  code?: string;
  data?: T;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface AuthResponse {
  status: 'success';
  access_token: string;
  refresh_token: string;
  user: import('./user.types').User;
}
