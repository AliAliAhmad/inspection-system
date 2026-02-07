import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Equipment,
  CreateEquipmentPayload,
  ImportLog,
  ImportResult,
} from '../types';

export interface EquipmentListParams extends PaginationParams {
  status?: string;
  equipment_type?: string;
  search?: string;
}

export const equipmentApi = {
  list(params?: EquipmentListParams) {
    return getApiClient().get<PaginatedResponse<Equipment>>('/api/equipment', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Equipment>>(`/api/equipment/${id}`);
  },

  create(payload: CreateEquipmentPayload) {
    return getApiClient().post<ApiResponse<Equipment>>('/api/equipment', payload);
  },

  update(id: number, payload: Partial<CreateEquipmentPayload>) {
    return getApiClient().put<ApiResponse<Equipment>>(`/api/equipment/${id}`, payload);
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/equipment/${id}`);
  },

  getTypes() {
    return getApiClient().get<ApiResponse<string[]>>('/api/equipment/types');
  },

  // Import endpoints - accepts File (web) or { uri, type, name } (React Native)
  import(file: File | { uri: string; type: string; name: string }) {
    const formData = new FormData();
    formData.append('file', file as any);
    return getApiClient().post<ApiResponse<ImportResult>>('/api/equipment/import', formData);
  },

  downloadTemplate() {
    return getApiClient().get('/api/equipment/template', { responseType: 'blob' });
  },

  getImportHistory() {
    return getApiClient().get<ApiResponse<ImportLog[]>>('/api/equipment/import-history');
  },

  // Dashboard endpoints
  getDashboard(params?: { status_color?: string; berth?: string }) {
    return getApiClient().get<ApiResponse<any>>('/api/equipment/dashboard', { params });
  },

  getDetails(id: number) {
    return getApiClient().get<ApiResponse<any>>(`/api/equipment/${id}/details`);
  },

  updateStatus(id: number, payload: { status: string; reason: string; next_action: string }) {
    return getApiClient().put<ApiResponse<Equipment>>(`/api/equipment/${id}/status`, payload);
  },

  getStatusHistory(id: number) {
    return getApiClient().get<ApiResponse<any[]>>(`/api/equipment/${id}/status-history`);
  },
};
