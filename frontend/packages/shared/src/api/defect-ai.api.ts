import { getApiClient } from './client';
import type {
  DefectRiskScore,
  DefectSLAResult,
  DefectEscalation,
  SimilarDefect,
  RootCauseAnalysis,
  DefectInsights,
} from '../types/defect-ai.types';
import type { ApiResponse } from '../types';

export const defectAIApi = {
  getRisk(defectId: number) {
    return getApiClient().get<ApiResponse<DefectRiskScore>>(`/api/defects/${defectId}/ai/risk`);
  },

  getSLAStatus(defectId: number) {
    return getApiClient().get<ApiResponse<DefectSLAResult>>(`/api/defects/${defectId}/ai/sla`);
  },

  checkEscalation(defectId: number) {
    return getApiClient().get<ApiResponse<DefectEscalation>>(`/api/defects/${defectId}/ai/escalation`);
  },

  predictResolution(defectId: number) {
    return getApiClient().get<ApiResponse<{ predicted_hours: number; confidence: number }>>(
      `/api/defects/${defectId}/ai/predict-resolution`
    );
  },

  findSimilar(defectId: number) {
    return getApiClient().get<ApiResponse<SimilarDefect[]>>(`/api/defects/${defectId}/ai/similar`);
  },

  analyzeRootCause(defectId: number) {
    return getApiClient().get<ApiResponse<RootCauseAnalysis>>(`/api/defects/${defectId}/ai/root-cause`);
  },

  getPreventions(defectId: number) {
    return getApiClient().get<ApiResponse<{ recommendations: string[] }>>(
      `/api/defects/${defectId}/ai/prevention`
    );
  },

  getInsights() {
    return getApiClient().get<ApiResponse<DefectInsights>>('/api/defects/ai/insights');
  },
};
