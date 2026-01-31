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
  Popconfirm,
  Upload,
  message,
  Typography,
  Alert,
  Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
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
  type EquipmentSchedule,
} from '@inspection/shared';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shiftTag = (value: string | undefined) => {
  if (!value) return <Tag>-</Tag>;
  switch (value) {
    case 'day':
      return <Tag color="blue">D</Tag>;
    case 'night':
      return <Tag color="purple">N</Tag>;
    case 'both':
      return <Tag color="orange">D+N</Tag>;
    default:
      return <Tag>{value}</Tag>;
  }
};

export default function InspectionRoutinesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<InspectionRoutine | null>(null);
  const [uploadResult, setUploadResult] = useState<{ created: number; equipment_processed: number; errors: string[] } | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inspection-routines'],
    queryFn: () => inspectionRoutinesApi.list().then(r => r.data.data),
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['inspection-schedules'],
    queryFn: () => inspectionRoutinesApi.getSchedules().then(r => (r.data as any).data as EquipmentSchedule[]),
  });

  const { data: templates } = useQuery({
    queryKey: ['checklists', 'all'],
    queryFn: () => checklistsApi.listTemplates({ per_page: 500 }).then(r => r.data.data),
    enabled: createModalOpen || editModalOpen,
  });

  const { data: equipmentTypes } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentApi.getTypes().then(r => r.data.data),
    enabled: createModalOpen || editModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateRoutinePayload) => inspectionRoutinesApi.create(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
      message.success(t('routines.createSuccess', 'Routine created successfully'));
      setCreateModalOpen(false);
      createForm.resetFields();
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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => inspectionRoutinesApi.uploadSchedule(file),
    onSuccess: (res) => {
      const result = res.data as any;
      setUploadResult({
        created: result.created ?? 0,
        equipment_processed: result.equipment_processed ?? 0,
        errors: result.errors ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      message.success(
        t('routines.uploadSuccess', '{{count}} schedule entries created', { count: result.created ?? 0 }),
      );
    },
    onError: () => message.error(t('routines.uploadError', 'Failed to upload schedule')),
  });

  const openEditModal = (record: InspectionRoutine) => {
    setEditingRoutine(record);
    editForm.setFieldsValue({
      name: record.name,
      name_ar: record.name_ar,
      asset_types: record.asset_types,
      template_id: record.template_id,
      is_active: record.is_active,
    });
    setEditModalOpen(true);
  };

  const routineColumns: ColumnsType<InspectionRoutine> = [
    {
      title: t('routines.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: t('routines.equipmentType', 'Equipment Type'),
      dataIndex: 'asset_types',
      key: 'asset_types',
      render: (types: string[]) =>
        types?.map((type) => (
          <Tag key={type}>{type}</Tag>
        )) || '-',
    },
    {
      title: t('routines.templateId', 'Template ID'),
      dataIndex: 'template_id',
      key: 'template_id',
    },
    {
      title: t('routines.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>
          {v ? t('common.yes', 'Yes') : t('common.no', 'No')}
        </Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: InspectionRoutine) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('routines.deleteConfirm', 'Delete this routine?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {t('common.delete', 'Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Equipment schedule columns
  const scheduleColumns: ColumnsType<EquipmentSchedule> = [
    {
      title: t('equipment.name', 'Equipment'),
      dataIndex: 'equipment_name',
      key: 'equipment_name',
      fixed: 'left',
      width: 180,
      sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
    },
    {
      title: t('equipment.type', 'Type'),
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      width: 130,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
      filters: [...new Set((schedules || []).map(s => s.equipment_type).filter(Boolean))].map(t => ({ text: t!, value: t! })),
      onFilter: (value, record) => record.equipment_type === value,
    },
    {
      title: t('equipment.berth', 'Berth'),
      dataIndex: 'berth',
      key: 'berth',
      width: 100,
      render: (v: string) => v || '-',
      filters: [...new Set((schedules || []).map(s => s.berth).filter(Boolean))].map(b => ({ text: b!, value: b! })),
      onFilter: (value, record) => record.berth === value,
    },
    ...DAY_NAMES.map((day, idx) => ({
      title: day,
      key: `day_${idx}`,
      width: 70,
      align: 'center' as const,
      render: (_: unknown, record: EquipmentSchedule) => shiftTag(record.days[String(idx)]),
    })),
  ];

  const routines = data || [];
  const templateOptions: ChecklistTemplate[] = templates || [];

  const routineFormFields = (
    <>
      <Form.Item name="name" label={t('routines.name', 'Name')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="name_ar" label={t('routines.nameAr', 'Name (Arabic)')}>
        <Input />
      </Form.Item>
      <Form.Item name="asset_types" label={t('routines.equipmentType', 'Equipment Type')} rules={[{ required: true }]}>
        <Select
          mode="multiple"
          placeholder={t('routines.selectEquipmentType', 'Select equipment type')}
          showSearch
          optionFilterProp="children"
        >
          {(equipmentTypes || []).map((et: string) => (
            <Select.Option key={et} value={et}>{et}</Select.Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item name="template_id" label={t('routines.template', 'Template')} rules={[{ required: true }]}>
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

  return (
    <div>
      <Card
        title={<Typography.Title level={4}>{t('nav.inspectionRoutines', 'Inspection Routines')}</Typography.Title>}
        extra={
          <Space>
            <Upload
              accept=".xlsx,.xls"
              showUploadList={false}
              beforeUpload={(file) => {
                uploadMutation.mutate(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
                {t('routines.importSchedule', 'Import Schedule')}
              </Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              {t('routines.create', 'Create Routine')}
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={routineColumns}
          dataSource={routines}
          loading={isLoading}
          locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Equipment Schedule Table */}
      <Card
        title={<Typography.Title level={4}>{t('routines.equipmentSchedule', 'Equipment Schedule')}</Typography.Title>}
        style={{ marginTop: 16 }}
      >
        <Table
          rowKey="equipment_id"
          columns={scheduleColumns}
          dataSource={schedules || []}
          loading={schedulesLoading}
          locale={{ emptyText: t('routines.noSchedule', 'No schedule imported yet. Use "Import Schedule" to upload an Excel file.') }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900 }}
          size="small"
        />
      </Card>

      {/* Create Routine Modal */}
      <Modal
        title={t('routines.create', 'Create Routine')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(v: CreateRoutinePayload) => createMutation.mutate(v)}
        >
          {routineFormFields}
        </Form>
      </Modal>

      {/* Edit Routine Modal */}
      <Modal
        title={t('routines.edit', 'Edit Routine')}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingRoutine(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(v: Partial<CreateRoutinePayload & { is_active: boolean }>) =>
            editingRoutine && updateMutation.mutate({ id: editingRoutine.id, payload: v })
          }
        >
          {routineFormFields}
          <Form.Item name="is_active" label={t('routines.active', 'Active')}>
            <Select>
              <Select.Option value={true}>{t('common.yes', 'Yes')}</Select.Option>
              <Select.Option value={false}>{t('common.no', 'No')}</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Upload Result Modal */}
      <Modal
        title={t('routines.uploadResult', 'Schedule Upload Result')}
        open={uploadResult !== null}
        onCancel={() => setUploadResult(null)}
        onOk={() => setUploadResult(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {uploadResult && (
          <>
            <p>
              <strong>{uploadResult.created}</strong> {t('routines.entriesCreated', 'schedule entries created')}
              {' '}{t('routines.forEquipment', 'for')}{' '}
              <strong>{uploadResult.equipment_processed}</strong> {t('routines.equipment', 'equipment')}.
            </p>
            {uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('routines.uploadWarnings', '{{count}} warnings', { count: uploadResult.errors.length })}
                description={
                  <ul style={{ maxHeight: 200, overflow: 'auto', paddingLeft: 16, margin: 0 }}>
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
