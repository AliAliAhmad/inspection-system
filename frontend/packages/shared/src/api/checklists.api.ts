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
  description?: string;
  is_active?: boolean;
}

export interface CreateChecklistItemPayload {
  question_text: string;
  question_text_ar?: string;
  answer_type: 'yes_no' | 'rating' | 'text' | 'number';
  category?: 'mechanical' | 'electrical';
  is_critical?: boolean;
  order?: number;
}

export interface UpdateChecklistItemPayload extends Partial<CreateChecklistItemPayload> {}

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
};
