import { getApiClient } from './client';
import { ApiResponse } from '../types';

export type ApprovalType = 'leave' | 'pause' | 'bonus' | 'takeover';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalUser {
  id: number;
  name: string;
  role?: string;
}

export interface ApprovalDetails {
  // Leave
  leave_type?: string;
  date_from?: string;
  date_to?: string;
  total_days?: number;
  reason?: string;
  scope?: string;
  // Pause
  pause_category?: string;
  pause_details?: string;
  job_type?: string;
  job_id?: number;
  // Bonus
  amount?: number;
  target_user?: { id: number; name: string };
  related_job_type?: string;
  related_job_id?: number;
  // Takeover
  queue_position?: number;
  takeover_reason?: string;
}

export interface UnifiedApproval {
  id: number;
  type: ApprovalType;
  status: ApprovalStatus;
  requested_at: string;
  requested_by: ApprovalUser;
  details: ApprovalDetails;
}

export interface ApprovalCounts {
  leave: number;
  pause: number;
  bonus: number;
  takeover: number;
  total: number;
}

export interface ApprovalListResponse {
  data: UnifiedApproval[];
  counts: ApprovalCounts;
}

export interface ApprovalListParams {
  type?: ApprovalType;
  status?: ApprovalStatus;
  date_from?: string;
  date_to?: string;
}

export interface BulkApprovalItem {
  type: ApprovalType;
  id: number;
}

export interface BulkApprovalPayload {
  items: BulkApprovalItem[];
  action: 'approve' | 'reject';
  reason?: string;
}

export interface BulkApprovalResult {
  type: string;
  id: number;
  success: boolean;
  error?: string;
}

export interface BulkApprovalResponse {
  success_count: number;
  failed_count: number;
  results: BulkApprovalResult[];
}

export const approvalsApi = {
  /**
   * List all pending approvals (combines leaves, pauses, bonuses, takeovers)
   */
  list(params?: ApprovalListParams) {
    return getApiClient().get<ApiResponse<ApprovalListResponse>>('/api/approvals', { params });
  },

  /**
   * Get pending approval counts by type
   */
  getCounts() {
    return getApiClient().get<ApiResponse<ApprovalCounts>>('/api/approvals/counts');
  },

  /**
   * Perform bulk approve/reject on multiple approvals
   */
  bulkAction(payload: BulkApprovalPayload) {
    return getApiClient().post<ApiResponse<BulkApprovalResponse>>('/api/approvals/bulk-action', payload);
  },

  /**
   * List pending takeover requests
   */
  listPendingTakeovers() {
    return getApiClient().get<ApiResponse<UnifiedApproval[]>>('/api/approvals/takeovers/pending');
  },

  /**
   * Approve a takeover request
   */
  approveTakeover(takeoverId: number) {
    return getApiClient().post<ApiResponse<UnifiedApproval>>(`/api/approvals/takeovers/${takeoverId}/approve`);
  },

  /**
   * Deny a takeover request
   */
  denyTakeover(takeoverId: number) {
    return getApiClient().post<ApiResponse<UnifiedApproval>>(`/api/approvals/takeovers/${takeoverId}/deny`);
  },
};
