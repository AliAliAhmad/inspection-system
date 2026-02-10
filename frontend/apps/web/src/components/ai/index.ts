/**
 * AI Components - Reusable components for AI-powered features
 *
 * These components provide consistent UI for:
 * - Risk scoring and display
 * - Anomaly detection alerts
 * - AI recommendations
 * - Trend analysis indicators
 * - Severity and priority badges
 */

export { RiskScoreBadge } from './RiskScoreBadge';
export { SeverityBadge } from './SeverityBadge';
export { PriorityBadge } from './PriorityBadge';
export { TrendIndicator } from './TrendIndicator';
export { AIInsightsCard } from './AIInsightsCard';
export { RecommendationList } from './RecommendationList';
export { AnomalyAlert } from './AnomalyAlert';
export { RiskFactorsBreakdown } from './RiskFactorsBreakdown';

// Re-export types for convenience
export type {
  RiskLevel,
  Severity,
  Priority,
  TrendDirection,
  RiskFactor,
  RiskResult,
  Anomaly,
  AnomalyResult,
  Prediction,
  PredictionResult,
  Recommendation,
  Trend,
  NLPParseResult,
  AIInsight,
  AIInsightsData,
  ComprehensiveAnalysis,
} from '@inspection/shared/src/types/ai-base.types';

// Re-export color constants
export {
  RISK_COLORS,
  SEVERITY_COLORS,
  PRIORITY_COLORS,
  TREND_COLORS,
} from '@inspection/shared/src/types/ai-base.types';
