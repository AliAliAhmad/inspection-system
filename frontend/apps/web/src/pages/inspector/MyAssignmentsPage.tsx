import { useState } from 'react';
import { Card, Table, Tag, Button, Typography, Alert, Tabs, Row, Col, Spin } from 'antd';
import {
  PlayCircleOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionAssignmentsApi,
  InspectionAssignment,
  MyAssignmentStats,
} from '@inspection/shared';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';
import { StatCard } from '../../components/shared/StatCard';

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  assigned: 'blue',
  in_progress: 'processing',
  completed: 'success',
};

export default function MyAssignmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Personal stats query
  const statsQuery = useQuery({
    queryKey: ['my-assignments', 'stats'],
    queryFn: () => inspectionAssignmentsApi.getMyStats().then((res) => res.data?.data),
    refetchInterval: 60000,
  });

  const stats: MyAssignmentStats | undefined = statsQuery.data;

  const { data, isLoading, error } = useOfflineQuery({
    queryKey: ['my-assignments', statusFilter, page],
    queryFn: () =>
      inspectionAssignmentsApi
        .getMyAssignments({
          status: statusFilter === 'all' ? undefined : statusFilter,
          page,
          per_page: pageSize,
        })
        .then((r) => r.data),
    cacheKey: `${CACHE_KEYS.myAssignments}-${statusFilter}-${page}`,
    cacheTtlMs: 30 * 60 * 1000, // 30 minutes
  });

  const assignments = data?.data ?? [];
  const pagination = data?.pagination;

  const columns: ColumnsType<InspectionAssignment> = [
    {
      title: t('equipment.name'),
      dataIndex: ['equipment', 'name'],
      key: 'equipment_name',
      render: (_: unknown, record: InspectionAssignment) =>
        record.equipment?.name ?? '-',
    },
    {
      title: t('equipment.type'),
      dataIndex: ['equipment', 'equipment_type'],
      key: 'equipment_type',
      render: (_: unknown, record: InspectionAssignment) =>
        record.equipment?.equipment_type ?? '-',
    },
    {
      title: `${t('equipment.location')} / ${t('equipment.berth')}`,
      key: 'location',
      render: (_: unknown, record: InspectionAssignment) => {
        const location = record.equipment?.location ?? '';
        const berth = record.berth ?? record.equipment?.berth ?? '';
        return [location, berth].filter(Boolean).join(' / ') || '-';
      },
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      render: (shift: string) => (
        <Tag color={shift === 'day' ? 'orange' : 'geekblue'}>
          {shift === 'day' ? 'Day' : 'Night'}
        </Tag>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status] ?? 'default'}>
          {t(`status.${status}`, status)}
        </Tag>
      ),
    },
    {
      title: 'Deadline',
      dataIndex: 'deadline',
      key: 'deadline',
      render: (deadline: string | null) =>
        deadline ? new Date(deadline).toLocaleDateString() : '-',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: InspectionAssignment) => {
        const status = record.status;
        if (status === 'assigned') {
          return (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => navigate(`/inspector/inspection/${record.id}`)}
            >
              {t('inspection.start')}
            </Button>
          );
        }
        if (status === 'in_progress') {
          return (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => navigate(`/inspector/inspection/${record.id}`)}
            >
              {t('common.details', 'Continue')}
            </Button>
          );
        }
        if (status === 'completed') {
          return (
            <Button
              icon={<EyeOutlined />}
              onClick={() => navigate(`/inspector/assessment/${record.id}`)}
            >
              {t('nav.assessments', 'View Assessment')}
            </Button>
          );
        }
        return null;
      },
    },
  ];

  // Calculate week progress
  const weekProgress = stats?.week?.total
    ? Math.round((stats.week.completed / stats.week.total) * 100)
    : 0;

  if (error) {
    return <Alert type="error" message={t('common.error')} showIcon />;
  }

  return (
    <div>
      {/* Stats Dashboard */}
      <Card style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginBottom: 16 }}>
          {t('nav.my_assignments')}
        </Typography.Title>

        {statsQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : stats ? (
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('inspections.today_total', 'Today Total')}
                value={stats.today.total}
                icon={<CalendarOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.assigned', 'Assigned')}
                value={stats.today.assigned}
                icon={<ClockCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.in_progress', 'In Progress')}
                value={stats.today.in_progress}
                icon={<PlayCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('inspections.today_completed', 'Today Completed')}
                value={stats.today.completed}
                icon={<CheckCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('inspections.week_completed', 'This Week')}
                value={stats.week.completed}
                suffix={`/ ${stats.week.total}`}
                progress={weekProgress}
                progressColor="#52c41a"
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('inspections.month_completed', 'This Month')}
                value={stats.month.completed}
                suffix={`/ ${stats.month.total}`}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('inspections.backlog', 'Backlog')}
                value={stats.backlog_count}
                icon={<ExclamationCircleOutlined />}
                tooltip={t('inspections.backlog_tooltip', 'Overdue inspections pending')}
              />
            </Col>
          </Row>
        ) : null}
      </Card>

      {/* Assignments List */}
      <Card>
        <Tabs
          activeKey={statusFilter}
          onChange={(key) => {
            setStatusFilter(key);
            setPage(1);
          }}
          items={[
            { key: 'all', label: t('common.all') },
            { key: 'assigned', label: t('status.assigned') },
            { key: 'in_progress', label: t('status.in_progress') },
            { key: 'completed', label: t('status.completed') },
          ]}
        />
        <Table<InspectionAssignment>
          rowKey="id"
          columns={columns}
          dataSource={assignments}
          loading={isLoading}
          locale={{ emptyText: t('common.noData') }}
          pagination={{
            current: pagination?.page ?? page,
            pageSize: pagination?.per_page ?? pageSize,
            total: pagination?.total ?? 0,
            showSizeChanger: false,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
}
