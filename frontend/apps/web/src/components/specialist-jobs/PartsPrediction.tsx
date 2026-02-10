// Re-export from shared with specialist-job specific defaults
import { PartsPrediction as SharedPartsPrediction, PartsPredictionResponse, PartPrediction } from '../shared/PartsPrediction';
import { specialistJobsApi } from '@inspection/shared';

export type { PartsPredictionResponse, PartPrediction };

export interface PartsPredictionProps {
  jobId?: number;
  defectId?: number;
  compact?: boolean;
  onPartSelect?: (part: PartPrediction) => void;
}

export function PartsPrediction({ jobId, defectId, compact = false, onPartSelect }: PartsPredictionProps) {
  const fetchPredictions = async (entityId?: number, defId?: number): Promise<PartsPredictionResponse | null> => {
    try {
      const res = await specialistJobsApi.getAIPredictParts(entityId, defId);
      if (res.data?.data) {
        return res.data.data as PartsPredictionResponse;
      }
      return null;
    } catch {
      return null;
    }
  };

  return (
    <SharedPartsPrediction
      entityId={jobId}
      entityType="specialist_job"
      defectId={defectId}
      compact={compact}
      fetchPredictions={fetchPredictions}
      onPartSelect={onPartSelect}
    />
  );
}

export default PartsPrediction;
