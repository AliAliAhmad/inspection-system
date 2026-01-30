import { User } from './user.types';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type RejectionCategory = 'incomplete_work' | 'wrong_parts' | 'safety_issue' | 'poor_workmanship' | 'did_not_follow_procedure' | 'equipment_still_faulty' | 'other';
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
//# sourceMappingURL=quality-review.types.d.ts.map