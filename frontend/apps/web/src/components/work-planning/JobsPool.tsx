import React, { useState } from 'react';
import { Card, Tag, Button, Space, Input, Segmented, Empty, Spin, Badge, Tooltip, Collapse } from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  SearchOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { workPlansApi, type AvailablePMJob, type AvailableDefectJob, type SAPWorkOrder } from '@inspection/shared';

// Job type config
const JOB_TYPES = {
  all: { label: '📋 All', emoji: '📋' },
  sap: { label: '📦 SAP', emoji: '📦' },
  pm: { label: '🔧 PM', emoji: '🔧' },
  defect: { label: '🔴 Defect', emoji: '🔴' },
  inspection: { label: '✅ Inspect', emoji: '✅' },
};

interface DraggableJobItemProps {
  job: any;
  jobType: string;
  onClick?: () => void;
  horizontal?: boolean;
}

const DraggableJobItem: React.FC<DraggableJobItemProps> = ({ job, jobType, onClick, horizontal }) => {
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
    ...(horizontal ? { flexShrink: 0, width: 200 } : {}),
  };

  const emoji = JOB_TYPES[jobType as keyof typeof JOB_TYPES]?.emoji || '📋';
  const hasOrder = !!job.sap_order_number || !!job.order_number;
  const isOverdue = job.overdue_value && job.overdue_value > 0;
  const defectStatus = job.defect?.status;

  // Get display info based on job type
  let title = '';
  let subtitle = '';
  let priorityColor = 'blue';

  if (jobType === 'sap') {
    // SAP order from pool
    title = job.equipment?.serial_number || job.equipment?.name || 'Unknown';
    subtitle = job.order_number + (job.description ? ` - ${job.description.substring(0, 30)}` : '');
    priorityColor = job.priority === 'high' || job.priority === 'urgent' ? 'orange' : 'blue';
    if (isOverdue) priorityColor = 'red';
  } else if (jobType === 'pm') {
    title = job.equipment?.serial_number || job.equipment?.name || 'Unknown';
    subtitle = job.equipment?.equipment_type || '';
    if (job.related_defects_count > 0) {
      priorityColor = 'orange';
    }
  } else if (jobType === 'defect') {
    title = job.equipment?.serial_number || 'Unknown Equipment';
    subtitle = job.defect?.description?.substring(0, 40) + '...' || '';
    priorityColor = defectStatus === 'in_progress' ? 'orange' : 'red';
  } else if (jobType === 'inspection') {
    title = job.equipment?.serial_number || 'Unknown';
    subtitle = job.template?.name || 'Inspection';
    priorityColor = 'green';
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <Card
        size="small"
        hoverable
        onClick={onClick}
        style={{
          marginBottom: horizontal ? 0 : 8,
          marginRight: horizontal ? 8 : 0,
          borderLeft: `4px solid ${priorityColor === 'red' ? '#ff4d4f' : priorityColor === 'orange' ? '#faad14' : '#1890ff'}`,
          backgroundColor: isDragging ? '#f0f0f0' : '#fff',
          height: horizontal ? '100%' : 'auto',
        }}
        bodyStyle={{ padding: '8px 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 500,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {title}
            </div>
            <div style={{
              fontSize: 11,
              color: '#8c8c8c',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {subtitle}
            </div>
            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {!hasOrder && jobType !== 'pm' && (
                <Tag color="error" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  ⚠️ No Order
                </Tag>
              )}
              {isOverdue && (
                <Tag color="warning" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  ⏰ Overdue
                </Tag>
              )}
              {jobType === 'pm' && job.related_defects_count > 0 && (
                <Tag color="orange" style={{ fontSize: 10, margin: 0, padding: '0 4px' }}>
                  🔴 {job.related_defects_count} defects
                </Tag>
              )}
              {jobType === 'defect' && defectStatus && (
                <Tag
                  color={defectStatus === 'in_progress' ? 'processing' : 'default'}
                  style={{ fontSize: 10, margin: 0, padding: '0 4px' }}
                >
                  {defectStatus === 'in_progress' ? '🔄 In Progress' : '📋 Open'}
                </Tag>
              )}
            </div>
          </div>
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
  horizontal?: boolean;
}

export const JobsPool: React.FC<JobsPoolProps> = ({
  berth,
  planId,
  onAddJob,
  onImportSAP,
  onDownloadTemplate,
  onJobClick,
  horizontal = false,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  // Fetch available jobs including SAP orders from pool
  const { data: availableJobs, isLoading } = useQuery({
    queryKey: ['available-jobs', berth, planId],
    queryFn: () => workPlansApi.getAvailableJobs({ berth, plan_id: planId }).then(r => r.data),
  });

  // Combine and filter jobs
  const allJobs = React.useMemo(() => {
    if (!availableJobs) return [];

    const jobs: Array<{ job: any; type: string }> = [];

    // SAP orders first (most important - from imported pool)
    if (filter === 'all' || filter === 'sap') {
      (availableJobs.sap_orders || []).forEach((j: SAPWorkOrder) => {
        jobs.push({ job: j, type: 'sap' });
      });
    }

    // Only show PM jobs if no SAP orders (to avoid duplicates)
    if ((filter === 'all' || filter === 'pm') && !availableJobs.sap_orders?.length) {
      (availableJobs.pm_jobs || []).forEach((j: AvailablePMJob) => {
        jobs.push({ job: j, type: 'pm' });
      });
    }

    if (filter === 'all' || filter === 'defect') {
      (availableJobs.defect_jobs || []).forEach((j: AvailableDefectJob) => {
        jobs.push({ job: j, type: 'defect' });
      });
    }

    if (filter === 'all' || filter === 'inspection') {
      (availableJobs.inspection_jobs || []).forEach((j: any) => {
        jobs.push({ job: j, type: 'inspection' });
      });
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      return jobs.filter(({ job }) => {
        const equipment = job.equipment || {};
        const defect = job.defect || {};
        return (
          (equipment.serial_number || '').toLowerCase().includes(searchLower) ||
          (equipment.name || '').toLowerCase().includes(searchLower) ||
          (defect.description || '').toLowerCase().includes(searchLower) ||
          (job.order_number || '').toLowerCase().includes(searchLower) ||
          (job.description || '').toLowerCase().includes(searchLower)
        );
      });
    }

    return jobs;
  }, [availableJobs, filter, search]);

  const sapCount = availableJobs?.sap_orders?.length || 0;
  const pmCount = availableJobs?.pm_jobs?.length || 0;
  const defectCount = availableJobs?.defect_jobs?.length || 0;
  const inspectionCount = availableJobs?.inspection_jobs?.length || 0;

  if (horizontal) {
    // Horizontal layout - full width with horizontal scrolling
    return (
      <Card
        size="small"
        style={{ marginBottom: 8 }}
        bodyStyle={{ padding: collapsed ? '8px 12px' : '12px' }}
      >
        {/* Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: collapsed ? 0 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📦</span>
            <span style={{ fontWeight: 600 }}>Jobs Pool</span>
            <Badge count={allJobs.length} style={{ backgroundColor: '#1890ff' }} />
            {sapCount > 0 && <Tag color="blue">{sapCount} SAP</Tag>}
            {defectCount > 0 && <Tag color="red">{defectCount} Defects</Tag>}
            {inspectionCount > 0 && <Tag color="green">{inspectionCount} Inspect</Tag>}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <Input
            placeholder="🔍 Search..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            size="small"
            style={{ width: 200 }}
          />

          {/* Filter Tabs */}
          <Segmented
            size="small"
            value={filter}
            onChange={v => setFilter(v as string)}
            options={[
              { label: 'All', value: 'all' },
              ...(sapCount > 0 ? [{ label: `📦 ${sapCount}`, value: 'sap' }] : []),
              { label: `🔴 ${defectCount}`, value: 'defect' },
              { label: `✅ ${inspectionCount}`, value: 'inspection' },
            ]}
          />

          {/* Action Buttons */}
          <Space size={4}>
            <Button size="small" type="primary" icon={<UploadOutlined />} onClick={onImportSAP}>
              Import SAP
            </Button>
            <Button size="small" icon={<PlusOutlined />} onClick={onAddJob}>
              Add Job
            </Button>
            <Button
              size="small"
              type="text"
              icon={collapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
          </Space>
        </div>

        {/* Jobs Row - Horizontal Scroll */}
        {!collapsed && (
          <div
            style={{
              display: 'flex',
              overflowX: 'auto',
              gap: 0,
              paddingBottom: 8,
              minHeight: 100,
            }}
          >
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 20 }}>
                <Spin />
              </div>
            ) : allJobs.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 20, color: '#8c8c8c' }}>
                {search ? "No jobs match search" : "No available jobs - Import SAP orders to get started"}
              </div>
            ) : (
              allJobs.map(({ job, type }, index) => (
                <DraggableJobItem
                  key={`${type}-${job.id || index}`}
                  job={job}
                  jobType={type}
                  onClick={() => onJobClick?.(job, type)}
                  horizontal
                />
              ))
            )}
          </div>
        )}

        {/* Collapsed hint */}
        {collapsed && allJobs.length > 0 && (
          <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 8 }}>
            👆 Drag jobs to calendar | Click to expand
          </span>
        )}
      </Card>
    );
  }

  // Vertical layout (original)
  return (
    <Card
      title={
        <Space>
          <span style={{ fontSize: 16 }}>📦</span>
          <span>Jobs Pool</span>
          <Badge count={allJobs.length} style={{ backgroundColor: '#1890ff' }} />
          {sapCount > 0 && <Tag color="blue">{sapCount} SAP Orders</Tag>}
        </Space>
      }
      size="small"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 400 }}
      bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 12 }}
      extra={
        <Tooltip title="Drag jobs to calendar to schedule">
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>👆 Drag to schedule</span>
        </Tooltip>
      }
    >
      {/* Search */}
      <Input
        placeholder="🔍 Search equipment..."
        prefix={<SearchOutlined />}
        value={search}
        onChange={e => setSearch(e.target.value)}
        allowClear
        size="small"
        style={{ marginBottom: 8 }}
      />

      {/* Filter */}
      <Segmented
        size="small"
        block
        value={filter}
        onChange={v => setFilter(v as string)}
        options={[
          { label: <><Badge count={sapCount + defectCount + inspectionCount} size="small" offset={[8, 0]}>All</Badge></>, value: 'all' },
          ...(sapCount > 0 ? [{ label: <><span>📦</span> <Badge count={sapCount} size="small" style={{ backgroundColor: '#1890ff' }} /></>, value: 'sap' }] : []),
          { label: <><span>🔴</span> <Badge count={defectCount} size="small" /></>, value: 'defect' },
          { label: <><span>✅</span> <Badge count={inspectionCount} size="small" /></>, value: 'inspection' },
        ]}
        style={{ marginBottom: 12 }}
      />

      {/* Jobs List */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : allJobs.length === 0 ? (
          <Empty
            description={search ? "No jobs match search" : "No available jobs"}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          allJobs.map(({ job, type }, index) => (
            <DraggableJobItem
              key={`${type}-${job.id || index}`}
              job={job}
              jobType={type}
              onClick={() => onJobClick?.(job, type)}
            />
          ))
        )}
      </div>

      {/* Action Buttons */}
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          block
          onClick={onAddJob}
        >
          Add Job
        </Button>
        <Button
          icon={<UploadOutlined />}
          block
          onClick={onImportSAP}
        >
          Import SAP
        </Button>
        <Button
          type="link"
          icon={<DownloadOutlined />}
          block
          size="small"
          onClick={onDownloadTemplate}
        >
          Download Template
        </Button>
      </Space>
    </Card>
  );
};

export default JobsPool;
