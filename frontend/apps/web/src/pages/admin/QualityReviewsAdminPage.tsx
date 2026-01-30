import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Radio,
  Tag,
  message,
  Typography,
  Tabs,
} from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  qualityReviewsApi,
  type QualityReview,
  type ReviewStatus,
  type ValidatePayload,
} from '@inspection/shared';
import dayjs from 'dayjs';

const statusColorMap: Record<ReviewStatus, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
};

export default function QualityReviewsAdminPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [validateOpen, setValidateOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<QualityReview | null>(null);

  const [validateForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quality-reviews', page, perPage, statusFilter],
    queryFn: () =>
      qualityReviewsApi.list({
        page,
        per_page: perPage,
        status: statusFilter as ReviewStatus | undefined,
      }),
  });

  const validateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ValidatePayload }) =>
      qualityReviewsApi.validate(id, payload),
    onSuccess: () => {
      message.success(t('qualityReviews.validateSuccess', 'Review validated'));
      queryClient.invalidateQueries({ queryKey: ['quality-reviews'] });
      setValidateOpen(false);
      setSelectedReview(null);
      validateForm.resetFields();
    },
    onError: () => message.error(t('qualityReviews.validateError', 'Failed to validate review')),
  });

  const openValidate = (record: QualityReview) => {
    setSelectedReview(record);
    validateForm.resetFields();
    setValidateOpen(true);
  };

  const columns: ColumnsType<QualityReview> = [
    { title: t('qualityReviews.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('qualityReviews.jobType', 'Job Type'),
      dataIndex: 'job_type',
      key: 'job_type',
      render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
    },
    { title: t('qualityReviews.jobId', 'Job ID'), dataIndex: 'job_id', key: 'job_id' },
    {
      title: t('qualityReviews.qeName', 'Quality Engineer'),
      key: 'qe_name',
      render: (_: unknown, r: QualityReview) => r.quality_engineer?.full_name || `#${r.qe_id}`,
    },
    {
      title: t('qualityReviews.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: ReviewStatus) => (
        <Tag color={statusColorMap[s]}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('qualityReviews.rejectionCategory', 'Rejection Category'),
      dataIndex: 'rejection_category',
      key: 'rejection_category',
      render: (v: string | null) => v ? <Tag color="orange">{v.replace(/_/g, ' ').toUpperCase()}</Tag> : '-',
    },
    {
      title: t('qualityReviews.slaMet', 'SLA Met'),
      dataIndex: 'sla_met',
      key: 'sla_met',
      render: (v: boolean | null) =>
        v === null ? '-' : v ? <Tag color="green">{t('common.yes', 'Yes')}</Tag> : <Tag color="red">{t('common.no', 'No')}</Tag>,
    },
    {
      title: t('qualityReviews.adminValidation', 'Admin Validation'),
      dataIndex: 'admin_validation',
      key: 'admin_validation',
      render: (v: string | null) =>
        v ? <Tag color={v === 'valid' ? 'green' : 'red'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('qualityReviews.reviewedAt', 'Reviewed At'),
      dataIndex: 'reviewed_at',
      key: 'reviewed_at',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: QualityReview) => (
        <>
          {!record.admin_validation && (record.status === 'approved' || record.status === 'rejected') && (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => openValidate(record)}>
              {t('qualityReviews.validate', 'Validate')}
            </Button>
          )}
        </>
      ),
    },
  ];

  const reviews = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const tabItems = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'pending', label: t('qualityReviews.pending', 'Pending') },
    { key: 'approved', label: t('qualityReviews.approved', 'Approved') },
    { key: 'rejected', label: t('qualityReviews.rejected', 'Rejected') },
  ];

  return (
    <Card title={<Typography.Title level={4}>{t('nav.qualityReviews', 'Quality Reviews')}</Typography.Title>}>
      <Tabs
        activeKey={statusFilter || 'all'}
        onChange={(key) => { setStatusFilter(key === 'all' ? undefined : key); setPage(1); }}
        items={tabItems}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={reviews}
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
        scroll={{ x: 1200 }}
      />

      <Modal
        title={t('qualityReviews.validateReview', 'Validate Quality Review')}
        open={validateOpen}
        onCancel={() => { setValidateOpen(false); setSelectedReview(null); validateForm.resetFields(); }}
        onOk={() => validateForm.submit()}
        confirmLoading={validateMutation.isPending}
        destroyOnClose
      >
        {selectedReview && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {t('qualityReviews.validateDescription', 'Validating review #{{id}} for {{type}} job #{{jobId}}', {
              id: selectedReview.id,
              type: selectedReview.job_type,
              jobId: selectedReview.job_id,
            })}
          </Typography.Paragraph>
        )}
        <Form
          form={validateForm}
          layout="vertical"
          onFinish={(v: ValidatePayload) =>
            selectedReview && validateMutation.mutate({ id: selectedReview.id, payload: v })
          }
        >
          <Form.Item
            name="admin_validation"
            label={t('qualityReviews.validation', 'Validation')}
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio.Button value="valid">{t('qualityReviews.valid', 'Valid')}</Radio.Button>
              <Radio.Button value="wrong">{t('qualityReviews.wrong', 'Wrong')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="admin_validation_notes"
            label={t('qualityReviews.validationNotes', 'Notes')}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
