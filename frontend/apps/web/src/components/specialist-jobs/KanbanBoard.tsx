// Re-export from shared for backward compatibility
// The shared KanbanBoard is generic and supports any job type
import { KanbanBoard as SharedKanbanBoard, KanbanColumn, KanbanJob } from '../shared/KanbanBoard';
import { SpecialistJob, JobStatus } from '@inspection/shared';

// Re-export shared types
export type { KanbanBoardProps, KanbanColumn, KanbanJob } from '../shared/KanbanBoard';

// Create a specialized version for specialist jobs
export interface SpecialistKanbanBoardProps {
  jobs: SpecialistJob[];
  onJobClick?: (job: SpecialistJob) => void;
  onStatusChange?: (jobId: number, newStatus: JobStatus) => Promise<void>;
  loading?: boolean;
}

const SPECIALIST_COLUMNS: KanbanColumn[] = [
  { id: 'assigned', title: 'Assigned', color: '#1890ff' },
  { id: 'in_progress', title: 'In Progress', color: '#fa8c16' },
  { id: 'paused', title: 'Paused', color: '#722ed1' },
  { id: 'completed', title: 'Completed', color: '#52c41a' },
];

export function KanbanBoard({ jobs, onJobClick, onStatusChange, loading }: SpecialistKanbanBoardProps) {
  const handleStatusChange = async (jobId: number, newStatus: string) => {
    if (onStatusChange) {
      await onStatusChange(jobId, newStatus as JobStatus);
    }
  };

  return (
    <SharedKanbanBoard
      jobs={jobs as unknown as KanbanJob[]}
      columns={SPECIALIST_COLUMNS}
      onJobClick={onJobClick as (job: KanbanJob) => void}
      onStatusChange={handleStatusChange}
      loading={loading}
      getCategoryColor={(category) => category === 'major' ? '#f5222d' : '#faad14'}
    />
  );
}

export default KanbanBoard;
