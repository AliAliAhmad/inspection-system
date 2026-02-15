/**
 * API for Previous Inspection features
 * - Get previous inspection for equipment
 * - Get previous photo for checklist item
 * - Copy answers from previous inspection
 */

import { getApiClient } from './client';
import { ApiResponse } from '../types';
import {
  PreviousInspection,
  PreviousInspectionPhoto,
  CopyFromPreviousPayload,
  CopyFromPreviousResult,
  PreviousInspectionSummary,
} from '../types/previous-inspection.types';

export const previousInspectionApi = {
  /**
   * Get the most recent completed inspection for an equipment
   */
  getPreviousInspection(equipmentId: number) {
    return getApiClient().get<ApiResponse<PreviousInspection>>(
      `/api/inspections/previous/${equipmentId}`
    );
  },

  /**
   * Get previous inspection with summary
   */
  getPreviousInspectionSummary(equipmentId: number) {
    return getApiClient().get<ApiResponse<PreviousInspectionSummary>>(
      `/api/inspections/previous/${equipmentId}/summary`
    );
  },

  /**
   * Get the most recent photo for a specific checklist item on an equipment
   */
  getPreviousPhoto(equipmentId: number, checklistItemId: number) {
    return getApiClient().get<ApiResponse<PreviousInspectionPhoto>>(
      `/api/inspections/previous/${equipmentId}/photo/${checklistItemId}`
    );
  },

  /**
   * Get all previous photos for an equipment (across all checklist items)
   */
  getPreviousPhotos(equipmentId: number) {
    return getApiClient().get<ApiResponse<PreviousInspectionPhoto[]>>(
      `/api/inspections/previous/${equipmentId}/photos`
    );
  },

  /**
   * Copy answers from a previous inspection to the current one
   */
  copyFromPrevious(
    currentInspectionId: number,
    payload: CopyFromPreviousPayload
  ) {
    return getApiClient().post<ApiResponse<CopyFromPreviousResult>>(
      `/api/inspections/${currentInspectionId}/copy-from-previous`,
      payload
    );
  },

  /**
   * Get answer comparisons between current and previous inspection
   */
  getAnswerComparisons(currentInspectionId: number, previousInspectionId: number) {
    return getApiClient().get<ApiResponse<{
      comparisons: Array<{
        checklist_item_id: number;
        question_text: string;
        question_text_ar?: string;
        current_value?: string;
        previous_value?: string;
        is_changed: boolean;
        current_photo_url?: string;
        previous_photo_url?: string;
      }>;
      changed_count: number;
      same_count: number;
    }>>(
      `/api/inspections/${currentInspectionId}/compare/${previousInspectionId}`
    );
  },
};
