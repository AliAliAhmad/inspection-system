import { useState, useMemo } from 'react';
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
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Tabs,
  Segmented,
  Empty,
  Spin,
  Tooltip,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  CalendarOutlined,
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  inspectionRoutinesApi,
  checklistsApi,
  equipmentApi,
  type InspectionRoutine,
  type CreateRoutinePayload,
  type ChecklistTemplate,
  type RoutineShiftType,
  type RoutineDayOfWeek,
  type RoutineFrequencyType,
} from '@inspection/shared';
import {
  ShiftDaySelector,
  RoutineCalendarPreview,
  ConflictWarning,
  RoutineCard,
} from '../../components/inspection-routines';

const { Title, Text } = Typography;

type ViewMode = 'table' | 'cards';

// Helper to get shift config
const getShiftConfig = (shift: RoutineShiftType | null) => {
  switch (shift) {
    case 'morning':
      return { icon: <SunOutlined />, color: '#faad14', label: 'Morning' };
    case 'afternoon':
      return { icon: <CloudOutlined />, color: '#1890ff', label: 'Afternoon' };
    case 'night':
      return { icon: <MoonOutlined />, color: '#722ed1', label: 'Night' };
    default:
      return { icon: null, color: '#8c8c8c', label: 'Any' };
  }
};

