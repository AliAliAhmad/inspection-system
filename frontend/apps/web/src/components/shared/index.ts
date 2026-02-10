export { StatCard } from './StatCard';

export { StatsHeader, StatIcons } from './StatsHeader';
export type { StatsHeaderProps, StatItem } from './StatsHeader';

// Generalized Job Components (used by specialist-jobs, engineer-jobs, etc.)
export { SmartTimer } from './SmartTimer';
export type { SmartTimerProps, PauseReason, TimerJobType } from './SmartTimer';

export { KanbanBoard } from './KanbanBoard';
export type { KanbanBoardProps, KanbanColumn, KanbanJob } from './KanbanBoard';

export { PhotoCapture } from './PhotoCapture';
export type { PhotoCaptureProps, PhotoCaptureType, EntityType } from './PhotoCapture';

export { PartsPrediction } from './PartsPrediction';
export type { PartsPredictionProps, PartPrediction, PartsPredictionResponse, PredictionEntityType } from './PartsPrediction';

export { ActivityFeed } from './ActivityFeed';
export type { ActivityItem } from './ActivityFeed';

export { PerformanceChart } from './PerformanceChart';
export type { ChartDataPoint, ChartSeries } from './PerformanceChart';

export { AIInsightsPanel } from './AIInsightsPanel';
export type { AIInsight } from './AIInsightsPanel';

export { AvatarUpload } from './AvatarUpload';

export { HealthScoreBadge } from './HealthScoreBadge';
export type { HealthScoreBadgeProps } from './HealthScoreBadge';

export { RiskIndicator, scoreToRiskLevel } from './RiskIndicator';
export type { RiskIndicatorProps, RiskLevel } from './RiskIndicator';

export { CoverageScoreCard } from './CoverageScoreCard';
export type { CoverageScoreCardProps, CoverageGap } from './CoverageScoreCard';

export { WorkloadBar, getWorkloadStatus } from './WorkloadBar';
export type { WorkloadBarProps, WorkloadStatus } from './WorkloadBar';

export { FleetHealthCards } from './FleetHealthCards';
export type { FleetHealthCardsProps, FleetHealthData } from './FleetHealthCards';
