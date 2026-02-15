/**
 * Animated Components - Smooth 60fps animations for better UX
 *
 * All animations respect the reduceMotion accessibility setting.
 */

// Slide Transitions
export {
  SlideTransition,
  SlideInLeft,
  SlideInRight,
  SlideInUp,
  SlideInDown,
  QuestionTransition,
} from './SlideTransition';
export type {
  SlideTransitionProps,
  SlideDirection,
  SlideInProps,
  QuestionTransitionProps,
} from './SlideTransition';

// Success Pulse (Pass/Fail buttons)
export {
  SuccessPulse,
  PassFailButton,
  RatingPulseButton,
} from './SuccessPulse';
export type {
  SuccessPulseProps,
  SuccessPulseRef,
  PulseType,
  PassFailButtonProps,
  RatingPulseButtonProps,
} from './SuccessPulse';

// Progress Celebration
export {
  ProgressCelebration,
  ProgressBadge,
} from './ProgressCelebration';
export type {
  ProgressCelebrationProps,
  ProgressCelebrationRef,
  MilestoneType,
  ProgressBadgeProps,
} from './ProgressCelebration';

// Card Flip
export {
  CardFlip,
  QuestionFlipCard,
  FlipButton,
} from './CardFlip';
export type {
  CardFlipProps,
  CardFlipRef,
  QuestionFlipCardProps,
  FlipButtonProps,
} from './CardFlip';

// Attention Bounce
export {
  AttentionBounce,
  CTABounceButton,
  BouncingDot,
  IconBounce,
} from './AttentionBounce';
export type {
  AttentionBounceProps,
  AttentionBounceRef,
  BouncePattern,
  CTABounceButtonProps,
  BouncingDotProps,
  IconBounceProps,
} from './AttentionBounce';

// Shake Error
export {
  ShakeError,
  RequiredField,
  ValidationError,
  ShakeGroup,
  ShakeGroupContext,
} from './ShakeError';
export type {
  ShakeErrorProps,
  ShakeErrorRef,
  ShakeIntensity,
  RequiredFieldProps,
  ValidationErrorProps,
  ShakeGroupProps,
  ShakeGroupRef,
} from './ShakeError';

// Re-export hooks and utilities for animations
export { useAccessibility } from '../../providers/AccessibilityProvider';
