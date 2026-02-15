/**
 * Types for Previous Inspection features
 * - Photo Compare Tool
 * - Copy from Previous Inspection
 */

export interface PreviousInspectionPhoto {
  id: number;
  url: string;
  checklist_item_id: number;
  inspection_id: number;
  inspection_date: string;
  ai_analysis?: { en: string; ar: string } | null;
}

export interface PreviousInspectionAnswer {
  id: number;
  checklist_item_id: number;
  answer_value: string;
  comment?: string | null;
  photo_url?: string | null;
  photo_ai_analysis?: { en: string; ar: string } | null;
  video_url?: string | null;
  video_ai_analysis?: { en: string; ar: string } | null;
  voice_note_url?: string | null;
  voice_transcription?: { en: string; ar: string } | null;
  answered_at: string;
}

export interface PreviousInspection {
  id: number;
  inspection_code: string | null;
  equipment_id: number;
  equipment_name: string;
  technician_id: number;
  technician_name: string;
  status: 'draft' | 'submitted' | 'reviewed';
  result: 'pass' | 'fail' | 'incomplete' | null;
  started_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  answers: PreviousInspectionAnswer[];
}

export type CopyOption = 'all' | 'passed_only' | 'comments_only' | 'photos_only';

export interface CopyFromPreviousPayload {
  previous_inspection_id: number;
  copy_option: CopyOption;
  checklist_item_ids?: number[]; // Optional: specific items to copy
}

export interface CopyFromPreviousResult {
  copied_count: number;
  skipped_count: number;
  copied_items: number[];
  skipped_items: number[];
}

export interface PhotoCompareSettings {
  photo_compare_enabled: boolean;
  sync_zoom: boolean;
  show_annotations: boolean;
}

export interface ComparisonAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  type: 'current' | 'previous';
  color?: string;
}

export interface AnswerComparison {
  checklist_item_id: number;
  question_text: string;
  question_text_ar?: string;
  current_value?: string;
  previous_value?: string;
  is_changed: boolean;
  current_photo_url?: string;
  previous_photo_url?: string;
}

export interface PreviousInspectionSummary {
  inspection: PreviousInspection;
  total_answers: number;
  passed_count: number;
  failed_count: number;
  has_photos: boolean;
  has_videos: boolean;
  has_comments: boolean;
  days_ago: number;
}
