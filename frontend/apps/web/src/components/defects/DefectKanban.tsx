import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Card,
  Typography,
  Tag,
  Space,
  Avatar,
  Select,
  DatePicker,
  Button,
  Tooltip,
  Badge,
  Spin,
  message,
  Empty,
} from 'antd';
import {
  FilterOutlined,
  ReloadOutlined,
  UserOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { defectsApi, equipmentApi } from '@inspection/shared';
import type { Defect, DefectStatus, DefectSeverity } from '@inspection/shared';
import dayjs, { Dayjs } from 'dayjs';

import SLAStatusBadge from './SLAStatusBadge';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// Column configuration
const COLUMNS: { key: DefectStatus; label: string; color: string }[] = [
  { key: 'open', label: 'Open', color: '#ff4d4f' },
  { key: 'in_progress', label: 'In Progress', color: '#1677ff' },
  { key: 'resolved', label: 'Resolved', color: '#52c41a' },
  { key: 'closed', label: 'Closed', color: '#8c8c8c' },
];

// We'll add 'under_review' as a virtual column between in_progress and resolved
const EXTENDED_COLUMNS = [
  { key: 'open' as const, label: 'Open', color: '#ff4d4f' },
  { key: 'in_progress' as const, label: 'In Progress', color: '#1677ff' },
  { key: 'resolved' as const, label: 'Resolved', color: '#52c41a' },
  { key: 'closed' as const, label: 'Closed', color: '#8c8c8c' },
];

const severityColors: Record<string, string> = {
  critical: '#cf1322',
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#52c41a',
};

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export interface DefectKanbanProps {
  onDefectClick?: (defect: Defect) => void;
  className?: string;
}

// Enhanced Defect type with SLA info
interface DefectWithSLA extends Defect {
  sla_status?: 'on_track' | 'warning' | 'at_risk' | 'breached' | 'critical';
  sla_hours_remaining?: number;
}

// Draggable Defect Card Component
interface DraggableDefectCardProps {
  defect: DefectWithSLA;
  onClick?: () => void;
  isDragging?: boolean;
}

function DraggableDefectCard({ defect, onClick, isDragging }: DraggableDefectCardProps) {
  const { t } = useTranslation();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: `defect-${defect.id}`,
    data: {
      type: 'defect',
      defect,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Calculate mock SLA data
  const createdAt = new Date(defect.created_at);
  const baseHours = defect.severity === 'critical' ? 4 :
                   defect.severity === 'high' ? 24 :
                   defect.severity === 'medium' ? 72 : 168;
  const deadline = new Date(createdAt.getTime() + baseHours * 60 * 60 * 1000);
  const now = new Date();
  const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
  const percentageElapsed = Math.min(100, ((baseHours - hoursRemaining) / baseHours) * 100);

  let slaStatus: 'on_track' | 'warning' | 'at_risk' | 'breached' | 'critical' = 'on_track';
  if (defect.status === 'closed' || defect.status === 'resolved') {
    slaStatus = 'on_track'; // Completed defects show as on_track
  } else if (percentageElapsed >= 100) {
    slaStatus = 'breached';
  } else if (percentageElapsed >= 90) {
    slaStatus = 'critical';
  } else if (percentageElapsed >= 75) {
    slaStatus = 'at_risk';
  } else if (percentageElapsed >= 50) {
    slaStatus = 'warning';
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-2"
    >
      <Card
        size="small"
        hoverable
        onClick={onClick}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          borderLeft: `3px solid ${severityColors[defect.severity] || '#999'}`,
        }}
        bodyStyle={{ padding: 12 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <Space size={4}>
            <Text strong style={{ fontSize: 12 }}>#{defect.id}</Text>
            <Tag
              color={severityColors[defect.severity]}
              style={{ margin: 0, fontSize: 10, padding: '0 4px' }}
            >
              {defect.severity?.toUpperCase()}
            </Tag>
          </Space>
          {defect.status !== 'closed' && defect.status !== 'resolved' && (
            <SLAStatusBadge
              status={slaStatus}
              hoursRemaining={hoursRemaining}
              size="small"
            />
          )}
        </div>

        {/* Description */}
        <Text
          ellipsis={{ tooltip: defect.description }}
          style={{ fontSize: 12, display: 'block', marginBottom: 8 }}
        >
          {defect.description}
        </Text>

        {/* Equipment */}
        {defect.equipment && (
          <div className="flex items-center gap-1 mb-2">
            <ToolOutlined style={{ fontSize: 11, color: '#999' }} />
            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
              {defect.equipment.name}
            </Text>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Occurrence count */}
          {defect.occurrence_count > 1 && (
            <Badge
              count={`x${defect.occurrence_count}`}
              style={{ backgroundColor: '#ff4d4f', fontSize: 10 }}
            />
          )}

          {/* Category */}
          {defect.category && (
            <Tag
              color={defect.category === 'mechanical' ? 'blue' : 'gold'}
              style={{ margin: 0, fontSize: 10 }}
            >
              {defect.category}
            </Tag>
          )}
        </div>
      </Card>
    </div>
  );
}

// Card Overlay for drag preview
function DefectCardOverlay({ defect }: { defect: DefectWithSLA }) {
  return (
    <Card
      size="small"
      style={{
        width: 250,
        borderLeft: `3px solid ${severityColors[defect.severity] || '#999'}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Text strong style={{ fontSize: 12 }}>#{defect.id}</Text>
        <Tag
          color={severityColors[defect.severity]}
          style={{ margin: 0, fontSize: 10 }}
        >
          {defect.severity?.toUpperCase()}
        </Tag>
      </div>
      <Text ellipsis style={{ fontSize: 12 }}>
        {defect.description}
      </Text>
    </Card>
  );
}

// Droppable Column Component
interface KanbanColumnProps {
  column: { key: DefectStatus; label: string; color: string };
  defects: DefectWithSLA[];
  onDefectClick?: (defect: Defect) => void;
}

function KanbanColumn({ column, defects, onDefectClick }: KanbanColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.key}`,
    data: {
      type: 'column',
      status: column.key,
    },
  });

  // Sort defects by severity (critical first)
  const sortedDefects = [...defects].sort(
    (a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99)
  );

  const defectIds = sortedDefects.map(d => `defect-${d.id}`);

  return (
    <div
      className="flex-1 min-w-[260px] max-w-[320px] flex flex-col"
      style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}
    >
      {/* Column Header */}
      <div
        className="p-3 rounded-t-lg flex items-center justify-between"
        style={{ backgroundColor: `${column.color}15`, borderBottom: `2px solid ${column.color}` }}
      >
        <Space>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: column.color,
            }}
          />
          <Text strong>{t(`defects.status.${column.key}`, column.label)}</Text>
        </Space>
        <Badge
          count={defects.length}
          style={{ backgroundColor: column.color }}
        />
      </div>

      {/* Defects List */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-2"
        style={{
          backgroundColor: isOver ? `${column.color}10` : '#fafafa',
          transition: 'background-color 0.2s',
          borderLeft: '1px solid #f0f0f0',
          borderRight: '1px solid #f0f0f0',
          borderBottom: '1px solid #f0f0f0',
          borderRadius: '0 0 8px 8px',
        }}
      >
        {sortedDefects.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('defects.noDefects', 'No defects')}
            </Text>
          </div>
        ) : (
          <SortableContext items={defectIds} strategy={verticalListSortingStrategy}>
            {sortedDefects.map((defect) => (
              <DraggableDefectCard
                key={defect.id}
                defect={defect}
                onClick={() => onDefectClick?.(defect)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// Main Kanban Component
export function DefectKanban({ onDefectClick, className }: DefectKanbanProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Filters
  const [severityFilter, setSeverityFilter] = useState<DefectSeverity | undefined>();
  const [equipmentFilter, setEquipmentFilter] = useState<number | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // Drag state
  const [activeDefect, setActiveDefect] = useState<DefectWithSLA | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Fetch all defects
  const { data: defectsData, isLoading, refetch } = useQuery({
    queryKey: ['defects-kanban', severityFilter, equipmentFilter, dateRange],
    queryFn: async () => {
      const allDefects: Defect[] = [];

      // Fetch defects for each status
      const statusQueries = EXTENDED_COLUMNS.map(col =>
        defectsApi.list({
          status: col.key,
          severity: severityFilter,
          equipment_id: equipmentFilter,
          per_page: 100,
        }).then(res => res.data?.data || [])
      );

      const results = await Promise.all(statusQueries);
      results.forEach(defects => allDefects.push(...defects));

      return allDefects;
    },
    staleTime: 30 * 1000,
  });

  // Fetch equipment for filter
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-list-kanban'],
    queryFn: () => equipmentApi.list({ per_page: 500 }).then(r => r.data?.data || []),
  });

  // Update defect status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ defectId, newStatus }: { defectId: number; newStatus: DefectStatus }) => {
      // In production, this would call the API
      if (newStatus === 'resolved') {
        return defectsApi.resolve(defectId);
      } else if (newStatus === 'closed') {
        return defectsApi.close(defectId);
      }
      // For other status changes, we'd need an update API
      throw new Error('Status change not supported');
    },
    onSuccess: () => {
      message.success(t('defects.statusUpdated', 'Defect status updated'));
      queryClient.invalidateQueries({ queryKey: ['defects-kanban'] });
    },
    onError: (err: any) => {
      message.error(err?.message || t('defects.updateError', 'Failed to update defect status'));
    },
  });

  // Group defects by status
  const defectsByStatus = useMemo(() => {
    const grouped: Record<string, DefectWithSLA[]> = {};
    EXTENDED_COLUMNS.forEach(col => {
      grouped[col.key] = [];
    });

    (defectsData || []).forEach(defect => {
      if (grouped[defect.status]) {
        grouped[defect.status].push(defect);
      }
    });

    // Apply date filter if set
    if (dateRange && dateRange[0] && dateRange[1]) {
      const startDate = dateRange[0].startOf('day');
      const endDate = dateRange[1].endOf('day');

      Object.keys(grouped).forEach(status => {
        grouped[status] = grouped[status].filter(defect => {
          const createdAt = dayjs(defect.created_at);
          return createdAt.isAfter(startDate) && createdAt.isBefore(endDate);
        });
      });
    }

    return grouped;
  }, [defectsData, dateRange]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const defect = active.data.current?.defect as DefectWithSLA;
    setActiveDefect(defect);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDefect(null);

    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || activeData.type !== 'defect') return;

    const defect = activeData.defect as Defect;
    let newStatus: DefectStatus | null = null;

    // Determine new status based on drop target
    if (overData?.type === 'column') {
      newStatus = overData.status as DefectStatus;
    } else if (overData?.type === 'defect') {
      // Dropped on another defect, find its column
      const targetDefect = overData.defect as Defect;
      newStatus = targetDefect.status;
    }

    if (newStatus && newStatus !== defect.status) {
      // Only allow certain transitions
      const allowedTransitions: Record<string, DefectStatus[]> = {
        open: ['in_progress'],
        in_progress: ['resolved', 'open'],
        resolved: ['closed', 'in_progress'],
        closed: [],
      };

      if (allowedTransitions[defect.status]?.includes(newStatus)) {
        updateStatusMutation.mutate({ defectId: defect.id, newStatus });
      } else {
        message.warning(t('defects.invalidTransition', 'This status transition is not allowed'));
      }
    }
  };

  const handleDragCancel = () => {
    setActiveDefect(null);
  };

  const clearFilters = () => {
    setSeverityFilter(undefined);
    setEquipmentFilter(undefined);
    setDateRange(null);
  };

  const hasFilters = severityFilter || equipmentFilter || dateRange;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Filters */}
      <Card size="small" className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Space>
            <FilterOutlined />
            <Text strong>{t('common.filters', 'Filters')}:</Text>
          </Space>

          <Select
            allowClear
            placeholder={t('defects.severity', 'Severity')}
            style={{ width: 140 }}
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('defects.equipment', 'Equipment')}
            style={{ width: 200 }}
            value={equipmentFilter}
            onChange={setEquipmentFilter}
            options={(equipmentData || []).map((eq: any) => ({
              value: eq.id,
              label: `${eq.name} (${eq.serial_number})`,
            }))}
          />

          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates)}
            placeholder={[t('common.startDate', 'Start Date'), t('common.endDate', 'End Date')]}
            style={{ width: 240 }}
          />

          {hasFilters && (
            <Button size="small" onClick={clearFilters}>
              {t('common.clearFilters', 'Clear Filters')}
            </Button>
          )}

          <div className="flex-1" />

          <Tooltip title={t('common.refresh', 'Refresh')}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isLoading}
            />
          </Tooltip>
        </div>
      </Card>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {EXTENDED_COLUMNS.map(column => (
            <KanbanColumn
              key={column.key}
              column={column}
              defects={defectsByStatus[column.key] || []}
              onDefectClick={onDefectClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDefect && <DefectCardOverlay defect={activeDefect} />}
        </DragOverlay>
      </DndContext>

      {/* Loading overlay for mutations */}
      {updateStatusMutation.isPending && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <Spin size="large" tip={t('common.updating', 'Updating...')} />
        </div>
      )}
    </div>
  );
}

export default DefectKanban;
