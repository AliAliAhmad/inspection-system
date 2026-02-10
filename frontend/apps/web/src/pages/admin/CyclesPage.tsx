import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  message,
  Typography,
  Row,
  Col,
  Tabs,
  InputNumber,
  Popconfirm,
  Tooltip,
  Switch,
  Drawer,
  Statistic,
  Progress,
  Divider,
  List,
  Badge,
  Alert,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  LockOutlined,
  BarChartOutlined,
  LinkOutlined,
  FileTextOutlined,
  ToolOutlined,
  RocketOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  cyclesApi,
  type MaintenanceCycle,
  type CreateCyclePayload,
  type CycleAnalyticsData,
  type CycleImpactData,
} from '@inspection/shared';

const { Title, Text } = Typography;

const CALENDAR_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

export default function CyclesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'running_hours' | 'calendar'>('running_hours');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<MaintenanceCycle | null>(null);
  const [analyticsDrawerOpen, setAnalyticsDrawerOpen] = useState(false);
  const [analyticsCycleId, setAnalyticsCycleId] = useState<number | null>(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [pendingDeleteCycle, setPendingDeleteCycle] = useState<MaintenanceCycle | null>(null);

  const [form] = Form.useForm();

  // Fetch cycles
  const { data: cyclesData, isLoading } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => cyclesApi.list(),
  });

  const cycles = cyclesData?.data?.data?.cycles || [];

  // Fetch analytics for selected cycle
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['cycles', 'analytics', analyticsCycleId],
    queryFn: () => analyticsCycleId ? cyclesApi.getAnalytics(analyticsCycleId).then(r => r.data.data) : null,
    enabled: !!analyticsCycleId && analyticsDrawerOpen,
  });

  // Fetch impact for cycle pending delete
  const { data: impactData, isLoading: impactLoading } = useQuery({
    queryKey: ['cycles', 'impact', pendingDeleteCycle?.id],
    queryFn: () => pendingDeleteCycle ? cyclesApi.getImpact(pendingDeleteCycle.id).then(r => r.data.data) : null,
    enabled: !!pendingDeleteCycle && impactModalOpen,
  });

  // Fetch linked items for analytics drawer
  const { data: linkedItemsData, isLoading: linkedItemsLoading } = useQuery({
    queryKey: ['cycles', 'linked', analyticsCycleId],
    queryFn: () => analyticsCycleId ? cyclesApi.getLinkedItems(analyticsCycleId, { per_page: 10 }).then(r => r.data.data) : null,
    enabled: !!analyticsCycleId && analyticsDrawerOpen,
  });
  const runningHoursCycles = cycles.filter((c) => c.cycle_type === 'running_hours');
  const calendarCycles = cycles.filter((c) => c.cycle_type === 'calendar');

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateCyclePayload) => cyclesApi.create(payload),
    onSuccess: () => {
      message.success('Cycle created successfully');
      queryClient.invalidateQueries({ queryKey: ['cycles'] });
      setCreateModalOpen(false);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to create cycle');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateCyclePayload> & { is_active?: boolean } }) =>
      cyclesApi.update(id, payload),
    onSuccess: () => {
      message.success('Cycle updated successfully');
      queryClient.invalidateQueries({ queryKey: ['cycles'] });
      setEditModalOpen(false);
      setEditingCycle(null);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to update cycle');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => cyclesApi.delete(id),
    onSuccess: () => {
      message.success('Cycle deleted');
      queryClient.invalidateQueries({ queryKey: ['cycles'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to delete cycle');
    },
  });

  const handleCreate = (values: any) => {
    const payload: CreateCyclePayload = {
      name: values.name,
      name_ar: values.name_ar,
      cycle_type: activeTab,
      hours_value: activeTab === 'running_hours' ? values.hours_value : undefined,
      calendar_value: activeTab === 'calendar' ? values.calendar_value : undefined,
      calendar_unit: activeTab === 'calendar' ? values.calendar_unit : undefined,
    };
    createMutation.mutate(payload);
  };

  const handleUpdate = (values: any) => {
    if (editingCycle) {
      const payload: Partial<CreateCyclePayload> & { is_active?: boolean } = {
        name: values.name,
        name_ar: values.name_ar,
        is_active: values.is_active,
      };
      if (editingCycle.cycle_type === 'running_hours') {
        payload.hours_value = values.hours_value;
      } else {
        payload.calendar_value = values.calendar_value;
        payload.calendar_unit = values.calendar_unit;
      }
      updateMutation.mutate({ id: editingCycle.id, payload });
    }
  };

  const openEditModal = (cycle: MaintenanceCycle) => {
    setEditingCycle(cycle);
    form.setFieldsValue({
      name: cycle.name,
      name_ar: cycle.name_ar,
      hours_value: cycle.hours_value,
      calendar_value: cycle.calendar_value,
      calendar_unit: cycle.calendar_unit,
      is_active: cycle.is_active,
    });
    setEditModalOpen(true);
  };

  const openAnalyticsDrawer = (cycleId: number) => {
    setAnalyticsCycleId(cycleId);
    setAnalyticsDrawerOpen(true);
  };

  const openImpactModal = (cycle: MaintenanceCycle) => {
    setPendingDeleteCycle(cycle);
    setImpactModalOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDeleteCycle) {
      deleteMutation.mutate(pendingDeleteCycle.id);
      setImpactModalOpen(false);
      setPendingDeleteCycle(null);
    }
  };

  const getEffectivenessColor = (score: number | null) => {
    if (score === null) return '#d9d9d9';
    if (score >= 80) return '#52c41a';
    if (score >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const runningHoursColumns: ColumnsType<MaintenanceCycle> = [
    {
      title: t('cycles.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MaintenanceCycle) => (
        <Space>
          {record.is_system && (
            <Tooltip title={t('cycles.systemCycle', 'System cycle (cannot be deleted)')}>
              <LockOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Text strong>{name}</Text>
          {record.name_ar && <Text type="secondary">({record.name_ar})</Text>}
        </Space>
      ),
    },
    {
      title: t('cycles.hours', 'Hours'),
      dataIndex: 'hours_value',
      key: 'hours_value',
      width: 120,
      render: (hours: number) => (
        <Tag color="orange" icon={<ClockCircleOutlined />}>
          {hours}h
        </Tag>
      ),
    },
    {
      title: t('cycles.linkedItems', 'Linked'),
      key: 'linked',
      width: 100,
      render: (_: any, record: MaintenanceCycle) => (
        <Tooltip title={t('cycles.viewLinkedItems', 'View linked items')}>
          <Badge
            count={record.linked_templates_count ?? 0}
            style={{ backgroundColor: record.linked_templates_count ? '#1890ff' : '#d9d9d9' }}
            showZero
          >
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openAnalyticsDrawer(record.id);
              }}
            />
          </Badge>
        </Tooltip>
      ),
    },
    {
      title: t('cycles.status', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">{t('common.active', 'Active')}</Tag> : <Tag>{t('common.inactive', 'Inactive')}</Tag>),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: MaintenanceCycle) => (
        <Space>
          <Tooltip title={t('cycles.analytics', 'Analytics')}>
            <Button
              type="text"
              icon={<BarChartOutlined />}
              onClick={() => openAnalyticsDrawer(record.id)}
            />
          </Tooltip>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          {!record.is_system && (
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => openImpactModal(record)}
            >
              {t('common.delete', 'Delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const calendarColumns: ColumnsType<MaintenanceCycle> = [
    {
      title: t('cycles.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MaintenanceCycle) => (
        <Space>
          {record.is_system && (
            <Tooltip title={t('cycles.systemCycle', 'System cycle (cannot be deleted)')}>
              <LockOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Text strong>{name}</Text>
          {record.name_ar && <Text type="secondary">({record.name_ar})</Text>}
        </Space>
      ),
    },
    {
      title: t('cycles.interval', 'Interval'),
      key: 'interval',
      width: 150,
      render: (_: any, record: MaintenanceCycle) => (
        <Tag color="green" icon={<CalendarOutlined />}>
          {record.calendar_value} {record.calendar_unit}
        </Tag>
      ),
    },
    {
      title: t('cycles.linkedItems', 'Linked'),
      key: 'linked',
      width: 100,
      render: (_: any, record: MaintenanceCycle) => (
        <Tooltip title={t('cycles.viewLinkedItems', 'View linked items')}>
          <Badge
            count={record.linked_templates_count ?? 0}
            style={{ backgroundColor: record.linked_templates_count ? '#1890ff' : '#d9d9d9' }}
            showZero
          >
            <Button
              type="text"
              size="small"
              icon={<LinkOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openAnalyticsDrawer(record.id);
              }}
            />
          </Badge>
        </Tooltip>
      ),
    },
    {
      title: t('cycles.status', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">{t('common.active', 'Active')}</Tag> : <Tag>{t('common.inactive', 'Inactive')}</Tag>),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: MaintenanceCycle) => (
        <Space>
          <Tooltip title={t('cycles.analytics', 'Analytics')}>
            <Button
              type="text"
              icon={<BarChartOutlined />}
              onClick={() => openAnalyticsDrawer(record.id)}
            />
          </Tooltip>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          {!record.is_system && (
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => openImpactModal(record)}
            >
              {t('common.delete', 'Delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const RunningHoursForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="500 Hours" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="name_ar" label="Name (Arabic)">
            <Input placeholder="٥٠٠ ساعة" dir="rtl" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="hours_value" label="Hours Value" rules={[{ required: true, message: 'Hours value is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="500" />
          </Form.Item>
        </Col>
        {isEdit && (
          <Col span={12}>
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );

  const CalendarForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="Monthly" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="name_ar" label="Name (Arabic)">
            <Input placeholder="شهري" dir="rtl" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="calendar_value" label="Interval" rules={[{ required: true, message: 'Interval is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="3" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="calendar_unit" label="Unit" rules={[{ required: true, message: 'Unit is required' }]}>
            <Select placeholder="Select unit">
              {CALENDAR_UNITS.map((unit) => (
                <Select.Option key={unit.value} value={unit.value}>
                  {unit.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        {isEdit && (
          <Col span={8}>
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        )}
      </Row>
    </>
  );

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <SettingOutlined /> Maintenance Cycles
            </Title>
            <Text type="secondary">Configure running hours and calendar-based maintenance cycles</Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setCreateModalOpen(true);
              }}
            >
              Add Cycle
            </Button>
          </Col>
        </Row>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'running_hours' | 'calendar')}
          items={[
            {
              key: 'running_hours',
              label: (
                <span>
                  <ClockCircleOutlined /> Running Hours ({runningHoursCycles.length})
                </span>
              ),
              children: (
                <Table
                  dataSource={runningHoursCycles}
                  columns={runningHoursColumns}
                  rowKey="id"
                  loading={isLoading}
                  pagination={false}
                />
              ),
            },
            {
              key: 'calendar',
              label: (
                <span>
                  <CalendarOutlined /> Calendar-Based ({calendarCycles.length})
                </span>
              ),
              children: (
                <Table
                  dataSource={calendarCycles}
                  columns={calendarColumns}
                  rowKey="id"
                  loading={isLoading}
                  pagination={false}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title={`Add ${activeTab === 'running_hours' ? 'Running Hours' : 'Calendar-Based'} Cycle`}
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          {activeTab === 'running_hours' ? <RunningHoursForm /> : <CalendarForm />}
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={`Edit ${editingCycle?.cycle_type === 'running_hours' ? 'Running Hours' : 'Calendar-Based'} Cycle`}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingCycle(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          {editingCycle?.cycle_type === 'running_hours' ? <RunningHoursForm isEdit /> : <CalendarForm isEdit />}
        </Form>
      </Modal>

      {/* Analytics Drawer */}
      <Drawer
        title={
          <Space>
            <BarChartOutlined />
            {t('cycles.analytics', 'Cycle Analytics')}
          </Space>
        }
        open={analyticsDrawerOpen}
        onClose={() => {
          setAnalyticsDrawerOpen(false);
          setAnalyticsCycleId(null);
        }}
        width={500}
      >
        {analyticsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : analyticsData ? (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Cycle Info */}
            <Card size="small">
              <Text strong style={{ fontSize: 16 }}>{analyticsData.cycle_name}</Text>
              <br />
              <Tag color={analyticsData.cycle_type === 'running_hours' ? 'orange' : 'green'}>
                {analyticsData.cycle_type === 'running_hours' ? (
                  <><ClockCircleOutlined /> {t('cycles.runningHours', 'Running Hours')}</>
                ) : (
                  <><CalendarOutlined /> {t('cycles.calendarBased', 'Calendar Based')}</>
                )}
              </Tag>
            </Card>

            {/* Key Stats */}
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title={t('cycles.linkedTemplates', 'Templates')}
                  value={analyticsData.linked_templates}
                  prefix={<FileTextOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('cycles.linkedJobs', 'Jobs')}
                  value={analyticsData.linked_jobs}
                  prefix={<ToolOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('cycles.linkedEquipment', 'Equipment')}
                  value={analyticsData.linked_equipment}
                  prefix={<RocketOutlined />}
                />
              </Col>
            </Row>

            {/* Effectiveness Score */}
            <Card size="small" title={t('cycles.effectiveness', 'Effectiveness Score')}>
              <Progress
                percent={analyticsData.effectiveness_score ?? 0}
                strokeColor={getEffectivenessColor(analyticsData.effectiveness_score)}
                format={(pct) => `${pct}%`}
              />
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={12}>
                  <Statistic
                    title={t('cycles.jobsCompleted', 'Completed')}
                    value={analyticsData.jobs_completed}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={t('cycles.jobsPending', 'Pending')}
                    value={analyticsData.jobs_pending}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Col>
              </Row>
              {analyticsData.avg_completion_time_hours && (
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  {t('cycles.avgCompletionTime', 'Avg completion time')}: {analyticsData.avg_completion_time_hours.toFixed(1)}h
                </Text>
              )}
            </Card>

            {/* Linked Items */}
            <Card
              size="small"
              title={
                <Space>
                  <LinkOutlined />
                  {t('cycles.linkedItems', 'Linked Items')}
                  <Badge count={analyticsData.total_linked_items} style={{ backgroundColor: '#1890ff' }} />
                </Space>
              }
            >
              {linkedItemsLoading ? (
                <Spin size="small" />
              ) : linkedItemsData?.items?.length ? (
                <List
                  size="small"
                  dataSource={linkedItemsData.items}
                  renderItem={(item) => (
                    <List.Item>
                      <Space>
                        {item.type === 'template' && <FileTextOutlined style={{ color: '#1890ff' }} />}
                        {item.type === 'job' && <ToolOutlined style={{ color: '#faad14' }} />}
                        {item.type === 'equipment' && <RocketOutlined style={{ color: '#52c41a' }} />}
                        <Text>{item.name}</Text>
                        <Tag>{item.type}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Text type="secondary">{t('cycles.noLinkedItems', 'No linked items')}</Text>
              )}
            </Card>
          </Space>
        ) : (
          <Text type="secondary">{t('cycles.noAnalyticsData', 'No analytics data available')}</Text>
        )}
      </Drawer>

      {/* Impact Analysis Modal */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            {t('cycles.impactAnalysis', 'Impact Analysis')}
          </Space>
        }
        open={impactModalOpen}
        onCancel={() => {
          setImpactModalOpen(false);
          setPendingDeleteCycle(null);
        }}
        onOk={confirmDelete}
        okText={t('common.delete', 'Delete')}
        okButtonProps={{
          danger: true,
          loading: deleteMutation.isPending,
          disabled: impactLoading || !!(impactData && !impactData.can_delete),
        }}
        width={500}
      >
        {impactLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : impactData ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Text strong>{t('cycles.deleteCycle', 'Delete cycle')}: {impactData.cycle_name}</Text>

            {!impactData.can_delete && (
              <Alert
                type="error"
                showIcon
                message={t('cycles.cannotDelete', 'Cannot Delete')}
                description={t('cycles.cycleInUse', 'This cycle has active jobs and cannot be deleted.')}
              />
            )}

            <Card size="small" title={t('cycles.affectedItems', 'Affected Items')}>
              <Row gutter={16}>
                <Col span={12}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary"><FileTextOutlined /> {t('cycles.templates', 'Templates')}</Text>
                    <Text strong>{impactData.affected_items.templates}</Text>
                  </Space>
                </Col>
                <Col span={12}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary"><ToolOutlined /> {t('cycles.activeJobs', 'Active Jobs')}</Text>
                    <Text strong style={{ color: impactData.affected_items.active_jobs > 0 ? '#ff4d4f' : undefined }}>
                      {impactData.affected_items.active_jobs}
                    </Text>
                  </Space>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 12 }}>
                <Col span={12}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary"><CheckCircleOutlined /> {t('cycles.completedJobs', 'Completed')}</Text>
                    <Text strong>{impactData.affected_items.completed_jobs}</Text>
                  </Space>
                </Col>
                <Col span={12}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary"><RocketOutlined /> {t('cycles.equipment', 'Equipment')}</Text>
                    <Text strong>{impactData.affected_items.equipment}</Text>
                  </Space>
                </Col>
              </Row>
            </Card>

            {impactData.deletion_warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                icon={<InfoCircleOutlined />}
                message={t('cycles.warnings', 'Warnings')}
                description={
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {impactData.deletion_warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                }
              />
            )}

            <Text type="secondary">
              <InfoCircleOutlined /> {impactData.recommended_action}
            </Text>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}
