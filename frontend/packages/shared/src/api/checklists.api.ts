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

// Stats and Analytics Types
export interface ChecklistStats {
  total_templates: number;
  active_templates: number;
  total_items: number;
  avg_items_per_template: number;
  critical_items: number;
  critical_ratio: number;
  by_category: Record<string, number>;
  by_answer_type: Record<string, number>;
  by_equipment: Record<string, number>;
  most_used: Array<{ id: number; name: string; usage_count: number }>;
  defect_correlation: Array<{ item_id: number; question: string; defect_count: number }>;
}

export interface TemplateAnalytics {
  template_id: number;
  template_name: string;
  item_count: number;
  critical_count: number;
  usage: {
    total: number;
    completed: number;
    recent_30_days: number;
    completion_rate: number;
  };
  defects_found: number;
  defect_rate: number;
  coverage: {
    mechanical_ratio: number;
    electrical_ratio: number;
    critical_ratio: number;
    balance_score: number;
  };
  items: Array<{
    id: number;
    item_code: string;
    question: string;
    category: string;
    answer_type: string;
    critical: boolean;
    defects_triggered: number;
  }>;
}

export interface AIGeneratePayload {
  equipment_type: string;
  description?: string;
  include_electrical?: boolean;
  include_mechanical?: boolean;
}

export interface AISuggestion {
  question_text: string;
  question_text_ar: string;
  category: 'mechanical' | 'electrical';
  answer_type: string;
  critical_failure: boolean;
}

export interface SearchResult {
  templates: ChecklistTemplate[];
  matching_items: Array<{
    id: number;
    template_id: number;
    template_name: string;
    question: string;
    category: string;
  }>;
  total_templates: number;
  total_items: number;
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

  deleteTemplate(templateId: number) {
    return getApiClient().delete<ApiResponse>(
      `/api/checklists/${templateId}`,
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

  // Stats and Analytics
  getStats() {
    return getApiClient().get<ApiResponse<ChecklistStats>>('/api/checklists/stats');
  },

  getTemplateAnalytics(templateId: number) {
    return getApiClient().get<ApiResponse<TemplateAnalytics>>(`/api/checklists/${templateId}/analytics`);
  },

  // Clone template
  cloneTemplate(templateId: number, options?: { name?: string; equipment_type?: string }) {
    return getApiClient().post<ApiResponse<ChecklistTemplate>>(`/api/checklists/${templateId}/clone`, options || {});
  },

  // Search
  search(params: { q?: string; equipment_type?: string; category?: string; has_critical?: boolean }) {
    return getApiClient().get<SearchResult>('/api/checklists/search', { params });
  },

  // AI Features
  aiGenerate(payload: AIGeneratePayload) {
    return getApiClient().post<ApiResponse<ChecklistTemplate> & { items_count: number }>('/api/checklists/ai-generate', payload);
  },

  aiSuggestItems(payload: { equipment_type: string; existing_items: string[]; category?: string }) {
    return getApiClient().post<ApiResponse<{ suggestions: AISuggestion[]; count: number }>>('/api/checklists/ai-suggest-items', payload);
  },

  // Reorder items (drag-and-drop)
  reorderItems(templateId: number, itemOrders: Array<{ id: number; order_index: number }>) {
    return getApiClient().post<ApiResponse<ChecklistTemplate>>(`/api/checklists/${templateId}/items/reorder`, { item_orders: itemOrders });
  },
};
