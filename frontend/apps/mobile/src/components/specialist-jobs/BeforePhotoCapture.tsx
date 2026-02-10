/**
 * BeforePhotoCapture for Specialist Jobs
 *
 * Re-exports the generalized PhotoCapture from shared with specialist-job specific defaults.
 * Use the shared PhotoCapture directly for other entity types or custom configurations.
 */
import React from 'react';
import {
  PhotoCapture,
  PhotoCaptureProps,
} from '../shared';

export interface BeforePhotoCaptureProps {
  visible: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoPath: string) => void;
  jobId: number;
  jobTitle?: string;
  loading?: boolean;
}

export function BeforePhotoCapture({
  visible,
  onClose,
  onPhotoCaptured,
  jobId,
  jobTitle,
  loading = false,
}: BeforePhotoCaptureProps) {
  return (
    <PhotoCapture
      visible={visible}
      onClose={onClose}
      onPhotoCaptured={onPhotoCaptured}
      entityId={jobId}
      entityType="specialist_job"
      entityTitle={jobTitle}
      photoType="before"
      loading={loading}
      required
      confirmButtonText="Confirm & Start"
    />
  );
}

// Also export the generalized component for other use cases
export { PhotoCapture } from '../shared';
export type { PhotoCaptureProps, PhotoCaptureType, EntityType } from '../shared';

export default BeforePhotoCapture;
