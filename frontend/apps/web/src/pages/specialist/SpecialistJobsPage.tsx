import { useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Tag,
  Button,
  Modal,
  InputNumber,
  message,
  Space,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  specialistJobsApi,
  SpecialistJob,
  JobStatus,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';

const STATUS_COLORS: Record<JobStatus, string> = {
  assigned: 'blue',
  in_progress: 'processing',
  paused: 'warning',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'green',
};

const CATEGORY_COLORS: Record<string, string> = {
  major: 'red',
  minor: 'orange',
};

type TabKey = 'pending' | 'active' | 'completed';

export default function SpecialistJobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [plannedTimeModalOpen, setPlannedTimeModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [plannedHours, setPlannedHours] = useState<number | null>(null);

  // Queries for each tab
  const pendingQuery = useQuery({
    queryKey: ['specialist-jobs', 'pending-planned-time'],
    queryFn: () => specialistJobsApi.getPendingPlannedTime(),
    select: (res) => res.data?.data ?? res.data ?? [],
    enabled: activeTab === 'pending',
  });

  const activeQuery = useQuery({
    queryKey: ['specialist-jobs', 'list', 'active'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'assigned,in_progress,paused' }),
    select: (res) => res.data?.data ?? [],
    enabled: activeTab === 'active',
  });

  const completedQuery = useQuery({
    queryKey: ['specialist-jobs', 'list', 'completed'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'completed,incomplete,qc_approved' }),
    select: (res) => res.data?.data ?? [],
    enabled: activeTab === 'completed',
  });

  // Mutation for entering planned time
  const enterPlannedTimeMutation = useMutation({
    mutationFn: ({ jobId, hours }: { jobId: number; hours: number }) =>
      specialistJobsApi.enterPlannedTime(jobId, hours),
    onSuccess: () => {
      message.success(t('common.save'));
      setPlannedTimeModalOpen(false);
      setSelectedJobId(null);
      setPlannedHours(null);
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const handleEnterTime = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setPlannedHours(null);
    setPlannedTimeModalOpen(true);
  }, []);

  const handlePlannedTimeSubmit = useCallback(() => {
    if (selectedJobId && plannedHours && plannedHours > 0) {
      enterPlannedTimeMutation.mutate({
        jobId: selectedJobId,
        hours: plannedHours,
      });
    }
  }, [selectedJobId, plannedHours, enterPlannedTimeMutation]);

  const getStatusTag = (status: JobStatus) => (
    <Tag color={STATUS_COLORS[status]}>
      {t(`status.${status}`)}
    </Tag>
  );

  const getCategoryTag = (category: string | null) => {
    if (!category) return '-';
    return <Tag color={CATEGORY_COLORS[category]}>{category}</Tag>;
  };

  // Column definitions
  const baseColumns: ColumnsType<SpecialistJob> = [
    {
      title: t('common.details'),
      dataIndex: 'job_id',
      key: 'job_id',
      render: (text: string) => <Typography.Text strong>{text}</Typography.Text>,
    },
    {
      title: t('common.status'),
      dataIndex: 'category',
      key: 'category',
      render: (_: unknown, record: SpecialistJob) => getCategoryTag(record.category),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: JobStatus) => getStatusTag(status),
    },
    {
      title: t('jobs.planned_time'),
      dataIndex: 'planned_time_hours',
      key: 'planned_time_hours',
      render: (val: number | null | undefined) =>
        val != null ? `${val}h` : '-',
    },
    {
      title: t('jobs.actual_time'),
      dataIndex: 'actual_time_hours',
      key: 'actual_time_hours',
      render: (val: number | null | undefined) =>
        val != null ? `${val.toFixed(1)}h` : '-',
    },
  ];

  const pendingColumns: ColumnsType<SpecialistJob> = [
    ...baseColumns,
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: SpecialistJob) => (
        <Button type="primary" size="small" onClick={() => handleEnterTime(record.id)}>
          {t('jobs.enter_planned_time')}
        </Button>
      ),
    },
  ];

  const activeColumns: ColumnsType<SpecialistJob> = [
    ...baseColumns,
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: SpecialistJob) => (
        <Button
          type="link"
          onClick={() => navigate(`/specialist/jobs/${record.id}`)}
        >
          {t('common.details')}
        </Button>
      ),
    },
  ];

  const completedColumns: ColumnsType<SpecialistJob> = [
    ...baseColumns,
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: SpecialistJob) => (
        <Button
          type="link"
          onClick={() => navigate(`/specialist/jobs/${record.id}`)}
        >
          {t('common.details')}
        </Button>
      ),
    },
  ];

  const getCurrentData = (): { data: SpecialistJob[]; loading: boolean } => {
    switch (activeTab) {
      case 'pending':
        return {
          data: (pendingQuery.data as SpecialistJob[]) ?? [],
          loading: pendingQuery.isLoading,
        };
      case 'active':
        return {
          data: (activeQuery.data as SpecialistJob[]) ?? [],
          loading: activeQuery.isLoading,
        };
      case 'completed':
        return {
          data: (completedQuery.data as SpecialistJob[]) ?? [],
          loading: completedQuery.isLoading,
        };
    }
  };

  const getCurrentColumns = (): ColumnsType<SpecialistJob> => {
    switch (activeTab) {
      case 'pending':
        return pendingColumns;
      case 'active':
        return activeColumns;
      case 'completed':
        return completedColumns;
    }
  };

  const { data, loading } = getCurrentData();

  const tabItems = [
    {
      key: 'pending',
      label: t('jobs.enter_planned_time'),
    },
    {
      key: 'active',
      label: t('status.in_progress'),
    },
    {
      key: 'completed',
      label: t('status.completed'),
    },
  ];

  return (
    <Card>
      <Typography.Title level={4}>{t('nav.my_jobs')}</Typography.Title>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={tabItems}
      />

      <Table<SpecialistJob>
        rowKey="id"
        columns={getCurrentColumns()}
        dataSource={data}
        loading={loading}
        locale={{ emptyText: t('common.noData') }}
        pagination={{ pageSize: 10 }}
      />

      {/* Enter Planned Time Modal */}
      <Modal
        title={t('jobs.enter_planned_time')}
        open={plannedTimeModalOpen}
        onOk={handlePlannedTimeSubmit}
        onCancel={() => {
          setPlannedTimeModalOpen(false);
          setSelectedJobId(null);
          setPlannedHours(null);
        }}
        confirmLoading={enterPlannedTimeMutation.isPending}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !plannedHours || plannedHours <= 0 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>{t('jobs.planned_time')}</Typography.Text>
          <InputNumber
            min={0.5}
            step={0.5}
            value={plannedHours}
            onChange={(val) => setPlannedHours(val)}
            style={{ width: '100%' }}
            placeholder="Hours"
            addonAfter="h"
          />
        </Space>
      </Modal>
    </Card>
  );
}
