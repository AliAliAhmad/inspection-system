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

export interface AnswerSummaryEntry {
  answer_value: string;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  min_value?: number | null;
  max_value?: number | null;
  numeric_rule?: 'less_than' | 'greater_than' | 'between' | null;
}

export interface AssessmentSummary {
  final_status: 'operational' | 'urgent' | null;
  mech_verdict: 'operational' | 'urgent' | null;
  elec_verdict: 'operational' | 'urgent' | null;
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
  pending_on: string | null;
  mech_completed_at: string | null;
  elec_completed_at: string | null;
  deadline: string | null;
  backlog_triggered: boolean;
  backlog_triggered_at: string | null;
  assigned_at: string | null;
  created_at: string;
  answers_summary?: AnswerSummaryEntry[];
  assessment?: AssessmentSummary | null;
}

export interface InspectionList {
  id: number;
  target_date: string;
  shift: 'day' | 'night';
  status: string;
  assignments: InspectionAssignment[];
  created_at: string;
}
