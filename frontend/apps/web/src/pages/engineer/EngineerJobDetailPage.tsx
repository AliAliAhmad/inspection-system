import { useState, useEffect, useRef } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  Rate,
  Spin,
  Alert,
  Statistic,
  Timeline,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  engineerJobsApi,
  EngineerJob,
  PauseLog,
  PauseCategory,
  formatDateTime,
  formatHours,
} from '@inspection/shared';

const STATUS_COLOR: Record<string, string> = {
  assigned: 'blue',
  in_progress: 'processing',
  paused: 'orange',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'green',
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

export default function EngineerJobDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [plannedTimeOpen, setPlannedTimeOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseCategory, setPauseCategory] = useState<PauseCategory | null>(null);
  const [pauseDetails, setPauseDetails] = useState('');
  const [plannedForm] = Form.useForm();
  const [completeForm] = Form.useForm();

  // Live timer state
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['engineer-job', id],
    queryFn: () => engineerJobsApi.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  const job: EngineerJob | undefined = data?.data as EngineerJob | undefined;

  // Live timer effect
  useEffect(() => {
    if (job?.status === 'in_progress' && job.started_at) {
      const startTime = new Date(job.started_at).getTime();

      const updateElapsed = () => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      };

      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [job?.status, job?.started_at]);

  const plannedTimeMutation = useMutation({
    mutationFn: (payload: { planned_time_days?: number; planned_time_hours?: number }) =>
      engineerJobsApi.enterPlannedTime(Number(id), payload),
    onSuccess: () => {
      message.success(t('common.success', 'Planned time saved'));
      queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
      setPlannedTimeOpen(false);
      plannedForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const startMutation = useMutation({
    mutationFn: () => engineerJobsApi.start(Number(id)),
    onSuccess: () => {
      message.success(t('common.success', 'Job started'));
      queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const completeMutation = useMutation({
    mutationFn: (payload: { work_notes?: string; completion_status?: string }) =>
      engineerJobsApi.complete(Number(id), payload),
    onSuccess: () => {
      message.success(t('common.success', 'Job completed'));
      queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
      setCompleteOpen(false);
      completeForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (payload: { reason_category: PauseCategory; reason_details?: string }) =>
      engineerJobsApi.requestPause(Number(id), payload),
    onSuccess: () => {
      message.success(t('jobs.pause', 'Pause requested'));
      setPauseModalOpen(false);
      setPauseCategory(null);
      setPauseDetails('');
      queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
      queryClient.invalidateQueries({ queryKey: ['engineer-job', id, 'pause-history'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const pauseHistoryQuery = useQuery({
    queryKey: ['engineer-job', id, 'pause-history'],
    queryFn: () => engineerJobsApi.getPauseHistory(Number(id)),
    select: (res) => (res.data?.data ?? res.data ?? []) as PauseLog[],
    enabled: !!id,
  });

  const pauseHistory = (pauseHistoryQuery.data ?? []) as PauseLog[];

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !job) {
    return <Alert type="error" message={t('common.error', 'Failed to load job details')} showIcon />;
  }

  const plannedParts: string[] = [];
  if (job.planned_time_days) plannedParts.push(`${job.planned_time_days} ${t('common.days', 'days')}`);
  if (job.planned_time_hours) plannedParts.push(`${job.planned_time_hours} ${t('common.hours', 'hours')}`);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/engineer/jobs')}>
          {t('common.back', 'Back')}
        </Button>
      </Space>

      {/* Header */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} align="start">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {job.job_id} - {job.title}
          </Typography.Title>
          <Space style={{ marginTop: 8 }}>
            <Tag color={STATUS_COLOR[job.status] ?? 'default'}>
              {t(`status.${job.status}`, job.status)}
            </Tag>
            {job.category && (
              <Tag color={job.category === 'major' ? 'red' : 'blue'}>
                {t(`status.${job.category}`, job.category)}
              </Tag>
            )}
          </Space>
        </div>

        {/* Action buttons based on status */}
        <Space>
          {job.status === 'assigned' && (
            <>
              <Button
                icon={<ClockCircleOutlined />}
                onClick={() => setPlannedTimeOpen(true)}
              >
                {t('jobs.enter_planned_time', 'Enter Planned Time')}
              </Button>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => startMutation.mutate()}
                loading={startMutation.isPending}
              >
                {t('jobs.start', 'Start')}
              </Button>
            </>
          )}
          {job.status === 'in_progress' && (
            <>
              <Button
                icon={<PauseCircleOutlined />}
                onClick={() => setPauseModalOpen(true)}
              >
                {t('jobs.pause', 'Pause')}
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => setCompleteOpen(true)}
              >
                {t('jobs.complete', 'Complete')}
              </Button>
            </>
          )}
        </Space>
      </Space>

      {/* Live timer for in_progress */}
      {job.status === 'in_progress' && (
        <Card style={{ marginBottom: 16, textAlign: 'center' }}>
          <Statistic
            title={t('jobs.elapsed_time', 'Elapsed Time')}
            value={formatElapsed(elapsed)}
            prefix={<ClockCircleOutlined />}
            valueStyle={{ color: '#1677ff', fontSize: 32 }}
          />
        </Card>
      )}

      {/* Details card */}
      <Card title={t('common.details', 'Details')}>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={t('common.type', 'Type')}>
            {t(`jobs.type_${job.job_type}`, job.job_type.replace(/_/g, ' '))}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.description', 'Description')}>
            {job.description || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('jobs.planned_time', 'Planned Time')}>
            {plannedParts.length > 0 ? plannedParts.join(' ') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('jobs.actual_time', 'Actual Time')}>
            {job.actual_time_hours !== null ? formatHours(job.actual_time_hours) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.created_at', 'Created At')}>
            {formatDateTime(job.created_at)}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.started_at', 'Started At')}>
            {formatDateTime(job.started_at)}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.completed_at', 'Completed At')}>
            {formatDateTime(job.completed_at)}
          </Descriptions.Item>
          {job.major_reason && (
            <Descriptions.Item label={t('jobs.major_reason', 'Major Reason')}>
              {job.major_reason}
            </Descriptions.Item>
          )}
          {job.work_notes && (
            <Descriptions.Item label={t('jobs.work_notes', 'Work Notes')} span={2}>
              {job.work_notes}
            </Descriptions.Item>
          )}
          {job.completion_status && (
            <Descriptions.Item label={t('common.completion_status', 'Completion Status')}>
              <Tag color={job.completion_status === 'pass' ? 'green' : 'red'}>
                {t(`status.${job.completion_status}`, job.completion_status)}
              </Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Ratings display for completed jobs */}
      {(job.status === 'completed' || job.status === 'qc_approved') && (
        <Card title={t('common.ratings', 'Ratings')} style={{ marginTop: 16 }}>
          <Descriptions column={{ xs: 1, sm: 3 }} bordered>
            <Descriptions.Item label={t('jobs.time_rating', 'Time Rating')}>
              {job.time_rating !== null ? (
                <Rate disabled value={job.time_rating} />
              ) : (
                <Typography.Text type="secondary">{t('common.not_rated', 'Not rated')}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('jobs.qc_rating', 'QC Rating')}>
              {job.qc_rating !== null ? (
                <Rate disabled value={job.qc_rating} />
              ) : (
                <Typography.Text type="secondary">{t('common.not_rated', 'Not rated')}</Typography.Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('jobs.admin_bonus', 'Admin Bonus')}>
              {job.admin_bonus ?? 0}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* Pause History */}
      {pauseHistory.length > 0 && (
        <Card title={t('jobs.pause', 'Pause History')} style={{ marginTop: 16 }}>
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
                    {pause.reason_category.replace(/_/g, ' ')}
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
                      {t(`status.${pause.status}`, pause.status)}
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

      {/* Pause Request Modal */}
      <Modal
        title={t('jobs.pause', 'Request Pause')}
        open={pauseModalOpen}
        onOk={() => {
          if (!pauseCategory) return;
          pauseMutation.mutate({
            reason_category: pauseCategory,
            reason_details: pauseDetails || undefined,
          });
        }}
        onCancel={() => {
          setPauseModalOpen(false);
          setPauseCategory(null);
          setPauseDetails('');
        }}
        confirmLoading={pauseMutation.isPending}
        okText={t('common.submit', 'Submit')}
        cancelText={t('common.cancel', 'Cancel')}
        okButtonProps={{ disabled: !pauseCategory }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>{t('jobs.pause_reason', 'Reason Category')}</Typography.Text>
            <Select
              value={pauseCategory}
              onChange={(val) => setPauseCategory(val)}
              style={{ width: '100%', marginTop: 8 }}
              placeholder={t('common.select', 'Select reason')}
              options={PAUSE_CATEGORIES.map((cat) => ({
                value: cat,
                label: cat.replace(/_/g, ' '),
              }))}
            />
          </div>
          <div>
            <Typography.Text strong>{t('common.details', 'Details')}</Typography.Text>
            <Input.TextArea
              rows={3}
              value={pauseDetails}
              onChange={(e) => setPauseDetails(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>

      {/* Enter Planned Time Modal */}
      <Modal
        title={t('jobs.enter_planned_time', 'Enter Planned Time')}
        open={plannedTimeOpen}
        onCancel={() => setPlannedTimeOpen(false)}
        footer={null}
      >
        <Form
          form={plannedForm}
          layout="vertical"
          onFinish={(values) =>
            plannedTimeMutation.mutate({
              planned_time_days: values.planned_time_days,
              planned_time_hours: values.planned_time_hours,
            })
          }
        >
          <Form.Item
            name="planned_time_days"
            label={t('common.days', 'Days')}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item
            name="planned_time_hours"
            label={t('common.hours', 'Hours')}
          >
            <InputNumber min={0} max={23} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={plannedTimeMutation.isPending}
              block
            >
              {t('common.save', 'Save')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Complete Job Modal */}
      <Modal
        title={t('jobs.complete', 'Complete Job')}
        open={completeOpen}
        onCancel={() => setCompleteOpen(false)}
        footer={null}
      >
        <Form
          form={completeForm}
          layout="vertical"
          onFinish={(values) =>
            completeMutation.mutate({
              work_notes: values.work_notes,
              completion_status: values.completion_status,
            })
          }
        >
          <Form.Item
            name="completion_status"
            label={t('common.completion_status', 'Completion Status')}
            rules={[{ required: true, message: t('common.required', 'This field is required') }]}
          >
            <Select
              placeholder={t('common.select', 'Select...')}
              options={[
                { value: 'pass', label: t('status.pass', 'Pass') },
                { value: 'incomplete', label: t('status.incomplete', 'Incomplete') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="work_notes"
            label={t('jobs.work_notes', 'Work Notes')}
          >
            <Input.TextArea rows={4} placeholder={t('jobs.work_notes', 'Work notes...')} />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={completeMutation.isPending}
              block
            >
              {t('jobs.complete', 'Complete')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
