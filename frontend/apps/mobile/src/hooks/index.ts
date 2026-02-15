// Offline support hooks
export { useOfflineQuery } from './useOfflineQuery';
export { useOfflineMutation } from './useOfflineMutation';

// Voice command hook
export { useVoiceCommands } from './useVoiceCommands';

// Big button mode hook
export { useBigButtonMode } from './useBigButtonMode';

// Smart FAB context hook
export { useFABContext } from './useFABContext';
export type {
  FABAction,
  FABContextType,
  JobExecutionState,
} from './useFABContext';

// AI Photo Analysis hook for inspection suggestions
export { useAIPhotoAnalysis } from './useAIPhotoAnalysis';
export type {
  AIPhotoAnalysisResult,
  InspectorDecision,
} from './useAIPhotoAnalysis';

// Animated transitions hook (respects reduceMotion)
export {
  useAnimatedTransitions,
  createPulseAnimation,
  createShakeAnimation,
  createBounceAnimation,
  createFadeAnimation,
} from './useAnimatedTransitions';
export type {
  UseAnimatedTransitionsResult,
  SpringConfig,
  TimingConfig,
  AnimationPresets,
} from './useAnimatedTransitions';

// Haptics hook
export { useHaptics } from './useHaptics';
export type { HapticPattern } from './useHaptics';

// Theme hook
export { useTheme } from './useTheme';
export type { UseThemeReturn } from './useTheme';

// GPS Location hook
export { useLocation } from './useLocation';
export type {
  LocationCoords,
  LocationData,
  UseLocationOptions,
  UseLocationReturn,
} from './useLocation';
