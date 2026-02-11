import { getApiClient } from './client';

// Types for Reports AI
export interface ExecutiveSummary {
  period: string;
  period_start: string;
  period_end: string;
  kpis: {
    inspections: { total: number; passed: number; pass_rate: number };
    defects: { new: number; resolved: number; open: number; critical: number; resolution_rate: number };
    jobs: { specialist_completed: number; engineer_completed: number; total_completed: number };
    sla: { breach_rate: number; breached_count: number };
    workforce: { active: number; on_leave: number; utilization: number };
  };
  highlights: string[];
  concerns: string[];
  trends: Array<{
    metric: string;
    direction: 'up' | 'down' | 'stable';
    change_percentage: number;
  }>;
  recommendations: string[];
  comparison: Record<string, any> | null;
  generated_at: string;
}

export interface ReportAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
  baseline?: number;
  metadata: Record<string, any>;
}

export interface AnomalyResult {
  status: string;
  max_severity: string;
  total_severity_score: number;
  anomalies: ReportAnomaly[];
}

export interface ForecastPrediction {
  predicted_value: number;
  confidence: number;
  horizon_days: number;
  reasoning: string;
  metadata: Record<string, any>;
}

export interface ForecastResult {
  metric: string;
  predictions: ForecastPrediction[];
}

export interface NLQueryResult {
  query: string;
  understood: boolean;
  intent: string;
  data: Record<string, any> | null;
  summary: string;
  sql_equivalent: string;
  suggestions: string[];
}

export interface ReportInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'recommendation' | 'prediction' | 'kpi';
  category: 'operational' | 'workforce' | 'maintenance' | 'management';
  title: string;
  description: string;
  value?: number;
  change_percentage?: number;
  severity?: 'info' | 'warning' | 'critical';
  priority: number;
  action_items: string[];
  metadata: Record<string, any>;
  generated_at: string;
}

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
