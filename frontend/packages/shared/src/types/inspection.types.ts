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
  answered_at: string;
}

export interface ChecklistTemplate {
  id: number;
  name: string;
  name_ar: string | null;
  description: string | null;
  is_active: boolean;
  items: ChecklistItem[];
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  template_id: number;
  question_text: string;
  question_text_ar: string | null;
  answer_type: 'yes_no' | 'rating' | 'text' | 'number';
  category: 'mechanical' | 'electrical' | null;
  is_critical: boolean;
  order: number;
}

export interface AnswerPayload {
  checklist_item_id: number;
  answer_value: string;
  comment?: string;
}

export interface InspectionProgress {
  total_items: number;
  answered_items: number;
  percentage: number;
}
