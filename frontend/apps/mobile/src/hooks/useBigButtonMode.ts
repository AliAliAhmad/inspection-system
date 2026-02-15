/**
 * useBigButtonMode Hook
 *
 * Manages Big Button Mode (Simple Mode) state and active job context.
 * Provides button visibility logic based on current job state.
 */
import { useQuery } from '@tanstack/react-query';
import { toolkitApi, workPlanTrackingApi } from '@inspection/shared';
import type { TrackingStatus } from '@inspection/shared';

export interface ActiveJobContext {
  jobId: number | null;
  status: TrackingStatus | null;
  isRunning: boolean;
  isPaused: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canComplete: boolean;
  canMarkIncomplete: boolean;
}

export interface BigButtonModeState {
  isEnabled: boolean;
  isLoading: boolean;
  activeJob: ActiveJobContext;
  refetchJobs: () => void;
}

export function useBigButtonMode(): BigButtonModeState {
  // Fetch toolkit preferences to check if simple_mode_enabled
  const { data: prefsData, isLoading: prefsLoading } = useQuery({
    queryKey: ['toolkit-preferences'],
    queryFn: () => toolkitApi.getPreferences().then((r) => r.data.data),
    staleTime: 60_000,
  });

  // Fetch user's current jobs for today
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ['my-jobs-today'],
    queryFn: () => workPlanTrackingApi.getMyJobs().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 30_000, // Auto-refresh every 30 seconds
  });

  const isEnabled = prefsData?.simple_mode_enabled ?? false;
  const isLoading = prefsLoading || jobsLoading;

  // Find active job (in_progress or paused takes priority)
  const jobs = (jobsData as any)?.jobs || [];

  const activeJobData = jobs.find(
    (j: any) => j.tracking?.status === 'in_progress' || j.tracking?.status === 'paused'
  ) || jobs.find(
    (j: any) => j.tracking?.status === 'pending' || j.tracking?.status === 'not_started'
  );

  const tracking = activeJobData?.tracking;
  const status: TrackingStatus | null = tracking?.status || null;

  const activeJob: ActiveJobContext = {
    jobId: activeJobData?.id || null,
    status,
    isRunning: tracking?.is_running || false,
    isPaused: tracking?.is_paused || false,
    canStart: status === 'pending' || status === 'not_started',
    canPause: status === 'in_progress',
    canResume: status === 'paused',
    canComplete: status === 'in_progress' || status === 'paused',
    canMarkIncomplete: status === 'in_progress' || status === 'paused',
  };

  return {
    isEnabled,
    isLoading,
    activeJob,
    refetchJobs,
  };
}

export default useBigButtonMode;
