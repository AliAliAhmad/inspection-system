import React, { useState } from 'react';
import { Card, List, Tag, Button, Space, Input, Segmented, Empty, Spin, Badge, Tooltip } from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
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
import { workPlansApi, type AvailablePMJob, type AvailableDefectJob } from '@inspection/shared';

// Job type config
const JOB_TYPES = {
  all: { label: '📋 All', emoji: '📋' },
  pm: { label: '🔧 PM', emoji: '🔧' },
  defect: { label: '🔴 Defect', emoji: '🔴' },
  inspection: { label: '✅ Inspect', emoji: '✅' },
};

interface DraggableJobItemProps {
  job: any;
  jobType: string;
  onClick?: () => void;
}

const DraggableJobItem: React.FC<DraggableJobItemProps> = ({ job, jobType, onClick }) => {
  const id = `pool-${jobType}-${job.equipment?.id || job.defect?.id || job.assignment?.id}`;

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

  const emoji = JOB_TYPES[jobType as keyof typeof JOB_TYPES]?.emoji || '📋';
  const hasOrder = !!job.sap_order_number;
  const isOverdue = job.overdue_value && job.overdue_value > 0;
  const defectStatus = job.defect?.status;

  // Get display info based on job type
  let title = '';
  let subtitle = '';
  let priorityColor = 'blue';

  if (jobType === 'pm') {
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
          marginBottom: 8,
          borderLeft: `4px solid ${priorityColor === 'red' ? '#ff4d4f' : priorityColor === 'orange' ? '#faad14' : '#1890ff'}`,
          backgroundColor: isDragging ? '#f0f0f0' : '#fff',
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
  onAddJob?: () => void;
  onImportSAP?: () => void;
  onDownloadTemplate?: () => void;
  onJobClick?: (job: any, jobType: string) => void;
}

export const JobsPool: React.FC<JobsPoolProps> = ({
  berth,
  onAddJob,
  onImportSAP,
  onDownloadTemplate,
  onJobClick,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Fetch available jobs
  const { data: availableJobs, isLoading } = useQuery({
    queryKey: ['available-jobs', berth],
    queryFn: () => workPlansApi.getAvailableJobs({ berth }).then(r => r.data),
  });

  // Combine and filter jobs
  const allJobs = React.useMemo(() => {
    if (!availableJobs) return [];

    const jobs: Array<{ job: any; type: string }> = [];

    if (filter === 'all' || filter === 'pm') {
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
          (defect.description || '').toLowerCase().includes(searchLower)
        );
      });
    }

    return jobs;
  }, [availableJobs, filter, search]);

  const pmCount = availableJobs?.pm_jobs?.length || 0;
  const defectCount = availableJobs?.defect_jobs?.length || 0;
  const inspectionCount = availableJobs?.inspection_jobs?.length || 0;

  return (
    <Card
      title={
        <Space>
          <span style={{ fontSize: 16 }}>📦</span>
          <span>Jobs Pool</span>
          <Badge count={allJobs.length} style={{ backgroundColor: '#1890ff' }} />
        </Space>
      }
      size="small"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
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
          { label: <><Badge count={pmCount + defectCount + inspectionCount} size="small" offset={[8, 0]}>All</Badge></>, value: 'all' },
          { label: <><span>🔧</span> <Badge count={pmCount} size="small" /></>, value: 'pm' },
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
              key={`${type}-${index}`}
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
          ➕ Add Job
        </Button>
        <Button
          icon={<UploadOutlined />}
          block
          onClick={onImportSAP}
        >
          📥 Import SAP
        </Button>
        <Button
          type="link"
          icon={<DownloadOutlined />}
          block
          size="small"
          onClick={onDownloadTemplate}
        >
          📄 Download Template
        </Button>
      </Space>
    </Card>
  );
};

export default JobsPool;
