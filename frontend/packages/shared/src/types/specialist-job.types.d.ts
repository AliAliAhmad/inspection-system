export type JobStatus = 'assigned' | 'in_progress' | 'paused' | 'completed' | 'incomplete' | 'qc_approved' | 'cancelled';
export type CompletionStatus = 'pass' | 'incomplete';
export type JobCategory = 'major' | 'minor';
export interface SpecialistJob {
    id: number;
    universal_id: number;
    job_id: string;
    defect_id: number;
    specialist_id: number;
    status: JobStatus;
    category: JobCategory | null;
    has_planned_time: boolean;
    can_view_details: boolean;
    planned_time_hours?: number | null;
    planned_time_entered_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    actual_time_hours?: number | null;
    work_notes?: string | null;
    completion_status?: CompletionStatus | null;
    incomplete_reason?: string | null;
    major_reason?: string | null;
    time_rating?: number | null;
    qc_rating?: number | null;
    cleaning_rating?: number | null;
    admin_bonus?: number;
    qe_id?: number | null;
    is_running?: boolean;
    is_paused?: boolean;
    wrong_finding_reason?: string | null;
    wrong_finding_photo?: string | null;
}
export type PauseCategory = 'parts' | 'duty_finish' | 'tools' | 'manpower' | 'oem' | 'other';
export interface PauseLog {
    id: number;
    job_type: string;
    job_id: number;
    requested_by: number;
    reason_category: PauseCategory;
    reason_details: string | null;
    requested_at: string;
    approved_by: number | null;
    approved_at: string | null;
    resumed_at: string | null;
    duration_minutes: number | null;
    status: 'pending' | 'approved' | 'denied';
}
export interface JobTakeover {
    id: number;
    job_type: string;
    job_id: number;
    requested_by: number;
    status: 'pending' | 'approved' | 'denied';
    approved_by: number | null;
    reason: string | null;
    queue_position: number;
    created_at: string;
}
//# sourceMappingURL=specialist-job.types.d.ts.map