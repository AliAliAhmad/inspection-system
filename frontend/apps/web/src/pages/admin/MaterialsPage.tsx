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
  Upload,
  Badge,
  Statistic,
  Divider,
  Alert,
  InputNumber,
  Switch,
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
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, type Material, type CreateMaterialPayload } from '@inspection/shared';

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

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [showLowStock, setShowLowStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

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

  const materials = materialsData?.data?.materials || [];
  const lowStockCount = lowStockData?.data?.low_stock_count || 0;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateMaterialPayload) => materialsApi.create(payload),
    onSuccess: () => {
      message.success('Material created successfully');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setCreateModalOpen(false);
      createForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to create material');
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
      message.success('Material updated successfully');
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setEditModalOpen(false);
      setEditingMaterial(null);
      editForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to update material');
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => materialsApi.import(file),
    onSuccess: (response) => {
      const data = response.data;
      message.success(`Import complete: ${data.created} created, ${data.updated} updated`);

      if (data.errors?.length) {
        Modal.warning({
          title: 'Import completed with some errors',
          width: 600,
          content: (
            <div>
              <p>
                <strong>Created:</strong> {data.created} materials
              </p>
              <p>
                <strong>Updated:</strong> {data.updated} materials
              </p>
              <Divider />
              <p>
                <strong>Errors ({data.errors.length}):</strong>
              </p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {data.errors.map((e, i) => (
                    <li key={i} style={{ color: '#ff4d4f' }}>
                      {e}
                    </li>
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
      message.error(err.response?.data?.message || 'Import failed');
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

  const columns: ColumnsType<Material> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Material) => (
        <div>
          <div>{name}</div>
          {record.name_ar && <Text type="secondary">{record.name_ar}</Text>}
        </div>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (category: string) => (
        <Tag color={categoryColorMap[category] || 'default'}>{category.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: 'Stock',
      key: 'stock',
      width: 140,
      render: (_: any, record: Material) => (
        <div>
          <div>
            <Text strong style={{ color: record.is_low_stock ? '#ff4d4f' : undefined }}>
              {record.current_stock}
            </Text>
            <Text type="secondary"> / {record.min_stock} min</Text>
          </div>
          {record.is_low_stock && (
            <Tag color="error" icon={<WarningOutlined />}>
              Low Stock
            </Tag>
          )}
          {record.stock_months !== null && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              ~{record.stock_months?.toFixed(1)} months
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Monthly Usage',
      dataIndex: 'monthly_consumption',
      key: 'monthly_consumption',
      width: 120,
      render: (val: number, record: Material) =>
        val > 0 ? (
          <Text>
            {val.toFixed(1)} {record.unit}/mo
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean) =>
        isActive ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Active
          </Tag>
        ) : (
          <Tag color="default">Inactive</Tag>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: Material) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Edit
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
            label="Code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input placeholder="MAT-001" disabled={isEdit} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
            <Select placeholder="Select unit">
              <Select.Option value="pcs">Pieces</Select.Option>
              <Select.Option value="liters">Liters</Select.Option>
              <Select.Option value="kg">Kilograms</Select.Option>
              <Select.Option value="meters">Meters</Select.Option>
              <Select.Option value="sets">Sets</Select.Option>
              <Select.Option value="pairs">Pairs</Select.Option>
              <Select.Option value="rolls">Rolls</Select.Option>
              <Select.Option value="boxes">Boxes</Select.Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="name"
            label="Name (English)"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="Hydraulic Oil" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="name_ar" label="Name (Arabic)">
            <Input placeholder="زيت هيدروليكي" dir="rtl" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Category is required' }]}
          >
            <Select placeholder="Select category">
              {CATEGORIES.map((cat) => (
                <Select.Option key={cat} value={cat}>
                  <Tag color={categoryColorMap[cat]}>{cat.toUpperCase()}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="current_stock" label="Current Stock" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="min_stock" label="Min Stock" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      {isEdit && (
        <Form.Item name="is_active" label="Active" valuePropName="checked">
          <Switch />
        </Form.Item>
      )}
    </Form>
  );

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Materials Management
            </Title>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['materials'] })}>
                Refresh
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
                Import Excel
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                Add Material
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Stats */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Total Materials" value={materials.length} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Low Stock Items"
                value={lowStockCount}
                valueStyle={{ color: lowStockCount > 0 ? '#ff4d4f' : '#52c41a' }}
                prefix={lowStockCount > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Active Materials"
                value={materials.filter((m) => m.is_active).length}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="Categories" value={new Set(materials.map((m) => m.category)).size} />
            </Card>
          </Col>
        </Row>

        {/* Low stock alert */}
        {lowStockCount > 0 && (
          <Alert
            message={`${lowStockCount} material${lowStockCount > 1 ? 's' : ''} below minimum stock level`}
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            action={
              <Button size="small" type="link" onClick={() => setShowLowStock(true)}>
                View Low Stock
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Input
              placeholder="Search by code or name..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="Filter by category"
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
                checkedChildren="Low Stock Only"
                unCheckedChildren="All Stock"
              />
            </Space>
          </Col>
          <Col span={5}>
            <Space>
              <Switch
                checked={showInactive}
                onChange={setShowInactive}
                checkedChildren="Show Inactive"
                unCheckedChildren="Active Only"
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
      </Card>

      {/* Create Modal */}
      <Modal
        title="Add New Material"
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
        title="Edit Material"
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
        title="Import Materials from Excel"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={600}
      >
        <p>Upload an Excel file with your materials/parts master data.</p>

        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Text strong>Required columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>
              <code>code</code> - Unique material code
            </li>
            <li>
              <code>name</code> - Material name (English)
            </li>
            <li>
              <code>category</code> - Category (filter, lubricant, hydraulic, etc.)
            </li>
            <li>
              <code>unit</code> - Unit of measure (pcs, liters, kg, etc.)
            </li>
          </ul>

          <Text strong>Optional columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li>
              <code>name_ar</code> - Arabic name
            </li>
            <li>
              <code>current_stock</code> - Current quantity in stock
            </li>
            <li>
              <code>min_stock</code> - Minimum stock level (for low stock alerts)
            </li>
          </ul>
        </Card>

        <Alert
          message="Existing materials will be updated by matching the code column"
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
            Select Excel File
          </Button>
        </Upload>
      </Modal>

      <style>{`
        .low-stock-row {
          background-color: #fff2f0;
        }
      `}</style>
    </div>
  );
}
