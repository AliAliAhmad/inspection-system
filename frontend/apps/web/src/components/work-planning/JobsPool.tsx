import React, { useState, useMemo } from 'react';
import { Card, Tag, Button, Space, Input, Select, Empty, Spin, Badge, Popconfirm, Tabs, Tooltip, Avatar, Dropdown, type MenuProps } from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  SearchOutlined,
  ToolOutlined,
  BugOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { workPlansApi, type AvailablePMJob, type AvailableDefectJob, type SAPWorkOrder } from '@inspection/shared';

// Priority order for sorting
const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Cycle hours for sorting (descending)
const HOURS_CYCLES = [4000, 3000, 2000, 1500, 1000, 500, 250];

// Calendar cycles for sorting (ascending)
const CALENDAR_ORDER: Record<string, number> = {
  '3-weeks': 1,
  'monthly': 2,
  'quarterly': 3,
  '6-months': 4,
  'yearly': 5,
};

interface DraggableJobItemProps {
  job: any;
  jobType: string;
  onClick?: () => void;
  days?: { id: number; date: string; day_name: string }[];
  onQuickSchedule?: (job: any, jobType: string, dayId: number) => void;
}

const DraggableJobItem: React.FC<DraggableJobItemProps> = ({ job, jobType, onClick, days = [], onQuickSchedule }) => {
  const id = `pool-${jobType}-${job.id || job.equipment?.id || job.defect?.id || job.assignment?.id}`;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: {
      type: 'pool-job',
      job,
      jobType,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  const isOverdue = job.overdue_value && job.overdue_value > 0;
  const priority = job.priority || 'normal';

  // Equipment name (never serial number)
  const equipmentName = job.equipment?.name || job.defect?.equipment?.name || 'Unknown Equipment';

  // Description — strip equipment name prefix if the backend concatenated them, fall back to job type label
  const jobTypeLabel = jobType === 'inspection' ? 'Inspection' : jobType === 'defect' ? 'Defect' : 'PM';
  const rawDesc = job.description || job.defect?.description || job.assignment?.description || '';
  const description = rawDesc && equipmentName !== 'Unknown Equipment' && rawDesc.startsWith(equipmentName)
    ? rawDesc.slice(equipmentName.length).replace(/^[\s\-_.]+/, '').trim() || jobTypeLabel
    : rawDesc || jobTypeLabel;

  // Get cycle info for PRM
  const cycleLabel = job.cycle?.display_label || job.maintenance_base || '';

  // Priority colors
  const priorityColors: Record<string, string> = {
    urgent: '#ff4d4f',
    high: '#fa8c16',
    normal: '#1890ff',
    low: '#8c8c8c',
  };

  // Context menu for quick scheduling
  const contextMenuItems: MenuProps['items'] = days.length > 0 && onQuickSchedule ? [
    {
      key: 'schedule-header',
      label: <span style={{ fontWeight: 600, color: '#8c8c8c' }}>Quick Schedule to:</span>,
      disabled: true,
    },
    { type: 'divider' },
    ...days.map(day => ({
      key: `day-${day.id}`,
      label: `${day.day_name} (${day.date.slice(5)})`,
      onClick: () => onQuickSchedule(job, jobType, day.id),
    })),
  ] : [];

  const cardContent = (
    <div
      onClick={onClick}
      style={{
        marginBottom: 4,
        padding: '5px 8px',
        borderLeft: `3px solid ${isOverdue ? '#ff4d4f' : priorityColors[priority] || '#1890ff'}`,
        backgroundColor: isDragging ? '#f0f5ff' : '#fff',
        border: `1px solid ${isOverdue ? '#ffccc7' : '#f0f0f0'}`,
        borderLeftWidth: 3,
        borderRadius: 4,
        cursor: 'grab',
        userSelect: 'none',
      }}
    >
      {/* Row 1: Equipment name + overdue badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <div style={{
          fontWeight: 700, fontSize: 15, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#262626',
          background: '#fffbe6', borderRadius: 3, padding: '0 4px',
        }}>
          {equipmentName}
        </div>
        {isOverdue && (
          <span style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 700, whiteSpace: 'nowrap' }}>
            <WarningOutlined /> {job.overdue_value}{job.overdue_unit === 'hours' ? 'h' : 'd'}
          </span>
        )}
      </div>
      {/* Row 2: Description (single line, truncated) */}
      {description && (
        <div style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', color: '#262626', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {description.substring(0, 60)}{description.length > 60 ? '…' : ''}
        </div>
      )}
      {/* Row 3: Tags */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'nowrap' }}>
        <Tag
          color={priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'default'}
          style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px' }}
        >
          {priority.charAt(0).toUpperCase()}
        </Tag>
        {cycleLabel && (
          <Tag color="blue" style={{ fontSize: 9, margin: 0, padding: '0 4px', lineHeight: '16px' }}>
            {cycleLabel}
          </Tag>
        )}
      </div>
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {contextMenuItems.length > 0 ? (
        <Dropdown menu={{ items: contextMenuItems }} trigger={['contextMenu']}>
          {cardContent}
        </Dropdown>
      ) : (
        cardContent
      )}
    </div>
  );
};

