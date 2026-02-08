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
  Empty,
  List,
  Divider,
  Badge,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckSquareOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  pmTemplatesApi,
  cyclesApi,
  materialsApi,
  type PMTemplate,
  type PMTemplateChecklistItem,
  type PMTemplateMaterial,
  type MaintenanceCycle,
  type Material,
  type CreatePMTemplatePayload,
} from '@inspection/shared';

const { Title, Text } = Typography;

const EQUIPMENT_TYPES = [
  'STS Crane',
  'RTG Crane',
  'Forklift',
  'Reach Stacker',
  'Generator',
  'Compressor',
  'HVAC Unit',
  'Pump',
  'Conveyor',
  'Other',
];

const ANSWER_TYPES = [
  { value: 'pass_fail', label: 'Pass/Fail' },
  { value: 'yes_no', label: 'Yes/No' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'text', label: 'Text' },
];

const CATEGORIES = [
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'electrical', label: 'Electrical' },
];

export default function PMTemplatesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>();
  const [cycleFilter, setCycleFilter] = useState<number | undefined>();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PMTemplate | null>(null);
  const [cloningTemplateId, setCloningTemplateId] = useState<number | null>(null);

  const [form] = Form.useForm();
  const [cloneForm] = Form.useForm();

  // Checklist items and materials managed in state for editing
  const [checklistItems, setChecklistItems] = useState<Partial<PMTemplateChecklistItem>[]>([]);
  const [templateMaterials, setTemplateMaterials] = useState<{ material_id: number; quantity: number }[]>([]);

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['pm-templates', equipmentFilter, cycleFilter],
    queryFn: () =>
      pmTemplatesApi.list({
        equipment_type: equipmentFilter,
        cycle_id: cycleFilter,
      }),
  });

  // Fetch cycles for filter and form
  const { data: cyclesData } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => cyclesApi.list(),
  });

  // Fetch materials for materials selector
  const { data: materialsData } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list({ active_only: true }),
  });

  const templates = templatesData?.data?.data?.templates || [];
  const cycles = cyclesData?.data?.data?.cycles || [];
  const materials = materialsData?.data?.materials || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreatePMTemplatePayload) => pmTemplatesApi.create(payload),
    onSuccess: () => {
      message.success('PM Template created successfully');
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setCreateModalOpen(false);
      form.resetFields();
      setChecklistItems([]);
      setTemplateMaterials([]);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to create template');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreatePMTemplatePayload> & { is_active?: boolean } }) =>
      pmTemplatesApi.update(id, payload),
    onSuccess: () => {
      message.success('PM Template updated successfully');
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setEditModalOpen(false);
      setEditingTemplate(null);
      form.resetFields();
      setChecklistItems([]);
      setTemplateMaterials([]);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to update template');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => pmTemplatesApi.delete(id),
    onSuccess: () => {
      message.success('PM Template deleted');
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to delete template');
    },
  });

  // Clone mutation
  const cloneMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { cycle_id: number; name?: string } }) =>
      pmTemplatesApi.clone(id, payload),
    onSuccess: () => {
      message.success('PM Template cloned successfully');
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setCloneModalOpen(false);
      setCloningTemplateId(null);
      cloneForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to clone template');
    },
  });

  const handleCreate = (values: any) => {
    const payload: CreatePMTemplatePayload = {
      ...values,
      checklist_items: checklistItems.map((item, idx) => ({
        ...item,
        order_index: idx,
      })),
      materials: templateMaterials,
    };
    createMutation.mutate(payload);
  };

  const handleUpdate = (values: any) => {
    if (editingTemplate) {
      const payload = {
        ...values,
        checklist_items: checklistItems.map((item, idx) => ({
          ...item,
          order_index: idx,
        })),
        materials: templateMaterials,
      };
      updateMutation.mutate({ id: editingTemplate.id, payload });
    }
  };

  const handleClone = (values: any) => {
    if (cloningTemplateId) {
      cloneMutation.mutate({ id: cloningTemplateId, payload: values });
    }
  };

  const openEditModal = async (template: PMTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      name_ar: template.name_ar,
      description: template.description,
      equipment_type: template.equipment_type,
      cycle_id: template.cycle_id,
      estimated_hours: template.estimated_hours,
      is_active: template.is_active,
    });
    setChecklistItems(template.checklist_items || []);
    setTemplateMaterials(
      (template.materials || []).map((m) => ({
        material_id: m.material_id,
        quantity: m.quantity,
      }))
    );
    setEditModalOpen(true);
  };

  const openCloneModal = (templateId: number) => {
    setCloningTemplateId(templateId);
    setCloneModalOpen(true);
  };

  const addChecklistItem = () => {
    setChecklistItems([
      ...checklistItems,
      {
        question_text: '',
        answer_type: 'pass_fail',
        is_required: true,
        order_index: checklistItems.length,
      },
    ]);
  };

  const updateChecklistItem = (index: number, updates: Partial<PMTemplateChecklistItem>) => {
    const updated = [...checklistItems];
    updated[index] = { ...updated[index], ...updates };
    setChecklistItems(updated);
  };

  const removeChecklistItem = (index: number) => {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };

  const addMaterial = () => {
    setTemplateMaterials([...templateMaterials, { material_id: 0, quantity: 1 }]);
  };

  const updateMaterial = (index: number, updates: { material_id?: number; quantity?: number }) => {
    const updated = [...templateMaterials];
    updated[index] = { ...updated[index], ...updates };
    setTemplateMaterials(updated);
  };

  const removeMaterial = (index: number) => {
    setTemplateMaterials(templateMaterials.filter((_, i) => i !== index));
  };

  const getCycleName = (cycleId: number) => {
    const cycle = cycles.find((c) => c.id === cycleId);
    return cycle?.display_label || '-';
  };

  const columns: ColumnsType<PMTemplate> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: PMTemplate) => (
        <div>
          <div>
            <Text strong>{name}</Text>
          </div>
          {record.description && <Text type="secondary">{record.description}</Text>}
        </div>
      ),
    },
    {
      title: 'Equipment Type',
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      width: 150,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: 'Cycle',
      key: 'cycle',
      width: 150,
      render: (_: any, record: PMTemplate) => (
        <Tag color={record.cycle?.cycle_type === 'running_hours' ? 'orange' : 'green'}>
          {record.cycle?.display_label || getCycleName(record.cycle_id)}
        </Tag>
      ),
    },
    {
      title: 'Est. Hours',
      dataIndex: 'estimated_hours',
      key: 'estimated_hours',
      width: 100,
      render: (hours: number) => <Text>{hours}h</Text>,
    },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 100,
      render: (_: any, record: PMTemplate) => (
        <Badge count={record.checklist_items_count} showZero color={record.checklist_items_count > 0 ? 'blue' : 'default'}>
          <Tag icon={<CheckSquareOutlined />}>Items</Tag>
        </Badge>
      ),
    },
    {
      title: 'Materials',
      key: 'materials',
      width: 100,
      render: (_: any, record: PMTemplate) => (
        <Badge count={record.materials_count} showZero color={record.materials_count > 0 ? 'green' : 'default'}>
          <Tag icon={<ToolOutlined />}>Parts</Tag>
        </Badge>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive: boolean) => (isActive ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: PMTemplate) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Edit
          </Button>
          <Button type="link" icon={<CopyOutlined />} onClick={() => openCloneModal(record.id)}>
            Clone
          </Button>
          <Popconfirm
            title="Delete this template?"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okButtonProps={{ loading: deleteMutation.isPending }}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const TemplateForm = ({ onFinish, isEdit = false }: any) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Tabs
        items={[
          {
            key: 'basic',
            label: 'Basic Info',
            children: (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                      <Input placeholder="500h Pump PM Template" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="name_ar" label="Name (Arabic)">
                      <Input placeholder="قالب صيانة 500 ساعة" dir="rtl" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="equipment_type" label="Equipment Type" rules={[{ required: true }]}>
                      <Select placeholder="Select equipment type">
                        {EQUIPMENT_TYPES.map((type) => (
                          <Select.Option key={type} value={type}>
                            {type}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="cycle_id" label="Maintenance Cycle" rules={[{ required: true }]}>
                      <Select placeholder="Select cycle">
                        {cycles.map((cycle) => (
                          <Select.Option key={cycle.id} value={cycle.id}>
                            <Tag color={cycle.cycle_type === 'running_hours' ? 'orange' : 'green'}>
                              {cycle.display_label}
                            </Tag>
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="estimated_hours" label="Estimated Hours" initialValue={4}>
                      <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  {isEdit && (
                    <Col span={12}>
                      <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
                        <Switch />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
                <Form.Item name="description" label="Description">
                  <Input.TextArea rows={2} placeholder="Description of this template..." />
                </Form.Item>
              </>
            ),
          },
          {
            key: 'checklist',
            label: (
              <span>
                <CheckSquareOutlined /> Checklist ({checklistItems.length})
              </span>
            ),
            children: (
              <>
                {checklistItems.length === 0 ? (
                  <Empty description="No checklist items" />
                ) : (
                  <List
                    dataSource={checklistItems}
                    renderItem={(item, index) => (
                      <List.Item
                        actions={[
                          <Button
                            type="link"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => removeChecklistItem(index)}
                          />,
                        ]}
                      >
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <Input
                            placeholder="Check item text..."
                            value={item.question_text}
                            onChange={(e) => updateChecklistItem(index, { question_text: e.target.value })}
                            style={{ flex: 1 }}
                          />
                          <Select
                            value={item.answer_type}
                            onChange={(val) => updateChecklistItem(index, { answer_type: val })}
                            style={{ width: 120 }}
                          >
                            {ANSWER_TYPES.map((at) => (
                              <Select.Option key={at.value} value={at.value}>
                                {at.label}
                              </Select.Option>
                            ))}
                          </Select>
                          <Select
                            value={item.category || undefined}
                            onChange={(val) => updateChecklistItem(index, { category: val })}
                            placeholder="Category"
                            allowClear
                            style={{ width: 120 }}
                          >
                            {CATEGORIES.map((cat) => (
                              <Select.Option key={cat.value} value={cat.value}>
                                {cat.label}
                              </Select.Option>
                            ))}
                          </Select>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addChecklistItem} style={{ marginTop: 8 }}>
                  Add Checklist Item
                </Button>
              </>
            ),
          },
          {
            key: 'materials',
            label: (
              <span>
                <ToolOutlined /> Materials ({templateMaterials.length})
              </span>
            ),
            children: (
              <>
                {templateMaterials.length === 0 ? (
                  <Empty description="No required materials" />
                ) : (
                  <List
                    dataSource={templateMaterials}
                    renderItem={(item, index) => (
                      <List.Item
                        actions={[
                          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => removeMaterial(index)} />,
                        ]}
                      >
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <Select
                            value={item.material_id || undefined}
                            onChange={(val) => updateMaterial(index, { material_id: val })}
                            placeholder="Select material"
                            style={{ flex: 1 }}
                            showSearch
                            optionFilterProp="children"
                          >
                            {materials.map((mat) => (
                              <Select.Option key={mat.id} value={mat.id}>
                                <Text code>{mat.code}</Text> {mat.name}
                              </Select.Option>
                            ))}
                          </Select>
                          <InputNumber
                            value={item.quantity}
                            onChange={(val) => updateMaterial(index, { quantity: val || 1 })}
                            min={1}
                            style={{ width: 100 }}
                            addonAfter="qty"
                          />
                        </div>
                      </List.Item>
                    )}
                  />
                )}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addMaterial} style={{ marginTop: 8 }}>
                  Add Material
                </Button>
              </>
            ),
          },
        ]}
      />
    </Form>
  );

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <UnorderedListOutlined /> PM Templates
            </Title>
            <Text type="secondary">Create templates for preventive maintenance tasks with checklists and materials</Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setChecklistItems([]);
                setTemplateMaterials([]);
                setCreateModalOpen(true);
              }}
            >
              New Template
            </Button>
          </Col>
        </Row>

        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Select
              placeholder="Filter by equipment type"
              value={equipmentFilter}
              onChange={setEquipmentFilter}
              allowClear
              style={{ width: '100%' }}
            >
              {EQUIPMENT_TYPES.map((type) => (
                <Select.Option key={type} value={type}>
                  {type}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col span={8}>
            <Select
              placeholder="Filter by cycle"
              value={cycleFilter}
              onChange={setCycleFilter}
              allowClear
              style={{ width: '100%' }}
            >
              {cycles.map((cycle) => (
                <Select.Option key={cycle.id} value={cycle.id}>
                  <Tag color={cycle.cycle_type === 'running_hours' ? 'orange' : 'green'}>{cycle.display_label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Col>
        </Row>

        {/* Table */}
        <Table
          dataSource={templates}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10, showTotal: (t) => `${t} templates` }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Create PM Template"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
          setChecklistItems([]);
          setTemplateMaterials([]);
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        width={800}
      >
        <TemplateForm onFinish={handleCreate} />
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Edit PM Template"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingTemplate(null);
          form.resetFields();
          setChecklistItems([]);
          setTemplateMaterials([]);
        }}
        onOk={() => form.submit()}
        confirmLoading={updateMutation.isPending}
        width={800}
      >
        <TemplateForm onFinish={handleUpdate} isEdit />
      </Modal>

      {/* Clone Modal */}
      <Modal
        title="Clone PM Template"
        open={cloneModalOpen}
        onCancel={() => {
          setCloneModalOpen(false);
          setCloningTemplateId(null);
          cloneForm.resetFields();
        }}
        onOk={() => cloneForm.submit()}
        confirmLoading={cloneMutation.isPending}
        width={500}
      >
        <Form form={cloneForm} layout="vertical" onFinish={handleClone}>
          <Form.Item name="cycle_id" label="New Cycle" rules={[{ required: true, message: 'Select the target cycle' }]}>
            <Select placeholder="Select cycle for clone">
              {cycles.map((cycle) => (
                <Select.Option key={cycle.id} value={cycle.id}>
                  <Tag color={cycle.cycle_type === 'running_hours' ? 'orange' : 'green'}>{cycle.display_label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="name" label="New Name (optional)">
            <Input placeholder="Leave empty to auto-generate" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
