import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Tag,
  Space,
  Statistic,
  Table,
  Tabs,
  Empty,
  Alert,
  Button,
  Modal,
  Form,
  DatePicker,
  Select,
  Radio,
  Input,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ScheduleOutlined,
  EyeOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { monitorFollowupsApi } from '@inspection/shared';
import type {
  MonitorFollowup,
  FollowupStatus,
  FollowupType,
  FollowupLocation,
  FollowupDashboardStats,
  ScheduleFollowupPayload,
  AvailableInspector,
  AvailableInspectorsResponse,
} from '@inspection/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<FollowupStatus, string> = {
  pending_schedule: '#fa8c16',
  scheduled: '#1890ff',
  overdue: '#ff4d4f',
  in_progress: '#722ed1',
  completed: '#52c41a',
  assignment_created: '#1890ff',
  cancelled: '#8c8c8c',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString();
}

function getStatusTag(status: FollowupStatus, label: string) {
  return <Tag color={STATUS_COLORS[status]}>{label}</Tag>;
}

function getFollowupTypeLabel(type: FollowupType, t: (key: string, fallback: string) => string): string {
  switch (type) {
    case 'routine_check':
      return t('monitor_followup.routine_check', 'Routine Check');
    case 'detailed_inspection':
      return t('monitor_followup.detailed_inspection', 'Detailed Inspection');
    case 'operational_test':
      return t('monitor_followup.operational_test', 'Operational Test');
    default:
      return type;
  }
}

function getStatusLabel(status: FollowupStatus, t: (key: string, fallback: string) => string): string {
  const labels: Record<FollowupStatus, string> = {
    pending_schedule: t('monitor_followup.pending', 'Pending Schedule'),
    scheduled: t('monitor_followup.scheduled', 'Scheduled'),
    overdue: t('monitor_followup.overdue', 'Overdue'),
    in_progress: t('monitor_followup.in_progress', 'In Progress'),
    completed: t('monitor_followup.completed', 'Completed'),
    assignment_created: t('monitor_followup.assignment_created', 'Assignment Created'),
    cancelled: t('monitor_followup.cancelled', 'Cancelled'),
  };
  return labels[status] || status;
}

function extractData<T>(response: { data: unknown }): T {
  const d = response.data;
  if (Array.isArray(d)) return d as T;
  return ((d as Record<string, unknown>)?.data ?? []) as T;
}

function extractSingle<T>(response: { data: unknown }): T {
  const d = response.data;
  return ((d as Record<string, unknown>)?.data ?? d) as T;
}

// ---------------------------------------------------------------------------
// Schedule Modal
// ---------------------------------------------------------------------------

interface ScheduleModalProps {
  open: boolean;
  followup: MonitorFollowup | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ScheduleModal({ open, followup, onClose, onSuccess }: ScheduleModalProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<string | undefined>(undefined);
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);

  // Fetch available inspectors when date changes
  const {
    data: inspectorsData,
    isLoading: loadingInspectors,
  } = useQuery({
    queryKey: ['available-inspectors', selectedDate, selectedShift, selectedLocation],
    queryFn: () =>
      monitorFollowupsApi
        .getAvailableInspectors({
          date: selectedDate!,
          shift: selectedShift,
          location: selectedLocation,
        })
        .then((r) => extractSingle<AvailableInspectorsResponse>(r)),
    enabled: !!selectedDate,
  });

