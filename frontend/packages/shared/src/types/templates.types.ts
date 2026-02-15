/** Answer Templates Types */

export type TemplateCategory =
  | 'inspection'
  | 'defect'
  | 'safety'
  | 'maintenance'
  | 'general'
  | 'custom';

export interface TemplateContent {
  fields: TemplateField[];
  default_values?: Record<string, any>;
  validation_rules?: Record<string, string>;
}

export interface TemplateField {
  key: string;
  label: string;
  label_ar?: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'date';
  required?: boolean;
  options?: string[];
  default_value?: any;
}

export interface AnswerTemplate {
  id: number;
  user_id: number;
  name: string;
  name_ar?: string;
  category: TemplateCategory;
  content: TemplateContent | Record<string, any>;
  is_favorite: boolean;
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAnswerTemplatePayload {
  name: string;
  name_ar?: string;
  category: TemplateCategory;
  content: TemplateContent | Record<string, any>;
  is_shared?: boolean;
}

export interface UpdateAnswerTemplatePayload {
  name?: string;
  name_ar?: string;
  category?: TemplateCategory;
  content?: TemplateContent | Record<string, any>;
  is_favorite?: boolean;
  is_shared?: boolean;
}

export interface TemplateListParams {
  category?: TemplateCategory;
  is_favorite?: boolean;
  is_shared?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface TemplateSuggestion {
  template_id: number;
  template_name: string;
  match_score: number;
  reason: string;
}
