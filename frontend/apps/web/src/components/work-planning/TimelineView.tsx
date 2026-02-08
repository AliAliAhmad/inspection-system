import React, { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Card, Spin, message } from 'antd';
import { TimelineDay } from './TimelineDay';
import { TimelineJobBlock } from './TimelineJobBlock';
import type { WorkPlan, WorkPlanJob, WorkPlanDay } from '@inspection/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';
import dayjs from 'dayjs';

interface TimelineViewProps {
  plan: WorkPlan;
  onJobClick?: (job: WorkPlanJob) => void;
  readOnly?: boolean;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  plan,
  onJobClick,
  readOnly = false,
}) => {
  const queryClient = useQueryClient();
  const [activeJob, setActiveJob] = useState<WorkPlanJob | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Move job mutation
  const moveMutation = useMutation({
    mutationFn: ({ jobId, targetDayId, position }: { jobId: number; targetDayId: number; position?: number }) =>
      workPlansApi.moveJob(plan.id, jobId, { target_day_id: targetDayId, position }),
    onSuccess: (response) => {
      message.success('Job moved successfully');
      queryClient.invalidateQueries({ queryKey: ['work-plans', plan.id] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to move job');
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const job = active.data.current?.job as WorkPlanJob;
    setActiveJob(job);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveJob(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || activeData.type !== 'job') return;

    const job = activeData.job as WorkPlanJob;
    const sourceDayId = activeData.dayId as number;

    // Determine target day
    let targetDayId: number;
    if (overData?.type === 'day') {
      targetDayId = (overData.day as WorkPlanDay).id;
    } else if (overData?.type === 'job') {
      targetDayId = overData.dayId as number;
    } else {
      return;
    }

    // If same day and same position, do nothing
    if (sourceDayId === targetDayId) {
      return;
    }

    // Move the job
    moveMutation.mutate({ jobId: job.id, targetDayId });
  };

  const handleDragCancel = () => {
    setActiveJob(null);
  };

  if (!plan.days || plan.days.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          No days in this work plan
        </div>
      </Card>
    );
  }

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={readOnly ? undefined : handleDragStart}
      onDragEnd={readOnly ? undefined : handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <Card
        bodyStyle={{ padding: 0 }}
        style={{ overflow: 'hidden' }}
      >
        {/* Legend */}
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            backgroundColor: '#fafafa',
            fontSize: '12px',
          }}
        >
          <span><strong>Legend:</strong></span>
          <span>🔧 PM</span>
          <span>🔴 Defect</span>
          <span>✅ Inspection</span>
          <span style={{ marginLeft: '16px' }}>|</span>
          <span>🟢 On time</span>
          <span>🟠 Overdue</span>
          <span>🔴 Critical</span>
          {!readOnly && (
            <>
              <span style={{ marginLeft: '16px' }}>|</span>
              <span style={{ color: '#8c8c8c' }}>Drag jobs to reschedule</span>
            </>
          )}
        </div>

        {/* Timeline Grid */}
        <div
          style={{
            display: 'flex',
            overflowX: 'auto',
            minHeight: '400px',
          }}
        >
          {plan.days
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((day) => (
              <TimelineDay
                key={day.id}
                day={day}
                isToday={day.date === today}
                onJobClick={onJobClick}
                readOnly={readOnly}
              />
            ))}
        </div>

        {/* Loading overlay */}
        {moveMutation.isPending && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(255,255,255,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
          >
            <Spin size="large" tip="Moving job..." />
          </div>
        )}
      </Card>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeJob && (
          <div style={{ width: '200px' }}>
            <TimelineJobBlock job={activeJob} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

export default TimelineView;
