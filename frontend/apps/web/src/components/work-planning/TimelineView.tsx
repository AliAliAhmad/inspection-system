import React, { useMemo } from 'react';
import { Card } from 'antd';
import { TimelineDay } from './TimelineDay';
import type { WorkPlan, WorkPlanJob } from '@inspection/shared';
import dayjs from 'dayjs';

interface TimelineViewProps {
  plan: WorkPlan;
  onJobClick?: (job: WorkPlanJob) => void;
  readOnly?: boolean;
}

/**
 * TimelineView — renders days as horizontal columns.
 * IMPORTANT: This component does NOT create its own DndContext.
 * It relies on the parent page's DndContext (WorkPlanningPage) to
 * handle all drag events. A nested DndContext causes @dnd-kit events
 * to race between contexts, making drag unreliable.
 */
export const TimelineView: React.FC<TimelineViewProps> = ({
  plan,
  onJobClick,
  readOnly = false,
}) => {
  const today = dayjs().format('YYYY-MM-DD');

  const sortedDays = useMemo(
    () => [...(plan.days || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [plan.days]
  );

  if (sortedDays.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          No days in this work plan
        </div>
      </Card>
    );
  }

  return (
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
        {sortedDays.map((day) => (
          <TimelineDay
            key={day.id}
            day={day}
            isToday={day.date === today}
            onJobClick={onJobClick}
            readOnly={readOnly}
          />
        ))}
      </div>
    </Card>
  );
};

export default TimelineView;
