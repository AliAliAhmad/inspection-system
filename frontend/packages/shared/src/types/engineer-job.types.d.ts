export type EngineerJobType = 'custom_project' | 'system_review' | 'special_task';
export interface EngineerJob {
    id: number;
    universal_id: number;
    job_id: string;
    engineer_id: number;
    job_type: EngineerJobType;
    equipment_id: number | null;
    title: string;
    description: string;
    category: 'major' | 'minor' | null;
    major_reason: string | null;
    planned_time_days: number | null;
    planned_time_hours: number | null;
    started_at: string | null;
    completed_at: string | null;
    actual_time_hours: number | null;
    status: string;
    work_notes: string | null;
    completion_status: string | null;
    time_rating: number | null;
    qc_rating: number | null;
    admin_bonus: number;
    qe_id: number | null;
    created_at: string;
}
export interface CreateEngineerJobPayload {
    engineer_id?: number;
    job_type: EngineerJobType;
    title: string;
    description: string;
    equipment_id?: number;
    category?: 'major' | 'minor';
    major_reason?: string;
}
//# sourceMappingURL=engineer-job.types.d.ts.map