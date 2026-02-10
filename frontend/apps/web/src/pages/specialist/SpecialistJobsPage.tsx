import { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Tag,
  Button,
  Modal,
  InputNumber,
  Upload,
  message,
  Space,
  Divider,
  Alert,
  Row,
  Col,
  Spin,
  Tooltip,
  Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CameraOutlined,
  PictureOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  TrophyOutlined,
  StarOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  specialistJobsApi,
  filesApi,
  SpecialistJob,
  JobStatus,
  MySpecialistStats,
  AITimeEstimate,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import VoiceTextArea from '../../components/VoiceTextArea';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { CACHE_KEYS } from '../../utils/offline-storage';
import { StatCard } from '../../components/shared/StatCard';

function openCameraInput(accept: string, onFile: (file: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.capture = 'environment';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onFile(file);
  };
  input.click();
}

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

  // AI Time Estimate state
  const [aiEstimate, setAiEstimate] = useState<AITimeEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  // Personal stats query
  const statsQuery = useQuery({
    queryKey: ['specialist-jobs', 'my-stats'],
    queryFn: () => specialistJobsApi.getMyStats().then((res) => res.data?.data),
    refetchInterval: 60000, // Refresh every minute
  });

  const stats: MySpecialistStats | undefined = statsQuery.data;

  // Pending tab: assigned jobs (not started yet)
  const pendingQuery = useOfflineQuery({
    queryKey: ['specialist-jobs', 'list', 'pending'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'assigned' }).then((res) => res.data?.data ?? []),
    enabled: activeTab === 'pending',
    refetchOnMount: 'always' as const,
    cacheKey: `${CACHE_KEYS.specialistJobs}-pending`,
    cacheTtlMs: 30 * 60 * 1000, // 30 minutes
  });

  // Active tab: in_progress + paused
  const activeQuery = useOfflineQuery({
    queryKey: ['specialist-jobs', 'list', 'active'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'in_progress,paused' }).then((res) => res.data?.data ?? []),
    enabled: activeTab === 'active',
    refetchOnMount: 'always' as const,
    cacheKey: `${CACHE_KEYS.specialistJobs}-active`,
    cacheTtlMs: 15 * 60 * 1000, // 15 minutes - active jobs update more frequently
  });

  const completedQuery = useOfflineQuery({
    queryKey: ['specialist-jobs', 'list', 'completed'],
    queryFn: () =>
      specialistJobsApi.list({ status: 'completed,incomplete,qc_approved,cancelled' }).then((res) => res.data?.data ?? []),
    enabled: activeTab === 'completed',
    refetchOnMount: 'always' as const,
    cacheKey: `${CACHE_KEYS.specialistJobs}-completed`,
    cacheTtlMs: 60 * 60 * 1000, // 1 hour - completed jobs don't change often
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

  const openStartModal = useCallback(async (jobId: number) => {
    setSelectedJobId(jobId);
    setPlannedHours(null);
    setShowWrongFinding(false);
    setWrongFindingReason('');
    setWrongFindingPhotoPath('');
    setAiEstimate(null);
    setStartModalOpen(true);

    // Fetch AI estimate
    setLoadingEstimate(true);
    try {
      const res = await specialistJobsApi.getAITimeEstimate(jobId);
      if (res.data?.data) {
        setAiEstimate(res.data.data);
        // Pre-fill with AI suggestion
        setPlannedHours(res.data.data.estimated_hours);
      }
    } catch {
      // AI estimate is optional, don't show error
    } finally {
      setLoadingEstimate(false);
    }
  }, []);

  const closeStartModal = useCallback(() => {
    setStartModalOpen(false);
    setSelectedJobId(null);
    setPlannedHours(null);
    setShowWrongFinding(false);
    setWrongFindingReason('');
    setWrongFindingPhotoPath('');
    setAiEstimate(null);
    setLoadingEstimate(false);
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
          data: pendingQuery.data ?? [],
          loading: pendingQuery.isLoading,
        };
      case 'active':
        return {
          data: activeQuery.data ?? [],
          loading: activeQuery.isLoading,
        };
      case 'completed':
        return {
          data: completedQuery.data ?? [],
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

  // Calculate week progress
  const weekProgress = stats?.week?.total
    ? Math.round((stats.week.completed / stats.week.total) * 100)
    : 0;

  return (
    <div>
      {/* Personal Stats Dashboard */}
      <Card style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ marginBottom: 16 }}>
          {t('nav.my_jobs')}
        </Typography.Title>

        {statsQuery.isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : stats ? (
          <Row gutter={[16, 16]}>
            {/* Today's Stats */}
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.pending_time', 'Need Time')}
                value={stats.today.pending_time}
                icon={<ClockCircleOutlined />}
                tooltip={t('jobs.pending_time_tooltip', 'Jobs needing planned time entry')}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.assigned', 'Assigned')}
                value={stats.today.assigned}
                icon={<PlayCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.in_progress', 'In Progress')}
                value={stats.today.in_progress}
                icon={<ThunderboltOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.today_completed', 'Today Completed')}
                value={stats.today.completed}
                icon={<CheckCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.paused', 'Paused')}
                value={stats.today.paused}
                icon={<PauseCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.week_completed', 'This Week')}
                value={stats.week.completed}
                suffix={`/ ${stats.week.total}`}
                progress={weekProgress}
                progressColor="#52c41a"
              />
            </Col>

            {/* Performance Stats */}
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.month_completed', 'This Month')}
                value={stats.month.completed}
                suffix={`/ ${stats.month.total}`}
                icon={<TrophyOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.avg_time', 'Avg Time')}
                value={stats.averages.completion_time_hours}
                suffix="h"
                tooltip={t('jobs.avg_time_tooltip', 'Average completion time (last 30 days)')}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.time_rating', 'Time Rating')}
                value={stats.averages.time_rating}
                suffix="/ 5"
                icon={<StarOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.qc_rating', 'QC Rating')}
                value={stats.averages.qc_rating}
                suffix="/ 5"
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('jobs.total_points', 'Total Points')}
                value={stats.total_points}
                icon={<TrophyOutlined />}
              />
            </Col>
            <Col xs={12} sm={8} md={6} lg={4}>
              <StatCard
                title={t('status.incomplete', 'Incomplete')}
                value={stats.incomplete_count}
                tooltip={t('jobs.incomplete_tooltip', 'Jobs marked incomplete')}
              />
            </Col>
          </Row>
        ) : null}
      </Card>

      {/* Jobs List */}
      <Card>
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
      </Card>

      {/* Start Job Modal */}
      <Modal
        title={t('jobs.start')}
        open={startModalOpen}
        onCancel={closeStartModal}
        footer={null}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* AI Time Estimation */}
          {loadingEstimate ? (
            <Alert
              type="info"
              icon={<RobotOutlined spin />}
              message={t('jobs.ai_estimating', 'AI is analyzing similar jobs...')}
              showIcon
            />
          ) : aiEstimate ? (
            <Alert
              type="info"
              icon={<RobotOutlined />}
              message={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Typography.Text strong>
                      {t('jobs.ai_suggestion', 'AI Suggestion')}:{' '}
                    </Typography.Text>
                    <Typography.Text>
                      {aiEstimate.estimated_hours}h{' '}
                      <Tag color={
                        aiEstimate.confidence === 'high' ? 'green' :
                        aiEstimate.confidence === 'medium' ? 'orange' : 'default'
                      }>
                        {aiEstimate.confidence}
                      </Tag>
                    </Typography.Text>
                  </div>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t('jobs.ai_range', 'Range')}: {aiEstimate.range.min}h - {aiEstimate.range.max}h
                      {aiEstimate.based_on.sample_size > 0 && (
                        <> | {t('jobs.based_on', 'Based on')} {aiEstimate.based_on.sample_size} {t('jobs.similar_jobs', 'similar jobs')}</>
                      )}
                    </Typography.Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Space size={8} wrap>
                      {aiEstimate.suggestions.map((s) => (
                        <Button
                          key={s.label}
                          size="small"
                          type={plannedHours === s.hours ? 'primary' : 'default'}
                          onClick={() => setPlannedHours(s.hours)}
                        >
                          {s.hours}h ({s.label})
                        </Button>
                      ))}
                    </Space>
                  </div>
                </Space>
              }
              showIcon
            />
          ) : null}

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
                <VoiceTextArea
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
                  <Space>
                    <Button
                      icon={<CameraOutlined />}
                      loading={uploadingPhoto}
                      onClick={() => openCameraInput('image/*,video/*', (file) => handlePhotoUpload(file))}
                    >
                      {t('inspection.take_photo', 'Take Photo')}
                    </Button>
                    <Upload
                      beforeUpload={(file) => {
                        handlePhotoUpload(file as File);
                        return false;
                      }}
                      maxCount={1}
                      accept="image/*,video/*"
                      showUploadList={true}
                    >
                      <Button icon={<PictureOutlined />} loading={uploadingPhoto}>
                        {t('inspection.from_gallery', 'From Gallery')}
                      </Button>
                    </Upload>
                  </Space>
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
    </div>
  );
}
