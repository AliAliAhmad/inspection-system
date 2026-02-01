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
  Space,
  Spin,
  message,
  Typography,
  Tabs,
} from 'antd';
import { CheckCircleOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionsApi,
  type Inspection,
  type InspectionStatus,
  type InspectionResult,
  type ReviewPayload,
  type InspectionAnswer,
} from '@inspection/shared';
import dayjs from 'dayjs';
import VoiceTextArea from '../../components/VoiceTextArea';
import InspectionFindingCard from '../../components/InspectionFindingCard';

const statusColorMap: Record<InspectionStatus, string> = {
  draft: 'default',
  submitted: 'processing',
  reviewed: 'success',
};

const resultColorMap: Record<string, string> = {
  pass: 'green',
  fail: 'red',
  incomplete: 'orange',
};

export default function AllInspectionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewingInspection, setReviewingInspection] = useState<Inspection | null>(null);

  const [reviewForm] = Form.useForm();
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingInspectionId, setViewingInspectionId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inspections', page, perPage, statusFilter],
    queryFn: () => inspectionsApi.list({ page, per_page: perPage, status: statusFilter }),
  });

  // Fetch full inspection with answers when viewing
  const viewInspectionQuery = useQuery({
    queryKey: ['inspection-detail', viewingInspectionId],
    queryFn: () =>
      inspectionsApi.get(viewingInspectionId!).then((r) => {
        const raw = (r.data as any).data ?? (r.data as any).inspection;
        return raw as Inspection;
      }),
    enabled: !!viewingInspectionId,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReviewPayload }) =>
      inspectionsApi.review(id, payload),
    onSuccess: () => {
      message.success(t('inspections.reviewSuccess', 'Inspection reviewed successfully'));
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      setReviewOpen(false);
      setReviewingInspection(null);
      reviewForm.resetFields();
    },
    onError: () => message.error(t('inspections.reviewError', 'Failed to review inspection')),
  });

  const openReview = (record: Inspection) => {
    setReviewingInspection(record);
    reviewForm.resetFields();
    setReviewOpen(true);
  };

  const columns: ColumnsType<Inspection> = [
    { title: t('inspections.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
    {
      title: t('inspections.equipment', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, r: Inspection) => r.equipment?.name || `ID: ${r.equipment_id}`,
    },
    {
      title: t('inspections.technician', 'Technician'),
      key: 'technician',
      render: (_: unknown, r: Inspection) => r.technician?.full_name || `ID: ${r.technician_id}`,
    },
    {
      title: t('inspections.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: InspectionStatus) => (
        <Tag color={statusColorMap[s]}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('inspections.result', 'Result'),
      dataIndex: 'result',
      key: 'result',
      render: (r: InspectionResult | null) =>
        r ? <Tag color={resultColorMap[r]}>{r.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('inspections.startedAt', 'Started'),
      dataIndex: 'started_at',
      key: 'started_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('inspections.submittedAt', 'Submitted'),
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: Inspection) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setViewingInspectionId(record.id);
              setViewOpen(true);
            }}
          >
            {t('common.view', 'View')}
          </Button>
          {record.status === 'submitted' && (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => openReview(record)}>
              {t('inspections.review', 'Review')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const inspections = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const tabItems = [
    { key: 'all', label: t('inspections.all', 'All') },
    { key: 'draft', label: t('inspections.draft', 'Draft') },
    { key: 'submitted', label: t('inspections.submitted', 'Submitted') },
    { key: 'reviewed', label: t('inspections.reviewed', 'Reviewed') },
  ];

  return (
    <Card title={<Typography.Title level={4}>{t('nav.inspections', 'All Inspections')}</Typography.Title>}>
      <Tabs
        activeKey={statusFilter || 'all'}
        onChange={(key) => {
          setStatusFilter(key === 'all' ? undefined : key);
          setPage(1);
        }}
        items={tabItems}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={inspections}
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
        scroll={{ x: 900 }}
      />

      <Modal
        title={t('inspections.reviewInspection', 'Review Inspection')}
        open={reviewOpen}
        onCancel={() => { setReviewOpen(false); setReviewingInspection(null); reviewForm.resetFields(); }}
        onOk={() => reviewForm.submit()}
        confirmLoading={reviewMutation.isPending}
        destroyOnClose
      >
        {reviewingInspection && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {t('inspections.reviewFor', 'Reviewing inspection #{{id}} for {{equipment}}', {
              id: reviewingInspection.id,
              equipment: reviewingInspection.equipment?.name || reviewingInspection.equipment_id,
            })}
          </Typography.Paragraph>
        )}
        <Form
          form={reviewForm}
          layout="vertical"
          onFinish={(v: ReviewPayload) =>
            reviewingInspection && reviewMutation.mutate({ id: reviewingInspection.id, payload: v })
          }
        >
          <Form.Item name="result" label={t('inspections.result', 'Result')} rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="pass">{t('inspections.pass', 'Pass')}</Radio.Button>
              <Radio.Button value="fail">{t('inspections.fail', 'Fail')}</Radio.Button>
              <Radio.Button value="incomplete">{t('inspections.incomplete', 'Incomplete')}</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="notes" label={t('inspections.notes', 'Notes')}>
            <VoiceTextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* View Inspection Details Modal */}
      <Modal
        title={t('inspections.details', 'Inspection Details')}
        open={viewOpen}
        onCancel={() => {
          setViewOpen(false);
          setViewingInspectionId(null);
        }}
        footer={null}
        width={700}
        destroyOnClose
      >
        {viewInspectionQuery.isLoading && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin size="large" />
          </div>
        )}
        {viewInspectionQuery.data && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Typography.Text type="secondary">
                {t('inspections.equipment', 'Equipment')}:{' '}
              </Typography.Text>
              <Typography.Text strong>
                {viewInspectionQuery.data.equipment?.name || `ID: ${viewInspectionQuery.data.equipment_id}`}
              </Typography.Text>
              {' | '}
              <Typography.Text type="secondary">
                {t('inspections.technician', 'Technician')}:{' '}
              </Typography.Text>
              <Typography.Text strong>
                {viewInspectionQuery.data.technician?.full_name || `ID: ${viewInspectionQuery.data.technician_id}`}
              </Typography.Text>
              {' | '}
              <Tag color={statusColorMap[viewInspectionQuery.data.status]}>
                {viewInspectionQuery.data.status.toUpperCase()}
              </Tag>
              {viewInspectionQuery.data.result && (
                <Tag color={resultColorMap[viewInspectionQuery.data.result]}>
                  {viewInspectionQuery.data.result.toUpperCase()}
                </Tag>
              )}
            </div>

            <Typography.Title level={5} style={{ marginBottom: 0 }}>
              {t('inspection.answers', 'Answers')}
            </Typography.Title>

            {(viewInspectionQuery.data.answers ?? []).length === 0 && (
              <Typography.Text type="secondary">{t('common.noData', 'No answers yet')}</Typography.Text>
            )}

            {(viewInspectionQuery.data.answers ?? []).map((answer: InspectionAnswer) => (
              <InspectionFindingCard
                key={answer.id}
                answer={answer as any}
                title={answer.checklist_item?.question_text || `Item #${answer.checklist_item_id}`}
              />
            ))}
          </Space>
        )}
      </Modal>
    </Card>
  );
}
