import { useCallback } from 'react';
import { message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { KanbanBoard, KanbanColumn, KanbanJob } from '../shared/KanbanBoard';
import { EngineerJob, engineerJobsApi } from '@inspection/shared';
import {
  PlayCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

interface EngineerKanbanBoardProps {
  jobs: EngineerJob[];
  loading?: boolean;
  onRefresh?: () => void;
}

const ENGINEER_COLUMNS: KanbanColumn[] = [
  { id: 'assigned', title: 'Assigned', color: '#1890ff', icon: <PlayCircleOutlined /> },
  { id: 'in_progress', title: 'In Progress', color: '#fa8c16', icon: <ClockCircleOutlined /> },
  { id: 'paused', title: 'Paused', color: '#722ed1', icon: <PauseCircleOutlined /> },
  { id: 'completed', title: 'Completed', color: '#52c41a', icon: <CheckCircleOutlined /> },
];

export function EngineerKanbanBoard({ jobs, loading, onRefresh }: EngineerKanbanBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: async ({ jobId, newStatus }: { jobId: number; newStatus: string }) => {
      // Handle status transitions
      switch (newStatus) {
        case 'in_progress':
          return engineerJobsApi.start(jobId);
        case 'paused':
          // Use start with pause flag or a custom approach
          return engineerJobsApi.start(jobId); // Will be updated when pause API is added
        case 'completed':
          return engineerJobsApi.complete(jobId, {});
        default:
          throw new Error(`Cannot transition to status: ${newStatus}`);
      }
    },
    onSuccess: () => {
      message.success(t('common.success', 'Status updated'));
      queryClient.invalidateQueries({ queryKey: ['engineer-jobs'] });
      onRefresh?.();
    },
    onError: () => {
      message.error(t('common.error', 'Failed to update status'));
    },
  });

  const handleStatusChange = useCallback(async (jobId: number, newStatus: string) => {
    await statusMutation.mutateAsync({ jobId, newStatus });
  }, [statusMutation]);

  const handleJobClick = useCallback((job: KanbanJob) => {
    navigate(`/engineer/jobs/${job.id}`);
  }, [navigate]);

  const getCategoryColor = useCallback((category?: string) => {
    if (category === 'major') return '#f5222d';
    if (category === 'minor') return '#faad14';
    return '#1890ff';
  }, []);

  // Transform EngineerJob to KanbanJob format
  const kanbanJobs: KanbanJob[] = jobs.map((job) => ({
    id: job.id,
    job_id: job.job_id,
    status: job.status,
    category: job.category || undefined,
    planned_time_hours: job.planned_time_hours,
    started_at: job.started_at,
    completed_at: job.completed_at,
    title: job.title,
    description: job.description,
  }));

  return (
    <KanbanBoard
      jobs={kanbanJobs}
      columns={ENGINEER_COLUMNS}
      onJobClick={handleJobClick}
      onStatusChange={handleStatusChange}
      loading={loading}
      getCategoryColor={getCategoryColor}
    />
  );
}

export default EngineerKanbanBoard;