interface JobsPoolProps {
  berth?: string;
  planId?: number;
  days?: { id: number; date: string; day_name: string }[];
  onAddJob?: () => void;
  onImportSAP?: () => void;
  onDownloadTemplate?: () => void;
  onJobClick?: (job: any, jobType: string) => void;
  onClearPool?: () => Promise<void>;
  onQuickSchedule?: (job: any, jobType: string, dayId: number) => void;
  /** When true, renders inline (no fixed positioning) to fit inside a parent panel */
  embedded?: boolean;
}

export const JobsPool: React.FC<JobsPoolProps> = ({
  berth,
  planId,
  days = [],
  onAddJob,
  onImportSAP,
  onJobClick,
  onClearPool,
  onQuickSchedule,
  embedded = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'prm' | 'defect'>('prm');
  const [prmSubTab, setPrmSubTab] = useState<'hourly' | 'calendar'>('hourly');
  const [searchText, setSearchText] = useState<string>('');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Droppable zone — accepts calendar jobs dragged back to remove them from the plan
  const { setNodeRef: setPoolDropRef, isOver: isPoolOver } = useDroppable({
    id: 'job-pool-drop',
    data: { type: 'pool' },
  });

  // Fetch available jobs including SAP orders from pool
  const { data: availableJobs, isLoading } = useQuery({
    queryKey: ['available-jobs', berth, planId],
    queryFn: () => workPlansApi.getAvailableJobs({ berth, plan_id: planId }).then(r => r.data),
    staleTime: 30000, // Cache for 30 seconds to prevent excessive refetches
    refetchOnWindowFocus: false,
  });

  // Get unique equipment list for filter
  const equipmentList = useMemo(() => {
    if (!availableJobs) return [];
    const equipmentMap = new Map<string, { id: number; name: string }>();

    [...(availableJobs.sap_orders || []), ...(availableJobs.defect_jobs || [])].forEach((job: any) => {
      const eq = job.equipment;
      if (eq && eq.id) {
        equipmentMap.set(eq.id.toString(), {
          id: eq.id,
          name: eq.name || eq.serial_number || `Equipment ${eq.id}`
        });
      }
    });

    return Array.from(equipmentMap.values());
  }, [availableJobs]);

  // Filter and sort jobs
  const { prmJobs, defectJobs } = useMemo(() => {
    if (!availableJobs) return { prmJobs: [], defectJobs: [] };

    const sapOrders = availableJobs.sap_orders || [];
    const defects = availableJobs.defect_jobs || [];
    // Inspections no longer shown in pool — they appear in InspectionSummaryBar

    // Filter function
    const filterJob = (job: any) => {
      // Text search filter
      if (searchText) {
        const search = searchText.toLowerCase();
        const equipName = (job.equipment?.name || '').toLowerCase();
        const equipSerial = (job.equipment?.serial_number || '').toLowerCase();
        const description = (job.description || job.defect?.description || '').toLowerCase();
        const orderNum = (job.order_number || '').toLowerCase();
        if (!equipName.includes(search) && !equipSerial.includes(search) &&
            !description.includes(search) && !orderNum.includes(search)) {
          return false;
        }
      }
      // Equipment filter
      if (equipmentFilter && job.equipment?.id?.toString() !== equipmentFilter) {
        return false;
      }
      // Priority filter
      if (priorityFilter !== 'all' && job.priority !== priorityFilter) {
        return false;
      }
      return true;
    };

    // PRM Jobs - from SAP orders with job_type === 'pm'
    let prm = sapOrders
      .filter((j: SAPWorkOrder) => j.job_type === 'pm')
      .filter(filterJob);

    // Sort PRM jobs
    prm = prm.sort((a: SAPWorkOrder, b: SAPWorkOrder) => {
      // Overdue first
      const aOverdue = (a.overdue_value || 0) > 0 ? 1 : 0;
      const bOverdue = (b.overdue_value || 0) > 0 ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;

      // Then by cycle type
      const aIsHourly = a.maintenance_base === 'running_hours';
      const bIsHourly = b.maintenance_base === 'running_hours';

      if (prmSubTab === 'hourly') {
        // Show hourly cycles, sorted descending by hours
        if (aIsHourly && !bIsHourly) return -1;
        if (!aIsHourly && bIsHourly) return 1;
        if (aIsHourly && bIsHourly) {
          const aHours = a.cycle?.hours_value || 0;
          const bHours = b.cycle?.hours_value || 0;
          return bHours - aHours; // Descending
        }
      } else {
        // Show calendar cycles, sorted ascending
        if (!aIsHourly && bIsHourly) return -1;
        if (aIsHourly && !bIsHourly) return 1;
        if (!aIsHourly && !bIsHourly) {
          const aOrder = CALENDAR_ORDER[a.cycle?.name || ''] || 99;
          const bOrder = CALENDAR_ORDER[b.cycle?.name || ''] || 99;
          return aOrder - bOrder; // Ascending
        }
      }

      return 0;
    });

    // Filter PRM by sub-tab
    if (prmSubTab === 'hourly') {
      prm = prm.filter((j: SAPWorkOrder) => j.maintenance_base === 'running_hours');
    } else {
      prm = prm.filter((j: SAPWorkOrder) => j.maintenance_base === 'calendar' || j.maintenance_base !== 'running_hours');
    }

    // Defect Jobs - from SAP orders with job_type === 'defect' + defect_jobs
    let defect = [
      ...sapOrders.filter((j: SAPWorkOrder) => j.job_type === 'defect'),
      ...defects.map((d: AvailableDefectJob) => ({
        ...d,
        equipment: d.equipment,
        description: d.defect?.description,
        priority: 'normal',
      })),
    ].filter(filterJob);

    // Sort defects by priority (urgent first), then overdue
    defect = defect.sort((a: any, b: any) => {
      // Overdue first
      const aOverdue = (a.overdue_value || 0) > 0 ? 1 : 0;
      const bOverdue = (b.overdue_value || 0) > 0 ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;

      // Then by priority
      const aPriority = PRIORITY_ORDER[a.priority || 'normal'] || 2;
      const bPriority = PRIORITY_ORDER[b.priority || 'normal'] || 2;
      return aPriority - bPriority;
    });

    return { prmJobs: prm, defectJobs: defect };
  }, [availableJobs, searchText, equipmentFilter, priorityFilter, prmSubTab]);

  // Counts
  const prmCount = prmJobs.length;
  const defectCount = defectJobs.length;
  const totalCount = prmCount + defectCount;

  // Get current jobs based on active tab
  const currentJobs = activeTab === 'prm' ? prmJobs : defectJobs;
  const currentJobType = activeTab === 'prm' ? 'sap' : 'defect';

  return (
    <div
      ref={setPoolDropRef}
      style={embedded ? {
        display: 'flex',
        flexDirection: 'column' as const,
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: isPoolOver ? '#fff1f0' : '#fff',
        outline: isPoolOver ? '2px dashed #ff4d4f' : undefined,
        outlineOffset: isPoolOver ? '-2px' : undefined,
        transition: 'background-color 0.15s, outline 0.15s',
      } : {
        position: 'fixed' as const,
        top: 0,
        right: 0,
        width: isCollapsed ? '40px' : '18%',
        minWidth: isCollapsed ? '40px' : '280px',
        height: '100vh',
        backgroundColor: '#fff',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        transition: 'width 0.3s ease',
      }}
    >
      {/* Collapse Toggle Button - standalone mode only */}
      {!embedded && (
        <Tooltip title={isCollapsed ? 'Open Jobs Pool' : 'Close Jobs Pool'} placement="left">
          <div
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%) translateX(-50%)',
              width: 24,
              height: 48,
              backgroundColor: '#1890ff',
              borderRadius: '4px 0 0 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '-2px 0 4px rgba(0,0,0,0.15)',
              zIndex: 1001,
            }}
          >
            {isCollapsed ? <LeftOutlined style={{ color: '#fff', fontSize: 12 }} /> : <RightOutlined style={{ color: '#fff', fontSize: 12 }} />}
          </div>
        </Tooltip>
      )}

      {/* Collapsed State - Show badge only (standalone mode) */}
      {!embedded && isCollapsed ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '16px 8px',
          }}
        >
          <span style={{ fontSize: 20 }}>📦</span>
          <Badge count={totalCount} style={{ backgroundColor: '#1890ff' }} />
        </div>
      ) : (
        <>
          {/* Header */}
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid #f0f0f0',
            backgroundColor: '#fafafa',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>📦</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Jobs Pool</span>
                <Badge count={totalCount} style={{ backgroundColor: '#1890ff' }} />
              </div>
              <Space size={4}>
                <Button size="small" type="primary" icon={<UploadOutlined />} onClick={onImportSAP}>
                  Import
                </Button>
                <Button size="small" icon={<PlusOutlined />} onClick={onAddJob}>
                  Add
                </Button>
                {totalCount > 0 && onClearPool && (
                  <Popconfirm
                    title="Clear all jobs from pool?"
                    description="This will remove all SAP orders from the pool."
                    onConfirm={onClearPool}
                    okText="Clear"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            </div>

            {/* Filters */}
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              {/* Text Search */}
              <Input
                placeholder="Search equipment, description..."
                allowClear
                size="small"
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />

              {/* Equipment Filter */}
              <Select
                placeholder="Filter by equipment..."
                allowClear
                showSearch
                style={{ width: '100%' }}
                size="small"
                value={equipmentFilter || undefined}
                onChange={(v) => setEquipmentFilter(v || '')}
                filterOption={(input, option) =>
                  (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                }
                options={equipmentList.map(eq => ({ value: eq.id.toString(), label: eq.name }))}
              />

              {/* Priority Filter */}
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'urgent', 'high', 'normal'].map(p => (
                  <Button
                    key={p}
                    size="small"
                    type={priorityFilter === p ? 'primary' : 'default'}
                    danger={p === 'urgent' && priorityFilter === p}
                    onClick={() => setPriorityFilter(p)}
                    style={{ flex: 1, fontSize: 10 }}
                  >
                    {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
            </Space>
          </div>

          {/* Tab bar — custom (no content area, zero gap) */}
          <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0', padding: '0 12px', flexShrink: 0 }}>
            {([
              { key: 'prm',    label: 'PRM',    icon: <ToolOutlined />, count: prmCount },
              { key: 'defect', label: 'Defect', icon: <BugOutlined />,  count: defectCount },
            ] as const).map(tab => (
              <div
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab.key ? '2px solid #1890ff' : '2px solid transparent',
                  marginBottom: -2,
                  color: activeTab === tab.key ? '#1890ff' : '#595959',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  fontSize: 12,
                  display: 'flex', alignItems: 'center', gap: 4,
                  userSelect: 'none',
                  transition: 'color 0.2s',
                }}
              >
                {tab.icon}
                {tab.label}
                {tab.count > 0 && (
                  <Badge count={tab.count} size="small" style={{ marginLeft: 2 }} />
                )}
              </div>
            ))}
          </div>

          {/* PRM Sub-tabs */}
          {activeTab === 'prm' && (
            <div style={{ padding: '6px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <Space size={4}>
                <Button
                  size="small"
                  type={prmSubTab === 'hourly' ? 'primary' : 'default'}
                  onClick={() => setPrmSubTab('hourly')}
                  icon={<ClockCircleOutlined />}
                >
                  Hourly
                </Button>
                <Button
                  size="small"
                  type={prmSubTab === 'calendar' ? 'primary' : 'default'}
                  onClick={() => setPrmSubTab('calendar')}
                >
                  Calendar
                </Button>
              </Space>
              <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 8 }}>
                {prmSubTab === 'hourly' ? '(4000h → 250h)' : '(3-weeks → yearly)'}
              </span>
            </div>
          )}

          {/* Jobs List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin />
              </div>
            ) : currentJobs.length === 0 ? (
              <Empty
                description={
                  searchText || equipmentFilter || priorityFilter !== 'all'
                    ? "No jobs match filters"
                    : `No ${activeTab.toUpperCase()} jobs available`
                }
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              currentJobs.map((job: any, index: number) => (
                <DraggableJobItem
                  key={`${currentJobType}-${job.id || index}`}
                  job={job}
                  jobType={currentJobType}
                  onClick={() => onJobClick?.(job, currentJobType)}
                  days={days}
                  onQuickSchedule={onQuickSchedule}
                />
              ))
            )}
          </div>

          {/* Footer hint */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid #f0f0f0',
            backgroundColor: isPoolOver ? '#fff1f0' : '#fafafa',
            fontSize: 11,
            color: isPoolOver ? '#ff4d4f' : '#8c8c8c',
            textAlign: 'center',
            transition: 'background-color 0.15s',
          }}>
            {isPoolOver ? '🗑 Release to remove from plan' : '↕ Drag to calendar · Drag back to remove'}
          </div>
        </>
      )}
    </div>
  );
};

export default JobsPool;
