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

// Schedule AI components
export { RiskBadge } from '../RiskBadge';
export type { RiskBadgeProps } from '../RiskBadge';

export { HealthTrendIcon } from '../HealthTrendIcon';
export type { HealthTrendIconProps } from '../HealthTrendIcon';

export { ScheduleAICard } from '../ScheduleAICard';
export type { ScheduleAICardProps } from '../ScheduleAICard';

// Photo Gallery components (multi-photo support)
export { PhotoGallery } from '../PhotoGallery';
export type { PhotoGalleryProps } from '../PhotoGallery';

export { PhotoThumbnailGrid } from '../PhotoThumbnailGrid';
export type { PhotoThumbnailGridProps, Photo } from '../PhotoThumbnailGrid';

export { FullScreenGallery } from '../FullScreenGallery';
export type { FullScreenGalleryProps, GalleryPhoto } from '../FullScreenGallery';

// Smart FAB (Context-Aware Floating Action Button)
export { default as SmartFAB } from '../SmartFAB';
export type { FABAction, JobExecutionState } from '../SmartFAB';

// Voice Commands
export { VoiceFAB } from '../VoiceFAB';
export { default as VoiceCommandOverlay } from '../VoiceCommandOverlay';

// Dashboard Widget (team status & system health)
export { DashboardWidget } from './DashboardWidget';
export type {
  DashboardWidgetProps,
  TeamMemberStatus,
  SystemHealth,
  DashboardStats,
} from './DashboardWidget';

// Drag-and-Drop Job Assignment
export { DragDropAssignment } from './DragDropAssignment';
export type {
  DragDropAssignmentProps,
  AssignableJob,
  AssignableInspector,
} from './DragDropAssignment';

// Team Location Map
export { TeamLocationMap } from './TeamLocationMap';
export type {
  TeamLocationMapProps,
  TeamMemberLocation,
} from './TeamLocationMap';

// Geofence Alerts (Red Zone)
export { GeofenceAlert } from './GeofenceAlert';
export type {
  GeofenceAlertProps,
  GeoZoneDefinition,
  GeofenceViolation,
} from './GeofenceAlert';

// KPI Alerts & Monitoring
export { KPIAlerts } from './KPIAlerts';
export type {
  KPIAlertsProps,
  KPIDefinition,
  KPIStatus,
  KPITrend,
} from './KPIAlerts';

// Morning Brief (Daily Summary)
export { MorningBrief } from './MorningBrief';
export type {
  MorningBriefProps,
  DailyBriefData,
} from './MorningBrief';
