// Question Card components with color-coded statuses
export {
  QuestionCard,
  QuestionThumbnail,
  QuestionDot,
  STATUS_CONFIG,
} from './QuestionCard';
export type {
  QuestionCardProps,
  QuestionThumbnailProps,
  QuestionDotProps,
  QuestionStatus,
} from './QuestionCard';

// Question Overview Strip - horizontal strip showing all questions as colored dots
export { QuestionOverviewStrip } from './QuestionOverviewStrip';
export type { QuestionOverviewStripProps } from './QuestionOverviewStrip';

// Question Grid View - modal showing all questions as color-coded thumbnails
export { QuestionGridView } from './QuestionGridView';
export type {
  QuestionGridViewProps,
  QuestionGridItem,
} from './QuestionGridView';

// AI Suggestions - AI-powered pass/fail suggestion after photo capture
export { AISuggestionBadge } from './AISuggestionBadge';
export type { AISuggestionBadgeProps } from './AISuggestionBadge';

// Assembly Tabs - tabbed navigation for multi-assembly inspections
export {
  AssemblyTabs,
  SwipeableAssemblyTabs,
  createAssemblyGroups,
  createAssemblyTabs,
} from './AssemblyTabs';
export type {
  AssemblyTab,
  AssemblyGroup,
  AssemblyTabsProps,
  SwipeableAssemblyTabsProps,
} from './AssemblyTabs';

// Assembly Tab Bar - standalone tab bar component with animated indicator
export { AssemblyTabBar } from './AssemblyTabBar';
export type { AssemblyTabBarProps } from './AssemblyTabBar';

// Jump to Question - modal with number input and numpad for quick navigation
export { JumpToQuestion, JumpToQuestionButton } from './JumpToQuestion';
export type { JumpToQuestionProps, JumpToQuestionButtonProps } from './JumpToQuestion';

// Question Number Pad - large buttons for outdoor/gloves use
export { default as QuestionNumberPad } from './QuestionNumberPad';
export type { QuestionNumberPadProps } from './QuestionNumberPad';

// Location Tag - GPS auto-tagging for inspections
export { LocationTag } from './LocationTag';
export type { LocationTagProps } from './LocationTag';

// Trending Alerts - pattern detection and recurring failure alerts
export { TrendingAlerts } from './TrendingAlerts';
export type {
  TrendingAlertsProps,
  TrendAlert,
  TrendSeverity,
  TrendType,
} from './TrendingAlerts';

// Previous Answers Panel - shows previous inspection answers with copy functionality
export { PreviousAnswersPanel } from './PreviousAnswersPanel';
export type { PreviousAnswersPanelProps } from './PreviousAnswersPanel';

// Re-export animated components for inspection flows
export {
  SlideTransition,
  QuestionTransition,
  SuccessPulse,
  PassFailButton,
  ProgressCelebration,
  ProgressBadge,
  CardFlip,
  QuestionFlipCard,
  ShakeError,
  RequiredField,
  AttentionBounce,
} from '../animated';
export type {
  SlideDirection,
  PulseType,
  MilestoneType,
  ShakeIntensity,
  BouncePattern,
} from '../animated';
