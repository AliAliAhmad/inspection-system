export interface BonusStar {
    id: number;
    user_id: number;
    awarded_by: number | null;
    amount: number;
    reason: string;
    related_job_type: string | null;
    related_job_id: number | null;
    is_qe_request: boolean;
    request_status: 'pending' | 'approved' | 'denied' | null;
    awarded_at: string;
}
export interface AwardBonusPayload {
    user_id: number;
    amount: number;
    reason: string;
    related_job_type?: string;
    related_job_id?: number;
}
//# sourceMappingURL=bonus-star.types.d.ts.map