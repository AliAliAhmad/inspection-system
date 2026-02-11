// Executive Summary Types
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

// Anomaly Detection Types
export interface ReportAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
  baseline?: number;
  metadata: Record<string, any>;
}

export interface ReportsAnomalyResult {
  status: string;
  max_severity: string;
  total_severity_score: number;
  anomalies: ReportAnomaly[];
}

// Alias for backward compatibility and to match API response
export type AnomalyDetectionResult = ReportsAnomalyResult;

// Forecast Types
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

// Natural Language Query Types
export interface NLQueryResult {
  query: string;
  understood: boolean;
  intent: string;
  data: Record<string, any> | null;
  summary: string;
  sql_equivalent: string;
  suggestions: string[];
}

// Insights Types
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

// Legacy Types (for backward compatibility)
export interface TrendForecast {
  metric: string;
  current_value: number;
  forecasted_values: Array<{ date: string; value: number }>;
  confidence_interval: { lower: number; upper: number };
}
