export interface NLQueryResult {
  query: string;
  parsed_intent: string;
  filters: Record<string, any>;
  sql_equivalent?: string;
  results: any[];
  visualization_type: 'table' | 'chart' | 'metric';
}

export interface ExecutiveSummary {
  period: string;
  highlights: string[];
  key_metrics: Array<{
    name: string;
    value: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  concerns: string[];
  recommendations: string[];
}

export interface ReportAnomaly {
  metric: string;
  expected_value: number;
  actual_value: number;
  deviation_percentage: number;
  severity: 'low' | 'medium' | 'high';
  possible_causes: string[];
}

export interface TrendForecast {
  metric: string;
  current_value: number;
  forecasted_values: Array<{ date: string; value: number }>;
  confidence_interval: { lower: number; upper: number };
}
