export type Verdict = 'operational' | 'urgent';
export interface FinalAssessment {
    id: number;
    equipment_id: number;
    inspection_assignment_id: number;
    mechanical_inspector_id: number;
    electrical_inspector_id: number;
    mech_verdict: Verdict | null;
    elec_verdict: Verdict | null;
    final_status: Verdict | null;
    urgent_reason: string | null;
    resolved_by: 'agreement' | 'safety_rule' | 'admin' | null;
    admin_decision_by: number | null;
    admin_decision_notes: string | null;
    finalized_at: string | null;
    created_at: string;
}
export interface InspectionAssignment {
    id: number;
    inspection_list_id: number;
    equipment_id: number;
    equipment: import('./equipment.types').Equipment | null;
    mechanical_inspector_id: number | null;
    electrical_inspector_id: number | null;
    berth: string | null;
    shift: 'day' | 'night';
    status: string;
    deadline: string | null;
    assigned_at: string | null;
    created_at: string;
}
export interface InspectionList {
    id: number;
    target_date: string;
    shift: 'day' | 'night';
    status: string;
    assignments: InspectionAssignment[];
    created_at: string;
}
//# sourceMappingURL=assessment.types.d.ts.map