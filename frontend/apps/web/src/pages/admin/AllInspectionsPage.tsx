import { useState, useMemo } from 'react';
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
  Row,
  Col,
  Statistic,
  Progress,
  Select,
  DatePicker,
  Drawer,
  Empty,
  Tooltip,
  Checkbox,
  Divider,
  List,
  Alert,
} from 'antd';
import {
  CheckCircleOutlined,
  EyeOutlined,
  FilePdfOutlined,
  DownloadOutlined,
  RobotOutlined,
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  BarChartOutlined,
  BulbOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  ExportOutlined,
  SafetyCertificateOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
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
  type InspectionStats,
  type AIInsights,
  type BulkReviewPayload,
} from '@inspection/shared';
import dayjs from 'dayjs';
import VoiceTextArea from '../../components/VoiceTextArea';
import InspectionFindingCard from '../../components/InspectionFindingCard';

const { RangePicker } = DatePicker;

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

// Stats Card Component
function StatsCard({
  title,
  value,
  suffix,
  icon,
  color = '#1890ff',
  trend,
  trendValue,
  loading = false,
}: {
  title: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  color?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  loading?: boolean;
}) {
  return (
    <Card size="small" loading={loading}>
      <Row align="middle" gutter={8}>
        <Col>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: `${color}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color,
          }}>
            {icon}
          </div>
        </Col>
        <Col flex={1}>
          <Statistic
            title={title}
            value={value}
            suffix={suffix}
            valueStyle={{ fontSize: 20 }}
          />
          {trend && trendValue && (
            <Space size={4}>
              {trend === 'up' ? <RiseOutlined style={{ color: '#52c41a' }} /> : <FallOutlined style={{ color: '#ff4d4f' }} />}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{trendValue}</Typography.Text>
            </Space>
          )}
        </Col>
      </Row>
    </Card>
  );
}

// AI Recommendation Card
function RecommendationCard({ rec }: { rec: { type: string; priority: string; title: string; description: string; action: string } }) {
  const priorityColors: Record<string, string> = {
    high: 'red',
    medium: 'orange',
    low: 'blue',
  };
  const typeIcons: Record<string, React.ReactNode> = {
    training: <TrophyOutlined />,
    equipment: <WarningOutlined />,
    process: <ThunderboltOutlined />,
    quality: <SafetyCertificateOutlined />,
  };

  return (
    <Card size="small" style={{ marginBottom: 8 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        <Row justify="space-between" align="middle">
          <Space>
            {typeIcons[rec.type] || <BulbOutlined />}
            <Typography.Text strong>{rec.title}</Typography.Text>
          </Space>
          <Tag color={priorityColors[rec.priority] || 'default'}>{rec.priority.toUpperCase()}</Tag>
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{rec.description}</Typography.Text>
        <Typography.Text style={{ fontSize: 12, color: '#1890ff' }}>{rec.action}</Typography.Text>
      </Space>
    </Card>
  );
}

export default function AllInspectionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [resultFilter, setResultFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [hasDefects, setHasDefects] = useState<boolean | undefined>();
  const [nlQuery, setNlQuery] = useState('');

  // Selection for bulk actions
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  // Modals/Drawers
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewingInspection, setReviewingInspection] = useState<Inspection | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingInspectionId, setViewingInspectionId] = useState<number | null>(null);
  const [insightsDrawerOpen, setInsightsDrawerOpen] = useState(false);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [reviewForm] = Form.useForm();
  const [bulkReviewForm] = Form.useForm();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [aiReportContent, setAiReportContent] = useState<string | null>(null);
  const [aiReportModalOpen, setAiReportModalOpen] = useState(false);
  const [bulkExporting, setBulkExporting] = useState(false);

  // Stats Query
  const statsQuery = useQuery({
    queryKey: ['inspections-stats'],
    queryFn: () => inspectionsApi.getStats(),
    refetchInterval: 60000, // Refresh every minute
  });
  const stats: InspectionStats | undefined = (statsQuery.data?.data as any)?.data;

  // AI Insights Query
  const insightsQuery = useQuery({
    queryKey: ['inspections-ai-insights'],
    queryFn: () => inspectionsApi.getAIInsights(),
    enabled: insightsDrawerOpen,
  });
  const insights: AIInsights | undefined = (insightsQuery.data?.data as any)?.data;

  // Natural Language Search Query
  const nlSearchQuery = useQuery({
    queryKey: ['inspections-nl-search', nlQuery],
    queryFn: () => inspectionsApi.search(nlQuery),
    enabled: nlQuery.length > 3,
  });

  // Main list query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inspections', page, perPage, statusFilter, resultFilter, dateRange, hasDefects],
    queryFn: () => inspectionsApi.list({
      page,
      per_page: perPage,
      status: statusFilter,
      result: resultFilter,
      date_from: dateRange?.[0]?.format('YYYY-MM-DD'),
      date_to: dateRange?.[1]?.format('YYYY-MM-DD'),
      has_defects: hasDefects,
    }),
  });

  // View inspection details
  const viewInspectionQuery = useQuery({
    queryKey: ['inspection-detail', viewingInspectionId],
    queryFn: () =>
      inspectionsApi.get(viewingInspectionId!).then((r) => {
        const raw = (r.data as any).data ?? (r.data as any).inspection;
        return raw as Inspection;
      }),
    enabled: !!viewingInspectionId,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReviewPayload }) =>
      inspectionsApi.review(id, payload),
    onSuccess: () => {
      message.success(t('inspections.reviewSuccess', 'Inspection reviewed successfully'));
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspections-stats'] });
      setReviewOpen(false);
      setReviewingInspection(null);
      reviewForm.resetFields();
    },
    onError: () => message.error(t('inspections.reviewError', 'Failed to review inspection')),
  });

  // Bulk Review mutation
  const bulkReviewMutation = useMutation({
    mutationFn: (payload: BulkReviewPayload) => inspectionsApi.bulkReview(payload),
    onSuccess: (response) => {
      const summary = (response.data as any)?.summary;
      if (summary) {
        message.success(t('inspections.bulkReviewSuccess', 'Reviewed {{successful}} of {{total}} inspections', {
          successful: summary.successful,
          total: summary.total,
        }));
      } else {
        message.success(t('inspections.bulkReviewSuccess', 'Bulk review completed'));
      }
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspections-stats'] });
      setBulkReviewOpen(false);
      setSelectedRowKeys([]);
      bulkReviewForm.resetFields();
    },
    onError: () => message.error(t('inspections.bulkReviewError', 'Failed to bulk review')),
  });

  // Handlers
  const handleGenerateAiReport = async (inspection: Inspection) => {
    setGeneratingAiReport(true);
    try {
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
    } catch {
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
    } catch {
      message.error(t('inspections.reportError', 'Failed to download report'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleBulkExport = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('inspections.selectToExport', 'Select inspections to export'));
      return;
    }
    setBulkExporting(true);
    try {
      const response = await inspectionsApi.bulkExport(selectedRowKeys);
      const blob = new Blob([response.data as BlobPart], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inspections_export_${dayjs().format('YYYY-MM-DD')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(t('inspections.exportSuccess', 'Exported {{count}} inspections', { count: selectedRowKeys.length }));
    } catch {
      message.error(t('inspections.exportError', 'Failed to export'));
    } finally {
      setBulkExporting(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter(undefined);
    setResultFilter(undefined);
    setDateRange(null);
    setHasDefects(undefined);
    setNlQuery('');
    setPage(1);
  };

  const openReview = (record: Inspection) => {
    setReviewingInspection(record);
    reviewForm.resetFields();
    setReviewOpen(true);
  };

  // Columns
  const columns: ColumnsType<Inspection> = [
    { title: t('inspections.id', 'ID'), dataIndex: 'id', key: 'id', width: 70 },
    {
      title: t('inspections.equipment', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, r: Inspection) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{r.equipment?.name || `ID: ${r.equipment_id}`}</Typography.Text>
          {r.equipment?.equipment_type && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {r.equipment.equipment_type}
            </Typography.Text>
          )}
        </Space>
      ),
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
      width: 110,
      render: (s: InspectionStatus) => (
        <Tag color={statusColorMap[s]}>{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('inspections.result', 'Result'),
      dataIndex: 'result',
      key: 'result',
      width: 100,
      render: (r: InspectionResult | null) =>
        r ? <Tag color={resultColorMap[r]}>{r.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('inspections.duration', 'Duration'),
      key: 'duration',
      width: 90,
      render: (_: unknown, r: Inspection) => {
        if (!r.started_at || !r.submitted_at) return '-';
        const minutes = dayjs(r.submitted_at).diff(dayjs(r.started_at), 'minute');
        return `${minutes} min`;
      },
    },
    {
      title: t('inspections.startedAt', 'Started'),
      dataIndex: 'started_at',
      key: 'started_at',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: Inspection) => (
        <Space size="small">
          <Tooltip title={t('common.view', 'View')}>
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setViewingInspectionId(record.id);
                setViewOpen(true);
              }}
            />
          </Tooltip>
          {record.status !== 'draft' && (
            <Tooltip title="PDF">
              <Button
                type="text"
                size="small"
                icon={<FilePdfOutlined />}
                loading={downloadingId === record.id}
                onClick={() => handleDownloadReport(record.id)}
              />
            </Tooltip>
          )}
          {record.status === 'submitted' && (
            <Tooltip title={t('inspections.review', 'Review')}>
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                onClick={() => openReview(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const inspections = nlQuery.length > 3 && nlSearchQuery.data
    ? ((nlSearchQuery.data.data as any)?.data || [])
    : (data?.data?.data || []);
  const pagination = data?.data?.pagination;

  const tabItems = [
    { key: 'all', label: t('inspections.all', 'All') },
    { key: 'draft', label: t('inspections.draft', 'Draft') },
    { key: 'submitted', label: `${t('inspections.submitted', 'Submitted')} (${stats?.by_status?.submitted || 0})` },
    { key: 'reviewed', label: t('inspections.reviewed', 'Reviewed') },
  ];

  // Selection config
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
    getCheckboxProps: (record: Inspection) => ({
      disabled: record.status !== 'submitted', // Only allow selecting submitted for bulk review
    }),
  };

  const hasActiveFilters = statusFilter || resultFilter || dateRange || hasDefects !== undefined;
  const selectedSubmittedCount = useMemo(() => {
    return selectedRowKeys.filter(key => {
      const insp = inspections.find((i: Inspection) => i.id === key);
      return insp?.status === 'submitted';
    }).length;
  }, [selectedRowKeys, inspections]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats Dashboard */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.todayTotal', 'Today')}
            value={stats?.today?.total || 0}
            icon={<ClockCircleOutlined />}
            color="#1890ff"
            loading={statsQuery.isLoading}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.submitted', 'Submitted')}
            value={stats?.today?.submitted || 0}
            icon={<CheckCircleOutlined />}
            color="#faad14"
            loading={statsQuery.isLoading}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.pendingReview', 'Pending Review')}
            value={stats?.pending_review || 0}
            icon={<WarningOutlined />}
            color="#ff4d4f"
            loading={statsQuery.isLoading}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.passRate', 'Pass Rate')}
            value={`${(stats?.pass_rate || 0).toFixed(0)}%`}
            icon={<SafetyCertificateOutlined />}
            color="#52c41a"
            loading={statsQuery.isLoading}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.avgTime', 'Avg. Time')}
            value={stats?.avg_completion_minutes || 0}
            suffix="min"
            icon={<ThunderboltOutlined />}
            color="#722ed1"
            loading={statsQuery.isLoading}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatsCard
            title={t('inspections.weekComplete', 'Week Total')}
            value={stats?.week?.total || 0}
            icon={<BarChartOutlined />}
            color="#13c2c2"
            loading={statsQuery.isLoading}
          />
        </Col>
      </Row>

      {/* Main Card */}
      <Card>
        {/* Toolbar */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Space>
            <Input.Search
              placeholder={t('inspections.searchPlaceholder', 'Search: "failed inspections last week"...')}
              style={{ width: 350 }}
              prefix={<SearchOutlined />}
              allowClear
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              loading={nlSearchQuery.isFetching}
            />
            <Button
              icon={<FilterOutlined />}
              type={hasActiveFilters ? 'primary' : 'default'}
              ghost={!!hasActiveFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              {t('common.filters', 'Filters')}
              {hasActiveFilters && ' •'}
            </Button>
          </Space>
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Typography.Text type="secondary">
                  {t('common.selected', '{{count}} selected', { count: selectedRowKeys.length })}
                </Typography.Text>
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => setBulkReviewOpen(true)}
                  disabled={selectedSubmittedCount === 0}
                >
                  {t('inspections.bulkReview', 'Bulk Review')} ({selectedSubmittedCount})
                </Button>
                <Button
                  icon={<ExportOutlined />}
                  loading={bulkExporting}
                  onClick={handleBulkExport}
                >
                  {t('common.export', 'Export')}
                </Button>
              </>
            )}
            <Button
              icon={<RobotOutlined />}
              onClick={() => setInsightsDrawerOpen(true)}
            >
              {t('inspections.aiInsights', 'AI Insights')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
          </Space>
        </Row>

        {/* Filters Panel */}
        {showFilters && (
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={[16, 8]} align="middle">
              <Col xs={24} sm={12} md={6}>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                  {t('inspections.result', 'Result')}
                </Typography.Text>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('inspections.anyResult', 'Any result')}
                  allowClear
                  value={resultFilter}
                  onChange={setResultFilter}
                  options={[
                    { value: 'pass', label: t('inspections.pass', 'Pass') },
                    { value: 'fail', label: t('inspections.fail', 'Fail') },
                    { value: 'incomplete', label: t('inspections.incomplete', 'Incomplete') },
                  ]}
                />
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                  {t('common.dateRange', 'Date Range')}
                </Typography.Text>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange}
                  onChange={(val) => setDateRange(val as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
                />
              </Col>
              <Col xs={12} sm={6} md={4}>
                <div style={{ paddingTop: 20 }}>
                  <Checkbox
                    checked={hasDefects}
                    onChange={(e) => setHasDefects(e.target.checked ? true : undefined)}
                  >
                    {t('inspections.hasDefects', 'Has Defects')}
                  </Checkbox>
                </div>
              </Col>
              <Col xs={12} sm={6} md={4}>
                <div style={{ paddingTop: 20 }}>
                  <Button size="small" onClick={clearFilters}>
                    {t('common.clearFilters', 'Clear Filters')}
                  </Button>
                </div>
              </Col>
            </Row>
          </Card>
        )}

        {/* NL Search Info */}
        {nlQuery.length > 3 && nlSearchQuery.data && (
          <Alert
            type="info"
            showIcon
            icon={<RobotOutlined />}
            message={
              <Space>
                <span>{t('inspections.aiSearchResults', 'AI Search Results')}</span>
                <Tag color="blue">{(nlSearchQuery.data.data as any)?.count || 0} {t('common.results', 'results')}</Tag>
                {(nlSearchQuery.data.data as any)?.filters_applied && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Filters: {JSON.stringify((nlSearchQuery.data.data as any)?.filters_applied)}
                  </Typography.Text>
                )}
              </Space>
            }
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setNlQuery('')}
          />
        )}

        {/* Tabs */}
        <Tabs
          activeKey={statusFilter || 'all'}
          onChange={(key) => {
            setStatusFilter(key === 'all' ? undefined : key);
            setPage(1);
          }}
          items={tabItems}
          style={{ marginBottom: 8 }}
        />

        {/* Table */}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={inspections}
          loading={isLoading || nlSearchQuery.isFetching}
          rowSelection={rowSelection}
          locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
          pagination={nlQuery.length > 3 ? false : {
            current: pagination?.page || page,
            pageSize: pagination?.per_page || perPage,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
            onChange: (p, ps) => { setPage(p); setPerPage(ps); },
          }}
          scroll={{ x: 1100 }}
          size="small"
        />
      </Card>

      {/* Single Review Modal */}
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

      {/* Bulk Review Modal */}
      <Modal
        title={t('inspections.bulkReview', 'Bulk Review Inspections')}
        open={bulkReviewOpen}
        onCancel={() => { setBulkReviewOpen(false); bulkReviewForm.resetFields(); }}
        onOk={() => bulkReviewForm.submit()}
        confirmLoading={bulkReviewMutation.isPending}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message={t('inspections.bulkReviewInfo', 'You are about to review {{count}} inspections with the same result.', {
            count: selectedSubmittedCount,
          })}
          style={{ marginBottom: 16 }}
        />
        <Form
          form={bulkReviewForm}
          layout="vertical"
          onFinish={(v) => {
            const submittedIds = selectedRowKeys.filter(key => {
              const insp = inspections.find((i: Inspection) => i.id === key);
              return insp?.status === 'submitted';
            });
            bulkReviewMutation.mutate({
              inspection_ids: submittedIds,
              result: v.result,
              notes: v.notes,
            });
          }}
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

      {/* AI Insights Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            {t('inspections.aiInsights', 'AI Insights & Analytics')}
          </Space>
        }
        open={insightsDrawerOpen}
        onClose={() => setInsightsDrawerOpen(false)}
        width={500}
      >
        {insightsQuery.isLoading && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
              {t('inspections.analyzingData', 'Analyzing inspection data...')}
            </Typography.Text>
          </div>
        )}
        {insights && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Trend Summary */}
            <Card size="small" title={t('inspections.trendSummary', 'Trend Summary')}>
              <Row align="middle" gutter={16}>
                <Col>
                  {insights.trend_summary.direction === 'up' ? (
                    <RiseOutlined style={{ fontSize: 32, color: '#52c41a' }} />
                  ) : (
                    <FallOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />
                  )}
                </Col>
                <Col>
                  <Typography.Text strong style={{ fontSize: 18 }}>
                    {insights.trend_summary.change.toFixed(1)}%
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    {insights.trend_summary.direction === 'up'
                      ? t('inspections.improvingTrend', 'Pass rate improving')
                      : t('inspections.decliningTrend', 'Pass rate declining')
                    }
                  </Typography.Text>
                </Col>
              </Row>
            </Card>

            {/* At Risk Equipment */}
            {insights.at_risk_equipment.length > 0 && (
              <Card size="small" title={
                <Space>
                  <WarningOutlined style={{ color: '#ff4d4f' }} />
                  {t('inspections.atRiskEquipment', 'At-Risk Equipment')}
                </Space>
              }>
                <List
                  size="small"
                  dataSource={insights.at_risk_equipment}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={item.name}
                        description={`${item.type} • ${item.failures}/${item.total_inspections} failed`}
                      />
                      <Tag color={item.risk_level === 'high' ? 'red' : 'orange'}>
                        {item.failure_rate.toFixed(0)}% fail
                      </Tag>
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {/* Anomalies */}
            {insights.anomalies.length > 0 && (
              <Card size="small" title={
                <Space>
                  <BulbOutlined style={{ color: '#faad14' }} />
                  {t('inspections.anomalies', 'Performance Anomalies')}
                </Space>
              }>
                <List
                  size="small"
                  dataSource={insights.anomalies}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={item.inspector_name}
                        description={`${item.inspections} inspections • ${item.pass_rate.toFixed(0)}% pass rate`}
                      />
                      <Tag color={item.type === 'above_average' ? 'green' : 'orange'}>
                        {item.deviation.toFixed(0)}% deviation
                      </Tag>
                    </List.Item>
                  )}
                />
              </Card>
            )}

            {/* Defects by Category */}
            <Card size="small" title={t('inspections.defectsByCategory', 'Defects by Category')}>
              {Object.entries(insights.defect_by_category || {}).length === 0 ? (
                <Empty description={t('common.noData', 'No data')} />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {Object.entries(insights.defect_by_category).map(([category, count]) => (
                    <Row key={category} justify="space-between" align="middle">
                      <Typography.Text>{category}</Typography.Text>
                      <Progress
                        percent={Math.round((count as number / Object.values(insights.defect_by_category).reduce((a: number, b: unknown) => a + (b as number), 0)) * 100)}
                        size="small"
                        style={{ width: 150 }}
                        format={() => count}
                      />
                    </Row>
                  ))}
                </Space>
              )}
            </Card>

            {/* Recommendations */}
            <Card size="small" title={
              <Space>
                <ThunderboltOutlined style={{ color: '#1890ff' }} />
                {t('inspections.recommendations', 'AI Recommendations')}
              </Space>
            }>
              {insights.recommendations.length === 0 ? (
                <Empty description={t('inspections.noRecommendations', 'No recommendations at this time')} />
              ) : (
                insights.recommendations.map((rec, idx) => (
                  <RecommendationCard key={idx} rec={rec} />
                ))
              )}
            </Card>

            {/* Top Performers from Stats */}
            {stats?.top_performers && stats.top_performers.length > 0 && (
              <Card size="small" title={
                <Space>
                  <TrophyOutlined style={{ color: '#faad14' }} />
                  {t('inspections.topPerformers', 'Top Performers')}
                </Space>
              }>
                <List
                  size="small"
                  dataSource={stats.top_performers}
                  renderItem={(item, idx) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : '#cd7f32',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: 12,
                          }}>
                            {idx + 1}
                          </div>
                        }
                        title={item.name}
                        description={`${item.completed} completed`}
                      />
                      <Tag color="green">{item.pass_rate.toFixed(0)}%</Tag>
                    </List.Item>
                  )}
                />
              </Card>
            )}

            <Divider />
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('inspections.insightsGenerated', 'Generated at')}: {insights.generated_at ? dayjs(insights.generated_at).format('YYYY-MM-DD HH:mm') : '-'}
            </Typography.Text>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
