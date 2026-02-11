import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Tabs,
  Typography,
  Button,
  Modal,
  Form,
  Select,
  Input,
  Space,
  message,
  List,
  Spin,
  Empty,
  Badge,
  Collapse,
  Drawer,
  Segmented,
  Tooltip,
} from 'antd';
import {
  ToolOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  RobotOutlined,
  TableOutlined,
  AppstoreOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  defectsApi,
  usersApi,
  equipmentApi,
  aiApi,
  type Defect,
  type DefectStatus,
  type AssignSpecialistPayload,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
import InspectionFindingCard from '../../components/InspectionFindingCard';
import {
  DefectKanban,
  DefectAIPanel,
  DefectInsightsCard,
  SLAStatusBadge,
} from '../../components/defects';

const severityColors: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'green',
};

const statusColors: Record<string, string> = {
  open: 'red',
  in_progress: 'blue',
  resolved: 'green',
  closed: 'default',
  false_alarm: 'purple',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  false_alarm: 'False Alarm',
};

type ViewMode = 'table' | 'kanban';

export default function DefectsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const [activeStatus, setActiveStatus] = useState<DefectStatus | undefined>();
  const [page, setPage] = useState(1);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [assignForm] = Form.useForm();
  const [category, setCategory] = useState<string | undefined>();

  const [equipmentFilter, setEquipmentFilter] = useState<number | undefined>();

  // AI Panel drawer state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelDefect, setAiPanelDefect] = useState<Defect | null>(null);

  // AI Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['defects', activeStatus, page, equipmentFilter],
    queryFn: () => defectsApi.list({ status: activeStatus, page, per_page: 20, equipment_id: equipmentFilter }).then(r => r.data),
  });

  // Fetch equipment list for filter
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: () => equipmentApi.list({ per_page: 500 }).then(r => r.data),
  });

  const equipmentList: any[] = equipmentData?.data || [];

  // Fetch specialists when modal is open
  const { data: specialistsData } = useQuery({
    queryKey: ['users', 'specialists'],
    queryFn: () => usersApi.list({ role: 'specialist', per_page: 200, is_active: true }),
    enabled: assignOpen,
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignSpecialistPayload }) =>
      defectsApi.assignSpecialist(id, payload),
    onSuccess: (res) => {
      const job = (res.data as any)?.data;
      message.success(
        t('defects.assignSuccess', 'Specialist job {{jobId}} created', {
          jobId: job?.job_id || '',
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['defects'] });
      setAssignOpen(false);
      setSelectedDefect(null);
      assignForm.resetFields();
      setCategory(undefined);
    },
    onError: (err: any) => {
      message.error(
        err?.response?.data?.message || t('defects.assignError', 'Failed to assign specialist'),
      );
    },
  });

  const specialists: any[] =
    specialistsData?.data?.data || (specialistsData?.data as any)?.data || [];

  // AI Search for similar defects
  const handleSearchSimilar = async () => {
    if (!searchQuery.trim()) {
      message.warning(t('defects.enterSearchQuery', 'Please enter a search query'));
      return;
    }
    setIsSearching(true);
    try {
      const response = await aiApi.searchSimilarDefects(searchQuery.trim(), 10);
      const results = (response.data as any)?.data?.results || [];
      setSearchResults(results);
      if (results.length === 0) {
        message.info(t('defects.noSimilarFound', 'No similar defects found'));
      }
    } catch (error) {
      message.error(t('defects.searchError', 'Failed to search for similar defects'));
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle defect click (opens AI panel)
  const handleDefectClick = (defect: Defect) => {
    setAiPanelDefect(defect);
    setAiPanelOpen(true);
  };

  // Handle defect escalation from AI panel
  const handleEscalate = (defectId: number, level: number) => {
    // In production, this would trigger escalation notifications
    console.log(`Defect ${defectId} escalated to level ${level}`);
    queryClient.invalidateQueries({ queryKey: ['defects'] });
  };

  // Calculate mock SLA for table view
  const getSLAInfo = (defect: Defect) => {
    if (defect.status === 'closed' || defect.status === 'resolved') {
      return { status: 'on_track' as const, hoursRemaining: 0 };
    }

    const createdAt = new Date(defect.created_at);
    const baseHours = defect.severity === 'critical' ? 4 :
                     defect.severity === 'high' ? 24 :
                     defect.severity === 'medium' ? 72 : 168;
    const deadline = new Date(createdAt.getTime() + baseHours * 60 * 60 * 1000);
    const now = new Date();
    const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
    const percentageElapsed = Math.min(100, ((baseHours - hoursRemaining) / baseHours) * 100);

    let status: 'on_track' | 'warning' | 'at_risk' | 'breached' | 'critical' = 'on_track';
    if (percentageElapsed >= 100) status = 'breached';
    else if (percentageElapsed >= 90) status = 'critical';
    else if (percentageElapsed >= 75) status = 'at_risk';
    else if (percentageElapsed >= 50) status = 'warning';

    return { status, hoursRemaining };
  };

  const columns: ColumnsType<Defect> = [
    {
      title: t('defects.id', 'ID'),
      dataIndex: 'id',
      key: 'id',
      width: 70,
      render: (id: number, record: Defect) => (
        <Button type="link" size="small" onClick={() => handleDefectClick(record)}>
          #{id}
        </Button>
      ),
    },
    {
      title: t('defects.equipment', 'Equipment'),
      key: 'equipment',
      width: 180,
      render: (_: unknown, record: Defect) => {
        if (!record.equipment) return '-';
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{record.equipment.name}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.equipment.serial_number}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: t('defects.description', 'Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string, record: Defect) => (
        <Space>
          <span>{desc}</span>
          {record.occurrence_count > 1 && (
            <Badge
              count={`x${record.occurrence_count}`}
              style={{ backgroundColor: '#ff4d4f' }}
            />
          )}
        </Space>
      ),
    },
    {
      title: t('defects.severity', 'Severity'),
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={severityColors[severity] || 'default'}>
          {severity?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('defects.sla', 'SLA'),
      key: 'sla',
      width: 120,
      render: (_: unknown, record: Defect) => {
        const slaInfo = getSLAInfo(record);
        return (
          <SLAStatusBadge
            status={slaInfo.status}
            hoursRemaining={slaInfo.hoursRemaining}
            size="small"
          />
        );
      },
    },
    {
      title: t('defects.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => (
        <Tag color={statusColors[status] || 'default'}>
          {statusLabels[status] || status?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: t('defects.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (cat: string | null) =>
        cat ? (
          <Tag color={cat === 'mechanical' ? 'blue' : 'gold'}>
            {cat.toUpperCase()}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('defects.dueDate', 'Due Date'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 100,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Defect) => {
        const hasJob = !!(record as any).specialist_job;
        return (
          <Space>
            <Tooltip title={t('defects.viewAIInsights', 'View AI Insights')}>
              <Button
                type="default"
                size="small"
                icon={<RobotOutlined />}
                onClick={() => handleDefectClick(record)}
              />
            </Tooltip>
            <Button
              type="primary"
              size="small"
              icon={<ToolOutlined />}
              onClick={() => {
                setSelectedDefect(record);
                assignForm.resetFields();
                setCategory(undefined);
                setAssignOpen(true);
              }}
              disabled={hasJob || record.status === 'closed' || record.status === 'resolved'}
            >
              {hasJob
                ? t('defects.assigned', 'Assigned')
                : t('defects.assign', 'Assign')}
            </Button>
          </Space>
        );
      },
    },
  ];

  const defects: Defect[] = data?.data || [];
  const pagination = data?.pagination;

  const tabItems = [
    { key: 'all', label: t('defects.all', 'All') },
    { key: 'open', label: t('defects.open', 'Open') },
    { key: 'in_progress', label: t('defects.inProgress', 'In Progress') },
    { key: 'resolved', label: t('defects.resolved', 'Resolved') },
    { key: 'closed', label: t('defects.closed', 'Closed') },
    { key: 'false_alarm', label: t('defects.falseAlarm', 'False Alarm') },
  ];

  const handleTabChange = (key: string) => {
    setActiveStatus(key === 'all' ? undefined : (key as DefectStatus));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* AI Insights Card */}
      <DefectInsightsCard />

      {/* Main Card */}
      <Card
        title={<Typography.Title level={4}>{t('nav.defects', 'Defects')}</Typography.Title>}
        extra={
          <Space>
            {/* View Toggle */}
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                {
                  value: 'table',
                  icon: <TableOutlined />,
                  label: t('defects.tableView', 'Table'),
                },
                {
                  value: 'kanban',
                  icon: <AppstoreOutlined />,
                  label: t('defects.kanbanView', 'Kanban'),
                },
              ]}
            />
            <Button
              icon={<RobotOutlined />}
              onClick={() => setSearchModalOpen(true)}
            >
              {t('defects.findSimilar', 'Find Similar')}
            </Button>
          </Space>
        }
      >
        {viewMode === 'table' ? (
          <>
            <Tabs
              activeKey={activeStatus || 'all'}
              onChange={handleTabChange}
              items={tabItems}
            />

            <div style={{ marginBottom: 16 }}>
              <Space>
                <Typography.Text strong>{t('defects.filterByEquipment', 'Equipment')}:</Typography.Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('defects.selectEquipment', 'Filter by equipment...')}
                  style={{ width: 300 }}
                  value={equipmentFilter}
                  onChange={(val) => { setEquipmentFilter(val); setPage(1); }}
                  options={equipmentList.map((eq: any) => ({
                    value: eq.id,
                    label: `${eq.name} (${eq.serial_number})`,
                  }))}
                />
              </Space>
            </div>

            <Table
              rowKey="id"
              columns={columns}
              dataSource={defects}
              loading={isLoading}
              locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
              expandable={{
                expandedRowRender: (record: Defect) => {
                  const occurrences = record.occurrences ?? [];
                  if (occurrences.length > 1) {
                    const ordinalLabel = (n: number) => {
                      const s = ['th', 'st', 'nd', 'rd'];
                      const v = n % 100;
                      return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
                    };
                    return (
                      <Collapse
                        defaultActiveKey={[occurrences[occurrences.length - 1]?.id]}
                        items={occurrences.map((occ) => ({
                          key: occ.id,
                          label: (
                            <Space>
                              <Tag color="blue">{ordinalLabel(occ.occurrence_number)} Occurrence</Tag>
                              {occ.found_by && (
                                <Typography.Text type="secondary">
                                  Found by: {occ.found_by.full_name}
                                </Typography.Text>
                              )}
                              {occ.found_at && (
                                <Typography.Text type="secondary">
                                  — {new Date(occ.found_at).toLocaleDateString()}
                                </Typography.Text>
                              )}
                            </Space>
                          ),
                          children: occ.inspection_answer ? (
                            <InspectionFindingCard answer={occ.inspection_answer} />
                          ) : (
                            <Typography.Text type="secondary">
                              {t('common.noData', 'No inspection data')}
                            </Typography.Text>
                          ),
                        }))}
                      />
                    );
                  }
                  // Single occurrence — show directly
                  return record.inspection_answer ? (
                    <InspectionFindingCard answer={record.inspection_answer} />
                  ) : (
                    <Typography.Text type="secondary">{t('common.noData', 'No inspection data')}</Typography.Text>
                  );
                },
                rowExpandable: (record: Defect) =>
                  !!record.inspection_answer || (record.occurrences?.length ?? 0) > 0,
                expandIcon: ({ expanded, onExpand, record }) =>
                  record.inspection_answer || (record.occurrences?.length ?? 0) > 0 ? (
                    <InfoCircleOutlined
                      style={{ color: expanded ? '#1677ff' : '#999', cursor: 'pointer' }}
                      onClick={(e) => onExpand(record, e)}
                    />
                  ) : null,
              }}
              pagination={{
                current: pagination?.page || page,
                pageSize: pagination?.per_page || 20,
                total: pagination?.total || 0,
                showSizeChanger: false,
                onChange: (p) => setPage(p),
              }}
              scroll={{ x: 1400 }}
            />
          </>
        ) : (
          <DefectKanban onDefectClick={handleDefectClick} />
        )}
      </Card>

      {/* Assign Specialist Modal */}
      <Modal
        title={t('defects.assignSpecialist', 'Assign Specialist')}
        open={assignOpen}
        onCancel={() => {
          setAssignOpen(false);
          setSelectedDefect(null);
          assignForm.resetFields();
          setCategory(undefined);
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        destroyOnClose
      >
        {selectedDefect && (
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>Defect #{selectedDefect.id}: </Typography.Text>
            <Typography.Text>{selectedDefect.description}</Typography.Text>
            <br />
            <Space style={{ marginTop: 4 }}>
              <Tag color={severityColors[selectedDefect.severity || '']}>
                {selectedDefect.severity?.toUpperCase()}
              </Tag>
              {selectedDefect.category && (
                <Tag color={selectedDefect.category === 'mechanical' ? 'blue' : 'gold'}>
                  {selectedDefect.category.toUpperCase()}
                </Tag>
              )}
            </Space>
          </div>
        )}
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(values: any) => {
            if (!selectedDefect) return;
            const payload: AssignSpecialistPayload = {
              specialist_ids: values.specialist_ids,
              ...(values.category ? { category: values.category } : {}),
              ...(values.major_reason ? { major_reason: values.major_reason } : {}),
            };
            assignMutation.mutate({ id: selectedDefect.id, payload });
          }}
        >
          <Form.Item
            name="specialist_ids"
            label={t('defects.specialists', 'Specialists')}
            rules={[{ required: true, message: 'Please select at least one specialist' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="children"
              placeholder={t('defects.selectSpecialists', 'Select specialists')}
            >
              {specialists.map((s: any) => (
                <Select.Option key={s.id} value={s.id}>
                  {s.full_name} ({s.role_id})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="category"
            label={t('defects.jobCategory', 'Job Category')}
          >
            <Select
              allowClear
              placeholder={t('defects.selectCategory', 'Select category (optional)')}
              onChange={(v) => setCategory(v)}
            >
              <Select.Option value="minor">Minor</Select.Option>
              <Select.Option value="major">Major</Select.Option>
            </Select>
          </Form.Item>
          {category === 'major' && (
            <Form.Item
              name="major_reason"
              label={t('defects.majorReason', 'Major Reason')}
              rules={[{ required: true, message: 'Reason is required for major category' }]}
            >
              <VoiceTextArea rows={3} placeholder={t('defects.enterMajorReason', 'Explain why this is a major job')} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* AI Search Similar Defects Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            {t('defects.findSimilar', 'Find Similar Defects')}
          </Space>
        }
        open={searchModalOpen}
        onCancel={() => {
          setSearchModalOpen(false);
          setSearchQuery('');
          setSearchResults([]);
        }}
        footer={null}
        width={700}
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            {t('defects.searchHint', 'Describe a defect or issue to find similar past defects using AI')}
          </Typography.Text>
        </div>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('defects.searchPlaceholder', 'e.g., hydraulic leak in cylinder, electrical fault in motor...')}
            onPressEnter={handleSearchSimilar}
            disabled={isSearching}
            style={{ flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearchSimilar}
            loading={isSearching}
          >
            {t('common.search', 'Search')}
          </Button>
        </Space.Compact>

        {isSearching && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">
                {t('defects.searchingAI', 'Searching with AI...')}
              </Typography.Text>
            </div>
          </div>
        )}

        {!isSearching && searchResults.length > 0 && (
          <List
            dataSource={searchResults}
            renderItem={(item: any) => (
              <List.Item
                style={{
                  background: '#fafafa',
                  marginBottom: 8,
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  // Find the defect and open AI panel
                  const defect = defects.find(d => d.id === item.id);
                  if (defect) {
                    setSearchModalOpen(false);
                    handleDefectClick(defect);
                  }
                }}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Typography.Text strong>#{item.id}</Typography.Text>
                      <Tag color={severityColors[item.severity] || 'default'}>
                        {item.severity?.toUpperCase()}
                      </Tag>
                      <Tag color={statusColors[item.status] || 'default'}>
                        {statusLabels[item.status] || item.status?.toUpperCase()}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {Math.round((item.similarity || 0) * 100)}% {t('defects.similar', 'similar')}
                      </Typography.Text>
                    </Space>
                  }
                  description={
                    <Typography.Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 0 }}
                    >
                      {item.description}
                    </Typography.Paragraph>
                  }
                />
              </List.Item>
            )}
          />
        )}

        {!isSearching && searchResults.length === 0 && searchQuery && (
          <Empty
            description={t('defects.noResults', 'No similar defects found')}
            style={{ padding: 40 }}
          />
        )}
      </Modal>

      {/* AI Panel Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#1677ff' }} />
            {t('defects.aiInsights', 'AI Insights')}
            {aiPanelDefect && (
              <Tag>#{aiPanelDefect.id}</Tag>
            )}
          </Space>
        }
        placement="right"
        width={420}
        open={aiPanelOpen}
        onClose={() => {
          setAiPanelOpen(false);
          setAiPanelDefect(null);
        }}
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => {
              setAiPanelOpen(false);
              setAiPanelDefect(null);
            }}
          />
        }
        styles={{
          body: { padding: 16, backgroundColor: '#f5f5f5' },
        }}
      >
        {aiPanelDefect && (
          <DefectAIPanel
            defect={aiPanelDefect}
            onDefectClick={(defectId) => {
              // Find and switch to clicked defect
              const clickedDefect = defects.find(d => d.id === defectId);
              if (clickedDefect) {
                setAiPanelDefect(clickedDefect);
              }
            }}
            onEscalate={handleEscalate}
          />
        )}
      </Drawer>
    </div>
  );
}
