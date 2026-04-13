import React, { useCallback, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TimelineJobBlock } from './TimelineJobBlock';
import type { WorkPlanJob } from '@inspection/shared';

interface DraggableJobCardProps {
  job: WorkPlanJob;
  dayId: number;
  /** Pass the parent handler directly — click is wrapped internally to avoid inline arrow breaking memo */
  onJobClick?: (job: WorkPlanJob) => void;
  disabled?: boolean;
}

const DraggableJobCardInner: React.FC<DraggableJobCardProps> = ({
  job,
  dayId,
  onJobClick,
  disabled = false,
}) => {
  const sortableData = useMemo(() => ({
    type: 'job' as const,
    job,
    dayId,
  }), [job, dayId]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `job-${job.id}`,
    data: sortableData,
    disabled,
  });

  const handleClick = useCallback(() => {
    onJobClick?.(job);
  }, [onJobClick, job]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <TimelineJobBlock
        job={job}
        onClick={handleClick}
        isDragging={isDragging}
      />
    </div>
  );
};

export const DraggableJobCard = React.memo(DraggableJobCardInner);

export default DraggableJobCard;
