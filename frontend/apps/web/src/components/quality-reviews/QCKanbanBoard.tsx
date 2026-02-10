import { useCallback } from 'react';
import { Card, Tag, Typography, Avatar, Tooltip, Badge, message } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KanbanBoard, KanbanColumn, KanbanJob } from '../shared/KanbanBoard';
import { QualityReview, qualityReviewsApi } from '@inspection/shared';

const { Text } = Typography;

interface QCKanbanBoardProps {
  reviews: QualityReview[];
  loading?: boolean;
  onRefresh?: () => void;
}

// Define columns for QC Kanban: Pending, Approved, Rejected, Validated
const QC_COLUMNS: KanbanColumn[] = [
  { id: 'pending', title: 'Pending', color: '#faad14', icon: <ClockCircleOutlined /> },
  { id: 'approved', title: 'Approved', color: '#52c41a', icon: <CheckCircleOutlined /> },
  { id: 'rejected', title: 'Rejected', color: '#f5222d', icon: <CloseCircleOutlined /> },
  { id: 'validated', title: 'Validated', color: '#1890ff', icon: <SafetyCertificateOutlined /> },
];

// Extended KanbanJob interface for QC reviews
interface QCKanbanJob extends KanbanJob {
  job_type: 'specialist' | 'engineer';
  sla_deadline: string | null;
  sla_met: boolean | null;
  rejection_category: string | null;
  admin_validation: 'valid' | 'wrong' | null;
  reviewed_at: string | null;
  quality_engineer?: {
    id: number;
    full_name: string;
  } | null;
}

// Custom card renderer for QC reviews
function QCReviewCard({
  job,
  onClick,
  isDragging,
}: {
  job: QCKanbanJob;
  onClick?: (job: QCKanbanJob) => void;
  isDragging?: boolean;
}) {
  const { t } = useTranslation();

  const isOverdue = job.sla_deadline && new Date(job.sla_deadline) < new Date() && job.status === 'pending';

  const getJobTypeColor = (type: string) => {
    return type === 'specialist' ? 'blue' : 'purple';
  };

  const getSLAColor = () => {
    if (job.sla_met === null) return undefined;
    return job.sla_met ? '#52c41a' : '#f5222d';
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        cursor: 'pointer',
        opacity: isDragging ? 0.5 : 1,
        borderLeft: `3px solid ${job.status === 'rejected' ? '#f5222d' : job.status === 'approved' ? '#52c41a' : '#faad14'}`,
      }}
      onClick={() => onClick?.(job)}
      hoverable
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block' }}>
            {job.job_type.toUpperCase()} #{job.job_id}
          </Text>
          {job.rejection_category && (
            <Text type="secondary" ellipsis style={{ fontSize: 12, display: 'block' }}>
              {job.rejection_category.replace(/_/g, ' ')}
            </Text>
          )}
        </div>
        {isOverdue && (
          <Tooltip title={t('qc.sla_overdue', 'SLA Overdue')}>
            <WarningOutlined style={{ color: '#f5222d', marginLeft: 8 }} />
          </Tooltip>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={getJobTypeColor(job.job_type)} style={{ margin: 0 }}>
            {job.job_type}
          </Tag>
          {job.sla_met !== null && (
            <Tag color={job.sla_met ? 'green' : 'red'} style={{ margin: 0 }}>
              {job.sla_met ? t('qc.sla_met', 'SLA Met') : t('qc.sla_breached', 'Breached')}
            </Tag>
          )}
          {job.admin_validation && (
            <Tag color={job.admin_validation === 'valid' ? 'cyan' : 'orange'} style={{ margin: 0 }}>
              {job.admin_validation}
            </Tag>
          )}
        </div>
        <Tooltip title={job.quality_engineer?.full_name || t('common.unassigned', 'Unassigned')}>
          <Avatar size="small" icon={<UserOutlined />} />
        </Tooltip>
      </div>

      {job.sla_deadline && job.status === 'pending' && (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 11, color: getSLAColor() }}>
            <ClockCircleOutlined /> {t('qc.due', 'Due')}: {new Date(job.sla_deadline).toLocaleDateString()}
          </Text>
        </div>
      )}
    </Card>
  );
}

export function QCKanbanBoard({ reviews, loading, onRefresh }: QCKanbanBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Transform QualityReview to QCKanbanJob format
  const kanbanJobs: QCKanbanJob[] = reviews.map((review) => {
    // Determine display status: if validated, show as 'validated', otherwise use review status
    const displayStatus = review.admin_validation ? 'validated' : review.status;

    return {
      id: review.id,
      job_id: String(review.job_id),
      status: displayStatus,
      job_type: review.job_type,
      sla_deadline: review.sla_deadline,
      sla_met: review.sla_met,
      rejection_category: review.rejection_category,
      admin_validation: review.admin_validation,
      reviewed_at: review.reviewed_at,
      quality_engineer: review.quality_engineer ? {
        id: review.quality_engineer.id,
        full_name: review.quality_engineer.full_name,
      } : null,
    };
  });

  const handleJobClick = useCallback((job: QCKanbanJob) => {
    navigate(`/quality/reviews/${job.id}`);
  }, [navigate]);

  const handleStatusChange = useCallback(async (jobId: number, newStatus: string) => {
    // QC reviews typically don't change status via drag/drop
    // This is mainly for viewing purposes
    message.info(t('qc.status_change_disabled', 'Status changes are made through review actions'));
  }, [t]);

  const renderCard = useCallback((job: KanbanJob) => {
    return <QCReviewCard job={job as QCKanbanJob} onClick={handleJobClick} />;
  }, [handleJobClick]);

  return (
    <KanbanBoard
      jobs={kanbanJobs}
      columns={QC_COLUMNS}
      onJobClick={handleJobClick}
      onStatusChange={handleStatusChange}
      loading={loading}
      renderCard={renderCard}
    />
  );
}

export default QCKanbanBoard;
