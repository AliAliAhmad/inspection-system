import { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  Space,
  message,
  Typography,
  Descriptions,
  Row,
  Col,
  Statistic,
  Progress,
  Drawer,
  Alert,
  Checkbox,
  Tooltip,
  Badge,
  Spin,
  Tabs,
  List,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  ReloadOutlined,
  FilterOutlined,
  RobotOutlined,
  CalendarOutlined,
  TableOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  ClusterOutlined,
  FileOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  rosterApi,
  type AssignTeamPayload,
  type AssignmentStats,
  type InspectorSuggestion,
} from '@inspection/shared';
import dayjs from 'dayjs';
import { SmartBatchView, TemplateManager, WorkloadBalancer } from '../../components/inspection-assignments';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

export default function InspectionAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Modal states
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [workloadDrawerOpen, setWorkloadDrawerOpen] = useState(false);

  // View mode: table or calendar
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // Active tab for Phase 4 features
  const [activeTab, setActiveTab] = useState<'assignments' | 'batching' | 'templates' | 'balancer'>('assignments');

  // Selected list for Phase 4 operations
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
    shift: undefined as string | undefined,
    status: undefined as string | undefined,
    equipmentType: undefined as string | undefined,
  });

  // Bulk selection
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const [generateForm] = Form.useForm();
  const [assignForm] = Form.useForm();

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['inspection-assignments', 'stats'],
    queryFn: () => inspectionAssignmentsApi.getStats().then((r) => r.data?.data),
    staleTime: 60000,
  });

  // Fetch all lists with their assignments
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inspection-assignments', filters],
    queryFn: () => inspectionAssignmentsApi.getLists({
      date_from: filters.dateRange?.[0]?.format('YYYY-MM-DD'),
      date_to: filters.dateRange?.[1]?.format('YYYY-MM-DD'),
      shift: filters.shift as any,
      status: filters.status,
      equipment_type: filters.equipmentType,
    }),
  });

  // Fetch calendar view
  const { data: calendarData, isLoading: calendarLoading } = useQuery({
    queryKey: ['inspection-assignments', 'calendar'],
    queryFn: () => inspectionAssignmentsApi.getCalendarView().then((r) => r.data?.data),
    enabled: viewMode === 'calendar',
  });

  // Fetch roster availability for the selected assignment's date + shift
  const assignmentDate = selectedAssignment?.list_target_date;
  const assignmentShift = selectedAssignment?.list_shift;

  const { data: availabilityData } = useQuery({
    queryKey: ['roster', 'day-availability', assignmentDate, assignmentShift],
    queryFn: () => rosterApi.getDayAvailability(assignmentDate, assignmentShift),
    enabled: assignOpen && !!assignmentDate && !!assignmentShift,
  });

  // AI Suggestion query
  const { data: aiSuggestion, isLoading: aiSuggestionLoading, refetch: refetchAISuggestion } = useQuery({
    queryKey: ['inspection-assignments', 'ai-suggest', selectedAssignment?.id],
    queryFn: () => inspectionAssignmentsApi.getAISuggestion(selectedAssignment!.id).then((r) => r.data?.data),
    enabled: aiSuggestionOpen && !!selectedAssignment,
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (payload: { target_date: string; shift: 'day' | 'night' }) =>
      inspectionAssignmentsApi.generateList(payload),
    onSuccess: (res) => {
      const result = (res.data as any)?.data ?? res.data;
      message.success(
        t('assignments.generateSuccess', 'Inspection list generated — {{count}} assignments created', {
          count: result?.total_assets ?? 0,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setGenerateOpen(false);
      generateForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.generateError', 'Failed to generate list'));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: AssignTeamPayload }) =>
      inspectionAssignmentsApi.assignTeam(id, payload),
    onSuccess: (res) => {
      const data = res.data as any;
      const autoCount = data.auto_assigned || 0;
      const msg = autoCount > 0
        ? `Team assigned successfully (also auto-assigned to ${autoCount} other equipment at same berth)`
        : t('assignments.assignSuccess', 'Team assigned successfully');
      message.success(msg);
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setAssignOpen(false);
      setAiSuggestionOpen(false);
      setSelectedAssignment(null);
      assignForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || t('assignments.assignError', 'Failed to assign team'));
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: (assignmentIds: number[]) =>
      inspectionAssignmentsApi.bulkAssign({ assignment_ids: assignmentIds, auto_assign: true }),
    onSuccess: (res) => {
      const summary = (res.data as any)?.summary;
      message.success(`Auto-assigned ${summary?.successful || 0} of ${summary?.total || 0} assignments`);
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      setSelectedRowKeys([]);
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Bulk assign failed');
    },
  });

  // Flatten: extract all assignments from all lists
  const rawLists: any[] = data?.data?.data || (data?.data as any)?.data || [];
  const allAssignments: any[] = useMemo(() => {
    const result: any[] = [];
    for (const list of rawLists) {
      const assignments = list.assignments || [];
      for (const a of assignments) {
        result.push({
          ...a,
          list_target_date: list.target_date,
          list_shift: list.shift,
          list_status: list.status,
        });
      }
    }
    // Sort by date descending
    result.sort((a, b) => (b.list_target_date || '').localeCompare(a.list_target_date || ''));
    return result;
  }, [rawLists]);

  // Get unique values for filters
  const equipmentTypes = useMemo(() => {
    const types = new Set<string>();
    allAssignments.forEach((a) => {
      if (a.equipment?.equipment_type) types.add(a.equipment.equipment_type);
    });
    return Array.from(types);
  }, [allAssignments]);

  // Build inspector lists from roster availability
  const availData = (availabilityData?.data as any)?.data ?? availabilityData?.data;
  const availableUsers: any[] = availData?.available ?? [];
  const onLeaveUsers: any[] = availData?.on_leave ?? [];

  const mechAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'mechanical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );
  const elecAvailable = availableUsers.filter(
    (u: any) => u.specialization === 'electrical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)),
  );

  const mechOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'mechanical');
  const elecOnLeave = onLeaveUsers.filter((u: any) => u.role === 'inspector' && u.specialization === 'electrical');

  const mechOptions = [...mechAvailable, ...mechOnLeave];
  const elecOptions = [...elecAvailable, ...elecOnLeave];

  const coverUserIds = new Set<number>();
  for (const u of availableUsers) {
    if (u.covering_for) coverUserIds.add(u.id);
  }

  const PENDING_LABELS: Record<string, string> = {
    both_inspections: 'Pending: Both inspections',
    mechanical_inspection: 'Pending: Mechanical inspection',
    electrical_inspection: 'Pending: Electrical inspection',
    both_verdicts: 'Pending: Both verdicts',
    mechanical_verdict: 'Pending: Mechanical verdict',
    electrical_verdict: 'Pending: Electrical verdict',
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green';
      case 'assigned': return 'blue';
      case 'in_progress': return 'processing';
      case 'mech_complete': return 'purple';
      case 'elec_complete': return 'purple';
      case 'both_complete': return 'cyan';
      case 'assessment_pending': return 'orange';
      case 'unassigned': return 'default';
      default: return 'default';
    }
  };

  const columns = [
    {
      title: t('assignments.targetDate', 'Date'),
      dataIndex: 'list_target_date',
      key: 'date',
      width: 110,
      render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      title: t('assignments.shift', 'Shift'),
      dataIndex: 'list_shift',
      key: 'shift',
      width: 80,
      render: (v: string) => v ? <Tag color={v === 'day' ? 'gold' : 'geekblue'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('assignments.equipment', 'Equipment'),
      key: 'equipment_name',
      render: (_: unknown, record: any) => record.equipment?.name || `ID: ${record.equipment_id}`,
    },
    {
      title: t('assignments.equipmentType', 'Type'),
      key: 'equipment_type',
      render: (_: unknown, record: any) => record.equipment?.equipment_type || '-',
    },
    {
      title: t('assignments.berth', 'Berth'),
      key: 'berth',
      width: 80,
      render: (_: unknown, record: any) => record.berth || record.equipment?.berth || '-',
    },
    {
      title: t('assignments.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (v: string, record: any) => (
        <div>
          <Tag color={statusColor(v)}>{(v || 'unknown').replace(/_/g, ' ').toUpperCase()}</Tag>
          {record.pending_on && PENDING_LABELS[record.pending_on] ? (
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {PENDING_LABELS[record.pending_on]}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: t('assignments.mechInspector', 'Mech'),
      key: 'mech',
      width: 120,
      ellipsis: true,
      render: (_: unknown, record: any) =>
        record.mechanical_inspector
          ? record.mechanical_inspector.full_name
          : <Text type="secondary">—</Text>,
    },
    {
      title: t('assignments.elecInspector', 'Elec'),
      key: 'elec',
      width: 120,
      ellipsis: true,
      render: (_: unknown, record: any) =>
        record.electrical_inspector
          ? record.electrical_inspector.full_name
          : <Text type="secondary">—</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: any) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<TeamOutlined />}
            onClick={() => {
              setSelectedAssignment(record);
              assignForm.resetFields();
              setAssignOpen(true);
            }}
            disabled={record.status === 'completed'}
          >
            {record.mechanical_inspector_id ? 'Reassign' : 'Assign'}
          </Button>
          {!record.mechanical_inspector_id && (
            <Tooltip title="AI Suggest">
              <Button
                size="small"
                icon={<RobotOutlined />}
                onClick={() => {
                  setSelectedAssignment(record);
                  setAiSuggestionOpen(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const renderInspectorOption = (u: any) => {
    const onLeave = onLeaveUsers.some((ol: any) => ol.id === u.id);
    const isCover = coverUserIds.has(u.id);
    return (
      <Select.Option key={u.id} value={u.id} disabled={onLeave}>
        <span style={{
          color: onLeave ? '#ff4d4f' : isCover ? '#52c41a' : undefined,
          fontWeight: onLeave || isCover ? 600 : undefined,
        }}>
          {u.full_name} ({u.role_id})
          {onLeave && u.leave_cover ? ` — Cover: ${u.leave_cover.full_name}` : ''}
          {onLeave && !u.leave_cover ? ' — On Leave' : ''}
          {isCover && u.covering_for ? ` — Covering ${u.covering_for.full_name}` : ''}
        </span>
      </Select.Option>
    );
  };

  const renderSuggestionCard = (suggestion: InspectorSuggestion | null, type: 'mechanical' | 'electrical') => {
    if (!suggestion) {
      return (
        <Card size="small" style={{ marginBottom: 8 }}>
          <Text type="secondary">No {type} inspector available</Text>
        </Card>
      );
    }

    const scoreColor = suggestion.match_score >= 80 ? 'green' : suggestion.match_score >= 60 ? 'orange' : 'red';

    return (
      <Card
        size="small"
        style={{ marginBottom: 8 }}
        extra={<Tag color={scoreColor}>{suggestion.match_score}% match</Tag>}
      >
        <Space direction="vertical" size={0}>
          <Text strong>{suggestion.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {suggestion.active_assignments} active assignments
          </Text>
          <Space size={4} style={{ marginTop: 4 }}>
            <Tag color={suggestion.factors.workload === 'low' ? 'green' : suggestion.factors.workload === 'medium' ? 'orange' : 'red'}>
              {suggestion.factors.workload} workload
            </Tag>
            <Tag color={suggestion.factors.availability === 'available' ? 'green' : 'orange'}>
              {suggestion.factors.availability}
            </Tag>
          </Space>
        </Space>
      </Card>
    );
  };

  // Stats summary
  const stats: AssignmentStats | undefined = statsData as any;

  // Row selection for bulk actions
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as number[]),
    getCheckboxProps: (record: any) => ({
      disabled: record.status !== 'unassigned',
    }),
  };

  const unassignedCount = allAssignments.filter((a) => a.status === 'unassigned').length;

  return (
    <div style={{ padding: 0 }}>
      {/* Stats Dashboard */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Today Total"
              value={stats?.today?.total || 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Unassigned"
              value={stats?.today?.unassigned || 0}
              valueStyle={{ color: (stats?.today?.unassigned || 0) > 0 ? '#faad14' : '#52c41a' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Completed"
              value={stats?.today?.completed || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Overdue"
              value={stats?.overdue_count || 0}
              valueStyle={{ color: (stats?.overdue_count || 0) > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Week Completion"
              value={stats?.completion_rate || 0}
              suffix="%"
              prefix={<Progress type="circle" percent={stats?.completion_rate || 0} size={20} showInfo={false} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small" hoverable onClick={() => setWorkloadDrawerOpen(true)}>
            <Statistic
              title="Inspector Workload"
              value={stats?.inspector_workload?.length || 0}
              suffix="active"
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Tab Navigation for Phase 4 Features */}
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
          items={[
            {
              key: 'assignments',
              label: (
                <span>
                  <TableOutlined />
                  {t('assignments.tab_assignments', 'Assignments')}
                </span>
              ),
            },
            {
              key: 'batching',
              label: (
                <span>
                  <ClusterOutlined />
                  {t('assignments.tab_batching', 'Smart Batching')}
                </span>
              ),
            },
            {
              key: 'templates',
              label: (
                <span>
                  <FileOutlined />
                  {t('assignments.tab_templates', 'Templates')}
                </span>
              ),
            },
            {
              key: 'balancer',
              label: (
                <span>
                  <SwapOutlined />
                  {t('assignments.tab_balancer', 'Workload Balancer')}
                </span>
              ),
            },
          ]}
        />
      </Card>

      {/* Smart Batching Tab */}
      {activeTab === 'batching' && (
        <SmartBatchView
          selectedAssignments={allAssignments.filter((a) => selectedRowKeys.includes(a.id))}
          onBatchApplied={() => {
            refetch();
            setSelectedRowKeys([]);
          }}
        />
      )}

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <TemplateManager
          currentListId={selectedListId || rawLists[0]?.id}
          targetListId={selectedListId || rawLists[0]?.id}
          onTemplateApplied={() => refetch()}
        />
      )}

      {/* Workload Balancer Tab */}
      {activeTab === 'balancer' && (
        <WorkloadBalancer
          listId={selectedListId || rawLists[0]?.id}
          onBalanceApplied={() => refetch()}
        />
      )}

      {/* Main Card - Only show on assignments tab */}
      {activeTab === 'assignments' && (
      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {t('nav.assignments', 'Inspection Assignments')}
            </Title>
            <Tag color="blue">{allAssignments.length} total</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button.Group>
              <Button
                icon={<TableOutlined />}
                type={viewMode === 'table' ? 'primary' : 'default'}
                onClick={() => setViewMode('table')}
              />
              <Button
                icon={<CalendarOutlined />}
                type={viewMode === 'calendar' ? 'primary' : 'default'}
                onClick={() => setViewMode('calendar')}
              />
            </Button.Group>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateOpen(true)}>
              {t('assignments.generate', 'Generate List')}
            </Button>
          </Space>
        }
      >
        {/* Filters Row */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              style={{ width: '100%' }}
              value={filters.dateRange}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates as any })}
              placeholder={['From', 'To']}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Shift"
              allowClear
              value={filters.shift}
              onChange={(v) => setFilters({ ...filters, shift: v })}
            >
              <Select.Option value="day">Day</Select.Option>
              <Select.Option value="night">Night</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Status"
              allowClear
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
            >
              <Select.Option value="unassigned">Unassigned</Select.Option>
              <Select.Option value="assigned">Assigned</Select.Option>
              <Select.Option value="in_progress">In Progress</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Equipment Type"
              allowClear
              value={filters.equipmentType}
              onChange={(v) => setFilters({ ...filters, equipmentType: v })}
            >
              {equipmentTypes.map((type) => (
                <Select.Option key={type} value={type}>{type}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={6}>
            <Button
              onClick={() => setFilters({ dateRange: null, shift: undefined, status: undefined, equipmentType: undefined })}
            >
              Clear Filters
            </Button>
          </Col>
        </Row>

        {/* Bulk Actions Bar */}
        {selectedRowKeys.length > 0 && (
          <Alert
            type="info"
            style={{ marginBottom: 16 }}
            message={
              <Space>
                <Text strong>{selectedRowKeys.length} assignments selected</Text>
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  loading={bulkAssignMutation.isPending}
                  onClick={() => bulkAssignMutation.mutate(selectedRowKeys)}
                >
                  Auto-Assign All
                </Button>
                <Button size="small" onClick={() => setSelectedRowKeys([])}>
                  Clear Selection
                </Button>
              </Space>
            }
          />
        )}

        {/* Unassigned Alert */}
        {unassignedCount > 0 && (
          <Alert
            type="warning"
            style={{ marginBottom: 16 }}
            message={`${unassignedCount} assignments need team assignment`}
            action={
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  const unassignedIds = allAssignments
                    .filter((a) => a.status === 'unassigned')
                    .map((a) => a.id);
                  setSelectedRowKeys(unassignedIds);
                }}
              >
                Select All Unassigned
              </Button>
            }
          />
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={allAssignments}
            loading={isLoading}
            rowSelection={rowSelection}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1200 }}
            size="small"
            bordered
            locale={{ emptyText: t('common.noData', 'No inspection assignments. Click "Generate List" to create one.') }}
          />
        )}

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div>
            {calendarLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin size="large" />
              </div>
            ) : (
              <Row gutter={[8, 8]}>
                {calendarData?.days?.map((day: any) => (
                  <Col key={day.date} xs={24} sm={12} md={8} lg={6} xl={3}>
                    <Card
                      size="small"
                      title={
                        <div>
                          <div style={{ fontWeight: 600 }}>{day.day_name}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{dayjs(day.date).format('MMM D')}</div>
                        </div>
                      }
                      extra={<Badge count={day.stats?.total || 0} showZero style={{ backgroundColor: '#1890ff' }} />}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <Tag color="gold">Day: {day.day?.length || 0}</Tag>
                        <Tag color="geekblue">Night: {day.night?.length || 0}</Tag>
                      </div>
                      <Progress
                        percent={day.stats?.total > 0 ? Math.round((day.stats?.completed || 0) / day.stats.total * 100) : 0}
                        size="small"
                        status={day.stats?.unassigned > 0 ? 'exception' : 'success'}
                      />
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        {day.stats?.unassigned > 0 && (
                          <Text type="warning">{day.stats.unassigned} unassigned</Text>
                        )}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            )}
          </div>
        )}
      </Card>
      )}

      {/* Generate List Modal */}
      <Modal
        title={t('assignments.generate', 'Generate Inspection List')}
        open={generateOpen}
        onCancel={() => { setGenerateOpen(false); generateForm.resetFields(); }}
        onOk={() => generateForm.submit()}
        confirmLoading={generateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={generateForm}
          layout="vertical"
          onFinish={(values: any) =>
            generateMutation.mutate({
              target_date: values.target_date.format('YYYY-MM-DD'),
              shift: values.shift,
            })
          }
        >
          <Form.Item
            name="target_date"
            label={t('assignments.targetDate', 'Target Date')}
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="shift"
            label={t('assignments.shift', 'Shift')}
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="day">{t('common.day', 'Day')}</Select.Option>
              <Select.Option value="night">{t('common.night', 'Night')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Team Modal */}
      <Modal
        title={t('assignments.assignTeam', 'Assign Inspection Team')}
        open={assignOpen}
        onCancel={() => { setAssignOpen(false); setSelectedAssignment(null); assignForm.resetFields(); }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        destroyOnClose
        width={600}
      >
        {selectedAssignment && (
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Equipment" span={2}>
              {selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}`}
            </Descriptions.Item>
            <Descriptions.Item label="Type">
              {selectedAssignment.equipment?.equipment_type || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Berth">
              {selectedAssignment.berth || selectedAssignment.equipment?.berth || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Shift">
              <Tag color={selectedAssignment.list_shift === 'day' ? 'gold' : 'geekblue'}>
                {selectedAssignment.list_shift?.toUpperCase() || '-'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {selectedAssignment.list_target_date ? dayjs(selectedAssignment.list_target_date).format('DD/MM/YYYY') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(v: AssignTeamPayload) =>
            selectedAssignment && assignMutation.mutate({ id: selectedAssignment.id, payload: v })
          }
        >
          <Form.Item
            name="mechanical_inspector_id"
            label={t('assignments.mechInspector', 'Mechanical Inspector')}
            rules={[{ required: true, message: 'Please select a mechanical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select mechanical inspector')}
            >
              {mechOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
          <Form.Item
            name="electrical_inspector_id"
            label={t('assignments.elecInspector', 'Electrical Inspector')}
            rules={[{ required: true, message: 'Please select an electrical inspector' }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('assignments.selectInspector', 'Select electrical inspector')}
            >
              {elecOptions.map(renderInspectorOption)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* AI Suggestion Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined />
            AI Smart Assignment
          </Space>
        }
        open={aiSuggestionOpen}
        onCancel={() => { setAiSuggestionOpen(false); setSelectedAssignment(null); }}
        footer={[
          <Button key="cancel" onClick={() => setAiSuggestionOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="apply"
            type="primary"
            icon={<ThunderboltOutlined />}
            disabled={!aiSuggestion?.recommended?.mechanical || !aiSuggestion?.recommended?.electrical}
            onClick={() => {
              if (selectedAssignment && aiSuggestion?.recommended) {
                assignMutation.mutate({
                  id: selectedAssignment.id,
                  payload: {
                    mechanical_inspector_id: aiSuggestion.recommended.mechanical!.id,
                    electrical_inspector_id: aiSuggestion.recommended.electrical!.id,
                  },
                });
              }
            }}
          >
            Apply Recommendation
          </Button>,
        ]}
        destroyOnClose
      >
        {aiSuggestionLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Analyzing workload and availability...</div>
          </div>
        ) : aiSuggestion ? (
          <div>
            <Alert
              type="info"
              message={`Assignment: ${aiSuggestion.assignment?.equipment || 'Unknown'}`}
              description={`${aiSuggestion.context?.date} - ${aiSuggestion.context?.shift} shift`}
              style={{ marginBottom: 16 }}
            />

            <Title level={5}>Recommended Team</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Text type="secondary">Mechanical</Text>
                {renderSuggestionCard(aiSuggestion.recommended?.mechanical || null, 'mechanical')}
              </Col>
              <Col span={12}>
                <Text type="secondary">Electrical</Text>
                {renderSuggestionCard(aiSuggestion.recommended?.electrical || null, 'electrical')}
              </Col>
            </Row>

            <Divider />

            <Title level={5}>Other Options</Title>
            <Tabs
              items={[
                {
                  key: 'mechanical',
                  label: 'Mechanical',
                  children: (
                    <List
                      size="small"
                      dataSource={aiSuggestion.suggestions?.mechanical?.slice(1, 5) || []}
                      renderItem={(item: InspectorSuggestion) => (
                        <List.Item>
                          <Space>
                            <Tag color={item.match_score >= 70 ? 'green' : 'orange'}>{item.match_score}%</Tag>
                            <Text>{item.name}</Text>
                            <Text type="secondary">({item.active_assignments} active)</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ),
                },
                {
                  key: 'electrical',
                  label: 'Electrical',
                  children: (
                    <List
                      size="small"
                      dataSource={aiSuggestion.suggestions?.electrical?.slice(1, 5) || []}
                      renderItem={(item: InspectorSuggestion) => (
                        <List.Item>
                          <Space>
                            <Tag color={item.match_score >= 70 ? 'green' : 'orange'}>{item.match_score}%</Tag>
                            <Text>{item.name}</Text>
                            <Text type="secondary">({item.active_assignments} active)</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
            />
          </div>
        ) : (
          <Alert type="error" message="Failed to get AI suggestions" />
        )}
      </Modal>

      {/* Workload Drawer */}
      <Drawer
        title="Inspector Workload"
        open={workloadDrawerOpen}
        onClose={() => setWorkloadDrawerOpen(false)}
        width={400}
      >
        {statsLoading ? (
          <Spin />
        ) : (
          <List
            dataSource={stats?.inspector_workload || []}
            renderItem={(item: any) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<UserOutlined style={{ fontSize: 24 }} />}
                  title={item.name}
                  description={`${item.active_assignments} active assignments`}
                />
                <Progress
                  type="circle"
                  percent={Math.min(100, item.active_assignments * 20)}
                  size={40}
                  status={item.active_assignments > 4 ? 'exception' : 'normal'}
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
}
