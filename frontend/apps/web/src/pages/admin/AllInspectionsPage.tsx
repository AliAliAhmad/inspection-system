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
import { CheckCircleOutlined, EyeOutlined, FilePdfOutlined, DownloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionsApi,
  aiApi,
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
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [aiReportContent, setAiReportContent] = useState<string | null>(null);
  const [aiReportModalOpen, setAiReportModalOpen] = useState(false);

  const handleGenerateAiReport = async (inspection: Inspection) => {
    setGeneratingAiReport(true);
    try {
      // Prepare inspection data for AI
      const inspectionData = {
        id: inspection.id,
        equipment: inspection.equipment?.name || `Equipment ${inspection.equipment_id}`,
        equipment_type: inspection.equipment?.equipment_type,
        technician: inspection.technician?.full_name || `Technician ${inspection.technician_id}`,
        status: inspection.status,
        result: inspection.result,
        started_at: inspection.started_at,
        submitted_at: inspection.submitted_at,
        answers: (inspection.answers || []).map((a: any) => ({
          question: a.checklist_item?.question_text,
          answer: a.answer_value,
          comment: a.comment,
          category: a.checklist_item?.category,
          critical: a.checklist_item?.critical_failure,
        })),
      };

      // Get report in both languages
      const [enResult, arResult] = await Promise.all([
        aiApi.generateReport(inspectionData, 'en'),
        aiApi.generateReport(inspectionData, 'ar'),
      ]);

      const enReport = (enResult.data as any)?.data?.report || '';
      const arReport = (arResult.data as any)?.data?.report || '';

      const combinedReport = `📋 INSPECTION REPORT (EN)\n${'='.repeat(50)}\n\n${enReport}\n\n\n📋 تقرير الفحص (AR)\n${'='.repeat(50)}\n\n${arReport}`;

      setAiReportContent(combinedReport);
      setAiReportModalOpen(true);
      message.success(t('inspections.aiReportGenerated', 'AI Report generated'));
    } catch (error) {
      message.error(t('inspections.aiReportError', 'Failed to generate AI report'));
    } finally {
      setGeneratingAiReport(false);
    }
  };

  const handleDownloadReport = async (inspectionId: number) => {
    setDownloadingId(inspectionId);
    try {
      const response = await inspectionsApi.downloadReport(inspectionId);
      const blob = new Blob([response.data as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inspection_report_${inspectionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(t('inspections.reportDownloaded', 'Report downloaded'));
    } catch (error) {
      message.error(t('inspections.reportError', 'Failed to download report'));
    } finally {
      setDownloadingId(null);
    }
  };

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
          {record.status !== 'draft' && (
            <Button
              type="link"
              icon={<FilePdfOutlined />}
              loading={downloadingId === record.id}
              onClick={() => handleDownloadReport(record.id)}
            >
              PDF
            </Button>
          )}
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
        footer={
          viewInspectionQuery.data && viewInspectionQuery.data.status !== 'draft' ? (
            <Space>
              <Button
                icon={<RobotOutlined />}
                loading={generatingAiReport}
                onClick={() => viewInspectionQuery.data && handleGenerateAiReport(viewInspectionQuery.data)}
              >
                {t('inspections.aiReport', 'AI Report')}
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={downloadingId === viewingInspectionId}
                onClick={() => viewingInspectionId && handleDownloadReport(viewingInspectionId)}
              >
                {t('inspections.downloadReport', 'Download PDF Report')}
              </Button>
            </Space>
          ) : null
        }
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

      {/* AI Report Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            {t('inspections.aiReport', 'AI Generated Report')}
          </Space>
        }
        open={aiReportModalOpen}
        onCancel={() => {
          setAiReportModalOpen(false);
          setAiReportContent(null);
        }}
        footer={
          <Button onClick={() => {
            if (aiReportContent) {
              navigator.clipboard.writeText(aiReportContent);
              message.success(t('common.copied', 'Copied to clipboard'));
            }
          }}>
            {t('common.copy', 'Copy to Clipboard')}
          </Button>
        }
        width={800}
      >
        <div style={{
          maxHeight: '60vh',
          overflowY: 'auto',
          background: '#f5f5f5',
          padding: 16,
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: 13,
        }}>
          {aiReportContent}
        </div>
      </Modal>
    </Card>
  );
}
