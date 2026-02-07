import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  ChecklistTemplate,
  ChecklistItem,
} from '../types';

export interface ChecklistListParams extends PaginationParams {
  is_active?: boolean;
  search?: string;
}

export interface CreateTemplatePayload {
  name: string;
  name_ar?: string;
  function: string;
  assembly: string;
  part?: string;
  description: string;
  version: string;
  is_active?: boolean;
}

export interface CreateChecklistItemPayload {
  question_text: string;
  question_text_ar?: string;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  category?: 'mechanical' | 'electrical';
  critical_failure?: boolean;
}

export interface UpdateChecklistItemPayload extends Partial<CreateChecklistItemPayload> {}

export interface ImportResult {
  template: ChecklistTemplate;
  items_count: number;
}

export const checklistsApi = {
  listTemplates(params?: ChecklistListParams) {
    return getApiClient().get<PaginatedResponse<ChecklistTemplate>>('/api/checklists', { params });
  },

  createTemplate(payload: CreateTemplatePayload) {
    return getApiClient().post<ApiResponse<ChecklistTemplate>>('/api/checklists', payload);
  },

  addItem(templateId: number, payload: CreateChecklistItemPayload) {
    return getApiClient().post<ApiResponse<ChecklistItem>>(
      `/api/checklists/${templateId}/items`,
      payload,
    );
  },

  updateItem(templateId: number, itemId: number, payload: UpdateChecklistItemPayload) {
    return getApiClient().put<ApiResponse<ChecklistItem>>(
      `/api/checklists/${templateId}/items/${itemId}`,
      payload,
    );
  },

  deleteItem(templateId: number, itemId: number) {
    return getApiClient().delete<ApiResponse>(
      `/api/checklists/${templateId}/items/${itemId}`,
    );
  },

  downloadTemplate() {
    return getApiClient().get('/api/checklists/download-template', {
      responseType: 'blob',
    });
  },

  import(file: File | { uri: string; type: string; name: string }) {
    const formData = new FormData();
    formData.append('file', file as any);
    return getApiClient().post<ApiResponse<ImportResult>>(
      '/api/checklists/import',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
};
