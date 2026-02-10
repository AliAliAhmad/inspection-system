// Re-export from shared for backward compatibility
import { PhotoCapture, PhotoCaptureProps } from '../shared/PhotoCapture';

export interface BeforePhotoCaptureProps {
  open: boolean;
  onClose: () => void;
  onPhotoCaptured: (photoPath: string) => void;
  jobId: number;
  jobTitle: string;
  loading?: boolean;
}

export function BeforePhotoCapture({
  open,
  onClose,
  onPhotoCaptured,
  jobId,
  jobTitle,
  loading = false,
}: BeforePhotoCaptureProps) {
  return (
    <PhotoCapture
      open={open}
      onClose={onClose}
      onPhotoCaptured={onPhotoCaptured}
      entityId={jobId}
      entityType="specialist_job"
      entityTitle={jobTitle}
      photoType="before"
      loading={loading}
      required={true}
    />
  );
}

export default BeforePhotoCapture;
