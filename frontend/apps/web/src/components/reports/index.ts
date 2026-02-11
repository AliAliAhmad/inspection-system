/**
 * Reports AI Components
 *
 * These components display AI-powered analytics and insights.
 */

// Reports AI Components
export { ExecutiveSummaryCard, type ExecutiveSummaryCardProps } from './ExecutiveSummaryCard';
export { AnomalyAlertsPanel, type AnomalyAlertsPanelProps } from './AnomalyAlertsPanel';
export { ForecastChart, type ForecastChartProps } from './ForecastChart';
export { NLQueryInterface, type NLQueryInterfaceProps } from './NLQueryInterface';
export { InsightsFeed, type InsightsFeedProps } from './InsightsFeed';

// Re-export shared types for convenience
export type {
  ExecutiveSummary,
  ReportAnomaly,
  ReportsAnomalyResult,
  ForecastPrediction,
  ForecastResult,
  NLQueryResult,
  ReportInsight,
} from '@inspection/shared';
