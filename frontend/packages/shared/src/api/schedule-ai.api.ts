import { apiClient } from './client';
import type { ApiResponse } from '../types/api-response.types';
import type {
  RiskScoresResponse,
  EquipmentRiskScore,
  CoverageGapsResponse,
  InspectorScore,
  TeamPerformance,
  RouteOptimizationRequest,
  OptimizedRoute,
  SLAWarning,
  CapacityForecast,
  HealthTrend,
  ScheduleAnomaly,
  ScheduleAIInsight,
  OptimalFrequencyRequest,
  OptimalFrequencyResponse,
  FatigueRisk,
} from '../types/schedule-ai.types';

export const scheduleAIApi = {
  getRiskScores: async (equipmentIds?: number[]): Promise<RiskScoresResponse> => {
    const params = equipmentIds ? { equipment_ids: equipmentIds } : {};
    const { data } = await apiClient.get<ApiResponse<RiskScoresResponse | EquipmentRiskScore[]>>(
      '/api/schedule-ai/risk-scores',
      { params },
    );
    // The endpoint answers a PLAIN LIST (ScheduleAIService.calculate_equipment_risk_scores),
    // but every caller reads `.equipment_risk_scores` / `.summary` — so every
    // risk list and stat card was empty. Build the envelope here, once.
    const raw = data.data as RiskScoresResponse | EquipmentRiskScore[] | undefined;
    if (!Array.isArray(raw)) {
      return raw ?? { equipment_risk_scores: [], summary: { total_equipment: 0, critical_count: 0, high_count: 0, average_risk_score: 0 } };
    }
    const total = raw.length;
    return {
      equipment_risk_scores: raw,
      summary: {
        total_equipment: total,
        critical_count: raw.filter((r) => r.risk_level === 'critical').length,
        high_count: raw.filter((r) => r.risk_level === 'high').length,
        average_risk_score: total
          ? Math.round((raw.reduce((sum, r) => sum + (Number(r.risk_score) || 0), 0) / total) * 10) / 10
          : 0,
      },
    };
  },

  getCoverageGaps: async (severityFilter?: string): Promise<CoverageGapsResponse> => {
    const params = severityFilter ? { severity: severityFilter } : {};
    const { data } = await apiClient.get<ApiResponse<CoverageGapsResponse>>('/api/schedule-ai/coverage-gaps', { params });
    return data.data as CoverageGapsResponse;
  },

  suggestOptimalFrequency: async (request: OptimalFrequencyRequest): Promise<OptimalFrequencyResponse> => {
    const { data } = await apiClient.post<ApiResponse<OptimalFrequencyResponse>>('/api/schedule-ai/optimal-frequency', request);
    return data.data as OptimalFrequencyResponse;
  },

  getInspectorScores: async (inspectorIds?: number[]): Promise<InspectorScore[]> => {
    const params = inspectorIds ? { inspector_ids: inspectorIds } : {};
    const { data } = await apiClient.get<ApiResponse<InspectorScore[]>>('/api/schedule-ai/inspector-scores', { params });
    return data.data || [];
  },

  getTeamPerformance: async (days?: number): Promise<TeamPerformance> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get<ApiResponse<TeamPerformance>>('/api/schedule-ai/team-performance', { params });
    return data.data as TeamPerformance;
  },

  getFatigueRisks: async (): Promise<FatigueRisk[]> => {
    const { data } = await apiClient.get<ApiResponse<FatigueRisk[]>>('/api/schedule-ai/fatigue-risk');
    return data.data || [];
  },

  optimizeRoute: async (request: RouteOptimizationRequest): Promise<OptimizedRoute> => {
    const { data } = await apiClient.post<ApiResponse<OptimizedRoute>>('/api/schedule-ai/optimize-route', request);
    return data.data as OptimizedRoute;
  },

  getSLAWarnings: async (daysAhead?: number): Promise<SLAWarning[]> => {
    const params = daysAhead ? { days_ahead: daysAhead } : {};
    const { data } = await apiClient.get<ApiResponse<SLAWarning[]>>('/api/schedule-ai/sla-warnings', { params });
    return data.data || [];
  },

  getCapacityForecast: async (days?: number): Promise<CapacityForecast[]> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get<ApiResponse<CapacityForecast[]>>('/api/schedule-ai/capacity-forecast', { params });
    return data.data || [];
  },

  getHealthTrends: async (equipmentIds?: number[]): Promise<HealthTrend[]> => {
    const params = equipmentIds ? { equipment_ids: equipmentIds } : {};
    const { data } = await apiClient.get<ApiResponse<HealthTrend[]>>('/api/schedule-ai/health-trends', { params });
    return data.data || [];
  },

  detectAnomalies: async (days?: number): Promise<ScheduleAnomaly[]> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get<ApiResponse<ScheduleAnomaly[]>>('/api/schedule-ai/anomalies', { params });
    return data.data || [];
  },

  getInsights: async (): Promise<ScheduleAIInsight[]> => {
    const { data } = await apiClient.get<ApiResponse<ScheduleAIInsight[]>>('/api/schedule-ai/insights');
    return data.data || [];
  },
};
