import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  InspectionList,
  InspectionAssignment,
} from '../types';

export interface AssignmentListParams extends PaginationParams {
  shift?: 'day' | 'night';
  target_date?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  equipment_type?: string;
  berth?: string;
  inspector_id?: number;
  unassigned_only?: boolean;
}

// Stats types
export interface AssignmentStats {
  by_status: Record<string, number>;
  today: {
    total: number;
    completed: number;
    unassigned: number;
    in_progress: number;
  };
  overdue_count: number;
  completion_rate: number;
  week_stats: {
    total: number;
    completed: number;
  };
  by_shift: Record<string, number>;
  by_equipment_type: Record<string, number>;
  inspector_workload: Array<{
    id: number;
    name: string;
    active_assignments: number;
  }>;
  daily_trend: Array<{
    date: string;
    total: number;
    completed: number;
  }>;
}

// AI Suggestion types
export interface InspectorSuggestion {
  id: number;
  name: string;
  specialization: string;
  shift: string | null;
  active_assignments: number;
  roster_status: string;
  match_score: number;
  factors: {
    workload: string;
    availability: string;
  };
}

export interface AISuggestionResponse {
  assignment: {
    id: number;
    equipment: string | null;
    equipment_type: string | null;
    berth: string | null;
  };
  context: {
    date: string;
    shift: string;
  };
  suggestions: {
    mechanical: InspectorSuggestion[];
    electrical: InspectorSuggestion[];
  };
  recommended: {
    mechanical: InspectorSuggestion | null;
    electrical: InspectorSuggestion | null;
  };
}

// Bulk action types
export interface BulkAssignPayload {
  assignments?: Array<{
    assignment_id: number;
    mechanical_inspector_id: number;
    electrical_inspector_id: number;
  }>;
  assignment_ids?: number[];
  auto_assign?: boolean;
}

export interface BulkAssignResult {
  success: Array<{ assignment_id: number; data: InspectionAssignment }>;
  errors: Array<{ assignment_id: number; error: string }>;
}

// Calendar view types
export interface CalendarDay {
  date: string;
  day_name: string;
  day: InspectionAssignment[];
  night: InspectionAssignment[];
  stats: {
    total: number;
    unassigned: number;
    completed: number;
    in_progress: number;
  };
}

export interface CalendarData {
  week_start: string;
  week_end: string;
  days: CalendarDay[];
}

export interface GenerateListPayload {
  target_date: string;
  shift: 'day' | 'night';
}

export interface AssignTeamPayload {
  mechanical_inspector_id: number;
  electrical_inspector_id: number;
}

export interface MyAssignmentsParams extends PaginationParams {
  status?: string;
}

export const inspectionAssignmentsApi = {
  getLists(params?: AssignmentListParams) {
    return getApiClient().get<PaginatedResponse<InspectionList>>(
      '/api/inspection-assignments/lists',
      { params },
    );
  },

  generateList(payload: GenerateListPayload) {
    return getApiClient().post<ApiResponse<InspectionList>>(
      '/api/inspection-assignments/lists/generate',
      payload,
    );
  },

  getList(listId: number) {
    return getApiClient().get<ApiResponse<InspectionList>>(
      `/api/inspection-assignments/lists/${listId}`,
    );
  },

  assignTeam(assignmentId: number, payload: AssignTeamPayload) {
    return getApiClient().post<ApiResponse<InspectionAssignment>>(
      `/api/inspection-assignments/${assignmentId}/assign`,
      payload,
    );
  },

  updateBerth(assignmentId: number, berth: string) {
    return getApiClient().put<ApiResponse<InspectionAssignment>>(
      `/api/inspection-assignments/${assignmentId}/berth`,
      { berth },
    );
  },

  getMyAssignments(params?: MyAssignmentsParams) {
    return getApiClient().get<PaginatedResponse<InspectionAssignment>>(
      '/api/inspection-assignments/my-assignments',
      { params },
    );
  },

  completeAssignment(assignmentId: number) {
    return getApiClient().post<ApiResponse<InspectionAssignment>>(
      `/api/inspection-assignments/${assignmentId}/complete`,
    );
  },

  getBacklog() {
    return getApiClient().get<ApiResponse<InspectionAssignment[]>>(
      '/api/inspection-assignments/backlog',
    );
  },

  // Stats & Analytics
  getStats() {
    return getApiClient().get<ApiResponse<AssignmentStats>>(
      '/api/inspection-assignments/stats',
    );
  },

  // AI-powered suggestions
  getAISuggestion(assignmentId: number, context?: { date?: string; shift?: string }) {
    return getApiClient().post<ApiResponse<AISuggestionResponse>>(
      '/api/inspection-assignments/ai-suggest',
      { assignment_id: assignmentId, ...context },
    );
  },

  // Bulk actions
  bulkAssign(payload: BulkAssignPayload) {
    return getApiClient().post<ApiResponse<BulkAssignResult> & { summary: { total: number; successful: number; failed: number } }>(
      '/api/inspection-assignments/bulk-assign',
      payload,
    );
  },

  // Calendar view
  getCalendarView(weekStart?: string, shift?: string) {
    return getApiClient().get<ApiResponse<CalendarData>>(
      '/api/inspection-assignments/calendar',
      { params: { week_start: weekStart, shift } },
    );
  },
};
