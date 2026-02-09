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
  Upload,
  Divider,
  Alert,
  InputNumber,
  Switch,
  Tabs,
  FloatButton,
  Drawer,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  SearchOutlined,
  UploadOutlined,
  FileExcelOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  MinusOutlined,
  ScanOutlined,
  SettingOutlined,
  LineChartOutlined,
  BellOutlined,
  RobotOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, type Material, type CreateMaterialPayload } from '@inspection/shared';

// Import new components
import {
  MaterialDashboard,
  StockLevelGauge,
  StockHistoryTimeline,
  BatchList,
  ExpiryAlertCard,
  ConsumptionChart,
  CategoryBreakdownChart,
  ABCAnalysisChart,
  AIReorderCard,
  CostOptimizationPanel,
  MaterialInsightsPanel,
  QuickConsumeModal,
  QuickRestockModal,
  InventoryCountModal,
  BarcodeScanner,
  ReservationList,
  VendorCard,
  LocationSelector,
} from '../../components/materials';

const { Title, Text } = Typography;

const CATEGORIES = [
  'filter',
  'lubricant',
  'hydraulic',
  'electrical',
  'mechanical',
  'safety',
  'consumable',
  'spare_part',
  'other',
];

const categoryColorMap: Record<string, string> = {
  filter: 'blue',
  lubricant: 'gold',
  hydraulic: 'cyan',
  electrical: 'purple',
  mechanical: 'orange',
  safety: 'red',
  consumable: 'green',
  spare_part: 'geekblue',
  other: 'default',
};

