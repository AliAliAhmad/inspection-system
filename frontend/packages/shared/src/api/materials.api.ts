import { getApiClient } from './client';
import { ApiResponse } from '../types';
import {
  Material,
  MaterialKit,
  CreateMaterialPayload,
  CreateMaterialKitPayload,
} from '../types/work-plan.types';

export interface MaterialListParams {
  category?: string;
  low_stock?: boolean;
  search?: string;
  active_only?: boolean;
}

export interface MaterialsListResponse {
  status: string;
  materials: Material[];
  count: number;
}

export interface KitsListResponse {
  status: string;
  kits: MaterialKit[];
  count: number;
}

export interface LowStockResponse {
  status: string;
  low_stock_count: number;
  low_stock_materials: Material[];
}

export interface ImportResponse {
  status: string;
  message: string;
  created: number;
  updated: number;
  errors: string[];
}

export const materialsApi = {
  // Materials
  list(params?: MaterialListParams) {
    return getApiClient().get<MaterialsListResponse>('/api/materials', { params });
  },

  get(materialId: number) {
    return getApiClient().get<ApiResponse<Material>>('/api/materials/' + materialId);
  },

  create(payload: CreateMaterialPayload) {
    return getApiClient().post<ApiResponse<Material>>('/api/materials', payload);
  },

  update(materialId: number, payload: Partial<CreateMaterialPayload> & { is_active?: boolean }) {
    return getApiClient().put<ApiResponse<Material>>('/api/materials/' + materialId, payload);
  },

  consume(materialId: number, quantity: number) {
    return getApiClient().post<ApiResponse<Material>>(`/api/materials/${materialId}/consume`, { quantity });
  },

  checkLowStock() {
    return getApiClient().post<LowStockResponse>('/api/materials/stock-check');
  },

  import(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return getApiClient().post<ImportResponse>('/api/materials/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Material Kits
  listKits(params?: { equipment_type?: string; active_only?: boolean }) {
    return getApiClient().get<KitsListResponse>('/api/materials/kits', { params });
  },

  getKit(kitId: number) {
    return getApiClient().get<ApiResponse<MaterialKit>>('/api/materials/kits/' + kitId);
  },

  createKit(payload: CreateMaterialKitPayload) {
    return getApiClient().post<ApiResponse<MaterialKit>>('/api/materials/kits', payload);
  },

  updateKit(kitId: number, payload: Partial<CreateMaterialKitPayload> & { is_active?: boolean }) {
    return getApiClient().put<ApiResponse<MaterialKit>>('/api/materials/kits/' + kitId, payload);
  },

  deleteKit(kitId: number) {
    return getApiClient().delete<ApiResponse<void>>('/api/materials/kits/' + kitId);
  },
};