const DAYS_SHORT: Record<RoutineDayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export default function InspectionRoutinesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<InspectionRoutine | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Form state for schedule fields
  const [createShift, setCreateShift] = useState<RoutineShiftType | null>(null);
  const [createDaysOfWeek, setCreateDaysOfWeek] = useState<RoutineDayOfWeek[]>([]);
  const [createFrequency, setCreateFrequency] = useState<RoutineFrequencyType>('weekly');

  const [editShift, setEditShift] = useState<RoutineShiftType | null>(null);
  const [editDaysOfWeek, setEditDaysOfWeek] = useState<RoutineDayOfWeek[]>([]);
  const [editFrequency, setEditFrequency] = useState<RoutineFrequencyType>('weekly');

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Fetch routines
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inspection-routines'],
    queryFn: () => inspectionRoutinesApi.list().then(r => r.data.data),
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['checklists', 'all'],
    queryFn: () => checklistsApi.listTemplates({ per_page: 500 }).then(r => r.data.data),
    enabled: createModalOpen || editModalOpen,
  });

  // Fetch equipment types
  const { data: equipmentTypes } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentApi.getTypes().then(r => r.data.data),
    enabled: createModalOpen || editModalOpen,
  });

  // Form values for conflict detection
  const createFormValues = Form.useWatch([], createForm);
  const editFormValues = Form.useWatch([], editForm);

  const createMutation = useMutation({
    mutationFn: (values: CreateRoutinePayload) => inspectionRoutinesApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
      message.success(t('routines.createSuccess', 'Routine created successfully'));
      setCreateModalOpen(false);
      createForm.resetFields();
      resetCreateFormState();
    },
    onError: () => message.error(t('routines.createError', 'Failed to create routine')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateRoutinePayload & { is_active: boolean }> }) =>
      inspectionRoutinesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
      message.success(t('routines.updateSuccess', 'Routine updated successfully'));
      setEditModalOpen(false);
      setEditingRoutine(null);
      editForm.resetFields();
      resetEditFormState();
    },
    onError: () => message.error(t('routines.updateError', 'Failed to update routine')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inspectionRoutinesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
      message.success(t('routines.deleteSuccess', 'Routine deleted successfully'));
    },
    onError: () => message.error(t('routines.deleteError', 'Failed to delete routine')),
  });

  const resetCreateFormState = () => {
    setCreateShift(null);
    setCreateDaysOfWeek([]);
    setCreateFrequency('weekly');
  };

  const resetEditFormState = () => {
    setEditShift(null);
    setEditDaysOfWeek([]);
    setEditFrequency('weekly');
  };

  const openEditModal = (record: InspectionRoutine) => {
    setEditingRoutine(record);
    editForm.setFieldsValue({
      name: record.name,
      name_ar: record.name_ar,
      asset_types: record.asset_types,
      template_id: record.template_id,
      is_active: record.is_active,
    });
    setEditShift(record.shift || null);
    setEditDaysOfWeek(record.days_of_week || []);
    setEditFrequency(record.frequency || 'weekly');
    setEditModalOpen(true);
  };

  const handleCreateSubmit = (values: CreateRoutinePayload) => {
    createMutation.mutate({
      ...values,
      shift: createShift,
      days_of_week: createDaysOfWeek,
      frequency: createFrequency,
    });
  };

  const handleEditSubmit = (values: Partial<CreateRoutinePayload & { is_active: boolean }>) => {
    if (!editingRoutine) return;
    updateMutation.mutate({
      id: editingRoutine.id,
      payload: {
        ...values,
        shift: editShift,
        days_of_week: editDaysOfWeek,
        frequency: editFrequency,
      },
    });
  };

  const handleDelete = (routine: InspectionRoutine) => {
    Modal.confirm({
      title: t('routines.deleteConfirm', 'Delete this routine?'),
      content: t('routines.deleteConfirmDesc', 'This will deactivate the routine. It can be reactivated later.'),
      okText: t('common.yes', 'Yes'),
      cancelText: t('common.no', 'No'),
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutate(routine.id),
    });
  };

  const routineColumns: ColumnsType<InspectionRoutine> = [
    {
      title: t('routines.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record: InspectionRoutine) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.name_ar && (
            <Text type="secondary" style={{ fontSize: 12, direction: 'rtl' }}>
              {record.name_ar}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('routines.equipmentType', 'Asset Types'),
      dataIndex: 'asset_types',
      key: 'asset_types',
      width: 200,
      render: (types: string[]) => (
        <Space size={4} wrap>
          {types?.slice(0, 2).map((type) => (
            <Tag key={type}>{type}</Tag>
          ))}
          {types?.length > 2 && (
            <Tooltip title={types.slice(2).join(', ')}>
              <Tag>+{types.length - 2}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('routines.schedule', 'Schedule'),
      key: 'schedule',
      width: 180,
      render: (_: unknown, record: InspectionRoutine) => {
        const shiftConfig = getShiftConfig(record.shift);
        const days = record.days_of_week || [];
        return (
          <Space direction="vertical" size={2}>
            <Space size={4}>
              <Tag color={record.frequency === 'daily' ? 'green' : record.frequency === 'weekly' ? 'blue' : 'purple'}>
                {t(`routines.${record.frequency}`, record.frequency || 'weekly')}
              </Tag>
              {record.shift && (
                <Tag color={shiftConfig.color} icon={shiftConfig.icon}>
                  {t(`routines.${record.shift}`, shiftConfig.label)}
                </Tag>
              )}
            </Space>
            {record.frequency === 'weekly' && days.length > 0 && (
              <Space size={2}>
                {days.slice(0, 3).map((day) => (
                  <Tag key={day} style={{ fontSize: 10, padding: '0 4px' }}>
                    {DAYS_SHORT[day as RoutineDayOfWeek]}
                  </Tag>
                ))}
                {days.length > 3 && (
                  <Tag style={{ fontSize: 10, padding: '0 4px' }}>+{days.length - 3}</Tag>
                )}
              </Space>
            )}
          </Space>
        );
      },
    },
    {
      title: t('routines.templateId', 'Template'),
      dataIndex: 'template_id',
      key: 'template_id',
      width: 100,
      render: (id: number) => <Badge count={id} style={{ backgroundColor: '#1890ff' }} />,
    },
    {
      title: t('routines.active', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      filters: [
        { text: t('common.yes', 'Active'), value: true },
        { text: t('common.no', 'Inactive'), value: false },
      ],
      onFilter: (value, record) => record.is_active === value,
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'}>
          {v ? t('routines.active', 'Active') : t('routines.inactive', 'Inactive')}
        </Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_: unknown, record: InspectionRoutine) => (
        <Space>
          <Tooltip title={t('common.edit', 'Edit')}>
            <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Tooltip title={t('common.delete', 'Delete')}>
            <Popconfirm
              title={t('routines.deleteConfirm', 'Delete this routine?')}
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const routines = data || [];
  const templateOptions: ChecklistTemplate[] = templates || [];

  // Form fields component
  const renderFormFields = (isEdit: boolean) => (
    <>
      <Form.Item name="name" label={t('routines.name', 'Name')} rules={[{ required: true }]}>
        <Input placeholder={t('routines.namePlaceholder', 'e.g., Daily Pump Inspection')} />
      </Form.Item>
      <Form.Item name="name_ar" label={t('routines.nameAr', 'Name (Arabic)')}>
        <Input dir="rtl" placeholder={t('routines.nameArPlaceholder', 'Arabic name (optional)')} />
      </Form.Item>
      <Form.Item
        name="asset_types"
        label={t('routines.equipmentType', 'Asset Types')}
        rules={[{ required: true }]}
      >
        <Select
          mode="multiple"
          placeholder={t('routines.selectEquipmentType', 'Select equipment types')}
          showSearch
          optionFilterProp="children"
        >
          {(equipmentTypes || []).map((et: string) => (
            <Select.Option key={et} value={et}>{et}</Select.Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        name="template_id"
        label={t('routines.template', 'Checklist Template')}
        rules={[{ required: true }]}
      >
        <Select
          showSearch
          optionFilterProp="children"
          placeholder={t('routines.selectTemplate', 'Select template')}
        >
          {templateOptions.map((tpl) => (
            <Select.Option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    </>
  );

  // Create modal content
  const createModalContent = (
    <Row gutter={24}>
      <Col xs={24} lg={14}>
        <Form form={createForm} layout="vertical" onFinish={handleCreateSubmit}>
          {renderFormFields(false)}

          <Form.Item label={t('routines.scheduleConfiguration', 'Schedule Configuration')}>
            <ShiftDaySelector
              shift={createShift}
              daysOfWeek={createDaysOfWeek}
              frequency={createFrequency}
              onShiftChange={setCreateShift}
              onDaysChange={setCreateDaysOfWeek}
              onFrequencyChange={setCreateFrequency}
            />
          </Form.Item>
        </Form>

        {/* Conflict Warning */}
        {createFormValues?.asset_types?.length > 0 && (
          <ConflictWarning
            currentRoutine={{
              asset_types: createFormValues.asset_types || [],
              shift: createShift,
              days_of_week: createDaysOfWeek,
              frequency: createFrequency,
            }}
            existingRoutines={routines}
          />
        )}
      </Col>
      <Col xs={24} lg={10}>
        <RoutineCalendarPreview
          frequency={createFrequency}
          shift={createShift}
          daysOfWeek={createDaysOfWeek}
          routineName={createFormValues?.name || t('routines.newRoutine', 'New Routine')}
        />
      </Col>
    </Row>
  );

  // Edit modal content
  const editModalContent = (
    <Row gutter={24}>
      <Col xs={24} lg={14}>
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          {renderFormFields(true)}

          <Form.Item name="is_active" label={t('routines.status', 'Status')}>
            <Select>
              <Select.Option value={true}>
                <Tag color="success">{t('routines.active', 'Active')}</Tag>
              </Select.Option>
              <Select.Option value={false}>
                <Tag color="default">{t('routines.inactive', 'Inactive')}</Tag>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label={t('routines.scheduleConfiguration', 'Schedule Configuration')}>
            <ShiftDaySelector
              shift={editShift}
              daysOfWeek={editDaysOfWeek}
              frequency={editFrequency}
              onShiftChange={setEditShift}
              onDaysChange={setEditDaysOfWeek}
              onFrequencyChange={setEditFrequency}
            />
          </Form.Item>
        </Form>

        {/* Conflict Warning */}
        {editFormValues?.asset_types?.length > 0 && editingRoutine && (
          <ConflictWarning
            currentRoutine={{
              id: editingRoutine.id,
              asset_types: editFormValues.asset_types || [],
              shift: editShift,
              days_of_week: editDaysOfWeek,
              frequency: editFrequency,
            }}
            existingRoutines={routines}
          />
        )}
      </Col>
      <Col xs={24} lg={10}>
        <RoutineCalendarPreview
          frequency={editFrequency}
          shift={editShift}
          daysOfWeek={editDaysOfWeek}
          routineName={editFormValues?.name || editingRoutine?.name || ''}
        />
      </Col>
    </Row>
  );

  // Cards view content
  const cardsView = (
    <Row gutter={[16, 16]}>
      {routines.length === 0 ? (
        <Col span={24}>
          <Empty description={t('routines.noRoutines', 'No inspection routines')} />
        </Col>
      ) : (
        routines.map((routine) => (
          <Col key={routine.id} xs={24} sm={12} lg={8} xl={6}>
            <RoutineCard
              routine={routine}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          </Col>
        ))
      )}
    </Row>
  );

  // Table view content
  const tableView = (
    <Table
      rowKey="id"
      columns={routineColumns}
      dataSource={routines}
      loading={isLoading}
      locale={{
        emptyText: isError
          ? t('common.error', 'Error loading data')
          : t('common.noData', 'No data'),
      }}
      pagination={{ pageSize: 10, showSizeChanger: true }}
      scroll={{ x: 900 }}
    />
  );

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined />
          <Title level={4} style={{ margin: 0 }}>
            {t('nav.inspectionRoutines', 'Inspection Routines')}
          </Title>
          <Badge
            count={routines.filter((r) => r.is_active).length}
            style={{ backgroundColor: '#52c41a' }}
          />
        </Space>
      }
      extra={
        <Space>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { value: 'table', icon: <UnorderedListOutlined /> },
              { value: 'cards', icon: <AppstoreOutlined /> },
            ]}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              resetCreateFormState();
              createForm.resetFields();
              setCreateModalOpen(true);
            }}
          >
            {t('routines.create', 'Create Routine')}
          </Button>
        </Space>
      }
    >
      {viewMode === 'table' ? tableView : cardsView}

      {/* Create Routine Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            {t('routines.create', 'Create Routine')}
          </Space>
        }
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
          resetCreateFormState();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        width={900}
        destroyOnClose
      >
        {createModalContent}
      </Modal>

      {/* Edit Routine Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            {t('routines.edit', 'Edit Routine')}
          </Space>
        }
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingRoutine(null);
          editForm.resetFields();
          resetEditFormState();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        width={900}
        destroyOnClose
      >
        {editModalContent}
      </Modal>
    </Card>
  );
}
