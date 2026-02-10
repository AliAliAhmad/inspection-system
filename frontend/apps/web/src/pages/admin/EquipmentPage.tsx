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
  Drawer,
  Divider,
  Spin,
  List,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UploadOutlined,
  DownloadOutlined,
  HistoryOutlined,
  RobotOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  BulbOutlined,
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
import {
  FleetHealthCards,
  HealthScoreBadge,
  RiskIndicator,
  scoreToRiskLevel,
} from '../../components/shared';

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

  // AI Insights states
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Fetch health summary for fleet cards
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['equipment-health-summary'],
    queryFn: () => equipmentApi.getHealthSummary(),
  });

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

  // AI Insights queries - only fetch when drawer is open
  const { data: aiSummary, isLoading: aiSummaryLoading } = useQuery({
    queryKey: ['equipment-ai-summary', selectedEquipmentId],
    queryFn: () => equipmentApi.getAISummary(selectedEquipmentId!),
    enabled: !!selectedEquipmentId && aiDrawerOpen,
  });

  const { data: aiRecommendations, isLoading: aiRecsLoading } = useQuery({
    queryKey: ['equipment-ai-recommendations', selectedEquipmentId],
    queryFn: () => equipmentApi.getAIRecommendations(selectedEquipmentId!),
    enabled: !!selectedEquipmentId && aiDrawerOpen,
  });

  const openAIInsights = (record: Equipment) => {
    setSelectedEquipmentId(record.id);
    setAiDrawerOpen(true);
  };

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
    {
      title: t('equipmentAI.healthScore', 'Health'),
      key: 'health',
      width: 100,
      render: (_: unknown, record: Equipment) => {
        // Calculate health from status (simplified - real would use AI endpoint)
        const healthScore = record.status === 'active' ? 85 :
          record.status === 'under_maintenance' ? 60 :
          record.status === 'paused' ? 50 :
          record.status === 'stopped' ? 30 : 20;
        return <HealthScoreBadge score={healthScore} size="small" showTrend={false} />;
      },
    },
    {
      title: t('equipmentAI.riskLevel', 'Risk'),
      key: 'risk',
      width: 100,
      render: (_: unknown, record: Equipment) => {
        // Calculate risk from status (simplified)
        const riskScore = record.status === 'active' ? 15 :
          record.status === 'under_maintenance' ? 40 :
          record.status === 'paused' ? 50 :
          record.status === 'stopped' ? 70 : 85;
        return <RiskIndicator level={scoreToRiskLevel(riskScore)} size="small" />;
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: Equipment) => (
        <Space size={4}>
          <Tooltip title={t('equipmentAI.viewInsights', 'View AI Insights')}>
            <Button
              type="text"
              size="small"
              icon={<RobotOutlined style={{ color: '#1890ff' }} />}
              onClick={() => openAIInsights(record)}
            />
          </Tooltip>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('equipment.deleteConfirm', 'Are you sure you want to delete this equipment?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
        <Select allowClear placeholder={t('equipment.selectBerth', 'Select berth')}>
          <Select.Option value="east">{t('equipment.east', 'East')}</Select.Option>
          <Select.Option value="west">{t('equipment.west', 'West')}</Select.Option>
          <Select.Option value="both">{t('equipment.both', 'Both')}</Select.Option>
        </Select>
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

  const healthSummaryRaw = healthData?.data?.data;
  // Transform to FleetHealthData format
  const healthSummary = healthSummaryRaw ? {
    total_equipment: healthSummaryRaw.summary?.total_equipment ?? 0,
    average_health_score: healthSummaryRaw.summary?.average_health_score ?? 0,
    expiring_certifications: healthSummaryRaw.summary?.expiring_certifications ?? 0,
    status_distribution: healthSummaryRaw.status_distribution ?? { active: 0, under_maintenance: 0, out_of_service: 0, stopped: 0, paused: 0 },
    risk_distribution: healthSummaryRaw.risk_distribution ?? { low: 0, medium: 0, high: 0, critical: 0 },
  } : undefined;

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
      {/* Fleet Health Summary Cards */}
      <div style={{ marginBottom: 24 }}>
        <FleetHealthCards
          data={healthSummary}
          loading={healthLoading}
          onCardClick={(type) => {
            // Filter table based on card clicked
            if (type === 'active') setStatusFilter('active');
            else if (type === 'maintenance') setStatusFilter('under_maintenance');
            else if (type === 'critical') setStatusFilter('stopped');
            else setStatusFilter(undefined);
            setPage(1);
          }}
        />
      </div>

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
                <li>{t('equipment.importInstruction3', 'Berth and home_berth must be "east", "west", or "both"')}</li>
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

      {/* AI Insights Drawer */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#1890ff' }} />
            {t('equipmentAI.aiInsights', 'AI Insights')}
          </Space>
        }
        open={aiDrawerOpen}
        onClose={() => {
          setAiDrawerOpen(false);
          setSelectedEquipmentId(null);
        }}
        width={500}
      >
        {aiSummaryLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <Typography.Text style={{ display: 'block', marginTop: 16 }}>
              {t('ai.generating', 'Generating insights...')}
            </Typography.Text>
          </div>
        ) : aiSummary?.data?.data ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {/* Health & Risk Summary */}
            <Card size="small" title={t('equipmentAI.fleetSummary', 'Equipment Summary')}>
              <Row gutter={16}>
                <Col span={12}>
                  <Typography.Text type="secondary">{t('equipmentAI.healthScore', 'Health Score')}</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <HealthScoreBadge
                      score={aiSummary.data.data.health_score || 0}
                      size="large"
                      showLabel
                    />
                  </div>
                </Col>
                <Col span={12}>
                  <Typography.Text type="secondary">{t('equipmentAI.riskScore', 'Risk Score')}</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <RiskIndicator
                      level={scoreToRiskLevel(aiSummary.data.data.risk_score || 0)}
                      score={aiSummary.data.data.risk_score}
                      showScore
                    />
                  </div>
                </Col>
              </Row>
            </Card>

            {/* Predictions */}
            {aiSummary.data.data.failure_prediction && (
              <Card size="small" title={<><ThunderboltOutlined /> {t('equipmentAI.predictions', 'Predictions')}</>}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div>
                    <Typography.Text type="secondary">
                      {t('equipmentAI.failureIn', 'Potential failure in')}:
                    </Typography.Text>
                    <Typography.Text strong style={{ marginLeft: 8 }}>
                      {aiSummary.data.data.failure_prediction['30_day_probability']}% {t('equipmentAI.daysFromNow', 'in 30 days')}
                    </Typography.Text>
                  </div>
                  {aiSummary.data.data.failure_prediction.recommended_maintenance && (
                    <div>
                      <Typography.Text type="secondary">
                        {t('equipmentAI.nextPM', 'Recommended maintenance')}:
                      </Typography.Text>
                      <Typography.Text strong style={{ marginLeft: 8 }}>
                        {aiSummary.data.data.failure_prediction.recommended_maintenance}
                      </Typography.Text>
                    </div>
                  )}
                </Space>
              </Card>
            )}

            {/* Recommendations */}
            <Card
              size="small"
              title={<><BulbOutlined /> {t('equipmentAI.recommendations', 'Recommendations')}</>}
              loading={aiRecsLoading}
            >
              {aiRecommendations?.data?.data && aiRecommendations.data.data.length > 0 ? (
                <List
                  size="small"
                  dataSource={aiRecommendations.data.data.slice(0, 5)}
                  renderItem={(rec: any) => (
                    <List.Item>
                      <Space>
                        <Tag
                          color={
                            rec.priority === 'critical' ? 'red' :
                            rec.priority === 'high' ? 'volcano' :
                            rec.priority === 'medium' ? 'orange' : 'blue'
                          }
                        >
                          {rec.priority}
                        </Tag>
                        <Typography.Text>{rec.message}</Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Typography.Text type="secondary">
                  {t('equipmentAI.noAnomalies', 'No recommendations at this time')}
                </Typography.Text>
              )}
            </Card>

            {/* Quick Actions */}
            <Card size="small" title={t('equipmentAI.quickActions', 'Quick Actions')}>
              <Space wrap>
                <Button icon={<EyeOutlined />} onClick={() => {
                  setAiDrawerOpen(false);
                  // Navigate to equipment details if available
                }}>
                  {t('equipmentAI.viewHistory', 'View History')}
                </Button>
                <Button type="primary" icon={<ThunderboltOutlined />}>
                  {t('equipmentAI.startPM', 'Start PM')}
                </Button>
              </Space>
            </Card>
          </Space>
        ) : (
          <Typography.Text type="secondary">
            {t('ai.noInsights', 'No insights available')}
          </Typography.Text>
        )}
      </Drawer>
    </Card>
  );
}
