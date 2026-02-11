import { apiClient } from './client';
import type {
  RiskScoresResponse,
  CoverageGapsResponse,
  InspectorScore,
  TeamPerformance,
  RouteOptimizationRequest,
  OptimizedRoute,
  SLAWarning,
  CapacityForecast,
  HealthTrend,
  ScheduleAIAnomaly,
  ScheduleAIInsight,
  OptimalFrequencyRequest,
  OptimalFrequencyResponse,
  FatigueRisk,
} from '../types/schedule-ai.types';

export const scheduleAIApi = {
  // Risk-Based Scheduling
  getRiskScores: async (equipmentIds?: number[]): Promise<RiskScoresResponse> => {
    const params = equipmentIds ? { equipment_ids: equipmentIds } : {};
    const { data } = await apiClient.get('/schedule-ai/risk-scores', { params });
    return data;
  },

  getCoverageGaps: async (severityFilter?: string): Promise<CoverageGapsResponse> => {
    const params = severityFilter ? { severity: severityFilter } : {};
    const { data } = await apiClient.get('/schedule-ai/coverage-gaps', { params });
    return data;
  },

  suggestOptimalFrequency: async (
    request: OptimalFrequencyRequest
  ): Promise<OptimalFrequencyResponse> => {
    const { data } = await apiClient.post('/schedule-ai/optimal-frequency', request);
    return data;
  },

  // Inspector Intelligence
  getInspectorScores: async (inspectorIds?: number[]): Promise<InspectorScore[]> => {
    const params = inspectorIds ? { inspector_ids: inspectorIds } : {};
    const { data } = await apiClient.get('/schedule-ai/inspector-scores', { params });
    return data;
  },

  getTeamPerformance: async (days?: number): Promise<TeamPerformance> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get('/schedule-ai/team-performance', { params });
    return data;
  },

  getFatigueRisks: async (): Promise<FatigueRisk[]> => {
    const { data } = await apiClient.get('/schedule-ai/fatigue-risk');
    return data;
  },

  // Route Optimization
  optimizeRoute: async (request: RouteOptimizationRequest): Promise<OptimizedRoute> => {
    const { data } = await apiClient.post('/schedule-ai/optimize-route', request);
    return data;
  },

  // Proactive Alerts
  getSLAWarnings: async (daysAhead?: number): Promise<SLAWarning[]> => {
    const params = daysAhead ? { days_ahead: daysAhead } : {};
    const { data } = await apiClient.get('/schedule-ai/sla-warnings', { params });
    return data;
  },

  getCapacityForecast: async (days?: number): Promise<CapacityForecast[]> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get('/schedule-ai/capacity-forecast', { params });
    return data;
  },

  // Analytics
  getHealthTrends: async (equipmentIds?: number[]): Promise<HealthTrend[]> => {
    const params = equipmentIds ? { equipment_ids: equipmentIds } : {};
    const { data } = await apiClient.get('/schedule-ai/health-trends', { params });
    return data;
  },

  detectAnomalies: async (days?: number): Promise<ScheduleAIAnomaly[]> => {
    const params = days ? { days } : {};
    const { data } = await apiClient.get('/schedule-ai/anomalies', { params });
    return data;
  },

  getInsights: async (): Promise<ScheduleAIInsight[]> => {
    const { data } = await apiClient.get('/schedule-ai/insights');
    return data;
  },
};
