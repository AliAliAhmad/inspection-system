export * from './api-response.types';
export * from './user.types';
export * from './equipment.types';
export * from './inspection.types';
export * from './specialist-job.types';
export * from './engineer-job.types';
export * from './quality-review.types';
export * from './leave.types';
export * from './notification.types';
export * from './defect.types';
export * from './assessment.types';
export * from './bonus-star.types';
export * from './rating.types';
export * from './schedule.types';
export * from './file.types';
export * from './work-plan.types';
export * from './work-plan-tracking.types';
export * from './error.types';
export * from './leaderboard.types';
export * from './material.types';
export * from './auto-approval.types';
// SLA and Escalation types
export * from './sla.types';
export * from './escalation.types';
// Enhanced AI module types
export * from './defect-ai.types';
export * from './overdue.types';
export * from './daily-review-ai.types';
export * from './performance-ai.types';
export * from './reports-ai.types';
// Schedule AI types - explicitly export to avoid conflict with ScheduleAnomaly from work-plan.types
export type {
  EquipmentRiskScore,
  RiskScoresResponse,
  CoverageGap,
  CoverageGapsResponse,
  InspectorScore,
  TeamPerformance,
  RouteOptimizationRequest,
  OptimizedRoute,
  SLAWarning,
  CapacityForecast,
  HealthTrend,
  ScheduleAnomaly as ScheduleAIAnomaly,
  ScheduleAIInsight,
  OptimalFrequencyRequest,
  OptimalFrequencyResponse,
  FatigueRisk,
} from './schedule-ai.types';
// AI Base types - selectively export to avoid conflicts with existing types
export type {
  Severity,
  Priority,
  TrendDirection,
  Anomaly,
  AnomalyResult,
  Prediction,
  PredictionResult,
  Recommendation,
  Trend,
  NLPFilters,
  NLPSort,
  NLPParseResult,
  AIInsightsData,
  ComprehensiveAnalysis,
  // Re-export with AIBase prefix for types that conflict with existing exports
  RiskLevel as AIBaseRiskLevel,
  RiskFactor as AIBaseRiskFactor,
  RiskResult as AIBaseRiskResult,
  AIInsight as AIBaseInsight,
} from './ai-base.types';
// Mobile Toolkit & Communication types
export * from './toolkit.types';
export * from './team-communication.types';
// Running Hours types
export * from './running-hours.types';
// Previous Inspection types
export * from './previous-inspection.types';
// Answer Templates types
export * from './templates.types';
// Shift Handover types
export * from './shift-handover.types';
// Color constants (values, not types)
export {
  RISK_COLORS,
  SEVERITY_COLORS,
  PRIORITY_COLORS,
  TREND_COLORS,
  RISK_BG_CLASSES,
  RISK_TEXT_CLASSES,
  SEVERITY_BG_CLASSES,
  SEVERITY_TEXT_CLASSES,
  PRIORITY_BG_CLASSES,
  PRIORITY_TEXT_CLASSES,
} from './ai-base.types';
