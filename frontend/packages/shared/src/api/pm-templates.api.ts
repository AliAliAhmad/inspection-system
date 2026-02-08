/**
 * PM Templates API client
 */
import { getApiClient } from './client';
import type { ApiResponse } from '../types';
import type {
  PMTemplate,
  CreatePMTemplatePayload,
  UpdatePMTemplatePayload,
  ClonePMTemplatePayload,
} from '../types/work-plan.types';

interface TemplatesListResponse {
  templates: PMTemplate[];
  count: number;
}

interface TemplateResponse {
  template: PMTemplate;
}

export interface TemplatesListParams {
  equipment_type?: string;
  cycle_id?: number;
  active_only?: boolean;
}

export interface FindTemplateParams {
  equipment_type: string;
  cycle_id: number;
}

export const pmTemplatesApi = {
  /**
   * List all PM templates
   */
  list(params?: TemplatesListParams) {
    return getApiClient().get<ApiResponse<TemplatesListResponse>>('/api/pm-templates', { params });
  },

  /**
   * Get a single template by ID (with full details)
   */
  get(templateId: number) {
    return getApiClient().get<ApiResponse<TemplateResponse>>(`/api/pm-templates/${templateId}`);
  },

  /**
   * Find a template by equipment type and cycle
   */
  find(params: FindTemplateParams) {
    return getApiClient().get<ApiResponse<{ template: PMTemplate | null }>>('/api/pm-templates/find', { params });
  },

  /**
   * Create a new PM template
   */
  create(payload: CreatePMTemplatePayload) {
    return getApiClient().post<ApiResponse<TemplateResponse>>('/api/pm-templates', payload);
  },

  /**
   * Update a PM template
   */
  update(templateId: number, payload: UpdatePMTemplatePayload) {
    return getApiClient().put<ApiResponse<TemplateResponse>>(`/api/pm-templates/${templateId}`, payload);
  },

  /**
   * Delete a PM template
   */
  delete(templateId: number) {
    return getApiClient().delete<ApiResponse<void>>(`/api/pm-templates/${templateId}`);
  },

  /**
   * Clone a PM template with a different cycle
   */
  clone(templateId: number, payload: ClonePMTemplatePayload) {
    return getApiClient().post<ApiResponse<TemplateResponse>>(`/api/pm-templates/${templateId}/clone`, payload);
  },
};
