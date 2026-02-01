import { Equipment } from './equipment.types';
import { User } from './user.types';

export type InspectionStatus = 'draft' | 'submitted' | 'reviewed';
export type InspectionResult = 'pass' | 'fail' | 'incomplete';

export interface Inspection {
  id: number;
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
  voice_note_id: number | null;
  voice_note: { id: number; filename: string; original_filename: string; mime_type?: string } | null;
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
  is_active: boolean;
  items: ChecklistItem[];
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  template_id: number;
  question_text: string;
  question_text_ar: string | null;
  answer_type: 'pass_fail' | 'yes_no' | 'numeric' | 'text';
  category: 'mechanical' | 'electrical' | null;
  critical_failure: boolean;
  order_index: number;
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
  percentage: number;
}
