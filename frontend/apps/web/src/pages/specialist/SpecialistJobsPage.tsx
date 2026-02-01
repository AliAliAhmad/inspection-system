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
  Input,
  Upload,
  message,
  Space,
  Divider,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UploadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  specialistJobsApi,
  filesApi,
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
  cancelled: 'default',
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

  const [activeTab, setActiveTab] = useState<TabKey>('pending');

  // Start Job Modal state
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [plannedHours, setPlannedHours] = useState<number | null>(null);

  // Wrong Finding state (within start modal)
  const [showWrongFinding, setShowWrongFinding] = useState(false);
  const [wrongFindingReason, setWrongFindingReason] = useState('');
  const [wrongFindingPhotoPath, setWrongFindingPhotoPath] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Pending tab: assigned jobs (not started yet)
  const pendingQuery = useQuery({
    queryKey: ['specialist-jobs', 'list', 'pending'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'assigned' }),
    select: (res) => res.data?.data ?? [],
    enabled: activeTab === 'pending',
  });

  // Active tab: in_progress + paused
  const activeQuery = useQuery({
    queryKey: ['specialist-jobs', 'list', 'active'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'in_progress,paused' }),
    select: (res) => res.data?.data ?? [],
    enabled: activeTab === 'active',
  });

  const completedQuery = useQuery({
    queryKey: ['specialist-jobs', 'list', 'completed'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'completed,incomplete,qc_approved,cancelled' }),
    select: (res) => res.data?.data ?? [],
    enabled: activeTab === 'completed',
  });

  // Start job mutation (combined: set planned time + start)
  const startJobMutation = useMutation({
    mutationFn: ({ jobId, hours }: { jobId: number; hours: number }) =>
      specialistJobsApi.start(jobId, hours),
    onSuccess: (_, variables) => {
      message.success(t('jobs.start'));
      closeStartModal();
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
      navigate(`/specialist/jobs/${variables.jobId}`);
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  // Wrong finding mutation
  const wrongFindingMutation = useMutation({
    mutationFn: ({ jobId, reason, photoPath }: { jobId: number; reason: string; photoPath: string }) =>
      specialistJobsApi.wrongFinding(jobId, reason, photoPath),
    onSuccess: () => {
      message.success(t('jobs.wrong_finding_success'));
      closeStartModal();
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const openStartModal = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setPlannedHours(null);
    setShowWrongFinding(false);
    setWrongFindingReason('');
    setWrongFindingPhotoPath('');
    setStartModalOpen(true);
  }, []);

  const closeStartModal = useCallback(() => {
    setStartModalOpen(false);
    setSelectedJobId(null);
    setPlannedHours(null);
    setShowWrongFinding(false);
    setWrongFindingReason('');
    setWrongFindingPhotoPath('');
  }, []);

  const handleStartJob = useCallback(() => {
    if (selectedJobId && plannedHours && plannedHours > 0) {
      startJobMutation.mutate({ jobId: selectedJobId, hours: plannedHours });
    }
  }, [selectedJobId, plannedHours, startJobMutation]);

  const handleWrongFinding = useCallback(() => {
    if (selectedJobId && wrongFindingReason.trim() && wrongFindingPhotoPath) {
      wrongFindingMutation.mutate({
        jobId: selectedJobId,
        reason: wrongFindingReason.trim(),
        photoPath: wrongFindingPhotoPath,
      });
    }
  }, [selectedJobId, wrongFindingReason, wrongFindingPhotoPath, wrongFindingMutation]);

  const handlePhotoUpload = useCallback(
    async (file: File) => {
      if (!selectedJobId) return false;
      setUploadingPhoto(true);
      try {
        const res = await filesApi.upload(file, 'specialist_job', selectedJobId, 'wrong_finding');
        const fileData = res.data?.data;
        const filePath = fileData?.filename ? `/uploads/${fileData.filename}` : `/uploads/${file.name}`;
        setWrongFindingPhotoPath(filePath);
        message.success(t('common.save'));
      } catch {
        message.error(t('common.error'));
      } finally {
        setUploadingPhoto(false);
      }
      return false;
    },
    [selectedJobId, t],
  );

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

  // Pending tab columns: "Start" button opens the start modal
  const pendingColumns: ColumnsType<SpecialistJob> = [
    ...baseColumns,
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: SpecialistJob) => (
        <Button type="primary" size="small" onClick={() => openStartModal(record.id)}>
          {t('jobs.start')}
        </Button>
      ),
    },
  ];

  // Active tab columns: "Details" link
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
      label: t('jobs.pending_jobs'),
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

      {/* Start Job Modal */}
      <Modal
        title={t('jobs.start')}
        open={startModalOpen}
        onCancel={closeStartModal}
        footer={null}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Planned Time Input */}
          <div>
            <Typography.Text strong>{t('jobs.planned_time')}</Typography.Text>
            <InputNumber
              min={0.5}
              step={0.5}
              value={plannedHours}
              onChange={(val) => setPlannedHours(val)}
              style={{ width: '100%', marginTop: 8 }}
              placeholder={t('jobs.planned_time')}
              addonAfter="h"
            />
          </div>

          {/* Start Job Button */}
          <Button
            type="primary"
            size="large"
            block
            onClick={handleStartJob}
            loading={startJobMutation.isPending}
            disabled={!plannedHours || plannedHours <= 0}
          >
            {t('jobs.start')}
          </Button>

          <Divider />

          {/* Wrong Finding Toggle */}
          {!showWrongFinding ? (
            <Button
              danger
              block
              icon={<ExclamationCircleOutlined />}
              onClick={() => setShowWrongFinding(true)}
            >
              {t('jobs.wrong_finding')}
            </Button>
          ) : (
            <div>
              <Alert
                type="warning"
                message={t('jobs.wrong_finding')}
                description={t('jobs.wrong_finding_description')}
                style={{ marginBottom: 16 }}
              />

              {/* Reason */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text strong>{t('jobs.wrong_finding_reason')}</Typography.Text>
                <Input.TextArea
                  rows={3}
                  value={wrongFindingReason}
                  onChange={(e) => setWrongFindingReason(e.target.value)}
                  placeholder={t('jobs.wrong_finding_reason')}
                  style={{ marginTop: 8 }}
                />
              </div>

              {/* Photo/Video Upload */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text strong>{t('jobs.wrong_finding_photo')}</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Upload
                    beforeUpload={(file) => {
                      handlePhotoUpload(file as File);
                      return false;
                    }}
                    maxCount={1}
                    accept="image/*,video/*"
                    showUploadList={true}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadingPhoto}>
                      {t('jobs.wrong_finding_photo')}
                    </Button>
                  </Upload>
                  {wrongFindingPhotoPath && (
                    <Typography.Text type="success" style={{ display: 'block', marginTop: 4 }}>
                      {t('common.save')}
                    </Typography.Text>
                  )}
                </div>
              </div>

              {/* Submit Wrong Finding */}
              <Button
                danger
                type="primary"
                block
                onClick={handleWrongFinding}
                loading={wrongFindingMutation.isPending}
                disabled={!wrongFindingReason.trim() || !wrongFindingPhotoPath}
              >
                {t('jobs.submit_wrong_finding')}
              </Button>
            </div>
          )}
        </Space>
      </Modal>
    </Card>
  );
}
