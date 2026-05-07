/**
 * Types for the admin data-cleanup endpoints.
 * Used to flag and bulk-correct historical reading typos
 * (e.g. mechanical-meter "red tenths" — 95333 entered as 9533.3).
 */

export type CleanupConfidence = 'high' | 'medium' | 'low';

export interface SuspiciousReadingRow {
  answer_id: number;
  equipment_id: number;
  equipment_name: string;
  current_value: number;
  suggested_value: number;
  previous_value: number | null;
  ratio: number | null;
  confidence: CleanupConfidence;
  reason: string;
  answered_at: string | null;
  photo_url: string | null;
  inspection_id: number;
  checklist_item_id: number;
}

export interface SuspiciousReadingsSummary {
  total_running_hours_answers: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
}

export interface SuspiciousReadingsResponse {
  summary: SuspiciousReadingsSummary;
  rows: SuspiciousReadingRow[];
}

export interface BulkCorrectPayload {
  edit_reason: string;
  corrections: Array<{
    answer_id: number;
    new_value: number;
  }>;
}

export interface BulkCorrectResponse {
  applied: number;
  total: number;
  errors: Array<{ answer_id: number | null; message: string }>;
  edit_reason: string;
}
