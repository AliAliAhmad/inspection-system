export type Verdict = 'operational' | 'monitor' | 'stop';
export type AssessmentEscalationLevel = 'none' | 'engineer' | 'admin';

export interface FinalAssessment {
  id: number;
  equipment_id: number;
  inspection_assignment_id: number;
  mechanical_inspector_id: number;
  electrical_inspector_id: number;
  mech_verdict: Verdict | null;
  elec_verdict: Verdict | null;
  final_status: Verdict | null;
  // System auto-assessment
  system_verdict: Verdict | null;
  system_urgency_score: number | null;
  system_has_critical: boolean;
  system_has_fail_urgency: boolean;
  // Reasons
  urgent_reason: string | null;
  monitor_reason: string | null;
  stop_reason: string | null;
  // Resolution
  resolved_by: 'agreement' | 'escalation' | 'engineer' | 'admin' | null;
  admin_decision_by: number | null;
  admin_decision_notes: string | null;
  // Engineer
  engineer_id: number | null;
  engineer_verdict: Verdict | null;
  engineer_notes: string | null;
  engineer_reviewed_at: string | null;
  // Escalation
  escalation_level: AssessmentEscalationLevel;
  escalation_reason: string | null;
  // Meta
  assessment_version: number;
  requires_followup: boolean;
  followup_scheduled: boolean;
  finalized_at: string | null;
  created_at: string;
}

export interface AnswerSummaryEntry {
  answer_value: string;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  min_value?: number | null;
  max_value?: number | null;
  numeric_rule?: 'less_than' | 'greater_than' | 'between' | null;
  urgency_level?: number; // 0=OK, 1=Monitor, 2=Needs Attention, 3=Critical
  question_text?: string;
  category?: string | null;
  comment?: string | null;
  has_photo?: boolean;
}

export interface AssessmentSummary {
  final_status: Verdict | null;
  mech_verdict: Verdict | null;
  elec_verdict: Verdict | null;
  system_verdict?: Verdict | null;
  engineer_verdict?: Verdict | null;
  escalation_level?: AssessmentEscalationLevel;
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
  urgency_score?: number;
  predicted_assessment?: Verdict | null;
}

export interface InspectionList {
  id: number;
  target_date: string;
  shift: 'day' | 'night';
  status: string;
  assignments: InspectionAssignment[];
  created_at: string;
}
