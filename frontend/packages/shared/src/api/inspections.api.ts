import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Inspection,
  AnswerPayload,
  InspectionProgress,
} from '../types';

export interface InspectionListParams extends PaginationParams {
  status?: string;
  result?: string;
  technician_id?: number;
  equipment_id?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  has_defects?: boolean;
}

// Stats types
export interface InspectionStats {
  total: number;
  by_status: Record<string, number>;
  by_result: Record<string, number>;
  pass_rate: number;
  today: {
    total: number;
    submitted: number;
  };
  week: {
    total: number;
    submitted: number;
    reviewed: number;
  };
  pending_review: number;
  avg_completion_minutes: number;
  by_equipment_type: Array<{
    type: string;
    total: number;
    failed: number;
    fail_rate: number;
  }>;
  top_performers: Array<{
    id: number;
    name: string;
    completed: number;
    pass_rate: number;
  }>;
  daily_trend: Array<{
    date: string;
    started: number;
    submitted: number;
    passed: number;
    failed: number;
  }>;
  defects: {
    total_this_week: number;
    inspections_with_defects: number;
  };
}

// AI Insights types
export interface AIInsights {
  at_risk_equipment: Array<{
    id: number;
    name: string;
    type: string;
    total_inspections: number;
    failures: number;
    failure_rate: number;
    risk_level: string;
  }>;
  defect_by_category: Record<string, number>;
  weekly_trend: Array<{
    week: string;
    start: string;
    end: string;
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
  }>;
  trend_summary: {
    direction: string;
    change: number;
  };
  anomalies: Array<{
    inspector_id: number;
    inspector_name: string;
    inspections: number;
    pass_rate: number;
    deviation: number;
    type: string;
  }>;
  recommendations: Array<{
    type: string;
    priority: string;
    title: string;
    description: string;
    action: string;
  }>;
  generated_at: string;
}

// Bulk action types
export interface BulkReviewPayload {
  inspection_ids: number[];
  result: 'pass' | 'fail' | 'incomplete';
  notes?: string;
}

export interface BulkReviewResult {
  success: Array<{ inspection_id: number; result: string }>;
  errors: Array<{ inspection_id: number; error: string }>;
}

export interface StartInspectionPayload {
  equipment_id: number;
  template_id: number;
}

export interface ReviewPayload {
  result: 'pass' | 'fail' | 'incomplete';
  notes?: string;
}

export const inspectionsApi = {
  list(params?: InspectionListParams) {
    return getApiClient().get<PaginatedResponse<Inspection>>('/api/inspections', { params });
  },

  get(id: number) {
    return getApiClient().get<ApiResponse<Inspection>>(`/api/inspections/${id}`);
  },

  getByAssignment(assignmentId: number) {
    return getApiClient().get<ApiResponse<Inspection>>(`/api/inspections/by-assignment/${assignmentId}`);
  },

  start(payload: StartInspectionPayload) {
    return getApiClient().post<ApiResponse<Inspection>>('/api/inspections/start', payload);
  },

  answerQuestion(id: number, payload: AnswerPayload) {
    return getApiClient().post<ApiResponse>(`/api/inspections/${id}/answer`, payload);
  },

  getProgress(id: number) {
    return getApiClient().get<ApiResponse<InspectionProgress>>(`/api/inspections/${id}/progress`);
  },

  submit(id: number) {
    return getApiClient().post<ApiResponse<Inspection>>(`/api/inspections/${id}/submit`);
  },

  review(id: number, payload: ReviewPayload) {
    return getApiClient().post<ApiResponse<Inspection>>(`/api/inspections/${id}/review`, payload);
  },

  /** Upload any media (photo or video) — backend auto-detects type */
  uploadMedia(inspectionId: number, checklistItemId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('checklist_item_id', String(checklistItemId));
    return getApiClient().post<ApiResponse>(`/api/inspections/${inspectionId}/upload-media`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** @deprecated Use uploadMedia instead */
  uploadAnswerPhoto(inspectionId: number, checklistItemId: number, file: File) {
    return this.uploadMedia(inspectionId, checklistItemId, file);
  },

  /** @deprecated Use uploadMedia instead */
  uploadAnswerVideo(inspectionId: number, checklistItemId: number, file: File) {
    return this.uploadMedia(inspectionId, checklistItemId, file);
  },

  deleteVoice(inspectionId: number, checklistItemId: number) {
    return getApiClient().post<ApiResponse>(`/api/inspections/${inspectionId}/delete-voice`, {
      checklist_item_id: checklistItemId,
    });
  },

  deletePhoto(inspectionId: number, checklistItemId: number) {
    return getApiClient().post<ApiResponse>(`/api/inspections/${inspectionId}/delete-photo`, {
      checklist_item_id: checklistItemId,
    });
  },

  deleteVideo(inspectionId: number, checklistItemId: number) {
    return getApiClient().post<ApiResponse>(`/api/inspections/${inspectionId}/delete-video`, {
      checklist_item_id: checklistItemId,
    });
  },

  remove(id: number) {
    return getApiClient().delete<ApiResponse>(`/api/inspections/${id}`);
  },

  /** Download PDF report for an inspection */
  downloadReport(id: number) {
    return getApiClient().get(`/api/inspections/${id}/report`, {
      responseType: 'blob',
    });
  },

  // Stats & Analytics
  getStats() {
    return getApiClient().get<ApiResponse<InspectionStats>>(
      '/api/inspections/stats',
    );
  },

  // AI-powered insights
  getAIInsights() {
    return getApiClient().get<ApiResponse<AIInsights>>(
      '/api/inspections/ai-insights',
    );
  },

  // Bulk review
  bulkReview(payload: BulkReviewPayload) {
    return getApiClient().post<ApiResponse<BulkReviewResult> & { summary: { total: number; successful: number; failed: number } }>(
      '/api/inspections/bulk-review',
      payload,
    );
  },

  // Bulk export
  bulkExport(inspectionIds: number[]) {
    return getApiClient().post('/api/inspections/bulk-export', { inspection_ids: inspectionIds }, {
      responseType: 'blob',
    });
  },

  // Natural language search
  search(query: string) {
    return getApiClient().get<ApiResponse<Inspection[]> & { query: string; filters_applied: Record<string, string>; count: number }>(
      '/api/inspections/search',
      { params: { q: query } },
    );
  },

  // Reschedule an inspection
  reschedule(id: number, payload: { new_date: string; reason?: string }) {
    return getApiClient().post<ApiResponse<Inspection>>(`/api/inspections/${id}/reschedule`, payload);
  },
};
