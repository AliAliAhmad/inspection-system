import { useState, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Typography,
  Space,
  Tabs,
  Segmented,
  Row,
  Col,
  Drawer,
  Tag,
  message,
} from 'antd';
import {
  UnorderedListOutlined,
  AppstoreOutlined,
  LineChartOutlined,
  FieldTimeOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  WarningOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import {
  qualityReviewsApi,
  type QualityReview,
  type ReviewStatus,
  formatDateTime,
} from '@inspection/shared';
import {
  QCStatsHeader,
  QCKanbanBoard,
  QCSLAIndicator,
  calculateSLAStatus,
  QCTrendsChart,
  QCAIAnalysisPanel,
  SLAProgressCard,
} from '../../components/quality-reviews';

const { Title, Text } = Typography;

type ViewMode = 'list' | 'kanban';
type ActivePanel = 'trends' | 'sla' | 'ai' | null;

const statusColorMap: Record<ReviewStatus, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
};

/**
 * QualityReviewsPage - Main Quality Reviews page for Quality Engineers
 *
 * Features:
 * - Stats header with key metrics
 * - View toggle (List/Kanban)
 * - SLA indicators
 * - Trends and AI analysis panels
 */
export default function QualityReviewsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Fetch reviews
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quality-reviews', page, perPage, statusFilter],
    queryFn: () =>
      qualityReviewsApi.list({
        page,
        per_page: perPage,
        status: statusFilter as ReviewStatus | undefined,
      }),
  });

  const reviews = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['quality-reviews'] });
    queryClient.invalidateQueries({ queryKey: ['qc-stats'] });
    refetch();
    message.success(t('common.refreshed', 'Data refreshed'));
  }, [queryClient, refetch, t]);

  const handleReviewClick = useCallback((review: QualityReview) => {
    navigate(`/quality/reviews/${review.id}`);
  }, [navigate]);

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  // Table columns
  const columns: ColumnsType<QualityReview> = [
    {
      title: t('common.id', 'ID'),
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: t('common.type', 'Job Type'),
      dataIndex: 'job_type',
      key: 'job_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'specialist' ? 'blue' : 'purple'}>
          {t(`common.${type}`, type.toUpperCase())}
        </Tag>
      ),
    },
    {
      title: t('common.jobId', 'Job ID'),
      dataIndex: 'job_id',
      key: 'job_id',
      width: 80,
    },
    {
      title: t('qualityReviews.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ReviewStatus) => (
        <Tag color={statusColorMap[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('qc.sla_status', 'SLA Status'),
      key: 'sla_status',
      width: 140,
      render: (_: unknown, record: QualityReview) => {
        const slaStatus = calculateSLAStatus(record.sla_deadline, record.reviewed_at);
        return (
          <QCSLAIndicator
            status={slaStatus}
            size="small"
            variant="tag"
            showProgress={record.status === 'pending'}
          />
        );
      },
    },
    {
      title: t('qc.sla_deadline', 'SLA Deadline'),
      dataIndex: 'sla_deadline',
      key: 'sla_deadline',
      width: 160,
      render: (deadline: string | null, record: QualityReview) => {
        if (!deadline) return '-';
        const isOverdue = new Date(deadline) < new Date() && record.status === 'pending';
        return (
          <Space>
            <Text style={{ color: isOverdue ? '#ff4d4f' : undefined }}>
              {formatDateTime(deadline)}
            </Text>
            {isOverdue && <WarningOutlined style={{ color: '#ff4d4f' }} />}
          </Space>
        );
      },
    },
    {
      title: t('qc.rejection_category', 'Rejection Category'),
      dataIndex: 'rejection_category',
      key: 'rejection_category',
      width: 150,
      render: (category: string | null) =>
        category ? (
          <Tag color="orange">{category.replace(/_/g, ' ')}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('common.reviewed_at', 'Reviewed At'),
      dataIndex: 'reviewed_at',
      key: 'reviewed_at',
      width: 160,
      render: (val: string | null) => (val ? formatDateTime(val) : '-'),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_: unknown, record: QualityReview) => (
        <Button
          type="primary"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            handleReviewClick(record);
          }}
        >
          {t('common.view', 'View')}
        </Button>
      ),
    },
  ];

  const tabItems = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'pending', label: t('qc.pending', 'Pending') },
    { key: 'approved', label: t('qc.approved', 'Approved') },
    { key: 'rejected', label: t('qc.rejected', 'Rejected') },
  ];

  return (
    <div>
      {/* Stats Header */}
      <QCStatsHeader period={period} />

      {/* Page Header with Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          {t('nav.qualityReviews', 'Quality Reviews')}
        </Title>

        <Space wrap>
          {/* Period Selector */}
          <Segmented
            value={period}
            onChange={(value) => setPeriod(value as 'week' | 'month' | 'year')}
            options={[
              { label: t('common.week', 'Week'), value: 'week' },
              { label: t('common.month', 'Month'), value: 'month' },
              { label: t('common.year', 'Year'), value: 'year' },
            ]}
          />

          {/* View Toggle */}
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as ViewMode)}
            options={[
              {
                label: (
                  <Space size={4}>
                    <UnorderedListOutlined />
                    {t('common.list', 'List')}
                  </Space>
                ),
                value: 'list',
              },
              {
                label: (
                  <Space size={4}>
                    <AppstoreOutlined />
                    {t('common.kanban', 'Kanban')}
                  </Space>
                ),
                value: 'kanban',
              },
            ]}
          />

          {/* Panel Toggles */}
          <Button
            icon={<LineChartOutlined />}
            onClick={() => togglePanel('trends')}
            type={activePanel === 'trends' ? 'primary' : 'default'}
          >
            {t('qc.trends', 'Trends')}
          </Button>
          <Button
            icon={<FieldTimeOutlined />}
            onClick={() => togglePanel('sla')}
            type={activePanel === 'sla' ? 'primary' : 'default'}
          >
            {t('qc.sla', 'SLA')}
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => togglePanel('ai')}
            type={activePanel === 'ai' ? 'primary' : 'default'}
          >
            {t('qc.ai', 'AI')}
          </Button>

          {/* Refresh */}
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            {t('common.refresh', 'Refresh')}
          </Button>
        </Space>
      </div>

      {/* Expandable Panels */}
      {activePanel === 'trends' && (
        <div style={{ marginBottom: 24 }}>
          <QCTrendsChart period={period} />
        </div>
      )}

      {activePanel === 'sla' && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <SLAProgressCard period={period} showReviewerBreakdown />
          </Col>
        </Row>
      )}

      {activePanel === 'ai' && (
        <div style={{ marginBottom: 24 }}>
          <QCAIAnalysisPanel showInsights />
        </div>
      )}

      {/* Main Content - List or Kanban View */}
      {viewMode === 'list' ? (
        <Card>
          <Tabs
            activeKey={statusFilter || 'all'}
            onChange={(key) => {
              setStatusFilter(key === 'all' ? undefined : key);
              setPage(1);
            }}
            items={tabItems}
          />

          <Table<QualityReview>
            rowKey="id"
            columns={columns}
            dataSource={reviews}
            loading={isLoading}
            locale={{
              emptyText: error
                ? t('common.error', 'Error loading data')
                : t('common.noData', 'No reviews found'),
            }}
            pagination={{
              current: pagination?.page || page,
              pageSize: pagination?.per_page || perPage,
              total: pagination?.total || 0,
              showSizeChanger: true,
              showTotal: (total) =>
                t('common.totalItems', 'Total: {{total}} items', { total }),
              onChange: (p, ps) => {
                setPage(p);
                setPerPage(ps);
              },
            }}
            onRow={(record) => ({
              onClick: () => handleReviewClick(record),
              style: { cursor: 'pointer' },
            })}
            scroll={{ x: 1200 }}
          />
        </Card>
      ) : (
        <QCKanbanBoard
          reviews={reviews}
          loading={isLoading}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
