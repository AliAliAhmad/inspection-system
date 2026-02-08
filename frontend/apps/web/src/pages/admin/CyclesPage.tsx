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
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { cyclesApi, type MaintenanceCycle, type CreateCyclePayload } from '@inspection/shared';

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

  const [form] = Form.useForm();

  // Fetch cycles
  const { data: cyclesData, isLoading } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => cyclesApi.list(),
  });

  const cycles = cyclesData?.data?.data?.cycles || [];
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

  const runningHoursColumns: ColumnsType<MaintenanceCycle> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MaintenanceCycle) => (
        <Space>
          {record.is_system && (
            <Tooltip title="System cycle (cannot be deleted)">
              <LockOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Text strong>{name}</Text>
          {record.name_ar && <Text type="secondary">({record.name_ar})</Text>}
        </Space>
      ),
    },
    {
      title: 'Hours',
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
      title: 'Display Label',
      dataIndex: 'display_label',
      key: 'display_label',
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: MaintenanceCycle) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Edit
          </Button>
          {!record.is_system && (
            <Popconfirm
              title="Delete this cycle?"
              description="Templates using this cycle will need to be updated."
              onConfirm={() => deleteMutation.mutate(record.id)}
              okButtonProps={{ loading: deleteMutation.isPending }}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const calendarColumns: ColumnsType<MaintenanceCycle> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: MaintenanceCycle) => (
        <Space>
          {record.is_system && (
            <Tooltip title="System cycle (cannot be deleted)">
              <LockOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
          <Text strong>{name}</Text>
          {record.name_ar && <Text type="secondary">({record.name_ar})</Text>}
        </Space>
      ),
    },
    {
      title: 'Interval',
      key: 'interval',
      width: 150,
      render: (_: any, record: MaintenanceCycle) => (
        <Tag color="green" icon={<CalendarOutlined />}>
          {record.calendar_value} {record.calendar_unit}
        </Tag>
      ),
    },
    {
      title: 'Display Label',
      dataIndex: 'display_label',
      key: 'display_label',
      width: 150,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) => (isActive ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: MaintenanceCycle) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Edit
          </Button>
          {!record.is_system && (
            <Popconfirm
              title="Delete this cycle?"
              description="Templates using this cycle will need to be updated."
              onConfirm={() => deleteMutation.mutate(record.id)}
              okButtonProps={{ loading: deleteMutation.isPending }}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
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
    </div>
  );
}
