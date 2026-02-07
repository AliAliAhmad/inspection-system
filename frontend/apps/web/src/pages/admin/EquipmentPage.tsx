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
  Upload,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UploadOutlined,
  DownloadOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  equipmentApi,
  type Equipment,
  type EquipmentStatus,
  type CreateEquipmentPayload,
  type ImportResult,
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

  // Import states
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importHistoryModalOpen, setImportHistoryModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);

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

  // Import mutations
  const importMutation = useMutation({
    mutationFn: (file: File) => equipmentApi.import(file),
    onSuccess: (response) => {
      const result = response.data.data as ImportResult;
      if (result) {
        setImportResult(result);
        message.success(
          t('equipment.importSuccess', 'Import completed: {{created}} created, {{updated}} updated, {{failed}} failed', {
            created: result.created.length,
            updated: result.updated.length,
            failed: result.failed.length,
          })
        );
      }
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setFileList([]);
      setImportFile(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Import failed';
      message.error(msg);
    },
  });

  const { data: importHistoryData, isLoading: importHistoryLoading } = useQuery({
    queryKey: ['equipment-import-history'],
    queryFn: () => equipmentApi.getImportHistory(),
    enabled: importHistoryModalOpen,
  });

  const handleDownloadTemplate = async () => {
    try {
      const response = await equipmentApi.downloadTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'equipment_import_template.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      message.error(t('equipment.downloadError', 'Failed to download template'));
    }
  };

  const handleImportUpload = () => {
    console.log('handleImportUpload called, importFile:', importFile);
    if (!importFile) {
      message.warning(t('equipment.selectFile', 'Please select a file to import'));
      return;
    }
    importMutation.mutate(importFile);
  };

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
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            {t('equipment.downloadTemplate', 'Download Template')}
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
            {t('equipment.import', 'Import')}
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setImportHistoryModalOpen(true)}>
            {t('equipment.importHistory', 'Import History')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('equipment.create', 'Add Equipment')}
          </Button>
        </Space>
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

      {/* Import Modal */}
      <Modal
        title={t('equipment.importEquipment', 'Import Equipment')}
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportResult(null);
          setFileList([]);
          setImportFile(null);
        }}
        onOk={handleImportUpload}
        confirmLoading={importMutation.isPending}
        okText={t('common.import', 'Import')}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            message={t('equipment.importInstructions', 'Import Instructions')}
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>{t('equipment.importInstruction1', 'Download the template and fill in the data')}</li>
                <li>{t('equipment.importInstruction2', 'All columns are required')}</li>
                <li>{t('equipment.importInstruction3', 'Berth and home_berth must be "east" or "west"')}</li>
                <li>{t('equipment.importInstruction4', 'equipment_type is auto-generated from name')}</li>
                <li>{t('equipment.importInstruction5', 'Immutable fields cannot be updated: name, serial_number, manufacturer, model_number, installation_date')}</li>
              </ul>
            }
            type="info"
            showIcon
          />

          <Upload.Dragger
            fileList={fileList}
            beforeUpload={(file) => {
              console.log('beforeUpload called with file:', file);
              setImportFile(file);
              setFileList([file as unknown as UploadFile]);
              return false;
            }}
            onRemove={() => {
              setImportFile(null);
              setFileList([]);
            }}
            accept=".xlsx,.xls"
            maxCount={1}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">{t('equipment.dragFile', 'Click or drag Excel file here')}</p>
            <p className="ant-upload-hint">{t('equipment.fileHint', 'Only .xlsx or .xls files are supported')}</p>
          </Upload.Dragger>

          {importResult && (
            <Alert
              message={t('equipment.importResults', 'Import Results')}
              description={
                <Space direction="vertical">
                  <Typography.Text type="success">
                    {t('equipment.created', 'Created')}: {importResult.created.length}
                  </Typography.Text>
                  <Typography.Text type="warning">
                    {t('equipment.updated', 'Updated')}: {importResult.updated.length}
                  </Typography.Text>
                  <Typography.Text type="danger">
                    {t('equipment.failed', 'Failed')}: {importResult.failed.length}
                  </Typography.Text>
                  {importResult.failed.length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                      {importResult.failed.map((f, i) => (
                        <Typography.Text key={i} type="danger" style={{ display: 'block' }}>
                          Row {f.row}: {f.errors.join(', ')}
                        </Typography.Text>
                      ))}
                    </div>
                  )}
                </Space>
              }
              type={importResult.failed.length > 0 ? 'warning' : 'success'}
              showIcon
            />
          )}
        </Space>
      </Modal>

      {/* Import History Modal */}
      <Modal
        title={t('equipment.importHistory', 'Import History')}
        open={importHistoryModalOpen}
        onCancel={() => setImportHistoryModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          rowKey="id"
          loading={importHistoryLoading}
          dataSource={importHistoryData?.data?.data || []}
          columns={[
            {
              title: t('equipment.date', 'Date'),
              dataIndex: 'created_at',
              render: (v: string) => new Date(v).toLocaleString(),
            },
            { title: t('equipment.fileName', 'File Name'), dataIndex: 'file_name' },
            { title: t('equipment.admin', 'Admin'), dataIndex: 'admin_name' },
            { title: t('equipment.totalRows', 'Total'), dataIndex: 'total_rows' },
            {
              title: t('equipment.created', 'Created'),
              dataIndex: 'created_count',
              render: (v: number) => <Tag color="green">{v}</Tag>,
            },
            {
              title: t('equipment.updated', 'Updated'),
              dataIndex: 'updated_count',
              render: (v: number) => <Tag color="orange">{v}</Tag>,
            },
            {
              title: t('equipment.failed', 'Failed'),
              dataIndex: 'failed_count',
              render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : <Tag>{v}</Tag>),
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </Card>
  );
}
