import { ApiResponse, PaginatedResponse, PaginationParams, ChecklistTemplate, ChecklistItem } from '../types';
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
export interface UpdateChecklistItemPayload extends Partial<CreateChecklistItemPayload> {
}
export declare const checklistsApi: {
    listTemplates(params?: ChecklistListParams): Promise<import("axios").AxiosResponse<PaginatedResponse<ChecklistTemplate>, any, {}>>;
    createTemplate(payload: CreateTemplatePayload): Promise<import("axios").AxiosResponse<ApiResponse<ChecklistTemplate>, any, {}>>;
    addItem(templateId: number, payload: CreateChecklistItemPayload): Promise<import("axios").AxiosResponse<ApiResponse<ChecklistItem>, any, {}>>;
    updateItem(templateId: number, itemId: number, payload: UpdateChecklistItemPayload): Promise<import("axios").AxiosResponse<ApiResponse<ChecklistItem>, any, {}>>;
    deleteItem(templateId: number, itemId: number): Promise<import("axios").AxiosResponse<ApiResponse<unknown>, any, {}>>;
};
//# sourceMappingURL=checklists.api.d.ts.map