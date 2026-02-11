import { getApiClient } from './client';
import type {
  ExecutiveSummary,
  ReportAnomaly,
  ReportsAnomalyResult,
  ForecastPrediction,
  ForecastResult,
  NLQueryResult,
  ReportInsight,
} from '../types/reports-ai.types';

// Re-export types for convenience
export type { ExecutiveSummary, ReportAnomaly, ForecastPrediction, ForecastResult, NLQueryResult, ReportInsight };

// Use a local alias for the API
type AnomalyResult = ReportsAnomalyResult;

/**
 * Reports AI API Client
 */
export const reportsAIApi = {
  /**
   * Get AI-powered executive summary
   */
  getExecutiveSummary: async (period: 'daily' | 'weekly' | 'monthly' = 'weekly') => {
    const client = getApiClient();
    const response = await client.get<{ status: string; data: ExecutiveSummary }>(
      '/api/reports/ai/executive-summary',
      { params: { period } }
    );
    return response.data.data;
  },

  /**
   * Detect anomalies in metrics
   */
  detectAnomalies: async (lookbackDays: number = 30) => {
    const client = getApiClient();
    const response = await client.get<{ status: string; data: AnomalyResult }>(
      '/api/reports/ai/anomalies',
      { params: { lookback_days: lookbackDays } }
    );
    return response.data.data;
  },

  /**
   * Forecast a specific metric
   */
  forecastMetric: async (metric: string, periods: number = 4) => {
    const client = getApiClient();
    const response = await client.get<{ status: string; data: ForecastResult }>(
      '/api/reports/ai/forecast',
      { params: { metric, periods } }
    );
    return response.data.data;
  },

  /**
   * Process a natural language query
   */
  queryReports: async (question: string) => {
    const client = getApiClient();
    const response = await client.post<{ status: string; data: NLQueryResult }>(
      '/api/reports/ai/query',
      { question }
    );
    return response.data.data;
  },

  /**
   * Get AI-generated insights
   */
  getInsights: async (limit: number = 10) => {
    const client = getApiClient();
    const response = await client.get<{ status: string; data: ReportInsight[] }>(
      '/api/reports/ai/insights',
      { params: { limit } }
    );
    return response.data.data;
  },
};
