import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, Tabs, Segmented, Row, Col, Drawer } from 'antd';
import {
  PlusOutlined,
  EyeOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  LineChartOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '../../providers/AuthProvider';
import {
  engineerJobsApi,
  EngineerJob,
  formatDateTime,
} from '@inspection/shared';
import {
  EngineerStatsHeader,
  EngineerKanbanBoard,
  EngineerPerformanceChart,
  AIInsightsWidget,
} from '../../components/engineer-jobs';

const STATUS_COLOR: Record<string, string> = {
  assigned: 'blue',
  in_progress: 'processing',
  paused: 'orange',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'green',
};

const JOB_TYPE_COLOR: Record<string, string> = {
  custom_project: 'purple',
  system_review: 'cyan',
  special_task: 'geekblue',
};

type ViewMode = 'list' | 'kanban';

export default function EngineerJobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showInsights, setShowInsights] = useState(false);
  const pageSize = 10;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['engineer-jobs', statusFilter, page, user?.id],
    queryFn: () =>
      engineerJobsApi
        .list({
          status: statusFilter === 'all' ? undefined : statusFilter,
          engineer_id: user?.id,
          page,
          per_page: viewMode === 'kanban' ? 100 : pageSize,
        })
        .then((r) => r.data),
  });

  const jobs = data?.data ?? [];
  const pagination = data?.pagination;

  const columns: ColumnsType<EngineerJob> = [
    {
      title: t('common.id', 'Job ID'),
      dataIndex: 'job_id',
      key: 'job_id',
      width: 120,
    },
    {
      title: t('common.title', 'Title'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: t('common.type', 'Type'),
      dataIndex: 'job_type',
      key: 'job_type',
      render: (type: string) => (
        <Tag color={JOB_TYPE_COLOR[type] ?? 'default'}>
          {t(`jobs.type_${type}`, type.replace(/_/g, ' '))}
        </Tag>
      ),
    },
    {
      title: t('common.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      render: (cat: string | null) =>
        cat ? (
          <Tag color={cat === 'major' ? 'red' : 'blue'}>
            {t(`status.${cat}`, cat)}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status] ?? 'default'}>
          {t(`status.${status}`, status)}
        </Tag>
      ),
    },
    {
      title: t('jobs.planned_time', 'Planned Time'),
      key: 'planned_time',
      render: (_: unknown, record: EngineerJob) => {
        const parts: string[] = [];
        if (record.planned_time_days) parts.push(`${record.planned_time_days}d`);
        if (record.planned_time_hours) parts.push(`${record.planned_time_hours}h`);
        return parts.length > 0 ? parts.join(' ') : '-';
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 100,
      render: (_: unknown, record: EngineerJob) => (
        <Button
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/engineer/jobs/${record.id}`);
          }}
        >
          {t('common.view', 'View')}
        </Button>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message={t('common.error', 'An error occurred')} showIcon />;
  }

  return (
    <div>
      {/* Stats Header */}
      <EngineerStatsHeader engineerId={user?.id} period="week" />

      {/* Page Header */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.my_jobs', 'My Jobs')}
        </Typography.Title>
        <Space>
          <Button
            icon={<RobotOutlined />}
            onClick={() => setShowInsights(true)}
          >
            {t('jobs.ai_insights', 'AI Insights')}
          </Button>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as ViewMode)}
            options={[
              { label: <UnorderedListOutlined />, value: 'list' },
              { label: <AppstoreOutlined />, value: 'kanban' },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/engineer/jobs/create')}
          >
            {t('nav.create_job', 'Create Job')}
          </Button>
        </Space>
      </Space>

      {/* Status Tabs */}
      <Tabs
        activeKey={statusFilter}
        onChange={(key) => {
          setStatusFilter(key);
          setPage(1);
        }}
        items={[
          { key: 'all', label: t('common.all', 'All') },
          { key: 'assigned', label: t('status.assigned', 'Assigned') },
          { key: 'in_progress', label: t('status.in_progress', 'In Progress') },
          { key: 'paused', label: t('status.paused', 'Paused') },
          { key: 'completed', label: t('status.completed', 'Completed') },
        ]}
      />

      {/* View Content */}
      {viewMode === 'list' ? (
        <Card>
          <Table<EngineerJob>
            rowKey="id"
            columns={columns}
            dataSource={jobs}
            loading={isLoading}
            locale={{ emptyText: t('common.noData', 'No data') }}
            onRow={(record) => ({
              onClick: () => navigate(`/engineer/jobs/${record.id}`),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: pagination?.page ?? page,
              pageSize: pagination?.per_page ?? pageSize,
              total: pagination?.total ?? 0,
              showSizeChanger: false,
              onChange: (p) => setPage(p),
            }}
          />
        </Card>
      ) : (
        <EngineerKanbanBoard
          jobs={jobs}
          loading={isLoading}
          onRefresh={() => refetch()}
        />
      )}

      {/* Performance Chart */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={24}>
          <EngineerPerformanceChart engineerId={user?.id} />
        </Col>
      </Row>

      {/* AI Insights Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            {t('jobs.ai_insights', 'AI Insights')}
          </Space>
        }
        open={showInsights}
        onClose={() => setShowInsights(false)}
        width={400}
      >
        <AIInsightsWidget engineerId={user?.id} />
      </Drawer>
    </div>
  );
}
