import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Badge, Typography } from 'antd';
import { DraggableJobCard } from './DraggableJobCard';
import type { WorkPlanDay, WorkPlanJob } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text } = Typography;

interface TimelineDayProps {
  day: WorkPlanDay;
  isToday: boolean;
  onJobClick?: (job: WorkPlanJob) => void;
  readOnly?: boolean;
}

export const TimelineDay: React.FC<TimelineDayProps> = ({
  day,
  isToday,
  onJobClick,
  readOnly = false,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}`,
    data: {
      type: 'day',
      day,
    },
  });

  const date = dayjs(day.date);
  const allJobs = [...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || [])];
  const sortedJobs = allJobs.sort((a, b) => a.position - b.position);
  const totalHours = sortedJobs.reduce((sum, job) => sum + job.estimated_hours, 0);

  // Calculate priority counts
  const criticalCount = sortedJobs.filter(j => j.computed_priority === 'critical').length;
  const highCount = sortedJobs.filter(j => j.computed_priority === 'high').length;

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        minWidth: '180px',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #f0f0f0',
        backgroundColor: isOver ? '#e6f7ff' : isToday ? '#fafff0' : 'transparent',
        transition: 'background-color 0.2s',
      }}
    >
      {/* Day Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: isToday ? '#52c41a' : '#fafafa',
          color: isToday ? 'white' : 'inherit',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '13px' }}>
          {date.format('ddd')}
        </div>
        <div style={{ fontSize: '11px', opacity: 0.8 }}>
          {date.format('MMM D')}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <Badge
            count={sortedJobs.length}
            showZero
            style={{ backgroundColor: sortedJobs.length > 0 ? '#1890ff' : '#d9d9d9' }}
            size="small"
          />
          {criticalCount > 0 && (
            <Badge count={`🔴${criticalCount}`} style={{ backgroundColor: '#ff4d4f' }} size="small" />
          )}
          {highCount > 0 && (
            <Badge count={`🟠${highCount}`} style={{ backgroundColor: '#faad14' }} size="small" />
          )}
        </div>
        <Text type="secondary" style={{ fontSize: '10px', color: isToday ? 'rgba(255,255,255,0.8)' : undefined }}>
          {totalHours}h total
        </Text>
      </div>

      {/* Jobs Container */}
      <div
        style={{
          flex: 1,
          padding: '8px',
          overflowY: 'auto',
          minHeight: '200px',
        }}
      >
        {sortedJobs.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '20px 8px',
              color: '#bfbfbf',
              fontSize: '12px',
              border: '2px dashed #e8e8e8',
              borderRadius: '8px',
            }}
          >
            {readOnly ? 'No jobs' : 'Drop jobs here'}
          </div>
        ) : (
          <SortableContext
            items={sortedJobs.map(j => `job-${j.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {sortedJobs.map((job) => (
              <DraggableJobCard
                key={job.id}
                job={job}
                dayId={day.id}
                onClick={() => onJobClick?.(job)}
                disabled={readOnly}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
};

export default TimelineDay;
