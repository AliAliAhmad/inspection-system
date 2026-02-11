// Main Dashboard
export { PerformanceDashboard, type PerformanceDashboardProps } from './PerformanceDashboard';

// Goals Components
export { GoalProgress, type GoalProgressProps, type Goal } from './GoalProgress';
export { CreateGoalModal, type CreateGoalModalProps, type CreateGoalPayload } from './CreateGoalModal';
export { GoalsManager, type GoalsManagerProps } from './GoalsManager';

// Charts and Analysis
export { SkillGapsChart, type SkillGapsChartProps, type SkillLevel, type SkillGapsData } from './SkillGapsChart';
export { TrajectoryChart, type TrajectoryChartProps, type TrajectoryData, type PerformancePoint } from './TrajectoryChart';

// Cards
export { BurnoutRiskCard, type BurnoutRiskCardProps, type BurnoutRiskData, type BurnoutIndicator, type BurnoutIntervention } from './BurnoutRiskCard';
export { PeerComparisonCard, type PeerComparisonCardProps, type PeerComparisonData, type ComparisonMetric } from './PeerComparisonCard';
export { LearningPathCard, type LearningPathCardProps, type LearningPathData, type Course } from './LearningPathCard';

// Re-export shared types for convenience
export type { GoalType, GoalStatus, PerformanceGoal, PerformanceTrajectory, PerformanceSkillGap, BurnoutRisk, CoachingTip, PeerComparison, LearningPath } from '@inspection/shared';
