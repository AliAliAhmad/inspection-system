import React, { useMemo } from 'react';
import { Card, Tooltip, Spin, Empty, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

interface WorkerCapacity {
  user_id: number;
  user_name: string;
  role: string;
  daily_hours: Record<string, number>; // date -> hours
  max_hours: number;
}

interface ResourceHeatmapProps {
  workers: WorkerCapacity[];
  weekStart: string;
  loading?: boolean;
  onCellClick?: (userId: number, date: string) => void;
}

const CELL_WIDTH = 100;
const CELL_HEIGHT = 50;

const getHeatColor = (utilization: number): string => {
  if (utilization === 0) return '#f5f5f5';
  if (utilization < 0.5) return '#b7eb8f'; // Light green - low
  if (utilization < 0.8) return '#ffe58f'; // Yellow - medium
  if (utilization < 1) return '#ffa940'; // Orange - high
  if (utilization === 1) return '#ff7a45'; // Dark orange - full
  return '#ff4d4f'; // Red - overtime
};

const getTextColor = (utilization: number): string => {
  if (utilization > 0.8) return '#fff';
  return '#000';
};

export const ResourceHeatmap: React.FC<ResourceHeatmapProps> = ({
  workers,
  weekStart,
  loading,
  onCellClick,
}) => {
  const { t } = useTranslation();

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => dayjs(weekStart).add(i, 'day'));
  }, [weekStart]);

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (workers.length === 0) {
    return (
      <Card title={t('workPlan.resourceHeatmap')}>
        <Empty description={t('workPlan.noWorkers')} />
      </Card>
    );
  }

  return (
    <Card
      title={t('workPlan.resourceHeatmap')}
      bodyStyle={{ padding: 0, overflow: 'auto' }}
    >
      <div style={{ display: 'inline-block', minWidth: '100%' }}>
        {/* Header row with days */}
        <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0' }}>
          <div
            style={{
              width: 180,
              flexShrink: 0,
              padding: 12,
              background: '#fafafa',
              fontWeight: 600,
              borderRight: '1px solid #f0f0f0',
            }}
          >
            {t('workPlan.worker')}
          </div>
          {weekDays.map((day) => (
            <div
              key={day.format('YYYY-MM-DD')}
              style={{
                width: CELL_WIDTH,
                textAlign: 'center',
                padding: 12,
                background: '#fafafa',
                borderRight: '1px solid #f0f0f0',
                fontWeight: 500,
              }}
            >
              <div>{day.format('ddd')}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{day.format('MMM D')}</div>
            </div>
          ))}
          <div
            style={{
              width: 80,
              textAlign: 'center',
              padding: 12,
              background: '#fafafa',
              fontWeight: 600,
            }}
          >
            {t('workPlan.total')}
          </div>
        </div>

        {/* Worker rows */}
        {workers.map((worker) => {
          const weekTotal = weekDays.reduce((sum, day) => {
            return sum + (worker.daily_hours[day.format('YYYY-MM-DD')] || 0);
          }, 0);

          return (
            <div
              key={worker.user_id}
              style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}
            >
              {/* Worker name */}
              <div
                style={{
                  width: 180,
                  flexShrink: 0,
                  padding: 12,
                  borderRight: '1px solid #f0f0f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontWeight: 500 }}>{worker.user_name}</div>
                <Tag  style={{ marginTop: 4, width: 'fit-content' }}>
                  {worker.role}
                </Tag>
              </div>

              {/* Day cells */}
              {weekDays.map((day) => {
                const dateKey = day.format('YYYY-MM-DD');
                const hours = worker.daily_hours[dateKey] || 0;
                const utilization = hours / worker.max_hours;
                const bgColor = getHeatColor(utilization);
                const textColor = getTextColor(utilization);

                return (
                  <Tooltip
                    key={dateKey}
                    title={
                      <div>
                        <div>{worker.user_name}</div>
                        <div>{day.format('dddd, MMM D')}</div>
                        <div>
                          {hours}h / {worker.max_hours}h ({Math.round(utilization * 100)}%)
                        </div>
                        {utilization > 1 && (
                          <div style={{ color: '#ff4d4f' }}>
                            ⚠️ {t('workPlan.overtime')}: {(hours - worker.max_hours).toFixed(1)}h
                          </div>
                        )}
                      </div>
                    }
                  >
                    <div
                      onClick={() => onCellClick?.(worker.user_id, dateKey)}
                      style={{
                        width: CELL_WIDTH,
                        height: CELL_HEIGHT,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: bgColor,
                        borderRight: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        color: textColor,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      {hours > 0 ? `${hours}h` : '-'}
                    </div>
                  </Tooltip>
                );
              })}

              {/* Weekly total */}
              <div
                style={{
                  width: 80,
                  height: CELL_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  background: weekTotal > worker.max_hours * 5 ? '#fff1f0' : '#f6ffed',
                }}
              >
                {weekTotal}h
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 500 }}>{t('workPlan.utilization')}:</span>
        {[
          { label: '0%', color: '#f5f5f5' },
          { label: '<50%', color: '#b7eb8f' },
          { label: '50-80%', color: '#ffe58f' },
          { label: '80-100%', color: '#ffa940' },
          { label: '100%', color: '#ff7a45' },
          { label: t('workPlan.overtime'), color: '#ff4d4f' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 20,
                height: 20,
                background: color,
                borderRadius: 2,
                border: '1px solid #d9d9d9',
              }}
            />
            <span style={{ fontSize: 12 }}>{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default ResourceHeatmap;
