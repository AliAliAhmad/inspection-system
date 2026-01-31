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
} from '@inspection/shared';

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

  const columns: ColumnsType<InspectionRoutine> = [
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
        columns={columns}
        dataSource={routines}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        scroll={{ x: 1000 }}
      />

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
    </Card>
  );
}
