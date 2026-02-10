import React, { useState, useMemo } from 'react';
import { Card, Select, Button, Tooltip, Tag, Spin, Empty, Dropdown } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  LeftOutlined,
  RightOutlined,
  SettingOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

interface Job {
  id: number;
  name: string;
  equipment_name?: string;
  start_time?: string;
  end_time?: string;
  estimated_hours: number;
  priority: string;
  status?: string;
  berth?: string;
  assigned_users?: Array<{ id: number; full_name: string }>;
  dependencies?: Array<{ depends_on_job_id: number }>;
}

interface GanttChartViewProps {
  jobs: Job[];
  weekStart: string;
  loading?: boolean;
  onJobClick?: (job: Job) => void;
  onJobMove?: (jobId: number, newDate: string, newStartTime: string) => void;
}

const HOUR_WIDTH = 40;
const ROW_HEIGHT = 50;
const HEADER_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;

const priorityColors: Record<string, string> = {
  low: '#52c41a',
  normal: '#1890ff',
  high: '#fa8c16',
  urgent: '#f5222d',
  critical: '#722ed1',
};

const statusColors: Record<string, string> = {
  pending: '#d9d9d9',
  in_progress: '#1890ff',
  completed: '#52c41a',
  incomplete: '#fa8c16',
  not_started: '#ff4d4f',
};

export const GanttChartView: React.FC<GanttChartViewProps> = ({
  jobs,
  weekStart,
  loading,
  onJobClick,
  onJobMove,
}) => {
  const { t } = useTranslation();
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDay, setSelectedDay] = useState(0);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) =>
      dayjs(weekStart).add(i, 'day')
    );
  }, [weekStart]);

  const hours = useMemo(() => {
    return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  }, []);

  const currentDayJobs = useMemo(() => {
    if (viewMode === 'week') return jobs;
    const dayDate = weekDays[selectedDay].format('YYYY-MM-DD');
    return jobs.filter((job) => {
      // Filter jobs for the selected day
      return true; // In real implementation, filter by job's day
    });
  }, [jobs, viewMode, selectedDay, weekDays]);

  const getJobPosition = (job: Job, index: number) => {
    const startHour = job.start_time
      ? parseInt(job.start_time.split(':')[0])
      : START_HOUR + index;
    const duration = job.estimated_hours || 2;
    const left = (startHour - START_HOUR) * HOUR_WIDTH * zoomLevel;
    const width = duration * HOUR_WIDTH * zoomLevel;
    return { left, width };
  };

  const handlePrevDay = () => {
    setSelectedDay((prev) => Math.max(0, prev - 1));
  };

  const handleNextDay = () => {
    setSelectedDay((prev) => Math.min(6, prev + 1));
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(2, prev + 0.25));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(0.5, prev - 0.25));
  };

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{t('workPlan.ganttChart')}</span>
          <Select
            value={viewMode}
            onChange={setViewMode}
            
            style={{ width: 100 }}
          >
            <Select.Option value="day">{t('common.day')}</Select.Option>
            <Select.Option value="week">{t('common.week')}</Select.Option>
          </Select>
          {viewMode === 'day' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button icon={<LeftOutlined />}  onClick={handlePrevDay} disabled={selectedDay === 0} />
              <span style={{ fontWeight: 500 }}>
                {weekDays[selectedDay].format('ddd, MMM D')}
              </span>
              <Button icon={<RightOutlined />}  onClick={handleNextDay} disabled={selectedDay === 6} />
            </div>
          )}
        </div>
      }
      extra={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ZoomOutOutlined />}  onClick={handleZoomOut} />
          <span style={{ lineHeight: '24px' }}>{Math.round(zoomLevel * 100)}%</span>
          <Button icon={<ZoomInOutlined />}  onClick={handleZoomIn} />
        </div>
      }
      bodyStyle={{ padding: 0, overflow: 'auto' }}
    >
      {currentDayJobs.length === 0 ? (
        <Empty description={t('workPlan.noJobs')} style={{ padding: 40 }} />
      ) : (
        <div style={{ position: 'relative', minHeight: 400 }}>
          {/* Time header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #f0f0f0',
              position: 'sticky',
              top: 0,
              background: '#fafafa',
              zIndex: 10,
              height: HEADER_HEIGHT,
            }}
          >
            <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #f0f0f0', padding: 8 }}>
              <strong>{t('workPlan.job')}</strong>
            </div>
            <div style={{ display: 'flex' }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    width: HOUR_WIDTH * zoomLevel,
                    textAlign: 'center',
                    borderRight: '1px solid #f0f0f0',
                    padding: '8px 0',
                    fontSize: 12,
                  }}
                >
                  {hour}:00
                </div>
              ))}
            </div>
          </div>

          {/* Job rows */}
          {currentDayJobs.map((job, index) => {
            const { left, width } = getJobPosition(job, index);
            const color = priorityColors[job.priority] || priorityColors.normal;

            return (
              <div
                key={job.id}
                style={{
                  display: 'flex',
                  borderBottom: '1px solid #f0f0f0',
                  height: ROW_HEIGHT,
                }}
              >
                {/* Job label */}
                <div
                  style={{
                    width: 200,
                    flexShrink: 0,
                    borderRight: '1px solid #f0f0f0',
                    padding: 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Tooltip title={job.equipment_name || job.name}>
                    <span style={{ fontSize: 13 }}>{job.equipment_name || job.name}</span>
                  </Tooltip>
                </div>

                {/* Timeline area */}
                <div style={{ position: 'relative', flex: 1 }}>
                  {/* Grid lines */}
                  <div style={{ display: 'flex', position: 'absolute', top: 0, bottom: 0 }}>
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        style={{
                          width: HOUR_WIDTH * zoomLevel,
                          borderRight: '1px dashed #f0f0f0',
                        }}
                      />
                    ))}
                  </div>

                  {/* Job bar */}
                  <Tooltip
                    title={
                      <div>
                        <div>{job.equipment_name || job.name}</div>
                        <div>{job.estimated_hours}h - {job.priority}</div>
                        {job.assigned_users?.map((u) => (
                          <Tag key={u.id} >{u.full_name}</Tag>
                        ))}
                      </div>
                    }
                  >
                    <div
                      onClick={() => onJobClick?.(job)}
                      style={{
                        position: 'absolute',
                        left: left + 2,
                        top: 6,
                        width: Math.max(width - 4, 20),
                        height: ROW_HEIGHT - 12,
                        background: color,
                        borderRadius: 4,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 8px',
                        color: '#fff',
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    >
                      {job.dependencies && job.dependencies.length > 0 && (
                        <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                      )}
                      {width > 80 && (job.equipment_name || job.name)}
                    </div>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {Object.entries(priorityColors).map(([priority, color]) => (
          <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 16, height: 16, background: color, borderRadius: 2 }} />
            <span style={{ fontSize: 12 }}>{t(`priority.${priority}`)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default GanttChartView;
