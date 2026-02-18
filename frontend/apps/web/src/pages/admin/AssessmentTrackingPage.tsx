import React, { useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Tag,
  Space,
  Badge,
  Statistic,
  Table,
  Tabs,
  Empty,
  Tooltip,
  Alert,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  SafetyOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { assessmentsApi } from '@inspection/shared';
import type { FinalAssessment, Verdict } from '@inspection/shared';

const { Title, Text } = Typography;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getVerdictColor = (verdict: Verdict | null): string => {
  switch (verdict) {
    case 'operational':
      return 'green';
    case 'monitor':
      return 'orange';
    case 'stop':
      return 'red';
    default:
      return 'default';
  }
};

const getVerdictTag = (verdict: Verdict | null, label?: string) => {
  if (!verdict) return <Tag>N/A</Tag>;
  return (
    <Tag color={getVerdictColor(verdict)}>
      {label ? `${label}: ` : ''}
      {verdict.toUpperCase()}
    </Tag>
  );
};

const getEscalationBadge = (level: string) => {
  switch (level) {
    case 'engineer':
      return <Tag color="blue">Engineer</Tag>;
    case 'admin':
      return <Tag color="red">Admin</Tag>;
    default:
      return <Tag>None</Tag>;
  }
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Determine pipeline stage for a given assessment
// ---------------------------------------------------------------------------

type PipelineStage = 'pending_inspector' | 'pending_engineer' | 'pending_admin' | 'finalized';

function getStage(a: FinalAssessment): PipelineStage {
  if (a.finalized_at) return 'finalized';
  if (a.escalation_level === 'admin') return 'pending_admin';
  if (a.escalation_level === 'engineer') return 'pending_engineer';
  // Not finalized, not escalated -> still with inspectors
  return 'pending_inspector';
}

// ---------------------------------------------------------------------------
// Pipeline Card (one assessment in the kanban view)
// ---------------------------------------------------------------------------

interface PipelineCardProps {
  assessment: FinalAssessment;
  onClick?: () => void;
}

function PipelineCard({ assessment, onClick }: PipelineCardProps) {
  return (
    <Card
      size="small"
      hoverable
      onClick={onClick}
      style={{ marginBottom: 8 }}
      styles={{ body: { padding: 12 } }}
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text strong>Equipment #{assessment.equipment_id}</Text>

        <Space size={[4, 4]} wrap>
          {getVerdictTag(assessment.system_verdict, 'SYS')}
          {getVerdictTag(assessment.mech_verdict, 'MECH')}
          {getVerdictTag(assessment.elec_verdict, 'ELEC')}
          {assessment.engineer_verdict && getVerdictTag(assessment.engineer_verdict, 'ENG')}
        </Space>

        <Space size={8}>
          {getEscalationBadge(assessment.escalation_level)}
          {assessment.system_has_critical && (
            <Tooltip title="Has critical findings">
              <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            </Tooltip>
          )}
        </Space>

        <Text type="secondary" style={{ fontSize: 11 }}>
          Created: {formatDate(assessment.created_at)}
        </Text>
      </Space>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Column
// ---------------------------------------------------------------------------

interface PipelineColumnProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  items: FinalAssessment[];
  onCardClick?: (a: FinalAssessment) => void;
}

function PipelineColumn({ title, icon, color, items, onCardClick }: PipelineColumnProps) {
  return (
    <Card
      title={
        <Space>
          {icon}
          <Text strong>{title}</Text>
          <Badge count={items.length} style={{ backgroundColor: color }} />
        </Space>
      }
      styles={{
        body: {
          maxHeight: 520,
          overflowY: 'auto',
          padding: 8,
          background: '#fafafa',
        },
      }}
      style={{ height: '100%' }}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assessments" />
      ) : (
        items.map((a) => (
          <PipelineCard key={a.id} assessment={a} onClick={() => onCardClick?.(a)} />
        ))
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AssessmentTrackingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pipeline');

  // Fetch all assessments
  const {
    data: allData,
    isLoading: loadingAll,
    isError: errorAll,
  } = useQuery({
    queryKey: ['assessments-all'],
    queryFn: () =>
      assessmentsApi.list({ per_page: 500 }).then((r) => {
        const d = r.data;
        if (Array.isArray(d)) return d;
        return (d as any)?.data ?? [];
      }),
  });

  // Fetch pending (inspector)
  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ['assessments-pending-inspector'],
    queryFn: () =>
      assessmentsApi.getPending().then((r) => {
        const d = r.data;
        if (Array.isArray(d)) return d;
        return (d as any)?.data ?? [];
      }),
  });

  // Fetch engineer pending
  const { data: engineerData, isLoading: loadingEngineer } = useQuery({
    queryKey: ['assessments-pending-engineer'],
    queryFn: () =>
      assessmentsApi.getEngineerPending().then((r) => {
        const d = r.data;
        if (Array.isArray(d)) return d;
        return (d as any)?.data ?? [];
      }),
  });

  // Fetch admin pending
  const { data: adminData, isLoading: loadingAdmin } = useQuery({
    queryKey: ['assessments-pending-admin'],
    queryFn: () =>
      assessmentsApi.getAdminPending().then((r) => {
        const d = r.data;
        if (Array.isArray(d)) return d;
        return (d as any)?.data ?? [];
      }),
  });

  const isLoading = loadingAll || loadingPending || loadingEngineer || loadingAdmin;

  const allAssessments: FinalAssessment[] = allData || [];
  const pendingInspector: FinalAssessment[] = pendingData || [];
  const pendingEngineer: FinalAssessment[] = engineerData || [];
  const pendingAdmin: FinalAssessment[] = adminData || [];

  // Derive finalized from all assessments
  const finalized = useMemo(
    () => allAssessments.filter((a) => a.finalized_at !== null),
    [allAssessments],
  );

  // Stats
  const stats = useMemo(
    () => ({
      total: allAssessments.length,
      pendingInspector: pendingInspector.length,
      pendingEngineer: pendingEngineer.length,
      pendingAdmin: pendingAdmin.length,
      finalized: finalized.length,
    }),
    [allAssessments, pendingInspector, pendingEngineer, pendingAdmin, finalized],
  );

  // Table columns for list view
  const columns: ColumnsType<FinalAssessment> = [
    {
      title: t('assessment.equipment', 'Equipment'),
      key: 'equipment',
      render: (_: unknown, record: FinalAssessment) => (
        <Text strong>#{record.equipment_id}</Text>
      ),
      sorter: (a, b) => a.equipment_id - b.equipment_id,
    },
    {
      title: t('assessment.systemVerdict', 'System'),
      dataIndex: 'system_verdict',
      key: 'system_verdict',
      render: (v: Verdict | null) => getVerdictTag(v),
      filters: [
        { text: 'Operational', value: 'operational' },
        { text: 'Monitor', value: 'monitor' },
        { text: 'Stop', value: 'stop' },
      ],
      onFilter: (value, record) => record.system_verdict === value,
    },
    {
      title: t('assessment.mechVerdict', 'Mechanical'),
      dataIndex: 'mech_verdict',
      key: 'mech_verdict',
      render: (v: Verdict | null) => getVerdictTag(v),
      filters: [
        { text: 'Operational', value: 'operational' },
        { text: 'Monitor', value: 'monitor' },
        { text: 'Stop', value: 'stop' },
      ],
      onFilter: (value, record) => record.mech_verdict === value,
    },
    {
      title: t('assessment.elecVerdict', 'Electrical'),
      dataIndex: 'elec_verdict',
      key: 'elec_verdict',
      render: (v: Verdict | null) => getVerdictTag(v),
      filters: [
        { text: 'Operational', value: 'operational' },
        { text: 'Monitor', value: 'monitor' },
        { text: 'Stop', value: 'stop' },
      ],
      onFilter: (value, record) => record.elec_verdict === value,
    },
    {
      title: t('assessment.engineerVerdict', 'Engineer'),
      dataIndex: 'engineer_verdict',
      key: 'engineer_verdict',
      render: (v: Verdict | null) => getVerdictTag(v),
    },
    {
      title: t('assessment.finalStatus', 'Final Status'),
      dataIndex: 'final_status',
      key: 'final_status',
      render: (v: Verdict | null) => getVerdictTag(v),
      filters: [
        { text: 'Operational', value: 'operational' },
        { text: 'Monitor', value: 'monitor' },
        { text: 'Stop', value: 'stop' },
      ],
      onFilter: (value, record) => record.final_status === value,
    },
    {
      title: t('assessment.escalation', 'Escalation'),
      dataIndex: 'escalation_level',
      key: 'escalation_level',
      render: (level: string) => getEscalationBadge(level),
      filters: [
        { text: 'None', value: 'none' },
        { text: 'Engineer', value: 'engineer' },
        { text: 'Admin', value: 'admin' },
      ],
      onFilter: (value, record) => record.escalation_level === value,
    },
    {
      title: t('assessment.stage', 'Stage'),
      key: 'stage',
      render: (_: unknown, record: FinalAssessment) => {
        const stage = getStage(record);
        const stageLabels: Record<PipelineStage, { label: string; color: string }> = {
          pending_inspector: { label: 'Inspector', color: 'gold' },
          pending_engineer: { label: 'Engineer', color: 'blue' },
          pending_admin: { label: 'Admin', color: 'red' },
          finalized: { label: 'Finalized', color: 'green' },
        };
        const s = stageLabels[stage];
        return <Tag color={s.color}>{s.label}</Tag>;
      },
      filters: [
        { text: 'Pending Inspector', value: 'pending_inspector' },
        { text: 'Pending Engineer', value: 'pending_engineer' },
        { text: 'Pending Admin', value: 'pending_admin' },
        { text: 'Finalized', value: 'finalized' },
      ],
      onFilter: (value, record) => getStage(record) === value,
    },
    {
      title: t('assessment.createdAt', 'Created'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (v: string) => formatDate(v),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: t('assessment.finalizedAt', 'Finalized'),
      dataIndex: 'finalized_at',
      key: 'finalized_at',
      render: (v: string | null) => (v ? formatDateTime(v) : <Text type="secondary">-</Text>),
      sorter: (a, b) =>
        new Date(a.finalized_at || 0).getTime() - new Date(b.finalized_at || 0).getTime(),
    },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <br />
        <Text type="secondary" style={{ marginTop: 12, display: 'block' }}>
          {t('common.loading', 'Loading assessments...')}
        </Text>
      </div>
    );
  }

  // Error state
  if (errorAll) {
    return (
      <Alert
        message={t('common.error', 'Error')}
        description={t('assessment.loadError', 'Failed to load assessments. Please try again.')}
        type="error"
        showIcon
        style={{ margin: 24 }}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Page Title */}
      <Title level={3} style={{ marginBottom: 24 }}>
        <SafetyOutlined style={{ marginInlineEnd: 8 }} />
        {t('assessment.tracking', 'Assessment Tracking')}
      </Title>

      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={4} lg={4}>
          <Card size="small">
            <Statistic
              title={t('assessment.total', 'Total Assessments')}
              value={stats.total}
              prefix={<SafetyOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={5} lg={5}>
          <Card size="small">
            <Statistic
              title={t('assessment.pendingInspector', 'Pending Inspector')}
              value={stats.pendingInspector}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={5} lg={5}>
          <Card size="small">
            <Statistic
              title={t('assessment.pendingEngineer', 'Pending Engineer')}
              value={stats.pendingEngineer}
              valueStyle={{ color: '#1890ff' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={5} lg={5}>
          <Card size="small">
            <Statistic
              title={t('assessment.pendingAdmin', 'Pending Admin')}
              value={stats.pendingAdmin}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={5} lg={5}>
          <Card size="small">
            <Statistic
              title={t('assessment.finalized', 'Finalized')}
              value={stats.finalized}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs: Pipeline / List */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        items={[
          {
            key: 'pipeline',
            label: (
              <Space>
                <RightOutlined />
                {t('assessment.pipelineView', 'Pipeline View')}
              </Space>
            ),
            children: (
              <Row gutter={16}>
                <Col xs={24} sm={12} lg={6}>
                  <PipelineColumn
                    title={t('assessment.pendingInspector', 'Pending Inspector')}
                    icon={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                    color="#faad14"
                    items={pendingInspector}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <PipelineColumn
                    title={t('assessment.pendingEngineer', 'Pending Engineer')}
                    icon={<WarningOutlined style={{ color: '#1890ff' }} />}
                    color="#1890ff"
                    items={pendingEngineer}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <PipelineColumn
                    title={t('assessment.pendingAdmin', 'Pending Admin')}
                    icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
                    color="#ff4d4f"
                    items={pendingAdmin}
                  />
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <PipelineColumn
                    title={t('assessment.finalized', 'Finalized')}
                    icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    color="#52c41a"
                    items={finalized}
                  />
                </Col>
              </Row>
            ),
          },
          {
            key: 'list',
            label: (
              <Space>
                <SafetyOutlined />
                {t('assessment.listView', 'List View')}
              </Space>
            ),
            children: (
              <Card>
                <Table<FinalAssessment>
                  rowKey="id"
                  columns={columns}
                  dataSource={allAssessments}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} assessments` }}
                  scroll={{ x: 1200 }}
                  locale={{
                    emptyText: (
                      <Empty description={t('assessment.noData', 'No assessments found')} />
                    ),
                  }}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
