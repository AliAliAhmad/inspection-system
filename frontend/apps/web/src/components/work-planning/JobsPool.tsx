import React, { useState, useMemo } from 'react';
import { Card, Tag, Button, Space, Input, Select, Empty, Spin, Badge, Popconfirm, Tabs } from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  SearchOutlined,
  ToolOutlined,
  BugOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
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
}

const DraggableJobItem: React.FC<DraggableJobItemProps> = ({ job, jobType, onClick }) => {
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

  // Get equipment name
  const equipmentName = job.equipment?.serial_number || job.equipment?.name || 'Unknown Equipment';

  // Get description
  const description = job.description || job.defect?.description || '';

  // Get cycle info for PRM
  const cycleLabel = job.cycle?.display_label || job.maintenance_base || '';

  // Priority colors
  const priorityColors: Record<string, string> = {
    urgent: '#ff4d4f',
    high: '#fa8c16',
    normal: '#1890ff',
    low: '#8c8c8c',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        size="small"
        hoverable
        onClick={onClick}
        style={{
          marginBottom: 8,
          borderLeft: `4px solid ${isOverdue ? '#ff4d4f' : priorityColors[priority] || '#1890ff'}`,
          backgroundColor: isDragging ? '#f0f0f0' : '#fff',
        }}
        bodyStyle={{ padding: '10px 12px' }}
      >
        {/* Equipment Name */}
        <div style={{
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {equipmentName}
        </div>

        {/* Description */}
        {description && (
          <div style={{
            fontSize: 12,
            color: '#595959',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {description.substring(0, 50)}{description.length > 50 ? '...' : ''}
          </div>
        )}

        {/* Tags Row */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Priority Tag */}
          <Tag
            color={priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'default'}
            style={{ fontSize: 10, margin: 0 }}
          >
            {priority.toUpperCase()}
          </Tag>

          {/* Cycle Tag for PRM */}
          {cycleLabel && (
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
              {cycleLabel}
            </Tag>
          )}

          {/* Overdue Tag */}
          {isOverdue && (
            <Tag color="error" style={{ fontSize: 10, margin: 0 }}>
              <WarningOutlined /> {job.overdue_value}{job.overdue_unit === 'hours' ? 'h' : 'd'} overdue
            </Tag>
          )}
        </div>
      </Card>
    </div>
  );
};

interface JobsPoolProps {
  berth?: string;
  planId?: number;
  onAddJob?: () => void;
  onImportSAP?: () => void;
  onDownloadTemplate?: () => void;
  onJobClick?: (job: any, jobType: string) => void;
  onClearPool?: () => Promise<void>;
}

export const JobsPool: React.FC<JobsPoolProps> = ({
  berth,
  planId,
  onAddJob,
  onImportSAP,
  onJobClick,
  onClearPool,
}) => {
  const [activeTab, setActiveTab] = useState<'prm' | 'defect' | 'ins'>('prm');
  const [prmSubTab, setPrmSubTab] = useState<'hourly' | 'calendar'>('hourly');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Fetch available jobs including SAP orders from pool
  const { data: availableJobs, isLoading } = useQuery({
    queryKey: ['available-jobs', berth, planId],
    queryFn: () => workPlansApi.getAvailableJobs({ berth, plan_id: planId }).then(r => r.data),
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
          name: eq.serial_number || eq.name || `Equipment ${eq.id}`
        });
      }
    });

    return Array.from(equipmentMap.values());
  }, [availableJobs]);

  // Filter and sort jobs
  const { prmJobs, defectJobs, insJobs } = useMemo(() => {
    if (!availableJobs) return { prmJobs: [], defectJobs: [], insJobs: [] };

    const sapOrders = availableJobs.sap_orders || [];
    const defects = availableJobs.defect_jobs || [];
    const inspections = availableJobs.inspection_jobs || [];

    // Filter function
    const filterJob = (job: any) => {
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

    // Inspection Jobs
    let ins = inspections.map((i: any) => ({
      ...i,
      equipment: i.assignment?.equipment,
      description: i.assignment?.template?.name || 'Inspection',
      priority: 'normal',
    })).filter(filterJob);

    return { prmJobs: prm, defectJobs: defect, insJobs: ins };
  }, [availableJobs, equipmentFilter, priorityFilter, prmSubTab]);

  // Counts
  const prmCount = prmJobs.length;
  const defectCount = defectJobs.length;
  const insCount = insJobs.length;
  const totalCount = prmCount + defectCount + insCount;

  // Get current jobs based on active tab
  const currentJobs = activeTab === 'prm' ? prmJobs : activeTab === 'defect' ? defectJobs : insJobs;
  const currentJobType = activeTab === 'prm' ? 'sap' : activeTab === 'defect' ? 'defect' : 'inspection';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '30%',
        height: '100vh',
        backgroundColor: '#fff',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #f0f0f0',
        backgroundColor: '#fafafa'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📦</span>
            <span style={{ fontWeight: 600, fontSize: 16 }}>Jobs Pool</span>
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
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
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
                style={{ flex: 1, fontSize: 11 }}
              >
                {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
          </div>
        </Space>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'prm' | 'defect' | 'ins')}
        size="small"
        style={{ padding: '0 16px' }}
        items={[
          {
            key: 'prm',
            label: (
              <span>
                <ToolOutlined /> PRM <Badge count={prmCount} size="small" style={{ marginLeft: 4 }} />
              </span>
            ),
          },
          {
            key: 'defect',
            label: (
              <span>
                <BugOutlined /> Defect <Badge count={defectCount} size="small" style={{ marginLeft: 4 }} />
              </span>
            ),
          },
          {
            key: 'ins',
            label: (
              <span>
                <EyeOutlined /> INS <Badge count={insCount} size="small" style={{ marginLeft: 4 }} />
              </span>
            ),
          },
        ]}
      />

      {/* PRM Sub-tabs */}
      {activeTab === 'prm' && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
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
          <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 12 }}>
            {prmSubTab === 'hourly' ? '(4000h → 250h)' : '(3-weeks → yearly)'}
          </span>
        </div>
      )}

      {/* Jobs List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : currentJobs.length === 0 ? (
          <Empty
            description={
              equipmentFilter || priorityFilter !== 'all'
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
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #f0f0f0',
        backgroundColor: '#fafafa',
        fontSize: 12,
        color: '#8c8c8c',
        textAlign: 'center'
      }}>
        👆 Drag jobs to calendar to schedule
      </div>
    </div>
  );
};

export default JobsPool;
