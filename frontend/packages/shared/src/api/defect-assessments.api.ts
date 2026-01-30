import { getApiClient } from './client';
import { ApiResponse, DefectAssessment } from '../types';

export interface CreateDefectAssessmentPayload {
  defect_id: number;
  verdict: 'confirm' | 'reject' | 'minor';
  technical_notes: string;
}

export const defectAssessmentsApi = {
  list() {
    return getApiClient().get<ApiResponse<DefectAssessment[]>>('/api/defect-assessments');
  },

  getPending() {
    return getApiClient().get<ApiResponse<DefectAssessment[]>>('/api/defect-assessments/pending');
  },

  create(payload: CreateDefectAssessmentPayload) {
    return getApiClient().post<ApiResponse<DefectAssessment>>(
      '/api/defect-assessments',
      payload,
    );
  },
};
