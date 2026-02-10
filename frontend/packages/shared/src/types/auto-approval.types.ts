/**
 * Unified Auto-Approval Types
 * Reusable types for AI-powered auto-approval across all approval types.
 */

export type AutoApprovalType = 'pause' | 'takeover' | 'bonus' | 'leave';

export interface ApprovalResult {
  can_auto_approve: boolean;
  risk_score: number;
  reasons: string[];
  recommendation: string;
  checks: Record<string, boolean>;
  metadata?: Record<string, any>;
}

export interface AutoApprovalEvaluateResponse {
  type?: AutoApprovalType;
  id?: number;
  can_auto_approve: boolean;
  risk_score: number;
  reasons: string[];
  recommendation: string;
  checks: Record<string, boolean>;
  error?: string;
}

export interface AutoApproveResponse {
  auto_approved: boolean;
  result: ApprovalResult;
  error: string | null;
  type?: AutoApprovalType;
  id?: number;
}

export interface BulkEvaluateItem {
  type: AutoApprovalType;
  id: number;
}

export interface BulkEvaluateResponse {
  results: AutoApprovalEvaluateResponse[];
  summary: {
    total: number;
    can_auto_approve: number;
    needs_review: number;
  };
}

export interface BulkAutoApproveResponse {
  results: AutoApproveResponse[];
  summary: {
    total: number;
    approved: number;
    skipped: number;
  };
}

export interface AutoApprovalStats {
  by_type: Record<AutoApprovalType, {
    pending: number;
    can_auto_approve: number;
  }>;
  totals: {
    pending: number;
    can_auto_approve: number;
    auto_approve_rate: number;
  };
}

export interface ApprovalTypeInfo {
  types: AutoApprovalType[];
  descriptions: Record<AutoApprovalType, string>;
}
