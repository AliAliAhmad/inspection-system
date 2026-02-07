import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Tag,
  Space,
  Rate,
  message,
  Typography,
  Tabs,
  Descriptions,
  Alert,
} from 'antd';
import {
  PauseCircleOutlined,
  StarOutlined,
  TrophyOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import {
  specialistJobsApi,
  type SpecialistJob,
  type JobStatus,
  type IncompleteReason,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';

const incompleteReasonLabels: Record<IncompleteReason, string> = {
  no_spare_parts: 'No Spare Parts',
  waiting_for_approval: 'Waiting for Approval',
  equipment_in_use: 'Equipment in Use',
  safety_concern: 'Safety Concern',
  need_assistance: 'Need Assistance',
  other: 'Other',
};

const statusColorMap: Record<JobStatus, string> = {
  assigned: 'default',
  in_progress: 'processing',
  paused: 'warning',
  completed: 'success',
  incomplete: 'error',
  qc_approved: 'cyan',
  cancelled: 'default',
};

export default function AllSpecialistJobsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const [pauseOpen, setPauseOpen] = useState(false);
  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<SpecialistJob | null>(null);

  const [pauseForm] = Form.useForm();
  const [cleaningForm] = Form.useForm();
  const [bonusForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['specialist-jobs', page, perPage, statusFilter],
    queryFn: () => specialistJobsApi.list({ page, per_page: perPage, status: statusFilter }),
  });

  const forcePauseMutation = useMutation({
    mutationFn: ({ jobId, reason }: { jobId: number; reason?: string }) =>
      specialistJobsApi.adminForcePause(jobId, reason),
    onSuccess: () => {
      message.success(t('specialistJobs.pauseSuccess', 'Job paused successfully'));
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
      setPauseOpen(false);
      pauseForm.resetFields();
    },
    onError: () => message.error(t('specialistJobs.pauseError', 'Failed to pause job')),
  });

  const cleaningRatingMutation = useMutation({
    mutationFn: ({ jobId, rating }: { jobId: number; rating: number }) =>
      specialistJobsApi.adminCleaningRating(jobId, rating),
    onSuccess: () => {
      message.success(t('specialistJobs.cleaningRatingSuccess', 'Cleaning rating set'));
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
      setCleaningOpen(false);
      cleaningForm.resetFields();
    },
    onError: () => message.error(t('specialistJobs.cleaningRatingError', 'Failed to set cleaning rating')),
  });

  const bonusMutation = useMutation({
    mutationFn: ({ jobId, bonus }: { jobId: number; bonus: number }) =>
      specialistJobsApi.adminBonus(jobId, bonus),
    onSuccess: () => {
      message.success(t('specialistJobs.bonusSuccess', 'Bonus awarded'));
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
      setBonusOpen(false);
      bonusForm.resetFields();
    },
    onError: () => message.error(t('specialistJobs.bonusError', 'Failed to award bonus')),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (jobId: number) => specialistJobsApi.acknowledgeIncomplete(jobId),
    onSuccess: () => {
      message.success(t('specialistJobs.acknowledgeSuccess', 'Incomplete job acknowledged'));
      queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
    },
    onError: () => message.error(t('specialistJobs.acknowledgeError', 'Failed to acknowledge')),
  });

  const columns: ColumnsType<SpecialistJob> = [
    { title: t('specialistJobs.jobId', 'Job ID'), dataIndex: 'job_id', key: 'job_id' },
    {
      title: t('specialistJobs.specialist', 'Specialist'),
      dataIndex: 'specialist_id',
      key: 'specialist_id',
      render: (v: number) => `#${v}`,
    },
    {
      title: t('specialistJobs.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: JobStatus) => (
        <Tag color={statusColorMap[s]}>{s.replace(/_/g, ' ').toUpperCase()}</Tag>
      ),
    },
    {
      title: t('specialistJobs.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      render: (v: string | null) =>
        v ? <Tag color={v === 'major' ? 'red' : 'blue'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('specialistJobs.plannedTime', 'Planned (hrs)'),
      dataIndex: 'planned_time_hours',
      key: 'planned_time_hours',
      render: (v: number | null | undefined) => v != null ? v.toFixed(1) : '-',
    },
    {
      title: t('specialistJobs.actualTime', 'Actual (hrs)'),
      dataIndex: 'actual_time_hours',
      key: 'actual_time_hours',
      render: (v: number | null | undefined) => v != null ? v.toFixed(1) : '-',
    },
    {
      title: t('specialistJobs.timeRating', 'Time Rating'),
      dataIndex: 'time_rating',
      key: 'time_rating',
      render: (v: number | null | undefined) => v != null ? <Rate disabled value={v} count={5} /> : '-',
    },
    {
      title: t('specialistJobs.qcRating', 'QC Rating'),
      dataIndex: 'qc_rating',
      key: 'qc_rating',
      render: (v: number | null | undefined) => v != null ? <Rate disabled value={v} count={5} /> : '-',
    },
    {
      title: t('specialistJobs.cleaningRating', 'Cleaning'),
      dataIndex: 'cleaning_rating',
      key: 'cleaning_rating',
      render: (v: number | null | undefined) => v != null ? <Rate disabled value={v} count={5} /> : '-',
    },
    {
      title: t('specialistJobs.bonus', 'Bonus'),
      dataIndex: 'admin_bonus',
      key: 'admin_bonus',
      render: (v: number | undefined) => v || 0,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: unknown, record: SpecialistJob) => (
        <Space direction="vertical" size="small">
          {record.status === 'in_progress' && (
            <Button
              type="link"
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => { setSelectedJob(record); setPauseOpen(true); pauseForm.resetFields(); }}
            >
              {t('specialistJobs.forcePause', 'Force Pause')}
            </Button>
          )}
          {record.status === 'incomplete' && !record.incomplete_acknowledged_by && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => acknowledgeMutation.mutate(record.id)}
              loading={acknowledgeMutation.isPending}
            >
              {t('specialistJobs.acknowledge', 'Acknowledge')}
            </Button>
          )}
          {record.status === 'incomplete' && record.incomplete_acknowledged_by && (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              {t('specialistJobs.acknowledged', 'Acknowledged')}
            </Tag>
          )}
          {(record.status === 'completed' || record.status === 'qc_approved') && (
            <>
              <Button
                type="link"
                size="small"
                icon={<StarOutlined />}
                onClick={() => { setSelectedJob(record); setCleaningOpen(true); cleaningForm.resetFields(); }}
              >
                {t('specialistJobs.setCleaning', 'Set Cleaning')}
              </Button>
              <Button
                type="link"
                size="small"
                icon={<TrophyOutlined />}
                onClick={() => { setSelectedJob(record); setBonusOpen(true); bonusForm.resetFields(); }}
              >
                {t('specialistJobs.awardBonus', 'Award Bonus')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  // Expandable row for incomplete jobs to show reason and notes
  const expandable: TableProps<SpecialistJob>['expandable'] = {
    expandedRowRender: (record: SpecialistJob) => {
      if (record.status !== 'incomplete') return null;
      const reasonLabel = record.incomplete_reason
        ? incompleteReasonLabels[record.incomplete_reason] || record.incomplete_reason
        : '-';
      return (
        <Alert
          type={record.incomplete_acknowledged_by ? 'success' : 'warning'}
          icon={record.incomplete_acknowledged_by ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
          showIcon
          message={
            <Descriptions column={2} size="small">
              <Descriptions.Item label={t('specialistJobs.incompleteReason', 'Reason')}>
                {reasonLabel}
              </Descriptions.Item>
              <Descriptions.Item label={t('specialistJobs.incompleteAt', 'Marked At')}>
                {record.incomplete_at ? new Date(record.incomplete_at).toLocaleString() : '-'}
              </Descriptions.Item>
              {record.incomplete_notes && (
                <Descriptions.Item label={t('specialistJobs.notes', 'Notes')} span={2}>
                  {record.incomplete_notes}
                </Descriptions.Item>
              )}
              {record.incomplete_acknowledged_by && (
                <>
                  <Descriptions.Item label={t('specialistJobs.acknowledgedBy', 'Acknowledged By')}>
                    {record.incomplete_acknowledger_name || `Admin #${record.incomplete_acknowledged_by}`}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('specialistJobs.acknowledgedAt', 'Acknowledged At')}>
                    {record.incomplete_acknowledged_at
                      ? new Date(record.incomplete_acknowledged_at).toLocaleString()
                      : '-'}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
          }
        />
      );
    },
    rowExpandable: (record: SpecialistJob) => record.status === 'incomplete',
  };

  const jobs = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const tabItems = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'assigned', label: t('specialistJobs.assigned', 'Assigned') },
    { key: 'in_progress', label: t('specialistJobs.inProgress', 'In Progress') },
    { key: 'paused', label: t('specialistJobs.paused', 'Paused') },
    { key: 'completed', label: t('specialistJobs.completed', 'Completed') },
    { key: 'incomplete', label: t('specialistJobs.incomplete', 'Incomplete') },
    { key: 'qc_approved', label: t('specialistJobs.qcApproved', 'QC Approved') },
  ];

  return (
    <Card title={<Typography.Title level={4}>{t('nav.specialistJobs', 'All Specialist Jobs')}</Typography.Title>}>
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
        expandable={expandable}
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

      {/* Force Pause Modal */}
      <Modal
        title={t('specialistJobs.forcePause', 'Force Pause Job')}
        open={pauseOpen}
        onCancel={() => { setPauseOpen(false); pauseForm.resetFields(); }}
        onOk={() => pauseForm.submit()}
        confirmLoading={forcePauseMutation.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          {t('specialistJobs.pauseDescription', 'Force pause job {{jobId}}', { jobId: selectedJob?.job_id })}
        </Typography.Paragraph>
        <Form
          form={pauseForm}
          layout="vertical"
          onFinish={(v: { reason?: string }) =>
            selectedJob && forcePauseMutation.mutate({ jobId: selectedJob.id, reason: v.reason })
          }
        >
          <Form.Item name="reason" label={t('specialistJobs.pauseReason', 'Reason')}>
            <VoiceTextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Cleaning Rating Modal */}
      <Modal
        title={t('specialistJobs.setCleaning', 'Set Cleaning Rating')}
        open={cleaningOpen}
        onCancel={() => { setCleaningOpen(false); cleaningForm.resetFields(); }}
        onOk={() => cleaningForm.submit()}
        confirmLoading={cleaningRatingMutation.isPending}
        destroyOnClose
      >
        <Form
          form={cleaningForm}
          layout="vertical"
          onFinish={(v: { rating: number }) =>
            selectedJob && cleaningRatingMutation.mutate({ jobId: selectedJob.id, rating: v.rating })
          }
        >
          <Form.Item name="rating" label={t('specialistJobs.cleaningRating', 'Cleaning Rating')} rules={[{ required: true }]}>
            <Rate count={5} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bonus Modal */}
      <Modal
        title={t('specialistJobs.awardBonus', 'Award Bonus')}
        open={bonusOpen}
        onCancel={() => { setBonusOpen(false); bonusForm.resetFields(); }}
        onOk={() => bonusForm.submit()}
        confirmLoading={bonusMutation.isPending}
        destroyOnClose
      >
        <Form
          form={bonusForm}
          layout="vertical"
          onFinish={(v: { bonus: number }) =>
            selectedJob && bonusMutation.mutate({ jobId: selectedJob.id, bonus: v.bonus })
          }
        >
          <Form.Item name="bonus" label={t('specialistJobs.bonusAmount', 'Bonus Amount')} rules={[{ required: true }]}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
