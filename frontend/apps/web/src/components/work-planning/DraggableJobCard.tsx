import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TimelineJobBlock } from './TimelineJobBlock';
import type { WorkPlanJob } from '@inspection/shared';

interface DraggableJobCardProps {
  job: WorkPlanJob;
  dayId: number;
  onClick?: () => void;
  disabled?: boolean;
}

export const DraggableJobCard: React.FC<DraggableJobCardProps> = ({
  job,
  dayId,
  onClick,
  disabled = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `job-${job.id}`,
    data: {
      type: 'job',
      job,
      dayId,
    },
    disabled,
  });

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
        onClick={onClick}
        isDragging={isDragging}
      />
    </div>
  );
};

export default DraggableJobCard;
