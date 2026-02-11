import { getApiClient } from './client';
import type {
  OverdueSummary,
  OverdueItem,
  AgingBucketData,
  OverduePattern,
  OverdueRiskPrediction,
} from '../types/overdue.types';
import type { ApiResponse } from '../types';

export const overdueApi = {
  getSummary() {
    return getApiClient().get<ApiResponse<OverdueSummary>>('/api/overdue/summary');
  },

  getInspections() {
    return getApiClient().get<ApiResponse<OverdueItem[]>>('/api/overdue/inspections');
  },

  getDefects() {
    return getApiClient().get<ApiResponse<OverdueItem[]>>('/api/overdue/defects');
  },

  getReviews() {
    return getApiClient().get<ApiResponse<OverdueItem[]>>('/api/overdue/reviews');
  },

  getAgingBuckets(type?: string) {
    return getApiClient().get<ApiResponse<AgingBucketData[]>>('/api/overdue/aging', {
      params: { type },
    });
  },

  bulkReschedule(entityType: string, entityIds: number[], newDate: string) {
    return getApiClient().post<ApiResponse<{ success: boolean; updated_count: number }>>(
      '/api/overdue/bulk-reschedule',
      {
        entity_type: entityType,
        entity_ids: entityIds,
        new_date: newDate,
      }
    );
  },

  getPatterns() {
    return getApiClient().get<ApiResponse<OverduePattern[]>>('/api/overdue/ai/patterns');
  },

  predictRisk(entityType: string, entityId: number) {
    return getApiClient().get<ApiResponse<OverdueRiskPrediction>>(
      `/api/overdue/ai/predict/${entityType}/${entityId}`
    );
  },

  getCalendar(startDate?: string, endDate?: string) {
    return getApiClient().get<ApiResponse<any>>('/api/overdue/calendar', {
      params: { start_date: startDate, end_date: endDate },
    });
  },
};
