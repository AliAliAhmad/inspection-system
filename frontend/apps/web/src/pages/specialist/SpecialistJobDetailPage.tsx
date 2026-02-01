import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Typography,
  Tag,
  Button,
  Modal,
  Select,
  Input,
  InputNumber,
  Radio,
  Timeline,
  Upload,
  Rate,
  Statistic,
  Descriptions,
  Space,
  Spin,
  Alert,

  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CameraOutlined,
  PictureOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';

import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  specialistJobsApi,
  defectAssessmentsApi,
  filesApi,
  SpecialistJob,
  PauseLog,
  DefectAssessment,
  JobStatus,
  PauseCategory,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import VoiceTextArea from '../../components/VoiceTextArea';

const STATUS_COLORS: Record<JobStatus, string> = {
  assigned: 'blue',
  in_progress: 'processing',
  paused: 'warning',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'green',
  cancelled: 'default',
};

const PAUSE_CATEGORIES: PauseCategory[] = [
  'parts',
  'duty_finish',
  'tools',
  'manpower',
  'oem',
  'error_record',
  'other',
];

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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SpecialistJobDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const jobId = Number(id);

  // State for modals
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseCategory, setPauseCategory] = useState<PauseCategory | null>(null);
  const [pauseDetails, setPauseDetails] = useState('');

  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [workNotes, setWorkNotes] = useState('');
  const [completionStatus, setCompletionStatus] = useState<'pass' | 'incomplete'>('pass');

  const [incompleteModalOpen, setIncompleteModalOpen] = useState(false);
  const [incompleteReason, setIncompleteReason] = useState('');

  // Defect assessment state
  const [assessmentVerdict, setAssessmentVerdict] = useState<'confirm' | 'reject' | 'minor'>('confirm');
  const [technicalNotes, setTechnicalNotes] = useState('');

  // Live timer state
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Queries
  const jobQuery = useQuery({
    queryKey: ['specialist-jobs', jobId],
    queryFn: () => specialistJobsApi.get(jobId),
    select: (res) => (res.data?.data ?? res.data) as SpecialistJob,
    enabled: !!jobId && !isNaN(jobId),
  });

  const pauseHistoryQuery = useQuery({
    queryKey: ['specialist-jobs', jobId, 'pause-history'],
    queryFn: () => specialistJobsApi.getPauseHistory(jobId),
    select: (res) => (res.data?.data ?? res.data ?? []) as PauseLog[],
    enabled: !!jobId && !isNaN(jobId),
  });

  const pendingAssessmentsQuery = useQuery({
    queryKey: ['defect-assessments', 'pending'],
    queryFn: () => defectAssessmentsApi.getPending(),
    select: (res) => (res.data?.data ?? res.data ?? []) as DefectAssessment[],
    enabled: !!jobId && !isNaN(jobId),
  });

  const job = jobQuery.data as SpecialistJob | undefined;

  // Live timer effect — counts from planned_time_entered_at (when specialist committed)
  const timerRef = job?.planned_time_entered_at || job?.started_at;
  useEffect(() => {
    if (job?.is_running && timerRef) {
      const startTime = new Date(timerRef).getTime();

      const updateElapsed = () => {
        const now = Date.now();
        setElapsed(Math.floor((now - startTime) / 1000));
      };

      updateElapsed();
      intervalRef.current = setInterval(updateElapsed, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      setElapsed(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [job?.is_running, timerRef]);

  // Start modal state (for assigned jobs without planned time)
  const [startPlannedHours, setStartPlannedHours] = useState<number | null>(null);
  const [startModalVisible, setStartModalVisible] = useState(false);

  // Mutations
  const startMutation = useMutation({
    mutationFn: (plannedHours?: number | undefined) => specialistJobsApi.start(jobId, plannedHours),
    onSuccess: () => {
      message.success(t('jobs.start'));
      setStartModalVisible(false);
      setStartPlannedHours(null);
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
    },
    onError: () => message.error(t('common.error')),
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: PauseCategory; reason_details?: string }) =>
      specialistJobsApi.requestPause(jobId, payload),
    onSuccess: () => {
      message.success(t('jobs.pause'));
      setPauseModalOpen(false);
      setPauseCategory(null);
      setPauseDetails('');
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId, 'pause-history'] });
    },
    onError: () => message.error(t('common.error')),
  });

  const completeMutation = useMutation({
    mutationFn: (payload: { work_notes?: string; completion_status?: 'pass' | 'incomplete' }) =>
      specialistJobsApi.complete(jobId, payload),
    onSuccess: () => {
      message.success(t('jobs.complete'));
      setCompleteModalOpen(false);
      setWorkNotes('');
      setCompletionStatus('pass');
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
    },
    onError: () => message.error(t('common.error')),
  });

  const incompleteMarkMutation = useMutation({
    mutationFn: (reason: string) => specialistJobsApi.markIncomplete(jobId, reason),
    onSuccess: () => {
      message.success(t('jobs.mark_incomplete'));
      setIncompleteModalOpen(false);
      setIncompleteReason('');
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
    },
    onError: () => message.error(t('common.error')),
  });

  const cleaningUploadMutation = useMutation({
    mutationFn: () => specialistJobsApi.uploadCleaning(jobId),
    onSuccess: () => {
      message.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
    },
    onError: () => message.error(t('common.error')),
  });

  const fileUploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.upload(file, 'specialist_job', jobId, 'cleaning'),
    onSuccess: () => {
      message.success(t('common.save'));
      cleaningUploadMutation.mutate();
    },
    onError: () => message.error(t('common.error')),
  });

  const defectAssessmentMutation = useMutation({
    mutationFn: (payload: { defect_id: number; verdict: 'confirm' | 'reject' | 'minor'; technical_notes: string }) =>
      defectAssessmentsApi.create(payload),
    onSuccess: () => {
      message.success(t('common.save'));
      setAssessmentVerdict('confirm');
      setTechnicalNotes('');
      queryClient.invalidateQueries({ queryKey: ['defect-assessments'] });
    },
    onError: () => message.error(t('common.error')),
  });

  // Handlers
  const handleStart = useCallback(() => {
    if (job?.has_planned_time) {
      Modal.confirm({
        title: t('common.confirm'),
        content: t('jobs.start'),
        onOk: () => startMutation.mutate(undefined),
      });
    } else {
      setStartModalVisible(true);
    }
  }, [startMutation, t, job?.has_planned_time]);

  const handleStartWithPlannedTime = useCallback(() => {
    if (startPlannedHours && startPlannedHours > 0) {
      startMutation.mutate(startPlannedHours ?? undefined);
    }
  }, [startPlannedHours, startMutation]);

  const handlePauseSubmit = useCallback(() => {
    if (!pauseCategory) return;
    pauseMutation.mutate({
      reason_category: pauseCategory,
      reason_details: pauseDetails || undefined,
    });
  }, [pauseCategory, pauseDetails, pauseMutation]);

  const handleCompleteSubmit = useCallback(() => {
    completeMutation.mutate({
      work_notes: workNotes || undefined,
      completion_status: completionStatus,
    });
  }, [workNotes, completionStatus, completeMutation]);

  const handleIncompleteSubmit = useCallback(() => {
    if (!incompleteReason.trim()) return;
    incompleteMarkMutation.mutate(incompleteReason);
  }, [incompleteReason, incompleteMarkMutation]);

  const handleFileUpload = useCallback(
    (file: File) => {
      fileUploadMutation.mutate(file);
      return false; // prevent default upload
    },
    [fileUploadMutation],
  );

  const handleDefectAssessment = useCallback(
    (defectId: number) => {
      if (!technicalNotes.trim()) {
        message.warning(t('common.error'));
        return;
      }
      defectAssessmentMutation.mutate({
        defect_id: defectId,
        verdict: assessmentVerdict,
        technical_notes: technicalNotes,
      });
    },
    [assessmentVerdict, technicalNotes, defectAssessmentMutation, t],
  );

  if (jobQuery.isLoading) {
    return (
      <Card>
        <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: 48 }} />
      </Card>
    );
  }

  if (jobQuery.isError || !job) {
    return (
      <Card>
        <Alert
          type="error"
          message={t('common.error')}
          action={
            <Button onClick={() => jobQuery.refetch()}>{t('common.retry')}</Button>
          }
        />
      </Card>
    );
  }

  const pauseHistory = (pauseHistoryQuery.data ?? []) as PauseLog[];
  const pendingAssessments = (pendingAssessmentsQuery.data ?? []) as DefectAssessment[];
  // Filter assessments related to this job's defect_id
  const jobAssessments = pendingAssessments.filter((a) => a.defect_id === job.defect_id);

  const isCompleted = job.status === 'completed' || job.status === 'qc_approved';
  const isIncomplete = job.status === 'incomplete';

  return (
    <div>
      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/specialist/jobs')}
            >
              {t('common.back')}
            </Button>
          </Space>
          <Space size="middle" align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {job.job_id}
            </Typography.Title>
            <Tag color={STATUS_COLORS[job.status]}>{t(`status.${job.status}`)}</Tag>
            {job.category && (
              <Tag color={job.category === 'major' ? 'red' : 'orange'}>
                {job.category}
              </Tag>
            )}
          </Space>
        </Space>
      </Card>

      {/* Details Card */}
      <Card title={t('common.details')} style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label={t('jobs.planned_time')}>
            {job.planned_time_hours != null ? `${job.planned_time_hours}h` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('jobs.actual_time')}>
            {job.actual_time_hours != null ? `${job.actual_time_hours.toFixed(1)}h` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Started At">
            {job.started_at ? new Date(job.started_at).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Completed At">
            {job.completed_at ? new Date(job.completed_at).toLocaleString() : '-'}
          </Descriptions.Item>
          {job.work_notes && (
            <Descriptions.Item label={t('jobs.work_notes')} span={2}>
              {job.work_notes}
            </Descriptions.Item>
          )}
          {job.incomplete_reason && (
            <Descriptions.Item label={t('jobs.incomplete_reason')} span={2}>
              {job.incomplete_reason}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Timer / Action Section */}
      <Card title={t('common.actions')} style={{ marginBottom: 16 }}>
        {/* Assigned: Start button (works with or without planned time) */}
        {job.status === 'assigned' && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            size="large"
            onClick={handleStart}
            loading={startMutation.isPending}
          >
            {t('jobs.start')}
          </Button>
        )}

        {/* Cancelled (wrong finding) */}
        {job.status === 'cancelled' && (
          <Alert
            type="warning"
            message={t('jobs.wrong_finding')}
            description={job.wrong_finding_reason || ''}
          />
        )}

        {/* In Progress — Waiting for Pause Approval */}
        {job.status === 'in_progress' && job.has_pending_pause && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert
              type="info"
              message={t('jobs.waiting_approval', 'Waiting for Pause Approval')}
              description={t('jobs.waiting_approval_desc', 'Your pause request has been submitted. Timer is stopped until an admin or engineer reviews your request.')}
              showIcon
            />
          </Space>
        )}

        {/* In Progress (running) */}
        {job.status === 'in_progress' && job.is_running && !job.has_pending_pause && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Live timer */}
            <div style={{ textAlign: 'center' }}>
              <Statistic
                title={t('jobs.actual_time')}
                value={formatElapsed(elapsed)}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ fontSize: 36, fontFamily: 'monospace' }}
              />
            </div>

            <Space wrap>
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => setPauseModalOpen(true)}
              >
                {t('jobs.pause')}
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => setCompleteModalOpen(true)}
              >
                {t('jobs.complete')}
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => setIncompleteModalOpen(true)}
              >
                {t('jobs.mark_incomplete')}
              </Button>
            </Space>
          </Space>
        )}

        {/* Paused */}
        {job.status === 'paused' && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="warning"
              message={t('status.paused')}
              description={
                pauseHistory.length > 0
                  ? `${pauseHistory[pauseHistory.length - 1].reason_category}${
                      pauseHistory[pauseHistory.length - 1].reason_details
                        ? ': ' + pauseHistory[pauseHistory.length - 1].reason_details
                        : ''
                    }`
                  : undefined
              }
            />
            {/* Show resume info - pause must be approved to resume */}
            {pauseHistory.length > 0 &&
              pauseHistory[pauseHistory.length - 1].status === 'approved' && (
                <Typography.Text type="secondary">
                  {t('status.approved')} - {t('jobs.resume')}
                </Typography.Text>
              )}
          </Space>
        )}

        {/* Completed / QC Approved: Read-only ratings */}
        {(isCompleted || isIncomplete) && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              {job.time_rating != null && (
                <Descriptions.Item label={t('jobs.time_rating')}>
                  <Rate disabled value={job.time_rating} />
                </Descriptions.Item>
              )}
              {job.qc_rating != null && (
                <Descriptions.Item label={t('jobs.qc_rating')}>
                  <Rate disabled value={job.qc_rating} />
                </Descriptions.Item>
              )}
              {job.cleaning_rating != null && (
                <Descriptions.Item label={t('jobs.cleaning_rating')}>
                  <Rate disabled value={job.cleaning_rating} />
                </Descriptions.Item>
              )}
              {job.admin_bonus != null && job.admin_bonus > 0 && (
                <Descriptions.Item label={t('jobs.admin_bonus')}>
                  {job.admin_bonus}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Card>

      {/* Pause History Section */}
      {pauseHistory.length > 0 && (
        <Card title={t('jobs.pause')} style={{ marginBottom: 16 }}>
          <Timeline
            items={pauseHistory.map((pause) => ({
              color:
                pause.status === 'approved'
                  ? 'green'
                  : pause.status === 'denied'
                    ? 'red'
                    : 'blue',
              children: (
                <div>
                  <Typography.Text strong>
                    {pause.reason_category}
                  </Typography.Text>
                  {pause.reason_details && (
                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                      {pause.reason_details}
                    </Typography.Paragraph>
                  )}
                  <Space size="small">
                    <Tag
                      color={
                        pause.status === 'approved'
                          ? 'success'
                          : pause.status === 'denied'
                            ? 'error'
                            : 'processing'
                      }
                    >
                      {t(`status.${pause.status}`)}
                    </Tag>
                    <Typography.Text type="secondary">
                      {new Date(pause.requested_at).toLocaleString()}
                    </Typography.Text>
                    {pause.duration_minutes != null && (
                      <Typography.Text type="secondary">
                        ({pause.duration_minutes} min)
                      </Typography.Text>
                    )}
                  </Space>
                </div>
              ),
            }))}
          />
        </Card>
      )}

      {/* Cleaning Section (for completed jobs) */}
      {isCompleted && (
        <Card title="Cleaning" style={{ marginBottom: 16 }}>
          <Space>
            <Button
              icon={<CameraOutlined />}
              loading={fileUploadMutation.isPending || cleaningUploadMutation.isPending}
              onClick={() => openCameraInput('image/*', (file) => handleFileUpload(file))}
            >
              {t('inspection.take_photo', 'Take Photo')}
            </Button>
            <Upload
              beforeUpload={(file) => {
                handleFileUpload(file as File);
                return false;
              }}
              maxCount={1}
              accept="image/*"
              showUploadList={true}
            >
              <Button
                icon={<PictureOutlined />}
                loading={fileUploadMutation.isPending || cleaningUploadMutation.isPending}
              >
                {t('inspection.from_gallery', 'From Gallery')}
              </Button>
            </Upload>
          </Space>
        </Card>
      )}

      {/* Defect Assessment Section */}
      {jobAssessments.length === 0 && job.defect_id && (
        <Card title={t('nav.defect_assessments')} style={{ marginBottom: 16 }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>Verdict</Typography.Text>
              <Radio.Group
                value={assessmentVerdict}
                onChange={(e) => setAssessmentVerdict(e.target.value)}
                style={{ display: 'block', marginTop: 8 }}
              >
                <Radio.Button value="confirm">{t('status.approved')}</Radio.Button>
                <Radio.Button value="reject">{t('status.rejected')}</Radio.Button>
                <Radio.Button value="minor">Minor</Radio.Button>
              </Radio.Group>
            </div>
            <div>
              <Typography.Text strong>Technical Notes</Typography.Text>
              <VoiceTextArea
                rows={3}
                value={technicalNotes}
                onChange={(e) => setTechnicalNotes(e.target.value)}
                style={{ marginTop: 8 }}
              />
            </div>
            <Button
              type="primary"
              onClick={() => handleDefectAssessment(job.defect_id)}
              loading={defectAssessmentMutation.isPending}
            >
              {t('common.submit')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Pause Request Modal */}
      <Modal
        title={t('jobs.pause')}
        open={pauseModalOpen}
        onOk={handlePauseSubmit}
        onCancel={() => {
          setPauseModalOpen(false);
          setPauseCategory(null);
          setPauseDetails('');
        }}
        confirmLoading={pauseMutation.isPending}
        okText={t('common.submit')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !pauseCategory }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>Reason Category</Typography.Text>
            <Select
              value={pauseCategory}
              onChange={(val) => setPauseCategory(val)}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Select reason"
              options={PAUSE_CATEGORIES.map((cat) => ({
                value: cat,
                label: cat.replace('_', ' '),
              }))}
            />
          </div>
          <div>
            <Typography.Text strong>Details</Typography.Text>
            <VoiceTextArea
              rows={3}
              value={pauseDetails}
              onChange={(e) => setPauseDetails(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>

      {/* Complete Modal */}
      <Modal
        title={t('jobs.complete')}
        open={completeModalOpen}
        onOk={handleCompleteSubmit}
        onCancel={() => {
          setCompleteModalOpen(false);
          setWorkNotes('');
          setCompletionStatus('pass');
        }}
        confirmLoading={completeMutation.isPending}
        okText={t('common.submit')}
        cancelText={t('common.cancel')}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>{t('jobs.work_notes')}</Typography.Text>
            <VoiceTextArea
              rows={4}
              value={workNotes}
              onChange={(e) => setWorkNotes(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
          <div>
            <Typography.Text strong>{t('common.status')}</Typography.Text>
            <Radio.Group
              value={completionStatus}
              onChange={(e) => setCompletionStatus(e.target.value)}
              style={{ display: 'block', marginTop: 8 }}
            >
              <Radio value="pass">{t('status.completed')}</Radio>
              <Radio value="incomplete">{t('status.incomplete')}</Radio>
            </Radio.Group>
          </div>
        </Space>
      </Modal>

      {/* Mark Incomplete Modal */}
      <Modal
        title={t('jobs.mark_incomplete')}
        open={incompleteModalOpen}
        onOk={handleIncompleteSubmit}
        onCancel={() => {
          setIncompleteModalOpen(false);
          setIncompleteReason('');
        }}
        confirmLoading={incompleteMarkMutation.isPending}
        okText={t('common.submit')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !incompleteReason.trim() }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text strong>{t('jobs.incomplete_reason')}</Typography.Text>
          <VoiceTextArea
            rows={4}
            value={incompleteReason}
            onChange={(e) => setIncompleteReason(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Start Job Modal (for jobs without planned time) */}
      <Modal
        title={t('jobs.start')}
        open={startModalVisible}
        onOk={handleStartWithPlannedTime}
        onCancel={() => {
          setStartModalVisible(false);
          setStartPlannedHours(null);
        }}
        confirmLoading={startMutation.isPending}
        okText={t('jobs.start')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !startPlannedHours || startPlannedHours <= 0 }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text strong>{t('jobs.planned_time')}</Typography.Text>
          <InputNumber
            min={0.5}
            step={0.5}
            value={startPlannedHours}
            onChange={(val) => setStartPlannedHours(val)}
            style={{ width: '100%' }}
            placeholder={t('jobs.planned_time')}
            addonAfter="h"
          />
        </Space>
      </Modal>
    </div>
  );
}
