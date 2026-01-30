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
  message,
  Typography,
  Row,
  Col,
  DatePicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  equipmentApi,
  type Equipment,
  type EquipmentStatus,
  type CreateEquipmentPayload,
} from '@inspection/shared';
import dayjs from 'dayjs';

const STATUSES: EquipmentStatus[] = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused'];

const statusColorMap: Record<EquipmentStatus, string> = {
  active: 'green',
  under_maintenance: 'orange',
  out_of_service: 'red',
  stopped: 'volcano',
  paused: 'gold',
};

export default function EquipmentPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['equipment', page, perPage, search, statusFilter, typeFilter],
    queryFn: () =>
      equipmentApi.list({
        page,
        per_page: perPage,
        search: search || undefined,
        status: statusFilter,
        equipment_type: typeFilter,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateEquipmentPayload) => equipmentApi.create(payload),
    onSuccess: () => {
      message.success(t('equipment.createSuccess', 'Equipment created successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setCreateModalOpen(false);
      createForm.resetFields();
    },
    onError: () => message.error(t('equipment.createError', 'Failed to create equipment')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateEquipmentPayload> }) =>
      equipmentApi.update(id, payload),
    onSuccess: () => {
      message.success(t('equipment.updateSuccess', 'Equipment updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setEditModalOpen(false);
      setEditingEquipment(null);
      editForm.resetFields();
    },
    onError: () => message.error(t('equipment.updateError', 'Failed to update equipment')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => equipmentApi.remove(id),
    onSuccess: () => {
      message.success(t('equipment.deleteSuccess', 'Equipment deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
    onError: () => message.error(t('equipment.deleteError', 'Failed to delete equipment')),
  });

  const openEdit = (record: Equipment) => {
    setEditingEquipment(record);
    editForm.setFieldsValue({
      name: record.name,
      equipment_type: record.equipment_type,
      serial_number: record.serial_number,
      location: record.location,
      location_ar: record.location_ar,
      status: record.status,
      berth: record.berth,
      manufacturer: record.manufacturer,
      model_number: record.model_number,
      installation_date: record.installation_date ? dayjs(record.installation_date) : undefined,
    });
    setEditModalOpen(true);
  };

  const handleCreateFinish = (values: Record<string, unknown>) => {
    const payload: CreateEquipmentPayload = {
      ...values,
      installation_date: values.installation_date
        ? (values.installation_date as dayjs.Dayjs).format('YYYY-MM-DD')
        : undefined,
    } as CreateEquipmentPayload;
    createMutation.mutate(payload);
  };

  const handleEditFinish = (values: Record<string, unknown>) => {
    if (!editingEquipment) return;
    const payload: Partial<CreateEquipmentPayload> = {
      ...values,
      installation_date: values.installation_date
        ? (values.installation_date as dayjs.Dayjs).format('YYYY-MM-DD')
        : undefined,
    };
    updateMutation.mutate({ id: editingEquipment.id, payload });
  };

  const columns: ColumnsType<Equipment> = [
    { title: t('equipment.name', 'Name'), dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: t('equipment.type', 'Type'), dataIndex: 'equipment_type', key: 'equipment_type' },
    { title: t('equipment.serialNumber', 'Serial Number'), dataIndex: 'serial_number', key: 'serial_number' },
    { title: t('equipment.location', 'Location'), dataIndex: 'location', key: 'location' },
    { title: t('equipment.berth', 'Berth'), dataIndex: 'berth', key: 'berth', render: (v: string | null) => v || '-' },
    {
      title: t('equipment.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: EquipmentStatus) => (
        <Tag color={statusColorMap[status]}>{status.replace(/_/g, ' ').toUpperCase()}</Tag>
      ),
    },
    { title: t('equipment.manufacturer', 'Manufacturer'), dataIndex: 'manufacturer', key: 'manufacturer', render: (v: string | null) => v || '-' },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: Equipment) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('equipment.deleteConfirm', 'Are you sure you want to delete this equipment?')}
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

  const items = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const formFields = (
    <>
      <Form.Item name="name" label={t('equipment.name', 'Name')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="equipment_type" label={t('equipment.type', 'Equipment Type')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="serial_number" label={t('equipment.serialNumber', 'Serial Number')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="location" label={t('equipment.location', 'Location')}>
        <Input />
      </Form.Item>
      <Form.Item name="status" label={t('equipment.status', 'Status')}>
        <Select allowClear>
          {STATUSES.map((s) => (
            <Select.Option key={s} value={s}>
              {s.replace(/_/g, ' ').toUpperCase()}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item name="berth" label={t('equipment.berth', 'Berth')}>
        <Input />
      </Form.Item>
      <Form.Item name="manufacturer" label={t('equipment.manufacturer', 'Manufacturer')}>
        <Input />
      </Form.Item>
      <Form.Item name="model_number" label={t('equipment.modelNumber', 'Model Number')}>
        <Input />
      </Form.Item>
      <Form.Item name="installation_date" label={t('equipment.installationDate', 'Installation Date')}>
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </>
  );

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.equipment', 'Equipment Management')}</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          {t('equipment.create', 'Add Equipment')}
        </Button>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Input
            placeholder={t('equipment.searchPlaceholder', 'Search equipment...')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
        <Col xs={12} sm={6}>
          <Select
            placeholder={t('equipment.filterStatus', 'Filter by status')}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            allowClear
            style={{ width: '100%' }}
          >
            {STATUSES.map((s) => (
              <Select.Option key={s} value={s}>
                {s.replace(/_/g, ' ').toUpperCase()}
              </Select.Option>
            ))}
          </Select>
        </Col>
        <Col xs={12} sm={6}>
          <Input
            placeholder={t('equipment.filterType', 'Filter by type')}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value || undefined); setPage(1); }}
            allowClear
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
          onChange: (p, ps) => { setPage(p); setPerPage(ps); },
        }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title={t('equipment.create', 'Add Equipment')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateFinish}>
          {formFields}
        </Form>
      </Modal>

      <Modal
        title={t('equipment.edit', 'Edit Equipment')}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingEquipment(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditFinish}>
          {formFields}
        </Form>
      </Modal>
    </Card>
  );
}
