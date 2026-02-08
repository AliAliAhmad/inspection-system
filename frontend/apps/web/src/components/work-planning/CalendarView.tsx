import React from 'react';
import { Card, Badge, Typography, Empty } from 'antd';
import { TimelineJobBlock } from './TimelineJobBlock';
import type { WorkPlan, WorkPlanJob } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface CalendarViewProps {
  plan: WorkPlan;
  onJobClick?: (job: WorkPlanJob) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ plan, onJobClick }) => {
  if (!plan.days || plan.days.length === 0) {
    return (
      <Card>
        <Empty description="No days in this work plan" />
      </Card>
    );
  }

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <Card bodyStyle={{ padding: '16px' }}>
      {/* Legend */}
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          fontSize: '12px',
          color: '#595959',
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
      </div>

      {/* Calendar Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
        }}
      >
        {plan.days
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((day) => {
            const date = dayjs(day.date);
            const isToday = day.date === today;
            const allJobs = [...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || [])];
            const sortedJobs = allJobs.sort((a, b) => a.position - b.position);
            const totalHours = sortedJobs.reduce((sum, job) => sum + job.estimated_hours, 0);

            return (
              <Card
                key={day.id}
                size="small"
                style={{
                  minHeight: '250px',
                  backgroundColor: isToday ? '#f6ffed' : undefined,
                  borderColor: isToday ? '#52c41a' : undefined,
                }}
                title={
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 600, color: isToday ? '#52c41a' : undefined }}>
                      {date.format('ddd')}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isToday ? '#52c41a' : undefined }}>
                      {date.format('D')}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8c8c8c' }}>
                      {date.format('MMM')}
                    </div>
                  </div>
                }
                extra={
                  <Badge
                    count={sortedJobs.length}
                    showZero
                    style={{ backgroundColor: sortedJobs.length > 0 ? '#1890ff' : '#d9d9d9' }}
                  />
                }
              >
                <div style={{ marginBottom: '8px' }}>
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {totalHours}h total
                  </Text>
                </div>

                {sortedJobs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#bfbfbf' }}>
                    No jobs
                  </div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {sortedJobs.map((job) => (
                      <TimelineJobBlock
                        key={job.id}
                        job={job}
                        onClick={() => onJobClick?.(job)}
                        compact
                      />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </Card>
  );
};

export default CalendarView;
