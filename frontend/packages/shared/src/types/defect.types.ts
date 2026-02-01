export type DefectSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DefectStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'false_alarm';

export interface InspectionAnswerSummary {
  id: number;
  inspection_id: number;
  checklist_item_id: number;
  answer_value: string;
  comment: string | null;
  photo_path: string | null;
  photo_file: {
    id: number;
    original_filename: string;
    mime_type: string;
    download_url: string;
  } | null;
  voice_note_id: number | null;
  voice_note: {
    id: number;
    filename: string;
    original_filename: string;
    mime_type: string;
  } | null;
  checklist_item: {
    id: number;
    question_text: string;
    question_text_ar: string | null;
    category: string | null;
    critical_failure: boolean;
  } | null;
  answered_at: string | null;
}

export interface Defect {
  id: number;
  inspection_id: number;
  checklist_item_id: number;
  description: string;
  description_ar: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  category: 'mechanical' | 'electrical' | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assessment_status: 'pending' | 'confirmed' | 'rejected' | 'minor' | null;
  photo_path: string | null;
  resolved_at: string | null;
  resolved_by_id: number | null;
  created_at: string;
  inspection_answer: InspectionAnswerSummary | null;
}

export interface DefectAssessment {
  id: number;
  defect_id: number;
  specialist_id: number;
  specialist: import('./user.types').User | null;
  verdict: 'confirm' | 'reject' | 'minor';
  technical_notes: string;
  assessed_at: string;
}
