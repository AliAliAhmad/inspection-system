import { useState } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Typography,
  Input,
  Select,
  Form,
  Spin,
  Alert,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  qualityReviewsApi,
  QualityReview,
  RejectionCategory,
  formatDateTime,
} from '@inspection/shared';

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
};

const REJECTION_CATEGORIES: RejectionCategory[] = [
  'incomplete_work',
  'wrong_parts',
  'safety_issue',
  'poor_workmanship',
  'did_not_follow_procedure',
  'equipment_still_faulty',
  'other',
];

export default function ReviewDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [rejectForm] = Form.useForm();

  const { data, isLoading, error } = useQuery({
    queryKey: ['quality-review', id],
    queryFn: () => qualityReviewsApi.get(Number(id)).then((r) => r.data),
    enabled: !!id,
  });

  const review: QualityReview | undefined = data?.data as QualityReview | undefined;

  const approveMutation = useMutation({
    mutationFn: (notes?: string) =>
      qualityReviewsApi.approve(Number(id), { notes }),
    onSuccess: () => {
      message.success(t('common.success', 'Review approved'));
      queryClient.invalidateQueries({ queryKey: ['quality-review', id] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (payload: {
      rejection_reason: string;
      rejection_category: RejectionCategory;
      notes?: string;
      evidence_notes?: string;
    }) => qualityReviewsApi.reject(Number(id), payload),
    onSuccess: () => {
      message.success(t('common.success', 'Review rejected'));
      queryClient.invalidateQueries({ queryKey: ['quality-review', id] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      setShowRejectForm(false);
      rejectForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !review) {
    return <Alert type="error" message={t('common.error', 'Failed to load review')} showIcon />;
  }

  const isPending = review.status === 'pending';

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/quality/reviews')}>
          {t('common.back', 'Back')}
        </Button>
      </Space>

      <Typography.Title level={4}>
        {t('common.review', 'Review')} #{review.id}
      </Typography.Title>

      {/* Review info */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label={t('common.type', 'Job Type')}>
            <Tag color={review.job_type === 'specialist' ? 'blue' : 'purple'}>
              {t(`common.${review.job_type}`, review.job_type)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('common.id', 'Job ID')}>
            {review.job_id}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.status', 'Status')}>
            <Tag color={STATUS_COLOR[review.status] ?? 'default'}>
              {t(`status.${review.status}`, review.status)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('quality.sla_deadline', 'SLA Deadline')}>
            {review.sla_deadline ? (
              <span
                style={{
                  color:
                    new Date(review.sla_deadline).getTime() < Date.now()
                      ? '#ff4d4f'
                      : undefined,
                }}
              >
                {formatDateTime(review.sla_deadline)}
              </span>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.created_at', 'Created At')}>
            {formatDateTime(review.created_at)}
          </Descriptions.Item>
          {review.reviewed_at && (
            <Descriptions.Item label={t('common.reviewed_at', 'Reviewed At')}>
              {formatDateTime(review.reviewed_at)}
            </Descriptions.Item>
          )}
          {review.quality_engineer && (
            <Descriptions.Item label={t('common.quality_engineer', 'Quality Engineer')}>
              {review.quality_engineer.full_name}
            </Descriptions.Item>
          )}
          {review.sla_met !== null && (
            <Descriptions.Item label={t('quality.sla_met', 'SLA Met')}>
              <Tag color={review.sla_met ? 'green' : 'red'}>
                {review.sla_met ? t('common.yes', 'Yes') : t('common.no', 'No')}
              </Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Pending: approve/reject actions */}
      {isPending && (
        <Card title={t('common.actions', 'Actions')} style={{ marginBottom: 16 }}>
          {!showRejectForm ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                rows={2}
                placeholder={t('common.notes_optional', 'Notes (optional)')}
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
              />
              <Space>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(approveNotes || undefined)}
                >
                  {t('quality.approve', 'Approve')}
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => setShowRejectForm(true)}
                >
                  {t('quality.reject', 'Reject')}
                </Button>
              </Space>
            </Space>
          ) : (
            <Form
              form={rejectForm}
              layout="vertical"
              onFinish={(values) =>
                rejectMutation.mutate({
                  rejection_reason: values.rejection_reason,
                  rejection_category: values.rejection_category,
                  notes: values.notes,
                  evidence_notes: values.evidence_notes,
                })
              }
            >
              <Form.Item
                name="rejection_category"
                label={t('quality.rejection_category', 'Rejection Category')}
                rules={[{ required: true, message: t('common.required', 'Required') }]}
              >
                <Select
                  placeholder={t('common.select', 'Select...')}
                  options={REJECTION_CATEGORIES.map((cat) => ({
                    value: cat,
                    label: t(`quality.cat_${cat}`, cat.replace(/_/g, ' ')),
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="rejection_reason"
                label={t('quality.rejection_reason', 'Rejection Reason')}
                rules={[{ required: true, message: t('common.required', 'Required') }]}
              >
                <Input.TextArea rows={3} placeholder={t('quality.rejection_reason', 'Reason...')} />
              </Form.Item>
              <Form.Item
                name="evidence_notes"
                label={t('quality.evidence', 'Evidence Notes')}
              >
                <Input.TextArea rows={2} placeholder={t('quality.evidence', 'Evidence notes...')} />
              </Form.Item>
              <Form.Item
                name="notes"
                label={t('common.notes', 'Notes')}
              >
                <Input.TextArea rows={2} placeholder={t('common.notes', 'Additional notes...')} />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button
                    danger
                    type="primary"
                    htmlType="submit"
                    loading={rejectMutation.isPending}
                  >
                    {t('quality.reject', 'Reject')}
                  </Button>
                  <Button onClick={() => setShowRejectForm(false)}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          )}
        </Card>
      )}

      {/* If already reviewed: show rejection details */}
      {review.status === 'rejected' && (
        <Card title={t('quality.rejection_details', 'Rejection Details')} style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label={t('quality.rejection_category', 'Category')}>
              <Tag color="red">
                {t(
                  `quality.cat_${review.rejection_category}`,
                  review.rejection_category?.replace(/_/g, ' ') ?? '-'
                )}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('quality.rejection_reason', 'Reason')}>
              {review.rejection_reason || '-'}
            </Descriptions.Item>
            {review.evidence_notes && (
              <Descriptions.Item label={t('quality.evidence', 'Evidence Notes')}>
                {review.evidence_notes}
              </Descriptions.Item>
            )}
            {review.notes && (
              <Descriptions.Item label={t('common.notes', 'Notes')}>
                {review.notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}

      {/* Approved with notes */}
      {review.status === 'approved' && review.notes && (
        <Card title={t('common.notes', 'Notes')} style={{ marginBottom: 16 }}>
          <Typography.Paragraph>{review.notes}</Typography.Paragraph>
        </Card>
      )}

      {/* Admin validation */}
      {review.admin_validation && (
        <Card title={t('quality.admin_validation', 'Admin Validation')} style={{ marginBottom: 16 }}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label={t('quality.validate_rejection', 'Validation')}>
              <Tag color={review.admin_validation === 'valid' ? 'green' : 'red'}>
                {t(`quality.${review.admin_validation}`, review.admin_validation)}
              </Tag>
            </Descriptions.Item>
            {review.admin_validation_notes && (
              <Descriptions.Item label={t('common.notes', 'Notes')}>
                {review.admin_validation_notes}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
