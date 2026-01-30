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
};
