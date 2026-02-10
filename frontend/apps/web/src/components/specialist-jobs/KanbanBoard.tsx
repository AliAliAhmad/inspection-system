import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, Tag, Typography, Avatar, Tooltip, Badge, message } from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SpecialistJob, JobStatus } from '@inspection/shared';

const { Text, Title } = Typography;

interface KanbanColumn {
  id: JobStatus;
  title: string;
  color: string;
  icon: React.ReactNode;
}

const COLUMNS: KanbanColumn[] = [
  { id: 'assigned', title: 'Assigned', color: '#1890ff', icon: <PlayCircleOutlined /> },
  { id: 'in_progress', title: 'In Progress', color: '#fa8c16', icon: <ClockCircleOutlined /> },
  { id: 'paused', title: 'Paused', color: '#722ed1', icon: <PauseCircleOutlined /> },
  { id: 'completed', title: 'Completed', color: '#52c41a', icon: <CheckCircleOutlined /> },
];

interface JobCardProps {
  job: SpecialistJob;
  onClick?: (job: SpecialistJob) => void;
  isDragging?: boolean;
}

function JobCard({ job, onClick, isDragging }: JobCardProps) {
  const { t } = useTranslation();
  const isOverdue = job.started_at && !job.completed_at &&
    new Date(job.started_at).getTime() < Date.now() - 24 * 60 * 60 * 1000;

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        cursor: 'pointer',
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `3px solid ${job.category === 'major' ? '#f5222d' : '#faad14'}`,
      }}
      onClick={() => onClick?.(job)}
      hoverable
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block' }}>
            {job.job_id}
          </Text>
          {job.defect?.description && (
            <Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
              {job.defect.description}
            </Text>
          )}
        </div>
        {isOverdue && (
          <Tooltip title={t('jobs.overdue', 'Overdue')}>
            <WarningOutlined style={{ color: '#f5222d', marginLeft: 8 }} />
          </Tooltip>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {job.category && (
            <Tag color={job.category === 'major' ? 'red' : 'orange'} style={{ margin: 0 }}>
              {job.category}
            </Tag>
          )}
          {job.planned_time_hours && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <ClockCircleOutlined /> {job.planned_time_hours}h
            </Text>
          )}
        </div>
        <Tooltip title={job.specialist?.full_name || `#${job.specialist_id}`}>
          <Avatar size="small" icon={<UserOutlined />} />
        </Tooltip>
      </div>

      {job.time_rating !== null && job.time_rating !== undefined && (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Rating: {'⭐'.repeat(Math.min(Math.round(job.time_rating), 5))}
          </Text>
        </div>
      )}
    </Card>
  );
}

interface SortableJobCardProps {
  job: SpecialistJob;
  onClick?: (job: SpecialistJob) => void;
}

function SortableJobCard({ job, onClick }: SortableJobCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <JobCard job={job} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

interface KanbanColumnProps {
  column: KanbanColumn;
  jobs: SpecialistJob[];
  onJobClick?: (job: SpecialistJob) => void;
}

function KanbanColumnComponent({ column, jobs, onJobClick }: KanbanColumnProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        flex: 1,
        minWidth: 280,
        maxWidth: 350,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <span style={{ color: column.color }}>{column.icon}</span>
        <Title level={5} style={{ margin: 0, flex: 1 }}>
          {t(`status.${column.id}`, column.title)}
        </Title>
        <Badge count={jobs.length} style={{ backgroundColor: column.color }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 200 }}>
        <SortableContext
          items={jobs.map((j) => j.id)}
          strategy={verticalListSortingStrategy}
        >
          {jobs.map((job) => (
            <SortableJobCard key={job.id} job={job} onClick={onJobClick} />
          ))}
        </SortableContext>

        {jobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
            {t('common.noData', 'No jobs')}
          </div>
        )}
      </div>
    </div>
  );
}

interface KanbanBoardProps {
  jobs: SpecialistJob[];
  onJobClick?: (job: SpecialistJob) => void;
  onStatusChange?: (jobId: number, newStatus: JobStatus) => Promise<void>;
  loading?: boolean;
}

export function KanbanBoard({ jobs, onJobClick, onStatusChange, loading }: KanbanBoardProps) {
  const { t } = useTranslation();
  const [activeJob, setActiveJob] = useState<SpecialistJob | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const jobsByStatus = useMemo(() => {
    const grouped: Record<JobStatus, SpecialistJob[]> = {
      assigned: [],
      in_progress: [],
      paused: [],
      completed: [],
      incomplete: [],
      qc_approved: [],
      cancelled: [],
    };
    jobs.forEach((job) => {
      if (grouped[job.status]) {
        grouped[job.status].push(job);
      }
    });
    return grouped;
  }, [jobs]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const job = jobs.find((j) => j.id === event.active.id);
    setActiveJob(job || null);
  }, [jobs]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveJob(null);

    if (!over) return;

    const jobId = active.id as number;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    // Find which column the job was dropped into
    const overJob = jobs.find((j) => j.id === over.id);
    const targetStatus = overJob?.status;

    // Check if dropped on a column header (not another job)
    const targetColumn = COLUMNS.find((c) => c.id === over.id);
    const newStatus = targetColumn?.id || targetStatus;

    if (newStatus && newStatus !== job.status && onStatusChange) {
      try {
        await onStatusChange(jobId, newStatus);
      } catch {
        message.error(t('common.error'));
      }
    }
  }, [jobs, onStatusChange, t]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          padding: '8px 0',
          minHeight: 400,
        }}
      >
        {COLUMNS.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            jobs={jobsByStatus[column.id] || []}
            onJobClick={onJobClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeJob && <JobCard job={activeJob} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
