/**
 * Unified Auto-Approval API Client
 * Provides a single API for evaluating and auto-approving all approval types.
 */

import { apiClient } from './client';
import type {
  AutoApprovalType,
  AutoApprovalEvaluateResponse,
  AutoApproveResponse,
  BulkEvaluateItem,
  BulkEvaluateResponse,
  BulkAutoApproveResponse,
  AutoApprovalStats,
  ApprovalTypeInfo,
} from '../types/auto-approval.types';
import type { ApiResponse } from '../types/api-response.types';

const BASE_URL = '/api/auto-approvals';

export const autoApprovalsApi = {
  /**
   * Evaluate if an approval can be auto-approved.
   */
  evaluate: (type: AutoApprovalType, entityId: number) =>
    apiClient.get<ApiResponse<AutoApprovalEvaluateResponse>>(
      `${BASE_URL}/evaluate/${type}/${entityId}`
    ),

  /**
   * Evaluate and auto-approve if eligible.
   */
  autoApprove: (type: AutoApprovalType, entityId: number) =>
    apiClient.post<ApiResponse<AutoApproveResponse>>(
      `${BASE_URL}/auto-approve/${type}/${entityId}`
    ),

  /**
   * Evaluate multiple approvals at once.
   */
  bulkEvaluate: (items: BulkEvaluateItem[]) =>
    apiClient.post<ApiResponse<BulkEvaluateResponse>>(
      `${BASE_URL}/bulk-evaluate`,
      { items }
    ),

  /**
   * Auto-approve multiple items that are eligible.
   */
  bulkAutoApprove: (items: BulkEvaluateItem[]) =>
    apiClient.post<ApiResponse<BulkAutoApproveResponse>>(
      `${BASE_URL}/bulk-auto-approve`,
      { items }
    ),

  /**
   * Get list of supported approval types.
   */
  getTypes: () =>
    apiClient.get<ApiResponse<ApprovalTypeInfo>>(`${BASE_URL}/types`),

  /**
   * Get auto-approval statistics.
   */
  getStats: () =>
    apiClient.get<ApiResponse<AutoApprovalStats>>(`${BASE_URL}/stats`),
};

export default autoApprovalsApi;