export default function MaterialsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [showLowStock, setShowLowStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [quickConsumeOpen, setQuickConsumeOpen] = useState(false);
  const [quickRestockOpen, setQuickRestockOpen] = useState(false);
  const [inventoryCountOpen, setInventoryCountOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // AI Sidebar
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState('inventory');

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Fetch materials
  const { data: materialsData, isLoading } = useQuery({
    queryKey: ['materials', categoryFilter, search, showLowStock, showInactive],
    queryFn: () =>
      materialsApi.list({
        category: categoryFilter,
        search: search || undefined,
        low_stock: showLowStock,
        active_only: !showInactive,
      }),
  });

  // Fetch low stock summary
  const { data: lowStockData } = useQuery({
    queryKey: ['materials', 'low-stock'],
    queryFn: () => materialsApi.checkLowStock(),
  });

  // Fetch alerts
  const { data: alertsData } = useQuery({
    queryKey: ['materials', 'alerts'],
    queryFn: () => materialsApi.getAlerts(),
  });

  const materials = materialsData?.data?.materials || [];
  const lowStockCount = lowStockData?.data?.low_stock_count || 0;
  const alertsCount = alertsData?.data?.count || 0;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateMaterialPayload) => materialsApi.create(payload),
    onSuccess: () => {
      message.success(t('materials.created_success', 'Material created successfully'));
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setCreateModalOpen(false);
      createForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'Failed to create material'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Partial<CreateMaterialPayload> & { is_active?: boolean };
    }) => materialsApi.update(id, payload),
    onSuccess: () => {
      message.success(t('materials.updated_success', 'Material updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setEditModalOpen(false);
      setEditingMaterial(null);
      editForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'Failed to update material'));
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => materialsApi.import(file),
    onSuccess: (response) => {
      const data = response.data;
      message.success(`${t('materials.import_complete', 'Import complete')}: ${data.created} ${t('materials.created', 'created')}, ${data.updated} ${t('materials.updated', 'updated')}`);

      if (data.errors?.length) {
        Modal.warning({
          title: t('materials.import_with_errors', 'Import completed with some errors'),
          width: 600,
          content: (
            <div>
              <p><strong>{t('materials.created', 'Created')}:</strong> {data.created}</p>
              <p><strong>{t('materials.updated', 'Updated')}:</strong> {data.updated}</p>
              <Divider />
              <p><strong>{t('materials.errors', 'Errors')} ({data.errors.length}):</strong></p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {data.errors.map((e, i) => (
                    <li key={i} style={{ color: '#ff4d4f' }}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          ),
        });
      }

      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setImportModalOpen(false);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('materials.import_failed', 'Import failed'));
    },
  });

  const handleCreate = (values: any) => {
    createMutation.mutate(values);
  };

  const handleUpdate = (values: any) => {
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, payload: values });
    }
  };

  const handleImport = (file: File) => {
    importMutation.mutate(file);
    return false;
  };

  const openEditModal = (material: Material) => {
    setEditingMaterial(material);
    editForm.setFieldsValue({
      code: material.code,
      name: material.name,
      name_ar: material.name_ar,
      category: material.category,
      unit: material.unit,
      current_stock: material.current_stock,
      min_stock: material.min_stock,
      is_active: material.is_active,
    });
    setEditModalOpen(true);
  };

  const openMaterialDetail = (material: Material) => {
    setSelectedMaterial(material);
    setDetailDrawerOpen(true);
  };

  const handleBarcodeFound = (material: Material) => {
    openMaterialDetail(material);
  };

  const columns: ColumnsType<Material> = [
    {
      title: t('materials.code', 'Code'),
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('materials.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Material) => (
        <a onClick={() => openMaterialDetail(record)}>
          <div>{name}</div>
          {record.name_ar && <Text type="secondary">{record.name_ar}</Text>}
        </a>
      ),
    },
    {
      title: t('materials.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => (
        <Tag color={categoryColorMap[category] || 'default'}>{category.toUpperCase()}</Tag>
      ),
    },
    {
      title: t('materials.unit', 'Unit'),
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: t('materials.stock', 'Stock'),
      key: 'stock',
      width: 160,
      render: (_: any, record: Material) => (
        <StockLevelGauge
          currentStock={record.current_stock}
          minStock={record.min_stock}
          unit={record.unit}
          size="small"
          showLabels={false}
        />
      ),
    },
    {
      title: t('materials.monthly_usage', 'Monthly Usage'),
      dataIndex: 'monthly_consumption',
      key: 'monthly_consumption',
      width: 120,
      render: (val: number, record: Material) =>
        val > 0 ? (
          <Text>{val.toFixed(1)} {record.unit}/mo</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean, record: Material) => (
        <Space direction="vertical" size={0}>
          {isActive ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>{t('common.active', 'Active')}</Tag>
          ) : (
            <Tag color="default">{t('common.inactive', 'Inactive')}</Tag>
          )}
          {record.is_low_stock && (
            <Tag color="error" icon={<WarningOutlined />}>{t('materials.low_stock', 'Low Stock')}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: Material) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            {t('common.edit', 'Edit')}
          </Button>
        </Space>
      ),
    },
  ];

  const MaterialForm = ({ form, onFinish, isEdit = false }: any) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="code"
            label={t('materials.code', 'Code')}
            rules={[{ required: true, message: t('materials.code_required', 'Code is required') }]}
          >
            <Input placeholder="MAT-001" disabled={isEdit} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="unit" label={t('materials.unit', 'Unit')} rules={[{ required: true }]}>
            <Select placeholder={t('materials.select_unit', 'Select unit')}>
              <Select.Option value="pcs">{t('materials.unit_pcs', 'Pieces')}</Select.Option>
              <Select.Option value="liters">{t('materials.unit_liters', 'Liters')}</Select.Option>
              <Select.Option value="kg">{t('materials.unit_kg', 'Kilograms')}</Select.Option>
              <Select.Option value="meters">{t('materials.unit_meters', 'Meters')}</Select.Option>
              <Select.Option value="sets">{t('materials.unit_sets', 'Sets')}</Select.Option>
              <Select.Option value="pairs">{t('materials.unit_pairs', 'Pairs')}</Select.Option>
              <Select.Option value="rolls">{t('materials.unit_rolls', 'Rolls')}</Select.Option>
              <Select.Option value="boxes">{t('materials.unit_boxes', 'Boxes')}</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name"
            label={t('materials.name_en', 'Name (English)')}
            rules={[{ required: true, message: t('materials.name_required', 'Name is required') }]}
          >
            <Input placeholder="Hydraulic Oil" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="name_ar" label={t('materials.name_ar', 'Name (Arabic)')}>
            <Input placeholder="زيت هيدروليكي" dir="rtl" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="category"
            label={t('materials.category', 'Category')}
            rules={[{ required: true, message: t('materials.category_required', 'Category is required') }]}
          >
            <Select placeholder={t('materials.select_category', 'Select category')}>
              {CATEGORIES.map((cat) => (
                <Select.Option key={cat} value={cat}>
                  <Tag color={categoryColorMap[cat]}>{cat.toUpperCase()}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="current_stock" label={t('materials.current_stock', 'Current Stock')} initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="min_stock" label={t('materials.min_stock', 'Min Stock')} initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {isEdit && (
        <Form.Item name="is_active" label={t('common.active', 'Active')} valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
    </Form>
  );

  // Tab items
  const tabItems = [
    {
      key: 'inventory',
      label: (
        <span>
          <SearchOutlined /> {t('materials.inventory', 'Inventory')}
        </span>
      ),
      children: (
        <div>
          {/* Filters */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Input
                placeholder={t('materials.search_placeholder', 'Search by code or name...')}
                prefix={<SearchOutlined />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={6}>
              <Select
                placeholder={t('materials.filter_category', 'Filter by category')}
                value={categoryFilter}
                onChange={setCategoryFilter}
                allowClear
                style={{ width: '100%' }}
              >
                {CATEGORIES.map((cat) => (
                  <Select.Option key={cat} value={cat}>
                    <Tag color={categoryColorMap[cat]}>{cat.toUpperCase()}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Col>
            <Col span={5}>
              <Space>
                <Switch
                  checked={showLowStock}
                  onChange={setShowLowStock}
                  checkedChildren={t('materials.low_stock_only', 'Low Stock Only')}
                  unCheckedChildren={t('materials.all_stock', 'All Stock')}
                />
              </Space>
            </Col>
            <Col span={5}>
              <Space>
                <Switch
                  checked={showInactive}
                  onChange={setShowInactive}
                  checkedChildren={t('materials.show_inactive', 'Show Inactive')}
                  unCheckedChildren={t('materials.active_only', 'Active Only')}
                />
              </Space>
            </Col>
          </Row>

          {/* Table */}
          <Table
            dataSource={materials}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} materials` }}
            rowClassName={(record) => (record.is_low_stock ? 'low-stock-row' : '')}
          />
        </div>
      ),
    },
    {
      key: 'analytics',
      label: (
        <span>
          <LineChartOutlined /> {t('materials.analytics', 'Analytics')}
        </span>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <ConsumptionChart />
          </Col>
          <Col xs={24} lg={12}>
            <CategoryBreakdownChart
              onCategoryClick={(cat) => {
                setCategoryFilter(cat);
                setActiveTab('inventory');
              }}
            />
          </Col>
          <Col xs={24}>
            <ABCAnalysisChart showDetails />
          </Col>
        </Row>
      ),
    },
    {
      key: 'alerts',
      label: (
        <span>
          <Badge count={alertsCount} size="small" offset={[8, 0]}>
            <BellOutlined /> {t('materials.alerts', 'Alerts')}
          </Badge>
        </span>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <ExpiryAlertCard
              days={30}
              onViewAll={() => {}}
            />
          </Col>
          <Col xs={24} lg={12}>
            <ReservationList showActions />
          </Col>
        </Row>
      ),
    },
    {
      key: 'settings',
      label: (
        <span>
          <SettingOutlined /> {t('materials.settings', 'Settings')}
        </span>
      ),
      children: (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={t('materials.locations', 'Storage Locations')} size="small">
              <Text type="secondary">{t('materials.manage_locations_desc', 'Manage warehouse and storage locations')}</Text>
              {/* Location management would go here */}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title={t('materials.vendors', 'Vendors')} size="small">
              <Text type="secondary">{t('materials.manage_vendors_desc', 'Manage material vendors and suppliers')}</Text>
              {/* Vendor management would go here */}
            </Card>
          </Col>
          <Col xs={24}>
            <Card title={t('materials.reorder_settings', 'Reorder Settings')} size="small">
              <Text type="secondary">{t('materials.reorder_settings_desc', 'Configure automatic reorder points and alerts')}</Text>
              {/* Reorder settings would go here */}
            </Card>
          </Col>
        </Row>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              {t('materials.title', 'Materials Management')}
            </Title>
          </Col>
          <Col>
            <Space>
              <Button icon={<ScanOutlined />} onClick={() => setBarcodeScannerOpen(true)}>
                {t('materials.scan', 'Scan')}
              </Button>
              <Button icon={<AuditOutlined />} onClick={() => setInventoryCountOpen(true)}>
                {t('materials.inventory_count', 'Count')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['materials'] })}>
                {t('common.refresh', 'Refresh')}
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
                {t('materials.import_excel', 'Import Excel')}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                {t('materials.add_material', 'Add Material')}
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Dashboard KPIs */}
        <MaterialDashboard
          onQuickConsume={() => setQuickConsumeOpen(true)}
          onQuickRestock={() => setQuickRestockOpen(true)}
          onViewLowStock={() => {
            setShowLowStock(true);
            setActiveTab('inventory');
          }}
          onViewExpiring={() => setActiveTab('alerts')}
        />

        {/* Low stock alert banner */}
        {lowStockCount > 0 && (
          <Alert
            message={`${lowStockCount} ${t('materials.below_min_stock', 'material(s) below minimum stock level')}`}
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            action={
              <Button size="small" type="link" onClick={() => setShowLowStock(true)}>
                {t('materials.view_low_stock', 'View Low Stock')}
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      {/* Floating Action Buttons */}
      <FloatButton.Group shape="circle" style={{ right: 24 }}>
        <FloatButton
          icon={<RobotOutlined />}
          tooltip={t('materials.ai_insights', 'AI Insights')}
          onClick={() => setAiSidebarOpen(true)}
        />
        <FloatButton
          icon={<MinusOutlined />}
          tooltip={t('materials.quick_consume', 'Quick Consume')}
          onClick={() => setQuickConsumeOpen(true)}
          style={{ backgroundColor: '#ff4d4f' }}
        />
        <FloatButton
          icon={<PlusOutlined />}
          tooltip={t('materials.quick_restock', 'Quick Restock')}
          type="primary"
          onClick={() => setQuickRestockOpen(true)}
        />
      </FloatButton.Group>

      {/* AI Insights Sidebar */}
      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('materials.ai_insights', 'AI Insights')}
          </Space>
        }
        placement="right"
        width={400}
        onClose={() => setAiSidebarOpen(false)}
        open={aiSidebarOpen}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <MaterialInsightsPanel />
          <CostOptimizationPanel />
        </Space>
      </Drawer>

      {/* Material Detail Drawer */}
      <Drawer
        title={selectedMaterial?.name || t('materials.details', 'Material Details')}
        placement="right"
        width={500}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedMaterial(null);
        }}
        open={detailDrawerOpen}
      >
        {selectedMaterial && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Card size="small">
              <StockLevelGauge
                currentStock={selectedMaterial.current_stock}
                minStock={selectedMaterial.min_stock}
                unit={selectedMaterial.unit}
              />
            </Card>
            <StockHistoryTimeline materialId={selectedMaterial.id} />
            <BatchList materialId={selectedMaterial.id} />
            <AIReorderCard materialId={selectedMaterial.id} materialName={selectedMaterial.name} />
          </Space>
        )}
      </Drawer>

      {/* Create Modal */}
      <Modal
        title={t('materials.add_new_material', 'Add New Material')}
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        width={600}
      >
        <MaterialForm form={createForm} onFinish={handleCreate} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={t('materials.edit_material', 'Edit Material')}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingMaterial(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        width={600}
      >
        <MaterialForm form={editForm} onFinish={handleUpdate} isEdit />
      </Modal>

      {/* Import Modal */}
      <Modal
        title={t('materials.import_from_excel', 'Import Materials from Excel')}
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={600}
      >
        <p>{t('materials.import_desc', 'Upload an Excel file with your materials/parts master data.')}</p>

        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Text strong>{t('materials.required_columns', 'Required columns')}:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li><code>code</code> - {t('materials.unique_code', 'Unique material code')}</li>
            <li><code>name</code> - {t('materials.name_english', 'Material name (English)')}</li>
            <li><code>category</code> - {t('materials.category_hint', 'Category (filter, lubricant, hydraulic, etc.)')}</li>
            <li><code>unit</code> - {t('materials.unit_hint', 'Unit of measure (pcs, liters, kg, etc.)')}</li>
          </ul>

          <Text strong>{t('materials.optional_columns', 'Optional columns')}:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li><code>name_ar</code> - {t('materials.arabic_name', 'Arabic name')}</li>
            <li><code>current_stock</code> - {t('materials.current_quantity', 'Current quantity in stock')}</li>
            <li><code>min_stock</code> - {t('materials.min_stock_hint', 'Minimum stock level (for low stock alerts)')}</li>
          </ul>
        </Card>

        <Alert
          message={t('materials.import_update_hint', 'Existing materials will be updated by matching the code column')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Upload
          accept=".xlsx,.xls"
          beforeUpload={handleImport}
          showUploadList={false}
        >
          <Button
            icon={<FileExcelOutlined />}
            loading={importMutation.isPending}
            type="primary"
            size="large"
          >
            {t('materials.select_excel_file', 'Select Excel File')}
          </Button>
        </Upload>
      </Modal>

      {/* Quick Consume Modal */}
      <QuickConsumeModal
        open={quickConsumeOpen}
        onClose={() => setQuickConsumeOpen(false)}
        material={selectedMaterial || undefined}
      />

      {/* Quick Restock Modal */}
      <QuickRestockModal
        open={quickRestockOpen}
        onClose={() => setQuickRestockOpen(false)}
        material={selectedMaterial || undefined}
      />

      {/* Inventory Count Modal */}
      <InventoryCountModal
        open={inventoryCountOpen}
        onClose={() => setInventoryCountOpen(false)}
      />

      {/* Barcode Scanner */}
      <BarcodeScanner
        open={barcodeScannerOpen}
        onClose={() => setBarcodeScannerOpen(false)}
        onMaterialFound={handleBarcodeFound}
      />

      <style>{`
        .low-stock-row {
          background-color: #fff2f0;
        }
      `}</style>
    </div>
  );
}
