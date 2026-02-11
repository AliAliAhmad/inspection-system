export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

// Generalized Job Components (used by specialist-jobs, engineer-jobs, etc.)
export { SmartTimer } from './SmartTimer';
export type { SmartTimerProps, PauseReason, TimerJobType } from './SmartTimer';

export { KanbanBoard } from './KanbanBoard';
export type { KanbanBoardProps, KanbanColumn, KanbanJob } from './KanbanBoard';

export { PhotoCapture } from './PhotoCapture';
export type { PhotoCaptureProps, PhotoCaptureType, EntityType } from './PhotoCapture';

export { JobStatsCard, JobStatsRow, JobStatsGrid } from './JobStatsCard';
export type { JobStatsCardProps, JobStatsRowProps, JobStatsGridProps } from './JobStatsCard';

// Enhanced module components (exported from parent components folder)
export { SLABadge } from '../SLABadge';
export type { SLABadgeProps } from '../SLABadge';

export { RiskGauge } from '../RiskGauge';
export type { RiskGaugeProps } from '../RiskGauge';

export { ProgressRing } from '../ProgressRing';
export type { ProgressRingProps } from '../ProgressRing';

export { DaysOverdueBadge } from '../DaysOverdueBadge';
export type { DaysOverdueBadgeProps } from '../DaysOverdueBadge';

export { default as AIRatingsSheet } from '../AIRatingsSheet';
