import React from 'react';
import { Tooltip, Tag, Badge } from 'antd';
import { UserOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
import type { WorkPlanJob, ComputedPriority } from '@inspection/shared';
import { useTranslation } from 'react-i18next';

// Job type emojis
const JOB_TYPE_EMOJI: Record<string, string> = {
  pm: '🔧',
  defect: '🔴',
  inspection: '✅',
};

// Priority styles
const PRIORITY_STYLES: Record<ComputedPriority, { bg: string; border: string; text: string }> = {
  normal: { bg: '#e6f7ff', border: '#91d5ff', text: '#1890ff' },
  high: { bg: '#fff7e6', border: '#ffc53d', text: '#d48806' },
  critical: { bg: '#fff1f0', border: '#ff4d4f', text: '#cf1322' },
};

// Priority emoji
const PRIORITY_EMOJI: Record<ComputedPriority, string> = {
  normal: '🟢',
  high: '🟠',
  critical: '🔴',
};

interface TimelineJobBlockProps {
  job: WorkPlanJob;
  onClick?: () => void;
  isDragging?: boolean;
  compact?: boolean;
  droppable?: boolean; // Enable dropping employees on this job
}

export const TimelineJobBlock: React.FC<TimelineJobBlockProps> = ({
  job,
  onClick,
  isDragging = false,
  compact = false,
  droppable = true,
}) => {
  const { t } = useTranslation();

  // Make this a drop target for employees
  const { setNodeRef, isOver } = useDroppable({
    id: `job-${job.id}`,
    data: { type: 'job', job },
    disabled: !droppable,
  });

  const priority = job.computed_priority || 'normal';
  const style = PRIORITY_STYLES[priority];
  const isOverdue = job.overdue_value && job.overdue_value > 0;

  const equipmentName = job.equipment?.serial_number || job.equipment?.name || '';
  const teamCount = job.assignments?.length || 0;
  const leadUser = job.assignments?.find(a => a.is_lead)?.user;

  const containerStyle: React.CSSProperties = {
    backgroundColor: isOver ? '#d9f7be' : style.bg,
    borderLeft: `4px solid ${isOver ? '#52c41a' : style.border}`,
    borderRadius: '6px',
    padding: compact ? '6px 8px' : '8px 12px',
    cursor: onClick ? 'pointer' : 'default',
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : isOver ? '0 0 0 2px #52c41a' : '0 1px 4px rgba(0,0,0,0.08)',
    transition: 'box-shadow 0.2s, opacity 0.2s, background-color 0.2s',
    marginBottom: '4px',
  };

  const content = (
    <div ref={setNodeRef} style={containerStyle} onClick={onClick}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: compact ? '2px' : '4px' }}>
        <span style={{ fontSize: compact ? '14px' : '16px' }}>{JOB_TYPE_EMOJI[job.job_type]}</span>
        {isOverdue && <span style={{ fontSize: compact ? '12px' : '14px' }}>⚠️</span>}
        <span style={{
          fontWeight: 500,
          fontSize: compact ? '12px' : '13px',
          color: '#262626',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {equipmentName}
        </span>
        <span style={{ fontSize: compact ? '11px' : '12px', color: '#8c8c8c' }}>
          {job.estimated_hours}h
        </span>
      </div>

      {/* Description if available */}
      {!compact && job.description && (
        <div style={{
          fontSize: '11px',
          color: '#595959',
          marginBottom: '4px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {job.description}
        </div>
      )}

      {/* Details row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Team indicator */}
        {teamCount > 0 && (
          <span style={{ fontSize: compact ? '11px' : '12px', color: '#595959' }}>
            👥 {leadUser ? leadUser.full_name.split(' ')[0] : teamCount}
            {teamCount > 1 && !compact && ` +${teamCount - 1}`}
          </span>
        )}

        {/* Overdue badge */}
        {isOverdue && (
          <Tag
            color={priority === 'critical' ? 'red' : 'orange'}
            style={{
              margin: 0,
              fontSize: compact ? '10px' : '11px',
              padding: '0 4px',
              lineHeight: compact ? '16px' : '18px'
            }}
          >
            {PRIORITY_EMOJI[priority]} {job.overdue_value} {job.overdue_unit === 'hours' ? 'h' : 'd'}
          </Tag>
        )}

        {/* Cycle info */}
        {!compact && job.cycle && (
          <Tag style={{ margin: 0, fontSize: '10px', padding: '0 4px' }}>
            {job.cycle.display_label}
          </Tag>
        )}

        {/* SAP order number */}
        {!compact && job.sap_order_number && (
          <span style={{ fontSize: '10px', color: '#8c8c8c' }}>
            #{job.sap_order_number}
          </span>
        )}
      </div>
    </div>
  );

  // Wrap in tooltip for more details
  const tooltipContent = (
    <div>
      <div style={{ marginBottom: '4px' }}>
        <strong>{JOB_TYPE_EMOJI[job.job_type]} {job.job_type.toUpperCase()}</strong>
        {job.sap_order_number && ` - #${job.sap_order_number}`}
      </div>
      {equipmentName && <div>📦 {equipmentName}</div>}
      {job.description && <div>📝 {job.description}</div>}
      <div>⏱️ {job.estimated_hours} hours</div>
      {isOverdue && (
        <div style={{ color: style.text }}>
          ⚠️ Overdue: {job.overdue_value} {job.overdue_unit}
        </div>
      )}
      {teamCount > 0 && (
        <div>
          👥 Team: {job.assignments?.map(a =>
            `${a.user?.full_name}${a.is_lead ? ' (Lead)' : ''}`
          ).join(', ')}
        </div>
      )}
      {job.notes && <div style={{ fontStyle: 'italic' }}>💬 {job.notes}</div>}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="right" mouseEnterDelay={0.5}>
      {content}
    </Tooltip>
  );
};

export default TimelineJobBlock;
