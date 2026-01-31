import {
  Card,
  Table,
  Tag,
  Badge,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionAssignmentsApi,
  type InspectionAssignment,
} from '@inspection/shared';

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

function getOverdueHours(deadline: string | null): number {
  if (!deadline) return 0;
  const diff = Date.now() - new Date(deadline).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}

function getOverdueLabel(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return `${days}d ${remaining}h`;
  }
  return `${hours}h`;
}

export default function BacklogPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['backlog-assignments'],
    queryFn: () => inspectionAssignmentsApi.getBacklog().then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d as any).data ?? [];
    }),
  });

  const assignments: InspectionAssignment[] = data || [];

  const columns: ColumnsType<InspectionAssignment> = [
    {
      title: t('backlog.equipment', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, record: InspectionAssignment) =>
        record.equipment?.name || `#${record.equipment_id}`,
      sorter: (a, b) =>
        (a.equipment?.name || '').localeCompare(b.equipment?.name || ''),
    },
    {
      title: t('backlog.shift', 'Shift'),
      dataIndex: 'shift',
      key: 'shift',
      render: (shift: string) => (
        <Tag color={shift === 'day' ? 'blue' : 'purple'}>
          {shift === 'day' ? t('routines.day', 'Day') : t('routines.night', 'Night')}
        </Tag>
      ),
    },
    {
      title: t('backlog.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{status.replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    {
      title: t('backlog.deadline', 'Deadline'),
      dataIndex: 'deadline',
      key: 'deadline',
      render: (deadline: string | null) => (
        <span style={{ color: '#ff4d4f' }}>{formatDateTime(deadline)}</span>
      ),
      sorter: (a, b) =>
        new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime(),
    },
    {
      title: t('backlog.overdueBy', 'Overdue By'),
      key: 'overdue_by',
      render: (_: unknown, record: InspectionAssignment) => {
        const hours = getOverdueHours(record.deadline);
        if (hours >= 24) {
          return <Badge status="error" text={<Tag color="red">{getOverdueLabel(hours)}</Tag>} />;
        }
        if (hours >= 8) {
          return <Badge status="warning" text={<Tag color="orange">{getOverdueLabel(hours)}</Tag>} />;
        }
        return <Badge status="processing" text={<Tag color="gold">{getOverdueLabel(hours)}</Tag>} />;
      },
      sorter: (a, b) => getOverdueHours(a.deadline) - getOverdueHours(b.deadline),
      defaultSortOrder: 'descend',
    },
    {
      title: t('backlog.assignedAt', 'Assigned At'),
      dataIndex: 'assigned_at',
      key: 'assigned_at',
      render: (v: string | null) => formatDateTime(v),
    },
  ];

  return (
    <Card
      title={
        <Typography.Title level={4}>
          {t('nav.backlog', 'Overdue Inspections')}{' '}
          {assignments.length > 0 && (
            <Tag color="red">{assignments.length}</Tag>
          )}
        </Typography.Title>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={assignments}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('backlog.noOverdue', 'No overdue inspections') }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 800 }}
      />
    </Card>
  );
}
