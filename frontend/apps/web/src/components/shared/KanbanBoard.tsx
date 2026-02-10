import { useState, useCallback, useMemo, ReactNode } from 'react';
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
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

// Generic job interface that works for specialist jobs, engineer jobs, etc.
export interface KanbanJob {
  id: number;
  job_id?: string;
  status: string;
  category?: string;
  priority?: string;
  planned_time_hours?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  time_rating?: number | null;
  description?: string;
  title?: string;
  assigned_to?: {
    id: number;
    full_name: string;
  } | null;
  specialist?: {
    id: number;
    full_name: string;
  } | null;
  engineer?: {
    id: number;
    full_name: string;
  } | null;
  defect?: {
    description?: string;
  } | null;
  equipment?: {
    name?: string;
    serial_number?: string;
  } | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  icon?: ReactNode;
}

interface JobCardProps<T extends KanbanJob> {
  job: T;
  onClick?: (job: T) => void;
  isDragging?: boolean;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
}

function DefaultJobCard<T extends KanbanJob>({
  job,
  onClick,
  isDragging,
  getCategoryColor,
}: JobCardProps<T>) {
  const { t } = useTranslation();
  const isOverdue = job.started_at && !job.completed_at &&
    new Date(job.started_at).getTime() < Date.now() - 24 * 60 * 60 * 1000;

  const assignee = job.assigned_to || job.specialist || job.engineer;
  const categoryColor = getCategoryColor?.(job.category) ?? (job.category === 'major' ? '#f5222d' : '#faad14');

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        cursor: 'pointer',
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `3px solid ${categoryColor}`,
      }}
      onClick={() => onClick?.(job)}
      hoverable
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block' }}>
            {job.job_id || job.title || `#${job.id}`}
          </Text>
          {(job.defect?.description || job.description) && (
            <Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
              {job.defect?.description || job.description}
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
          {job.priority && job.priority !== 'normal' && (
            <Tag color={job.priority === 'critical' ? 'red' : job.priority === 'high' ? 'orange' : 'blue'} style={{ margin: 0 }}>
              {job.priority}
            </Tag>
          )}
          {job.planned_time_hours && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <ClockCircleOutlined /> {job.planned_time_hours}h
            </Text>
          )}
        </div>
        <Tooltip title={assignee?.full_name || 'Unassigned'}>
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

interface SortableJobCardProps<T extends KanbanJob> {
  job: T;
  onClick?: (job: T) => void;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
}

function SortableJobCard<T extends KanbanJob>({ job, onClick, renderCard, getCategoryColor }: SortableJobCardProps<T>) {
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
      {renderCard ? (
        renderCard(job)
      ) : (
        <DefaultJobCard job={job} onClick={onClick} isDragging={isDragging} getCategoryColor={getCategoryColor} />
      )}
    </div>
  );
}

interface KanbanColumnProps<T extends KanbanJob> {
  column: KanbanColumn;
  jobs: T[];
  onJobClick?: (job: T) => void;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
}

function KanbanColumnComponent<T extends KanbanJob>({
  column,
  jobs,
  onJobClick,
  renderCard,
  getCategoryColor,
}: KanbanColumnProps<T>) {
  const { t } = useTranslation();

  const getColumnIcon = () => {
    if (column.icon) return column.icon;
    switch (column.id) {
      case 'assigned': return <PlayCircleOutlined />;
      case 'in_progress': return <ClockCircleOutlined />;
      case 'paused': return <PauseCircleOutlined />;
      case 'completed': return <CheckCircleOutlined />;
      default: return <ExclamationCircleOutlined />;
    }
  };

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
        <span style={{ color: column.color }}>{getColumnIcon()}</span>
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
            <SortableJobCard
              key={job.id}
              job={job}
              onClick={onJobClick}
              renderCard={renderCard}
              getCategoryColor={getCategoryColor}
            />
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

export interface KanbanBoardProps<T extends KanbanJob> {
  jobs: T[];
  columns?: KanbanColumn[];
  onJobClick?: (job: T) => void;
  onStatusChange?: (jobId: number, newStatus: string) => Promise<void>;
  loading?: boolean;
  renderCard?: (job: T) => ReactNode;
  getCategoryColor?: (category?: string) => string;
  groupByField?: keyof T;
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'assigned', title: 'Assigned', color: '#1890ff', icon: <PlayCircleOutlined /> },
  { id: 'in_progress', title: 'In Progress', color: '#fa8c16', icon: <ClockCircleOutlined /> },
  { id: 'paused', title: 'Paused', color: '#722ed1', icon: <PauseCircleOutlined /> },
  { id: 'completed', title: 'Completed', color: '#52c41a', icon: <CheckCircleOutlined /> },
];

export function KanbanBoard<T extends KanbanJob>({
  jobs,
  columns = DEFAULT_COLUMNS,
  onJobClick,
  onStatusChange,
  loading,
  renderCard,
  getCategoryColor,
  groupByField = 'status' as keyof T,
}: KanbanBoardProps<T>) {
  const { t } = useTranslation();
  const [activeJob, setActiveJob] = useState<T | null>(null);

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

  const jobsByColumn = useMemo(() => {
    const grouped: Record<string, T[]> = {};
    columns.forEach((col) => {
      grouped[col.id] = [];
    });
    jobs.forEach((job) => {
      const columnId = String(job[groupByField]);
      if (grouped[columnId]) {
        grouped[columnId].push(job);
      }
    });
    return grouped;
  }, [jobs, columns, groupByField]);

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
    const targetStatus = overJob ? String(overJob[groupByField]) : undefined;

    // Check if dropped on a column header (not another job)
    const targetColumn = columns.find((c) => c.id === over.id);
    const newStatus = targetColumn?.id || targetStatus;

    const currentStatus = String(job[groupByField]);
    if (newStatus && newStatus !== currentStatus && onStatusChange) {
      try {
        await onStatusChange(jobId, newStatus);
      } catch {
        message.error(t('common.error'));
      }
    }
  }, [jobs, columns, groupByField, onStatusChange, t]);

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
        {columns.map((column) => (
          <KanbanColumnComponent
            key={column.id}
            column={column}
            jobs={jobsByColumn[column.id] || []}
            onJobClick={onJobClick}
            renderCard={renderCard}
            getCategoryColor={getCategoryColor}
          />
        ))}
      </div>

      <DragOverlay>
        {activeJob && (
          renderCard ? renderCard(activeJob) : <DefaultJobCard job={activeJob} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
