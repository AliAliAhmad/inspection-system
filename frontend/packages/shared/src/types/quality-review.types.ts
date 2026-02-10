import { User } from './user.types';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type RejectionCategory =
  | 'incomplete_work'
  | 'wrong_parts'
  | 'safety_issue'
  | 'poor_workmanship'
  | 'did_not_follow_procedure'
  | 'equipment_still_faulty'
  | 'other';

export interface QualityReview {
  id: number;
  job_type: 'specialist' | 'engineer';
  job_id: number;
  qe_id: number;
  quality_engineer: User | null;
  status: ReviewStatus;
  rejection_reason: string | null;
  rejection_category: RejectionCategory | null;
  notes: string | null;
  evidence_notes: string | null;
  sla_deadline: string | null;
  sla_met: boolean | null;
  admin_validation: 'valid' | 'wrong' | null;
  admin_validation_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface QualityReviewStats {
  total_reviews: number;
  approved: number;
  rejected: number;
  pending: number;
  approval_rate: number;
  avg_review_time_hours: number;
  sla_compliance_rate: number;
  trend: {
    reviews_change: number;
    approval_rate_change: number;
  };
}

export interface SLAReport {
  on_time_count: number;
  breached_count: number;
  avg_response_time_hours: number;
  by_reviewer: Array<{ reviewer_id: number; reviewer_name: string; on_time: number; breached: number }>;
}

export interface ReviewTemplate {
  id: number;
  name: string;
  category: string;
  response_text: string;
  is_approval: boolean;
}

export interface QualityTrend {
  daily_reviews: Array<{ date: string; approved: number; rejected: number }>;
  common_rejection_reasons: Array<{ reason: string; count: number }>;
}
