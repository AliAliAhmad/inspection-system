import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Rate,
  Typography,
  Tabs,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  engineerJobsApi,
  type EngineerJob,
} from '@inspection/shared';
import dayjs from 'dayjs';

const statusColorMap: Record<string, string> = {
  assigned: 'default',
  in_progress: 'processing',
  paused: 'warning',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'cyan',
};

export default function AllEngineerJobsPage() {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['engineer-jobs', page, perPage, statusFilter],
    queryFn: () => engineerJobsApi.list({ page, per_page: perPage, status: statusFilter }),
  });

  const columns: ColumnsType<EngineerJob> = [
    { title: t('engineerJobs.jobId', 'Job ID'), dataIndex: 'job_id', key: 'job_id' },
    { title: t('engineerJobs.title', 'Title'), dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: t('engineerJobs.engineer', 'Engineer'),
      dataIndex: 'engineer_id',
      key: 'engineer_id',
      render: (v: number) => `#${v}`,
    },
    {
      title: t('engineerJobs.type', 'Type'),
      dataIndex: 'job_type',
      key: 'job_type',
      render: (v: string) => <Tag>{v.replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    {
      title: t('engineerJobs.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={statusColorMap[s] || 'default'}>{s.replace(/_/g, ' ').toUpperCase()}</Tag>
      ),
    },
    {
      title: t('engineerJobs.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      render: (v: string | null) =>
        v ? <Tag color={v === 'major' ? 'red' : 'blue'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('engineerJobs.plannedDays', 'Planned (days)'),
      dataIndex: 'planned_time_days',
      key: 'planned_time_days',
      render: (v: number | null) => v != null ? v : '-',
    },
    {
      title: t('engineerJobs.plannedHours', 'Planned (hrs)'),
      dataIndex: 'planned_time_hours',
      key: 'planned_time_hours',
      render: (v: number | null) => v != null ? v.toFixed(1) : '-',
    },
    {
      title: t('engineerJobs.actualHours', 'Actual (hrs)'),
      dataIndex: 'actual_time_hours',
      key: 'actual_time_hours',
      render: (v: number | null) => v != null ? v.toFixed(1) : '-',
    },
    {
      title: t('engineerJobs.timeRating', 'Time Rating'),
      dataIndex: 'time_rating',
      key: 'time_rating',
      render: (v: number | null) => v != null ? <Rate disabled value={v} count={5} /> : '-',
    },
    {
      title: t('engineerJobs.qcRating', 'QC Rating'),
      dataIndex: 'qc_rating',
      key: 'qc_rating',
      render: (v: number | null) => v != null ? <Rate disabled value={v} count={5} /> : '-',
    },
    {
      title: t('engineerJobs.bonus', 'Bonus'),
      dataIndex: 'admin_bonus',
      key: 'admin_bonus',
      render: (v: number) => v || 0,
    },
    {
      title: t('engineerJobs.createdAt', 'Created'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
  ];

  const jobs = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const tabItems = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'assigned', label: t('engineerJobs.assigned', 'Assigned') },
    { key: 'in_progress', label: t('engineerJobs.inProgress', 'In Progress') },
    { key: 'completed', label: t('engineerJobs.completed', 'Completed') },
    { key: 'incomplete', label: t('engineerJobs.incomplete', 'Incomplete') },
    { key: 'qc_approved', label: t('engineerJobs.qcApproved', 'QC Approved') },
  ];

  return (
    <Card title={<Typography.Title level={4}>{t('nav.engineerJobs', 'All Engineer Jobs')}</Typography.Title>}>
      <Tabs
        activeKey={statusFilter || 'all'}
        onChange={(key) => { setStatusFilter(key === 'all' ? undefined : key); setPage(1); }}
        items={tabItems}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={jobs}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
          onChange: (p, ps) => { setPage(p); setPerPage(ps); },
        }}
        scroll={{ x: 1400 }}
      />
    </Card>
  );
}
