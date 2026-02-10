// Specialist job specific wrappers around shared components
export { SmartTimer } from './SmartTimer';
export type { SpecialistJobSmartTimerProps } from './SmartTimer';

export { BeforePhotoCapture } from './BeforePhotoCapture';
export type { BeforePhotoCaptureProps } from './BeforePhotoCapture';

// Re-export generalized shared components for convenience
export {
  SmartTimer as SharedSmartTimer,
  KanbanBoard,
  PhotoCapture,
  JobStatsCard,
  JobStatsRow,
  JobStatsGrid,
} from '../shared';

export type {
  SmartTimerProps,
  PauseReason,
  TimerJobType,
  KanbanBoardProps,
  KanbanColumn,
  KanbanJob,
  PhotoCaptureProps,
  PhotoCaptureType,
  EntityType,
  JobStatsCardProps,
  JobStatsRowProps,
  JobStatsGridProps,
} from '../shared';
