/**
 * SmartTimer for Specialist Jobs
 *
 * Re-exports the generalized SmartTimer from shared with specialist-job specific defaults.
 * Use the shared SmartTimer directly for other job types or custom configurations.
 */
import React from 'react';
import {
  SmartTimer as SharedSmartTimer,
  SmartTimerProps as SharedSmartTimerProps,
  PauseReason,
} from '../shared';

// Default pause reasons for specialist jobs
const SPECIALIST_JOB_PAUSE_REASONS: PauseReason[] = [
  { value: 'parts', label: 'Waiting for Parts' },
  { value: 'duty_finish', label: 'End of Shift' },
  { value: 'tools', label: 'Need Tools' },
  { value: 'manpower', label: 'Need Assistance' },
  { value: 'oem', label: 'Waiting for OEM' },
  { value: 'other', label: 'Other' },
];

export interface SpecialistJobSmartTimerProps extends Omit<SharedSmartTimerProps, 'jobType'> {
  jobId: string | number;
}

export function SmartTimer(props: SpecialistJobSmartTimerProps) {
  return (
    <SharedSmartTimer
      {...props}
      jobType="specialist_job"
      pauseReasons={props.pauseReasons || SPECIALIST_JOB_PAUSE_REASONS}
    />
  );
}

// Also export types and the shared component for direct use
export type { SmartTimerProps, PauseReason, TimerJobType } from '../shared';

export default SmartTimer;
