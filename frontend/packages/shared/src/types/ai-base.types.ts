/**
 * AI Base Types
 * Reusable types for AI-powered features across the application.
 */

// ============================================================================
// ENUMS
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Priority = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type TrendDirection = 'up' | 'down' | 'flat';

// ============================================================================
// RISK SCORING
// ============================================================================

export interface RiskFactor {
  value: number | string;
  score: number;
  weight: number;
  weighted_score: number;
  description?: string;
}

export interface RiskResult {
  entity_id: number;
  entity_type: string;
  risk_score: number;
  risk_level: RiskLevel;
  raw_score: number;
  multiplier: number;
  factors: Record<string, RiskFactor>;
  recommendations: string[];
  calculated_at: string;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

export interface Anomaly {
  type: string;
  severity: Severity;
  description: string;
  value: number | string;
  baseline?: number | string;
  date?: string;
  [key: string]: unknown;
}

export interface AnomalyResult {
  entity_id: number;
  entity_type: string;
  anomaly_count: number;
  anomalies: Anomaly[];
  max_severity: Severity;
  total_severity_score: number;
  status: 'normal' | 'anomalies_detected';
  analyzed_at: string;
}

// ============================================================================
// PREDICTIONS
// ============================================================================

export interface Prediction {
  metric: string;
  predicted_value: number | string | boolean;
  confidence: number;
  horizon_days: number;
  reasoning: string;
  factors: string[];
  [key: string]: unknown;
}

export interface PredictionResult {
  entity_id: number;
  entity_type: string;
  predictions: Prediction[];
  predicted_at: string;
}

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

export interface Recommendation {
  type: string;
  priority: Priority;
  message: string;
  action?: string;
  [key: string]: unknown;
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

export interface Trend {
  metric: string;
  current_value: number;
  previous_value: number;
  change_percentage: number;
  direction: TrendDirection;
  period: string;
  insight: string;
}

// ============================================================================
// NLP QUERY PARSING
// ============================================================================

export interface NLPFilters {
  type?: string;
  status?: string;
  period?: string;
  risk_level?: RiskLevel;
  [key: string]: string | undefined;
}

export interface NLPSort {
  field?: string;
  order?: 'asc' | 'desc';
}

export interface NLPParseResult {
  original_query: string;
  filters: NLPFilters;
  sort: NLPSort;
  understood: boolean;
  parsed_at: string;
}

// ============================================================================
// COMPREHENSIVE ANALYSIS
// ============================================================================

export interface ComprehensiveAnalysis {
  entity_id: number;
  risk: RiskResult | { error: string };
  anomalies: AnomalyResult | { error: string };
  predictions: PredictionResult | { error: string };
  recommendations: Recommendation[];
  trends: Trend[];
  analyzed_at: string;
}

// ============================================================================
// AI INSIGHTS (for panels/cards)
// ============================================================================

export interface AIInsight {
  id?: string;
  type: 'risk' | 'anomaly' | 'prediction' | 'recommendation' | 'trend' | 'info' | 'warning';
  title: string;
  description: string;
  value?: number | string;
  severity?: Severity;
  priority?: Priority;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface AIInsightsData {
  insights: AIInsight[];
  summary?: {
    total_insights: number;
    critical_count: number;
    high_count: number;
    has_anomalies: boolean;
    risk_level?: RiskLevel;
    risk_score?: number;
  };
  generated_at: string;
}

// ============================================================================
// HELPER TYPES FOR UI COMPONENTS
// ============================================================================

export interface RiskScoreProps {
  score: number;
  level: RiskLevel;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface SeverityBadgeProps {
  severity: Severity;
  showLabel?: boolean;
}

export interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
}

export interface TrendIndicatorProps {
  direction: TrendDirection;
  changePercentage: number;
  showValue?: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS (for consistent colors/styling)
// ============================================================================

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#22c55e',      // green-500
  medium: '#f59e0b',   // amber-500
  high: '#f97316',     // orange-500
  critical: '#ef4444', // red-500
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  info: '#3b82f6',     // blue-500
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export const TREND_COLORS: Record<TrendDirection, string> = {
  up: '#22c55e',
  down: '#ef4444',
  flat: '#6b7280',     // gray-500
};

// Tailwind class mappings
export const RISK_BG_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-green-100 dark:bg-green-900/30',
  medium: 'bg-amber-100 dark:bg-amber-900/30',
  high: 'bg-orange-100 dark:bg-orange-900/30',
  critical: 'bg-red-100 dark:bg-red-900/30',
};

export const RISK_TEXT_CLASSES: Record<RiskLevel, string> = {
  low: 'text-green-700 dark:text-green-400',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-orange-700 dark:text-orange-400',
  critical: 'text-red-700 dark:text-red-400',
};

export const SEVERITY_BG_CLASSES: Record<Severity, string> = {
  low: 'bg-green-100 dark:bg-green-900/30',
  medium: 'bg-amber-100 dark:bg-amber-900/30',
  high: 'bg-orange-100 dark:bg-orange-900/30',
  critical: 'bg-red-100 dark:bg-red-900/30',
};

export const SEVERITY_TEXT_CLASSES: Record<Severity, string> = {
  low: 'text-green-700 dark:text-green-400',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-orange-700 dark:text-orange-400',
  critical: 'text-red-700 dark:text-red-400',
};

export const PRIORITY_BG_CLASSES: Record<Priority, string> = {
  info: 'bg-blue-100 dark:bg-blue-900/30',
  low: 'bg-green-100 dark:bg-green-900/30',
  medium: 'bg-amber-100 dark:bg-amber-900/30',
  high: 'bg-orange-100 dark:bg-orange-900/30',
  critical: 'bg-red-100 dark:bg-red-900/30',
};

export const PRIORITY_TEXT_CLASSES: Record<Priority, string> = {
  info: 'text-blue-700 dark:text-blue-400',
  low: 'text-green-700 dark:text-green-400',
  medium: 'text-amber-700 dark:text-amber-400',
  high: 'text-orange-700 dark:text-orange-400',
  critical: 'text-red-700 dark:text-red-400',
};
