import { getApiClient } from './client';
import {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  Leave,
  LeaveStatus,
  LeaveRequestPayload,
  User,
} from '../types';

export interface LeaveListParams extends PaginationParams {
  status?: LeaveStatus;
}

export interface LeaveApprovePayload {
  notes?: string;
}

export interface LeaveRejectPayload {
  rejection_reason?: string;
}

export interface CapacityInfo {
  shift: string;
  total: number;
  available: number;
  on_leave: number;
}

export interface LeaveBalanceData {
  total_balance: number;
  used: number;
  remaining: number;
  leaves: any[];
}

export const leavesApi = {
  list(params?: LeaveListParams) {
    return getApiClient().get<PaginatedResponse<Leave>>('/api/leaves', { params });
  },

  request(payload: LeaveRequestPayload) {
    return getApiClient().post<ApiResponse<Leave>>('/api/leaves', payload);
  },

  approve(leaveId: number, payload?: LeaveApprovePayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/approve`,
      payload,
    );
  },

  reject(leaveId: number, payload?: LeaveRejectPayload) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/reject`,
      payload,
    );
  },

  getActive() {
    return getApiClient().get<ApiResponse<Leave[]>>('/api/leaves/active');
  },

  getCoverageCandidates(leaveId: number) {
    return getApiClient().get<ApiResponse<User[]>>(
      `/api/leaves/${leaveId}/coverage/candidates`,
    );
  },

  assignCoverage(leaveId: number, userId: number) {
    return getApiClient().post<ApiResponse<Leave>>(
      `/api/leaves/${leaveId}/coverage/assign`,
      { user_id: userId },
    );
  },

  getCapacity(shift?: string) {
    return getApiClient().get<ApiResponse<CapacityInfo[]>>(
      '/api/leaves/capacity',
      { params: shift ? { shift } : undefined },
    );
  },

  getBalance(userId: number) {
    return getApiClient().get<ApiResponse<LeaveBalanceData>>(`/api/leaves/user/${userId}/balance`);
  },

  addDays(userId: number, days: number, reason: string) {
    return getApiClient().post<ApiResponse<{ annual_leave_balance: number }>>(`/api/leaves/user/${userId}/add-days`, { days, reason });
  },
};