  // Auto-fill first available inspectors when data changes
  useEffect(() => {
    if (inspectorsData) {
      const firstMech = inspectorsData.mechanical?.[0];
      const firstElec = inspectorsData.electrical?.[0];
      form.setFieldsValue({
        mechanical_inspector_id: firstMech?.id ?? undefined,
        electrical_inspector_id: firstElec?.id ?? undefined,
      });
    }
  }, [inspectorsData, form]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      setSelectedDate(null);
      setSelectedShift(undefined);
      setSelectedLocation(undefined);
    }
  }, [open, form]);

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: (payload: ScheduleFollowupPayload) =>
      monitorFollowupsApi.schedule(followup!.id, payload),
    onSuccess: () => {
      message.success(t('monitor_followup.schedule_success', 'Follow-up scheduled successfully'));
      queryClient.invalidateQueries({ queryKey: ['monitor-followups'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-followups-dashboard'] });
      onSuccess();
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred. Please try again.'));
    },
  });

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: ScheduleFollowupPayload = {
        followup_date: values.followup_date.format('YYYY-MM-DD'),
        followup_type: values.followup_type,
        location: values.location,
        shift: values.shift || undefined,
        mechanical_inspector_id: values.mechanical_inspector_id || undefined,
        electrical_inspector_id: values.electrical_inspector_id || undefined,
        notes: values.notes || undefined,
      };
      scheduleMutation.mutate(payload);
    } catch {
      // validation failed
    }
  };

  const handleDateChange = (date: dayjs.Dayjs | null) => {
    const dateStr = date ? date.format('YYYY-MM-DD') : null;
    setSelectedDate(dateStr);
  };

  const handleShiftChange = (val: string) => {
    setSelectedShift(val || undefined);
  };

  const handleLocationChange = (val: string) => {
    setSelectedLocation(val || undefined);
  };

  const mechanicalOptions: AvailableInspector[] = inspectorsData?.mechanical ?? [];
  const electricalOptions: AvailableInspector[] = inspectorsData?.electrical ?? [];

  return (
    <Modal
      title={t('monitor_followup.schedule_followup', 'Schedule Follow-Up')}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={scheduleMutation.isPending}
      destroyOnClose
      width={560}
    >
      {followup && (
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            {followup.equipment_name || `Equipment #${followup.equipment_id}`}
          </Text>
        </div>
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="followup_date"
          label={t('monitor_followup.followup_date', 'Follow-Up Date')}
          rules={[{ required: true, message: t('common.required', 'This field is required') }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            onChange={handleDateChange}
            disabledDate={(current) => current && current < dayjs().startOf('day')}
          />
        </Form.Item>

        <Form.Item
          name="followup_type"
          label={t('monitor_followup.followup_type', 'Follow-Up Type')}
          rules={[{ required: true, message: t('common.required', 'This field is required') }]}
        >
          <Select placeholder={t('monitor_followup.followup_type', 'Follow-Up Type')}>
            <Select.Option value="routine_check">
              {t('monitor_followup.routine_check', 'Routine Check')}
            </Select.Option>
            <Select.Option value="detailed_inspection">
              {t('monitor_followup.detailed_inspection', 'Detailed Inspection')}
            </Select.Option>
            <Select.Option value="operational_test">
              {t('monitor_followup.operational_test', 'Operational Test')}
            </Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="location"
          label={t('monitor_followup.location', 'Location')}
          rules={[{ required: true, message: t('common.required', 'This field is required') }]}
        >
          <Radio.Group onChange={(e) => handleLocationChange(e.target.value)}>
            <Radio.Button value="east">{t('monitor_followup.east', 'East')}</Radio.Button>
            <Radio.Button value="west">{t('monitor_followup.west', 'West')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="shift"
          label={t('monitor_followup.shift', 'Shift')}
        >
          <Radio.Group onChange={(e) => handleShiftChange(e.target.value)}>
            <Radio.Button value="day">{t('monitor_followup.day', 'Day')}</Radio.Button>
            <Radio.Button value="night">{t('monitor_followup.night', 'Night')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="mechanical_inspector_id"
          label={t('monitor_followup.mechanical_inspector', 'Mechanical Inspector')}
        >
          <Select
            placeholder={
              selectedDate
                ? t('monitor_followup.mechanical_inspector', 'Mechanical Inspector')
                : t('monitor_followup.select_date_first', 'Select a date to see available inspectors')
            }
            loading={loadingInspectors}
            disabled={!selectedDate}
            allowClear
            notFoundContent={
              loadingInspectors ? (
                <Spin size="small" />
              ) : (
                t('monitor_followup.no_inspectors', 'No inspectors available for this date')
              )
            }
          >
            {mechanicalOptions.map((insp) => (
              <Select.Option key={insp.id} value={insp.id}>
                {insp.name} {insp.employee_id ? `(${insp.employee_id})` : ''} - Workload: {insp.workload}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="electrical_inspector_id"
          label={t('monitor_followup.electrical_inspector', 'Electrical Inspector')}
        >
          <Select
            placeholder={
              selectedDate
                ? t('monitor_followup.electrical_inspector', 'Electrical Inspector')
                : t('monitor_followup.select_date_first', 'Select a date to see available inspectors')
            }
            loading={loadingInspectors}
            disabled={!selectedDate}
            allowClear
            notFoundContent={
              loadingInspectors ? (
                <Spin size="small" />
              ) : (
                t('monitor_followup.no_inspectors', 'No inspectors available for this date')
              )
            }
          >
            {electricalOptions.map((insp) => (
              <Select.Option key={insp.id} value={insp.id}>
                {insp.name} {insp.employee_id ? `(${insp.employee_id})` : ''} - Workload: {insp.workload}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="notes"
          label={t('monitor_followup.notes', 'Notes')}
        >
          <TextArea rows={3} placeholder={t('monitor_followup.notes', 'Notes')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MonitorFollowupsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string>('pending_schedule');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedFollowup, setSelectedFollowup] = useState<MonitorFollowup | null>(null);

  // Fetch dashboard stats
  const {
    data: dashboardStats,
    isLoading: loadingDashboard,
  } = useQuery({
    queryKey: ['monitor-followups-dashboard'],
    queryFn: () =>
      monitorFollowupsApi.getDashboard().then((r) => extractSingle<FollowupDashboardStats>(r)),
  });

  // Fetch all follow-ups
  const {
    data: allFollowups,
    isLoading: loadingList,
    isError: errorList,
  } = useQuery({
    queryKey: ['monitor-followups'],
    queryFn: () =>
      monitorFollowupsApi.list().then((r) => extractData<MonitorFollowup[]>(r)),
  });

  const isLoading = loadingDashboard || loadingList;
  const followups: MonitorFollowup[] = allFollowups || [];

  // Group follow-ups by status
  const grouped = useMemo(() => {
    const groups: Record<string, MonitorFollowup[]> = {
      pending_schedule: [],
      scheduled: [],
      overdue: [],
      in_progress: [],
      completed: [],
    };
    for (const fu of followups) {
      if (fu.status === 'overdue' || fu.is_overdue) {
        groups.overdue.push(fu);
      } else if (fu.status === 'pending_schedule') {
        groups.pending_schedule.push(fu);
      } else if (fu.status === 'scheduled' || fu.status === 'assignment_created') {
        groups.scheduled.push(fu);
      } else if (fu.status === 'in_progress') {
        groups.in_progress.push(fu);
      } else if (fu.status === 'completed') {
        groups.completed.push(fu);
      }
    }
    return groups;
  }, [followups]);

  // Stats from dashboard API (fallback to counted from grouped)
  const stats = useMemo(
    (): FollowupDashboardStats => ({
      pending_schedule: dashboardStats?.pending_schedule ?? grouped.pending_schedule.length,
      scheduled: dashboardStats?.scheduled ?? grouped.scheduled.length,
      overdue: dashboardStats?.overdue ?? grouped.overdue.length,
      in_progress: dashboardStats?.in_progress ?? grouped.in_progress.length,
      completed_this_month: dashboardStats?.completed_this_month ?? grouped.completed.length,
      total_active: dashboardStats?.total_active ?? followups.length,
    }),
    [dashboardStats, grouped, followups],
  );

  // Open schedule modal
  const handleSchedule = (record: MonitorFollowup) => {
    setSelectedFollowup(record);
    setScheduleModalOpen(true);
  };

  // Close schedule modal
  const handleModalClose = () => {
    setScheduleModalOpen(false);
    setSelectedFollowup(null);
  };

  // Table columns
  const columns: ColumnsType<MonitorFollowup> = [
    {
      title: t('assessment.equipment', 'Equipment'),
      key: 'equipment_name',
      render: (_: unknown, record: MonitorFollowup) => (
        <Text strong>{record.equipment_name || `#${record.equipment_id}`}</Text>
      ),
      sorter: (a, b) =>
        (a.equipment_name || '').localeCompare(b.equipment_name || ''),
    },
    {
      title: t('monitor_followup.followup_date', 'Follow-Up Date'),
      dataIndex: 'followup_date',
      key: 'followup_date',
      render: (v: string) => formatDate(v),
      sorter: (a, b) =>
        new Date(a.followup_date || 0).getTime() - new Date(b.followup_date || 0).getTime(),
      defaultSortOrder: 'ascend',
    },
    {
      title: t('monitor_followup.followup_type', 'Type'),
      dataIndex: 'followup_type',
      key: 'followup_type',
      render: (type: FollowupType) => getFollowupTypeLabel(type, t),
      filters: [
        { text: t('monitor_followup.routine_check', 'Routine Check'), value: 'routine_check' },
        { text: t('monitor_followup.detailed_inspection', 'Detailed Inspection'), value: 'detailed_inspection' },
        { text: t('monitor_followup.operational_test', 'Operational Test'), value: 'operational_test' },
      ],
      onFilter: (value, record) => record.followup_type === value,
    },
    {
      title: t('monitor_followup.location', 'Location'),
      dataIndex: 'location',
      key: 'location',
      render: (loc: FollowupLocation) => {
        if (!loc) return '-';
        const color = loc === 'east' ? 'blue' : 'green';
        const label = loc === 'east'
          ? t('monitor_followup.east', 'East')
          : t('monitor_followup.west', 'West');
        return <Tag color={color}>{label}</Tag>;
      },
      filters: [
        { text: t('monitor_followup.east', 'East'), value: 'east' },
        { text: t('monitor_followup.west', 'West'), value: 'west' },
      ],
      onFilter: (value, record) => record.location === value,
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: FollowupStatus, record: MonitorFollowup) => {
        const displayStatus = record.is_overdue ? 'overdue' as FollowupStatus : status;
        return getStatusTag(displayStatus, getStatusLabel(displayStatus, t));
      },
    },
    {
      title: t('monitor_followup.mechanical_inspector', 'Inspectors'),
      key: 'inspectors',
      render: (_: unknown, record: MonitorFollowup) => (
        <Space direction="vertical" size={2}>
          {record.mechanical_inspector_name && (
            <Text style={{ fontSize: 12 }}>
              <Tag color="blue" style={{ marginInlineEnd: 4, fontSize: 10 }}>MECH</Tag>
              {record.mechanical_inspector_name}
            </Text>
          )}
          {record.electrical_inspector_name && (
            <Text style={{ fontSize: 12 }}>
              <Tag color="orange" style={{ marginInlineEnd: 4, fontSize: 10 }}>ELEC</Tag>
              {record.electrical_inspector_name}
            </Text>
          )}
          {!record.mechanical_inspector_name && !record.electrical_inspector_name && (
            <Text type="secondary">-</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('monitor_followup.scheduled_by', 'Scheduled By'),
      key: 'scheduled_by',
      render: (_: unknown, record: MonitorFollowup) => {
        if (!record.scheduled_by_name) return <Text type="secondary">-</Text>;
        return (
          <Space size={4}>
            <Text>{record.scheduled_by_name}</Text>
            {record.scheduled_by_role && (
              <Tag color={record.scheduled_by_role === 'admin' ? 'red' : 'blue'} style={{ fontSize: 10 }}>
                {record.scheduled_by_role.toUpperCase()}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      render: (_: unknown, record: MonitorFollowup) => {
        if (record.status === 'pending_schedule') {
          return (
            <Button
              type="primary"
              size="small"
              icon={<ScheduleOutlined />}
              onClick={() => handleSchedule(record)}
            >
              {t('monitor_followup.schedule_followup', 'Schedule')}
            </Button>
          );
        }
        return (
          <Button
            size="small"
            icon={<EyeOutlined />}
          >
            {t('common.view', 'View')}
          </Button>
        );
      },
    },
  ];

  // Loading state
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
        <br />
        <Text type="secondary" style={{ marginTop: 12, display: 'block' }}>
          {t('common.loading', 'Loading...')}
        </Text>
      </div>
    );
  }

  // Error state
  if (errorList) {
    return (
      <Alert
        message={t('common.error', 'Error')}
        description={t('common.loadError', 'Failed to load data. Please try again.')}
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
        <CalendarOutlined style={{ marginInlineEnd: 8 }} />
        {t('monitor_followup.title', 'Monitor Follow-Ups')}
      </Title>

      {/* Dashboard Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('monitor_followup.pending', 'Pending Schedule')}
              value={stats.pending_schedule}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('monitor_followup.scheduled', 'Scheduled')}
              value={stats.scheduled}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ScheduleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('monitor_followup.overdue', 'Overdue')}
              value={stats.overdue}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('monitor_followup.completed_month', 'Completed This Month')}
              value={stats.completed_this_month}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs by Status */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="large"
        items={[
          {
            key: 'pending_schedule',
            label: (
              <Space>
                <ClockCircleOutlined style={{ color: '#fa8c16' }} />
                {t('monitor_followup.pending', 'Pending')}
                <Tag color="#fa8c16">{grouped.pending_schedule.length}</Tag>
              </Space>
            ),
            children: (
              <Card>
                <Table<MonitorFollowup>
                  rowKey="id"
                  columns={columns}
                  dataSource={grouped.pending_schedule}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: (
                      <Empty description={t('monitor_followup.no_pending', 'No pending follow-ups')} />
                    ),
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'scheduled',
            label: (
              <Space>
                <ScheduleOutlined style={{ color: '#1890ff' }} />
                {t('monitor_followup.scheduled', 'Scheduled')}
                <Tag color="#1890ff">{grouped.scheduled.length}</Tag>
              </Space>
            ),
            children: (
              <Card>
                <Table<MonitorFollowup>
                  rowKey="id"
                  columns={columns}
                  dataSource={grouped.scheduled}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: (
                      <Empty description={t('monitor_followup.no_scheduled', 'No scheduled follow-ups')} />
                    ),
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'overdue',
            label: (
              <Space>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                {t('monitor_followup.overdue', 'Overdue')}
                <Tag color="#ff4d4f">{grouped.overdue.length}</Tag>
              </Space>
            ),
            children: (
              <Card>
                {grouped.overdue.length > 0 && (
                  <Alert
                    message={t('monitor_followup.overdue_warning', 'This follow-up is overdue')}
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    style={{ marginBottom: 16 }}
                  />
                )}
                <Table<MonitorFollowup>
                  rowKey="id"
                  columns={columns}
                  dataSource={grouped.overdue}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: (
                      <Empty description={t('monitor_followup.no_overdue', 'No overdue follow-ups')} />
                    ),
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'in_progress',
            label: (
              <Space>
                <ClockCircleOutlined style={{ color: '#722ed1' }} />
                {t('monitor_followup.in_progress', 'In Progress')}
                <Tag color="#722ed1">{grouped.in_progress.length}</Tag>
              </Space>
            ),
            children: (
              <Card>
                <Table<MonitorFollowup>
                  rowKey="id"
                  columns={columns}
                  dataSource={grouped.in_progress}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: <Empty description={t('common.noData', 'No data')} />,
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'completed',
            label: (
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                {t('monitor_followup.completed', 'Completed')}
                <Tag color="#52c41a">{grouped.completed.length}</Tag>
              </Space>
            ),
            children: (
              <Card>
                <Table<MonitorFollowup>
                  rowKey="id"
                  columns={columns}
                  dataSource={grouped.completed}
                  pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: <Empty description={t('common.noData', 'No data')} />,
                  }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Schedule Modal */}
      <ScheduleModal
        open={scheduleModalOpen}
        followup={selectedFollowup}
        onClose={handleModalClose}
        onSuccess={handleModalClose}
      />
    </div>
  );
}
