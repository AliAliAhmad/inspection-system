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
  Empty,
  Radio,
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
  WarningOutlined,
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  inspectionAssignmentsApi,
  rosterApi,
  inspectionRoutinesApi,
  equipmentApi,
  type AssignTeamPayload,
  type AssignmentStats,
  type InspectorSuggestion,
} from '@inspection/shared';
import dayjs from 'dayjs';
import {
  SmartBatchView,
  TemplateManager,
  WorkloadBalancer,
  InspectorScoreboardCard,
  TeamPerformanceDashboard,
  FatigueAlerts,
  RouteOptimizer,
} from '../../components/inspection-assignments';
import { scheduleAIApi } from '@inspection/shared';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

// SLA Monitor Component
function SLAMonitorView() {
  const { t } = useTranslation();

  // Fetch SLA warnings
  const { data: slaWarnings, isLoading: slaLoading } = useQuery({
    queryKey: ['schedule-ai', 'sla-warnings', 14],
    queryFn: async () => {
      const response = await scheduleAIApi.getSLAWarnings(14);
      return response;
    },
    staleTime: 60000,
  });

  // Fetch capacity forecast
  const { data: capacityForecast, isLoading: capacityLoading } = useQuery({
    queryKey: ['schedule-ai', 'capacity-forecast', 7],
    queryFn: async () => {
      const response = await scheduleAIApi.getCapacityForecast(7);
      return response;
    },
    staleTime: 60000,
  });

  const warnings = slaWarnings || [];
  const forecast = capacityForecast || [];

  // Chart data for capacity forecast
  const chartData = forecast.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    required: item.required_inspections,
    available: item.available_capacity,
    utilization: item.utilization_rate,
  }));

  return (
    <Row gutter={[16, 16]}>
      {/* SLA Warnings Panel */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <ClockCircleOutlined />
              <span>{t('scheduleAI.slaWarnings', 'SLA Warnings (14 Days)')}</span>
            </Space>
          }
          extra={<Badge count={warnings.filter((w: any) => w.risk_level === 'critical').length} />}
        >
          {slaLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : warnings.length > 0 ? (
            <List
              size="small"
              dataSource={warnings}
              renderItem={(warning: any) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Badge
                        status={
                          warning.risk_level === 'critical'
                            ? 'error'
                            : warning.risk_level === 'high'
                            ? 'warning'
                            : 'processing'
                        }
                      />
                    }
                    title={
                      <Space>
                        <Text strong>{warning.equipment_name}</Text>
                        <Tag
                          color={
                            warning.risk_level === 'critical'
                              ? 'red'
                              : warning.risk_level === 'high'
                              ? 'orange'
                              : 'blue'
                          }
                        >
                          {warning.risk_level}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary">
                          SLA Due: {new Date(warning.sla_due_date).toLocaleDateString()} (
                          {warning.days_until_due} days)
                        </Text>
                        <br />
                        <Text type="secondary">{warning.recommended_action}</Text>
                        {warning.assigned_inspector && (
                          <>
                            <br />
                            <Text type="secondary">
                              Assigned: {warning.assigned_inspector}
                            </Text>
                          </>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Alert
              type="success"
              message={t('scheduleAI.noSLAWarnings', 'All inspections within SLA')}
              showIcon
            />
          )}
        </Card>
      </Col>

      {/* Capacity Forecast Panel */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <BulbOutlined />
              <span>{t('scheduleAI.capacityForecast', 'Capacity Forecast (7 Days)')}</span>
            </Space>
          }
        >
          {capacityLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
            </div>
          ) : forecast.length > 0 ? (
            <>
              <List
                size="small"
                dataSource={forecast}
                style={{ marginBottom: 16 }}
                renderItem={(day: any) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{new Date(day.date).toLocaleDateString()}</Text>
                          {day.is_overloaded && (
                            <Tag color="red" icon={<WarningOutlined />}>
                              OVERLOADED
                            </Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <Text type="secondary">
                            Required: {day.required_inspections} | Available: {day.available_capacity} | Utilization: {day.utilization_rate.toFixed(0)}%
                          </Text>
                          <Progress
                            percent={day.utilization_rate}
                            status={day.is_overloaded ? 'exception' : 'normal'}
                            size="small"
                            style={{ marginTop: 4 }}
                          />
                          {day.recommendations?.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {day.recommendations.map((rec: string, idx: number) => (
                                <Tag key={idx} color="orange" style={{ marginTop: 4 }}>
                                  {rec}
                                </Tag>
                              ))}
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            </>
          ) : (
            <Alert
              type="info"
              message={t('scheduleAI.noCapacityData', 'No capacity forecast data available')}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}

// Equipment Preview Component for Generate Modal
interface ScheduledEquipmentPreviewProps {
  form: any;
  selectedEquipmentIds: number[];
  onSelectChange: (ids: number[]) => void;
}

function ScheduledEquipmentPreview({ form, selectedEquipmentIds, onSelectChange }: ScheduledEquipmentPreviewProps) {
  const { t } = useTranslation();

  // Watch form values
  const targetDate = Form.useWatch('target_date', form);
  const shift = Form.useWatch('shift', form);

  // Calculate day of week from target date
  const dayOfWeek = useMemo(() => {
    if (!targetDate) return null;
    const day = dayjs(targetDate).day(); // 0=Sunday, 1=Monday, ...
    return day === 0 ? 6 : day - 1; // Convert to 0=Monday, 6=Sunday
  }, [targetDate]);

  // Fetch all schedules
  const { data: allSchedulesData, isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['inspection-schedules'],
    queryFn: async () => {
      const response = await inspectionRoutinesApi.getSchedules();
      return (response.data as any).data || [];
    },
    staleTime: 60000,
  });

  // Filter schedules by day_of_week and shift
  const equipment = useMemo(() => {
    if (!allSchedulesData || dayOfWeek === null || !shift) return [];

    const filtered = allSchedulesData.filter((item: any) => {
      const days = item.days || {};
      const dayKey = String(dayOfWeek);
      const dayValue = days[dayKey];

      // Check if this equipment is scheduled for the selected day and shift
      // Support new shift values (morning, afternoon, night) and legacy 'day' value
      // For backward compatibility: 'day' in schedule matches 'morning' or 'afternoon' shift
      if (dayValue === shift) return true;
      if (dayValue === 'both') return true;
      if (dayValue === 'day' && (shift === 'morning' || shift === 'afternoon')) return true;

      return false;
    });

    return filtered.map((item: any) => ({
      id: item.equipment_id,
      name: item.equipment_name,
      equipment_type: item.equipment_type,
      berth: item.berth,
      location: item.location,
      serial_number: item.equipment_name, // Use name as serial for display
    }));
  }, [allSchedulesData, dayOfWeek, shift]);

  // Auto-select all equipment when data loads
  useMemo(() => {
    if (equipment.length > 0 && selectedEquipmentIds.length === 0) {
      onSelectChange(equipment.map((eq: any) => eq.id));
    }
  }, [equipment, selectedEquipmentIds.length, onSelectChange]);

  if (!targetDate || !shift) {
    return (
      <Alert
        type="info"
        message={t('assignments.selectDateShift', 'Please select a date and shift to preview equipment')}
        icon={<CalendarOutlined />}
        style={{ marginTop: 16 }}
      />
    );
  }

  if (isLoadingSchedule) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          {t('assignments.loadingSchedule', 'Loading scheduled equipment...')}
        </div>
      </div>
    );
  }

  if (equipment.length === 0) {
    return (
      <Alert
        type="warning"
        message={t('assignments.noScheduledEquipment', 'No equipment scheduled')}
        description={t(
          'assignments.noScheduledEquipmentDesc',
          'No equipment is scheduled for this date and shift in the imported inspection schedule. Please check the schedule or select a different date/shift.'
        )}
        icon={<ExclamationCircleOutlined />}
        style={{ marginTop: 16 }}
      />
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <AppstoreOutlined />
          <Text strong>Equipment List</Text>
          <Badge count={selectedEquipmentIds.length} style={{ backgroundColor: '#52c41a' }} />
          <Text type="secondary">/ {equipment.length}</Text>
        </Space>
      }
      extra={
        <Space size={4}>
          <Button
            size="small"
            type="text"
            onClick={() => onSelectChange(equipment.map((eq: any) => eq.id))}
            style={{ fontSize: 12 }}
          >
            All
          </Button>
          <Button
            size="small"
            type="text"
            onClick={() => onSelectChange([])}
            style={{ fontSize: 12 }}
          >
            None
          </Button>
        </Space>
      }
      style={{ height: '100%' }}
    >
      {equipment.length > 0 && (
        <Alert
          type="info"
          message={`${equipment.length} equipment scheduled for this date/shift`}
          style={{ marginBottom: 12, fontSize: 12 }}
          showIcon
        />
      )}

      <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
        <Checkbox.Group
          value={selectedEquipmentIds}
          onChange={onSelectChange as any}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            {equipment.map((eq: any) => (
              <div
                key={eq.id}
                style={{
                  padding: '8px 12px',
                  backgroundColor: selectedEquipmentIds.includes(eq.id) ? '#f6ffed' : '#fafafa',
                  borderRadius: 6,
                  border: selectedEquipmentIds.includes(eq.id) ? '1px solid #b7eb8f' : '1px solid #d9d9d9',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => {
                  if (selectedEquipmentIds.includes(eq.id)) {
                    onSelectChange(selectedEquipmentIds.filter(id => id !== eq.id));
                  } else {
                    onSelectChange([...selectedEquipmentIds, eq.id]);
                  }
                }}
              >
                <Checkbox value={eq.id} style={{ width: '100%' }}>
                  <Space size={4} wrap>
                    <Text strong style={{ fontSize: 13 }}>{eq.name}</Text>
                    {eq.equipment_type && (
                      <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{eq.equipment_type}</Tag>
                    )}
                    {eq.berth && (
                      <Tag color="green" style={{ fontSize: 11, margin: 0 }}>{eq.berth}</Tag>
                    )}
                  </Space>
                </Checkbox>
              </div>
            ))}
          </Space>
        </Checkbox.Group>
      </div>
    </Card>
  );
}

// Preview Panel Component for Generate Modal
interface GeneratePreviewPanelProps {
  form: any;
}

function GeneratePreviewPanel({ form }: GeneratePreviewPanelProps) {
  const { t } = useTranslation();

  // Watch form values
  const targetDate = Form.useWatch('target_date', form);
  const shift = Form.useWatch('shift', form);

  // Calculate day of week
  const dayInfo = useMemo(() => {
    if (!targetDate) return null;
    const day = dayjs(targetDate);
    return {
      dayName: day.format('dddd'),
      dayShort: day.format('ddd'),
      date: day.format('DD MMM YYYY'),
      dayOfWeek: day.day() === 0 ? 6 : day.day() - 1, // Convert to 0=Monday
    };
  }, [targetDate]);

  const shiftConfig = useMemo(() => {
    if (shift === 'day') {
      return {
        icon: <SunOutlined style={{ fontSize: 32, color: '#faad14' }} />,
        label: 'Day Shift',
        color: '#faad14',
        time: '06:00 - 18:00',
      };
    } else if (shift === 'night') {
      return {
        icon: <MoonOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
        label: 'Night Shift',
        color: '#722ed1',
        time: '18:00 - 06:00',
      };
    }
    return null;
  }, [shift]);

  return (
    <div>
      <Card size="small" title="📊 Generation Summary" style={{ marginBottom: 16 }}>
        {!targetDate || !shift ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary">Select date and shift to see preview</Text>
            }
            style={{ padding: 20 }}
          />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {/* Date Card */}
            <Card
              size="small"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  Target Date
                </Text>
                <Title level={4} style={{ color: '#fff', margin: 0 }}>
                  {dayInfo?.dayName}
                </Title>
                <Text style={{ color: '#fff', fontSize: 16 }}>
                  {dayInfo?.date}
                </Text>
              </Space>
            </Card>

            {/* Shift Card */}
            <Card
              size="small"
              style={{
                background: `linear-gradient(135deg, ${shiftConfig?.color}22 0%, ${shiftConfig?.color}44 100%)`,
                border: `2px solid ${shiftConfig?.color}`,
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} align="center" size={8}>
                {shiftConfig?.icon}
                <Title level={4} style={{ margin: 0, color: shiftConfig?.color }}>
                  {shiftConfig?.label}
                </Title>
                <Text type="secondary">{shiftConfig?.time}</Text>
              </Space>
            </Card>

            {/* Info Cards */}
            <Row gutter={8}>
              <Col span={12}>
                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Statistic
                    title="Equipment"
                    value={0}
                    prefix={<AppstoreOutlined />}
                    valueStyle={{ fontSize: 20 }}
                  />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" bodyStyle={{ padding: 12 }}>
                  <Statistic
                    title="Inspectors"
                    value="TBD"
                    prefix={<TeamOutlined />}
                    valueStyle={{ fontSize: 20 }}
                  />
                </Card>
              </Col>
            </Row>

            <Alert
              type="info"
              message="Ready to Generate"
              description="Click OK to create inspection assignments for the selected date and shift."
              icon={<CheckCircleOutlined />}
              showIcon
            />
          </Space>
        )}
      </Card>

      <Card size="small" title="ℹ️ Important Notes">
        <List size="small">
          <List.Item>
            <Text type="secondary">
              • Equipment will be assigned from the imported inspection schedule
            </Text>
          </List.Item>
          <List.Item>
            <Text type="secondary">
              • Assignments will be created in 'unassigned' status
            </Text>
          </List.Item>
          <List.Item>
            <Text type="secondary">
              • You can assign inspectors after generation
            </Text>
          </List.Item>
        </List>
      </Card>
    </div>
  );
}

export default function InspectionAssignmentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Modal states
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [aiSuggestionOpen, setAiSuggestionOpen] = useState(false);
  const [workloadDrawerOpen, setWorkloadDrawerOpen] = useState(false);

  // View mode: table or calendar
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // Active tab for Phase 4 features + AI Intelligence
  const [activeTab, setActiveTab] = useState<'assignments' | 'batching' | 'templates' | 'balancer' | 'ai' | 'sla'>('assignments');

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
    mutationFn: (payload: { target_date: string; shift: 'morning' | 'afternoon' | 'night' | 'day' }) =>
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
      setSelectedEquipmentIds([]);
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

  const clearAllMutation = useMutation({
    mutationFn: () => inspectionAssignmentsApi.clearAllAssignments(),
    onSuccess: (res) => {
      const result = (res.data as any).data || res.data;
      queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
      message.success(`Cleared ${result.deleted || 0} assignments`);
    },
    onError: () => message.error('Failed to clear assignments'),
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
      width: 100,
      render: (v: string) => {
        if (!v) return '-';
        const colors: Record<string, string> = {
          morning: 'gold',
          afternoon: 'blue',
          night: 'purple',
          day: 'orange'
        };
        return <Tag color={colors[v] || 'default'}>{v.toUpperCase()}</Tag>;
      },
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
            {
              key: 'ai',
              label: (
                <span>
                  <RobotOutlined />
                  {t('assignments.tab_ai', 'AI Intelligence')}
                </span>
              ),
            },
            {
              key: 'sla',
              label: (
                <span>
                  <ClockCircleOutlined />
                  {t('assignments.tab_sla', 'SLA Monitor')}
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

      {/* AI Intelligence Tab */}
      {activeTab === 'ai' && (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <TeamPerformanceDashboard />
          </Col>
          <Col xs={24} lg={12}>
            <InspectorScoreboardCard />
          </Col>
          <Col xs={24} lg={12}>
            <FatigueAlerts />
          </Col>
          <Col span={24}>
            <RouteOptimizer />
          </Col>
        </Row>
      )}

      {/* SLA Monitor Tab */}
      {activeTab === 'sla' && (
        <SLAMonitorView />
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
            <Button
              danger
              onClick={() => {
                Modal.confirm({
                  title: 'Clear All Assignments?',
                  content: 'This will delete ALL inspection assignments from the database. This cannot be undone!',
                  okText: 'Yes, Clear All',
                  okType: 'danger',
                  onOk: () => clearAllMutation.mutate(),
                });
              }}
              loading={clearAllMutation.isPending}
            >
              🗑️ Clear All
            </Button>
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
              <Select.Option value="morning">Morning</Select.Option>
              <Select.Option value="afternoon">Afternoon</Select.Option>
              <Select.Option value="night">Night</Select.Option>
              <Select.Option value="day">Day (Legacy)</Select.Option>
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

      {/* Generate List Modal - ENHANCED */}
      <Modal
        title={
          <Space>
            <CalendarOutlined style={{ fontSize: 20, color: '#1890ff' }} />
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              {t('assignments.generate', 'Generate Inspection List')}
            </span>
          </Space>
        }
        open={generateOpen}
        onCancel={() => {
          setGenerateOpen(false);
          generateForm.resetFields();
          setSelectedEquipmentIds([]);
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {Form.useWatch('shift', generateForm) && Form.useWatch('target_date', generateForm) && selectedEquipmentIds.length > 0 && (
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                  <Text type="secondary">
                    {selectedEquipmentIds.length} equipment &middot; {Form.useWatch('shift', generateForm)} shift &middot; {Form.useWatch('target_date', generateForm)?.format('DD MMM YYYY')}
                  </Text>
                </Space>
              )}
            </div>
            <Space>
              <Button onClick={() => { setGenerateOpen(false); generateForm.resetFields(); setSelectedEquipmentIds([]); }}>
                Cancel
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<ThunderboltOutlined />}
                loading={generateMutation.isPending}
                onClick={() => generateForm.submit()}
                disabled={!Form.useWatch('shift', generateForm) || !Form.useWatch('target_date', generateForm) || selectedEquipmentIds.length === 0}
                style={{ fontWeight: 600, borderRadius: 8, minWidth: 160 }}
              >
                Generate List
              </Button>
            </Space>
          </div>
        }
        destroyOnClose
        width={960}
        styles={{ body: { padding: '16px 24px' } }}
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
          {/* STEP 1: Date + Shift in one row */}
          <Card
            size="small"
            style={{ marginBottom: 16, borderRadius: 10, background: 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 100%)' }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            <Row gutter={24} align="middle">
              <Col span={8}>
                <Form.Item
                  name="target_date"
                  label={<Text strong>📅 Date</Text>}
                  rules={[{ required: true, message: 'Select date' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker
                    style={{ width: '100%' }}
                    format="DD/MM/YYYY"
                    size="large"
                    placeholder="Pick date"
                  />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item
                  name="shift"
                  label={<Text strong>⏰ Shift</Text>}
                  rules={[{ required: true, message: 'Select shift' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Radio.Group style={{ width: '100%' }}>
                    <Row gutter={8}>
                      <Col span={8}>
                        <Radio.Button value="morning" style={{ width: '100%', height: 60, padding: 0, borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{
                            textAlign: 'center', paddingTop: 8,
                            background: Form.useWatch('shift', generateForm) === 'morning' ? 'linear-gradient(135deg, #fff7e6, #ffe7ba)' : undefined,
                            height: '100%',
                          }}>
                            <SunOutlined style={{ fontSize: 22, color: '#faad14' }} />
                            <div style={{ fontWeight: 600, color: '#d48806', fontSize: 13 }}>Morning</div>
                            <div style={{ fontSize: 10, color: '#999' }}>06:00 - 14:00</div>
                          </div>
                        </Radio.Button>
                      </Col>
                      <Col span={8}>
                        <Radio.Button value="afternoon" style={{ width: '100%', height: 60, padding: 0, borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{
                            textAlign: 'center', paddingTop: 8,
                            background: Form.useWatch('shift', generateForm) === 'afternoon' ? 'linear-gradient(135deg, #e6f7ff, #bae7ff)' : undefined,
                            height: '100%',
                          }}>
                            <CloudOutlined style={{ fontSize: 22, color: '#1890ff' }} />
                            <div style={{ fontWeight: 600, color: '#096dd9', fontSize: 13 }}>Afternoon</div>
                            <div style={{ fontSize: 10, color: '#999' }}>14:00 - 22:00</div>
                          </div>
                        </Radio.Button>
                      </Col>
                      <Col span={8}>
                        <Radio.Button value="night" style={{ width: '100%', height: 60, padding: 0, borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{
                            textAlign: 'center', paddingTop: 8,
                            background: Form.useWatch('shift', generateForm) === 'night' ? 'linear-gradient(135deg, #f9f0ff, #efdbff)' : undefined,
                            height: '100%',
                          }}>
                            <MoonOutlined style={{ fontSize: 22, color: '#722ed1' }} />
                            <div style={{ fontWeight: 600, color: '#531dab', fontSize: 13 }}>Night</div>
                            <div style={{ fontSize: 10, color: '#999' }}>22:00 - 06:00</div>
                          </div>
                        </Radio.Button>
                      </Col>
                    </Row>
                  </Radio.Group>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* STEP 2: Equipment List + Summary Side by Side */}
          <Row gutter={16}>
            <Col span={15}>
              <ScheduledEquipmentPreview
                form={generateForm}
                selectedEquipmentIds={selectedEquipmentIds}
                onSelectChange={setSelectedEquipmentIds}
              />
            </Col>
            <Col span={9}>
              <Card
                size="small"
                style={{ borderRadius: 10, height: '100%' }}
                bodyStyle={{ padding: 16 }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    {selectedEquipmentIds.length > 0 ? (
                      <>
                        <div style={{ fontSize: 48, marginBottom: 4 }}>✅</div>
                        <Title level={2} style={{ margin: 0, color: '#52c41a' }}>
                          {selectedEquipmentIds.length}
                        </Title>
                        <Text type="secondary">Equipment Selected</Text>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 48, marginBottom: 4 }}>📋</div>
                        <Title level={4} style={{ margin: 0, color: '#999' }}>
                          Select Date & Shift
                        </Title>
                        <Text type="secondary">to preview equipment</Text>
                      </>
                    )}
                  </div>

                  <Divider style={{ margin: '4px 0' }} />

                  <div>
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">📅 Date</Text>
                        <Text strong>
                          {Form.useWatch('target_date', generateForm)?.format('DD MMM YYYY') || '—'}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">⏰ Shift</Text>
                        <Text strong style={{ textTransform: 'capitalize' }}>
                          {Form.useWatch('shift', generateForm) || '—'}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">🔧 Equipment</Text>
                        <Text strong>{selectedEquipmentIds.length || '—'}</Text>
                      </div>
                    </Space>
                  </div>

                  {selectedEquipmentIds.length > 0 && (
                    <Alert
                      type="success"
                      message="Ready to Generate"
                      description={`${selectedEquipmentIds.length} inspection assignments will be created`}
                      showIcon
                      style={{ borderRadius: 8 }}
                    />
                  )}
                </Space>
              </Card>
            </Col>
          </Row>
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
