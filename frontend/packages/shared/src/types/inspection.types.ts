import { Equipment } from './equipment.types';
import { User } from './user.types';
import { FileRecord } from './file.types';

export type InspectionStatus = 'draft' | 'submitted' | 'reviewed';
export type InspectionResult = 'pass' | 'fail' | 'incomplete';

export interface Inspection {
  id: number;
  assignment_id: number | null;
  inspection_code: string | null;
  equipment_id: number;
  equipment: Equipment | null;
  template_id: number;
  technician_id: number;
  technician: User | null;
  status: InspectionStatus;
  result: InspectionResult | null;
  started_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  notes: string | null;
  answers?: InspectionAnswer[];
}

export interface InspectionAnswer {
  id: number;
  inspection_id: number;
  checklist_item_id: number;
  checklist_item: ChecklistItem | null;
  answer_value: string;
  comment: string | null;
  photo_path: string | null;
  photo_file: FileRecord | null;
  photo_ai_analysis?: { en: string; ar: string } | null;
  video_path: string | null;
  video_file: FileRecord | null;
  video_ai_analysis?: { en: string; ar: string } | null;
  voice_note_id: number | null;
  voice_note: FileRecord | null;
  voice_transcription?: string | null;
  answered_at: string;
}

export interface ChecklistTemplate {
  id: number;
  name: string;
  name_ar: string | null;
  description: string | null;
  function: string | null;
  assembly: string | null;
  part: string | null;
  equipment_type: string | null;
  version: string;
  is_active: boolean;
  items: ChecklistItem[];
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  template_id: number;
  item_code: string | null;
  // Assembly/Part grouping for hierarchical checklists
  assembly: string | null;
  part: string | null;
  question_text: string;
  question_text_en: string;
  question_text_ar: string | null;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  category: 'mechanical' | 'electrical' | null;
  critical_failure: boolean;
  order_index: number;
  action: string | null;
  action_en: string | null;
  action_ar: string | null;
  // Expected result and action if fail - for inspector guidance
  expected_result: string | null;
  expected_result_en: string | null;
  expected_result_ar: string | null;
  action_if_fail: string | null;
  action_if_fail_en: string | null;
  action_if_fail_ar: string | null;
  numeric_rule: 'less_than' | 'greater_than' | 'between' | null;
  min_value: number | null;
  max_value: number | null;
}

export interface AnswerPayload {
  checklist_item_id: number;
  answer_value: string;
  comment?: string;
  voice_note_id?: number;
}

export interface InspectionProgress {
  total_items: number;
  answered_items: number;
  required_items: number;
  answered_required: number;
  is_complete: boolean;
  progress_percentage: number;
  percentage: number;
}
