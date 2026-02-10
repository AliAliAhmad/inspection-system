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
  Tooltip,
  Progress,
  Spin,
  Drawer,
  Timeline,
  Statistic,
  Alert,
  Checkbox,
  Dropdown,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckSquareOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  HistoryOutlined,
  BarChartOutlined,
  BulbOutlined,
  ExportOutlined,
  ImportOutlined,
  DownOutlined,
  ReloadOutlined,
  StarOutlined,
  FireOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  pmTemplatesApi,
  cyclesApi,
  materialsApi,
  aiApi,
  type PMTemplate,
  type PMTemplateChecklistItem,
  type PMTemplateMaterial,
  type MaintenanceCycle,
  type Material,
  type CreatePMTemplatePayload,
} from '@inspection/shared';
import { AIInsightsPanel, PerformanceChart, StatCard } from '../../components/shared';
import type { AIInsight } from '../../components/shared';

const { Title, Text, Paragraph } = Typography;

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
  { value: 'hydraulic', label: 'Hydraulic' },
  { value: 'pneumatic', label: 'Pneumatic' },
  { value: 'safety', label: 'Safety' },
  { value: 'lubrication', label: 'Lubrication' },
];

// AI-generated checklist suggestions by equipment type
// Note: category field uses extended values beyond the base type
const AI_CHECKLIST_SUGGESTIONS: Record<string, any[]> = {
  'Pump': [
    { question_text: 'Check pump pressure within operating range', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Inspect seals for leaks', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check bearing temperature', answer_type: 'numeric', category: 'mechanical', is_required: true },
    { question_text: 'Verify motor amperage', answer_type: 'numeric', category: 'electrical', is_required: true },
    { question_text: 'Inspect impeller condition', answer_type: 'pass_fail', category: 'mechanical', is_required: false },
    { question_text: 'Check coupling alignment', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Lubricate bearings if required', answer_type: 'yes_no', category: 'lubrication', is_required: false },
  ],
  'Generator': [
    { question_text: 'Check fuel level and quality', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Inspect coolant level', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check oil level and condition', answer_type: 'pass_fail', category: 'lubrication', is_required: true },
    { question_text: 'Test battery voltage', answer_type: 'numeric', category: 'electrical', is_required: true },
    { question_text: 'Inspect belts for wear', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check exhaust system for leaks', answer_type: 'pass_fail', category: 'safety', is_required: true },
    { question_text: 'Verify control panel readings', answer_type: 'pass_fail', category: 'electrical', is_required: true },
    { question_text: 'Test emergency stop function', answer_type: 'pass_fail', category: 'safety', is_required: true },
  ],
  'STS Crane': [
    { question_text: 'Inspect wire ropes for wear', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check spreader lock mechanism', answer_type: 'pass_fail', category: 'safety', is_required: true },
    { question_text: 'Test emergency brakes', answer_type: 'pass_fail', category: 'safety', is_required: true },
    { question_text: 'Verify limit switches operation', answer_type: 'pass_fail', category: 'electrical', is_required: true },
    { question_text: 'Inspect gantry wheels', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check hydraulic fluid level', answer_type: 'pass_fail', category: 'hydraulic', is_required: true },
    { question_text: 'Test anti-collision system', answer_type: 'pass_fail', category: 'safety', is_required: true },
  ],
  'HVAC Unit': [
    { question_text: 'Check refrigerant levels', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Clean or replace air filters', answer_type: 'yes_no', category: 'mechanical', is_required: true },
    { question_text: 'Inspect condenser coils', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
    { question_text: 'Check thermostat calibration', answer_type: 'pass_fail', category: 'electrical', is_required: true },
    { question_text: 'Inspect drain lines', answer_type: 'pass_fail', category: 'mechanical', is_required: false },
    { question_text: 'Test safety controls', answer_type: 'pass_fail', category: 'safety', is_required: true },
  ],
};

export default function PMTemplatesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>();
  const [cycleFilter, setCycleFilter] = useState<number | undefined>();
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [analyticsDrawerOpen, setAnalyticsDrawerOpen] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [viewingTemplateId, setViewingTemplateId] = useState<number | null>(null);

  const [editingTemplate, setEditingTemplate] = useState<PMTemplate | null>(null);
  const [cloningTemplateId, setCloningTemplateId] = useState<number | null>(null);

  const [form] = Form.useForm();
  const [cloneForm] = Form.useForm();
  const [aiForm] = Form.useForm();

  // Checklist items and materials managed in state for editing
  const [checklistItems, setChecklistItems] = useState<Partial<PMTemplateChecklistItem>[]>([]);
  const [templateMaterials, setTemplateMaterials] = useState<{ material_id: number; quantity: number }[]>([]);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

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
      message.success(t('pmTemplate.created', 'PM Template created successfully'));
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setCreateModalOpen(false);
      form.resetFields();
      setChecklistItems([]);
      setTemplateMaterials([]);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('pmTemplate.createFailed', 'Failed to create template'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreatePMTemplatePayload> & { is_active?: boolean } }) =>
      pmTemplatesApi.update(id, payload),
    onSuccess: () => {
      message.success(t('pmTemplate.updated', 'PM Template updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setEditModalOpen(false);
      setEditingTemplate(null);
      form.resetFields();
      setChecklistItems([]);
      setTemplateMaterials([]);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('pmTemplate.updateFailed', 'Failed to update template'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => pmTemplatesApi.delete(id),
    onSuccess: () => {
      message.success(t('pmTemplate.deleted', 'PM Template deleted'));
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('pmTemplate.deleteFailed', 'Failed to delete template'));
    },
  });

  // Clone mutation
  const cloneMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { cycle_id: number; name?: string } }) =>
      pmTemplatesApi.clone(id, payload),
    onSuccess: () => {
      message.success(t('pmTemplate.cloned', 'PM Template cloned successfully'));
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setCloneModalOpen(false);
      setCloningTemplateId(null);
      cloneForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('pmTemplate.cloneFailed', 'Failed to clone template'));
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => pmTemplatesApi.delete(id)));
    },
    onSuccess: () => {
      message.success(t('pmTemplate.bulkDeleted', 'Templates deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['pm-templates'] });
      setSelectedRows([]);
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

  // AI Template Generator
  const handleGenerateAIChecklist = async () => {
    const equipmentType = aiForm.getFieldValue('equipment_type');
    if (!equipmentType) {
      message.warning(t('pmTemplate.selectEquipmentFirst', 'Please select an equipment type first'));
      return;
    }

    setIsGeneratingAI(true);

    // Simulate AI generation (in production, this would call the backend AI service)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const suggestions = AI_CHECKLIST_SUGGESTIONS[equipmentType] || [];
    if (suggestions.length > 0) {
      setChecklistItems([...checklistItems, ...suggestions]);
      message.success(t('pmTemplate.aiGenerated', `Generated ${suggestions.length} checklist items`));
    } else {
      // Fallback: Generate generic items
      const genericItems: any[] = [
        { question_text: 'Visual inspection for damage or wear', answer_type: 'pass_fail', category: 'mechanical', is_required: true },
        { question_text: 'Check all safety guards are in place', answer_type: 'pass_fail', category: 'safety', is_required: true },
        { question_text: 'Verify electrical connections are secure', answer_type: 'pass_fail', category: 'electrical', is_required: true },
        { question_text: 'Test emergency stop function', answer_type: 'pass_fail', category: 'safety', is_required: true },
        { question_text: 'Check lubrication points', answer_type: 'yes_no', category: 'lubrication', is_required: false },
      ];
      setChecklistItems([...checklistItems, ...genericItems]);
      message.success(t('pmTemplate.aiGenerated', `Generated ${genericItems.length} checklist items`));
    }

    setIsGeneratingAI(false);
  };

  // Calculate template statistics
  const templateStats = {
    total: templates.length,
    active: templates.filter(t => t.is_active).length,
    byEquipment: EQUIPMENT_TYPES.reduce((acc, type) => {
      acc[type] = templates.filter(t => t.equipment_type === type).length;
      return acc;
    }, {} as Record<string, number>),
    avgChecklistItems: templates.length > 0
      ? Math.round(templates.reduce((sum, t) => sum + (t.checklist_items_count || 0), 0) / templates.length)
      : 0,
    avgMaterials: templates.length > 0
      ? Math.round(templates.reduce((sum, t) => sum + (t.materials_count || 0), 0) / templates.length)
      : 0,
  };

  // AI Insights for templates
  const templateInsights: AIInsight[] = [
    {
      id: 'usage-tip',
      type: 'tip',
      title: t('pmTemplate.insight.usage', 'Template Usage'),
      description: t('pmTemplate.insight.usageDesc', `You have ${templateStats.total} templates. ${templateStats.active} are active.`),
      priority: 'medium',
    },
    ...(templateStats.avgChecklistItems < 5 ? [{
      id: 'checklist-warning',
      type: 'warning' as const,
      title: t('pmTemplate.insight.fewItems', 'Low Checklist Items'),
      description: t('pmTemplate.insight.fewItemsDesc', 'Average of only ' + templateStats.avgChecklistItems + ' items per template. Consider adding more comprehensive checks.'),
      priority: 'high' as const,
    }] : []),
    {
      id: 'optimization',
      type: 'suggestion',
      title: t('pmTemplate.insight.optimize', 'Optimization Opportunity'),
      description: t('pmTemplate.insight.optimizeDesc', 'Consider creating cycle-specific templates for your most used equipment types.'),
      priority: 'low',
      actionLabel: t('pmTemplate.createNew', 'Create New'),
      onAction: () => setCreateModalOpen(true),
    },
  ];

  // Mock version history
  const versionHistory = [
    { version: '1.3', date: '2026-02-10', author: 'Admin', changes: 'Added 2 safety checklist items' },
    { version: '1.2', date: '2026-02-05', author: 'Admin', changes: 'Updated material quantities' },
    { version: '1.1', date: '2026-01-28', author: 'Engineer', changes: 'Added lubrication checks' },
    { version: '1.0', date: '2026-01-15', author: 'Admin', changes: 'Initial version' },
  ];

  const columns: ColumnsType<PMTemplate> = [
    {
      title: t('common.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: PMTemplate) => (
        <div>
          <div>
            <Text strong>{name}</Text>
          </div>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </div>
      ),
    },
    {
      title: t('pmTemplate.equipmentType', 'Equipment Type'),
      dataIndex: 'equipment_type',
      key: 'equipment_type',
      width: 140,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: t('pmTemplate.cycle', 'Cycle'),
      key: 'cycle',
      width: 140,
      render: (_: any, record: PMTemplate) => (
        <Tag color={record.cycle?.cycle_type === 'running_hours' ? 'orange' : 'green'}>
          {record.cycle?.display_label || getCycleName(record.cycle_id)}
        </Tag>
      ),
    },
    {
      title: t('pmTemplate.estHours', 'Est. Hours'),
      dataIndex: 'estimated_hours',
      key: 'estimated_hours',
      width: 90,
      render: (hours: number) => <Text>{hours}h</Text>,
    },
    {
      title: t('pmTemplate.checklist', 'Checklist'),
      key: 'checklist',
      width: 90,
      render: (_: any, record: PMTemplate) => (
        <Badge count={record.checklist_items_count} showZero color={record.checklist_items_count > 0 ? 'blue' : 'default'}>
          <Tag icon={<CheckSquareOutlined />}>{t('pmTemplate.items', 'Items')}</Tag>
        </Badge>
      ),
    },
    {
      title: t('pmTemplate.materials', 'Materials'),
      key: 'materials',
      width: 90,
      render: (_: any, record: PMTemplate) => (
        <Badge count={record.materials_count} showZero color={record.materials_count > 0 ? 'green' : 'default'}>
          <Tag icon={<ToolOutlined />}>{t('pmTemplate.parts', 'Parts')}</Tag>
        </Badge>
      ),
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (isActive: boolean) => (
        isActive
          ? <Tag color="success">{t('common.active', 'Active')}</Tag>
          : <Tag>{t('common.inactive', 'Inactive')}</Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 220,
      render: (_: any, record: PMTemplate) => (
        <Space size={4}>
          <Tooltip title={t('common.edit', 'Edit')}>
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          </Tooltip>
          <Tooltip title={t('pmTemplate.clone', 'Clone')}>
            <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => openCloneModal(record.id)} />
          </Tooltip>
          <Tooltip title={t('pmTemplate.analytics', 'Analytics')}>
            <Button
              type="link"
              size="small"
              icon={<BarChartOutlined />}
              onClick={() => {
                setViewingTemplateId(record.id);
                setAnalyticsDrawerOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title={t('pmTemplate.history', 'History')}>
            <Button
              type="link"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => {
                setViewingTemplateId(record.id);
                setHistoryDrawerOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title={t('pmTemplate.deleteConfirm', 'Delete this template?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okButtonProps={{ loading: deleteMutation.isPending }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
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
            label: t('pmTemplate.basicInfo', 'Basic Info'),
            children: (
              <>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="name" label={t('common.name', 'Name')} rules={[{ required: true }]}>
                      <Input placeholder="500h Pump PM Template" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="name_ar" label={t('common.nameAr', 'Name (Arabic)')}>
                      <Input placeholder="قالب صيانة 500 ساعة" dir="rtl" />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item name="equipment_type" label={t('pmTemplate.equipmentType', 'Equipment Type')} rules={[{ required: true }]}>
                      <Select placeholder={t('pmTemplate.selectEquipment', 'Select equipment type')}>
                        {EQUIPMENT_TYPES.map((type) => (
                          <Select.Option key={type} value={type}>
                            {type}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="cycle_id" label={t('pmTemplate.maintenanceCycle', 'Maintenance Cycle')} rules={[{ required: true }]}>
                      <Select placeholder={t('pmTemplate.selectCycle', 'Select cycle')}>
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
                    <Form.Item name="estimated_hours" label={t('pmTemplate.estimatedHours', 'Estimated Hours')} initialValue={4}>
                      <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  {isEdit && (
                    <Col span={12}>
                      <Form.Item name="is_active" label={t('common.active', 'Active')} valuePropName="checked" initialValue={true}>
                        <Switch />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
                <Form.Item name="description" label={t('common.description', 'Description')}>
                  <Input.TextArea rows={2} placeholder={t('pmTemplate.descriptionPlaceholder', 'Description of this template...')} />
                </Form.Item>
              </>
            ),
          },
          {
            key: 'checklist',
            label: (
              <span>
                <CheckSquareOutlined /> {t('pmTemplate.checklist', 'Checklist')} ({checklistItems.length})
              </span>
            ),
            children: (
              <>
                <Alert
                  message={
                    <Space>
                      <RobotOutlined />
                      <span>{t('pmTemplate.aiAssist', 'AI Assist')}</span>
                    </Space>
                  }
                  description={t('pmTemplate.aiAssistDesc', 'Generate smart checklist items based on equipment type and industry best practices.')}
                  type="info"
                  showIcon={false}
                  action={
                    <Button
                      type="primary"
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={isGeneratingAI}
                      onClick={handleGenerateAIChecklist}
                    >
                      {t('pmTemplate.generateAI', 'Generate')}
                    </Button>
                  }
                  style={{ marginBottom: 16 }}
                />

                {checklistItems.length === 0 ? (
                  <Empty description={t('pmTemplate.noChecklistItems', 'No checklist items')} />
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
                        <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                          <Input
                            placeholder={t('pmTemplate.checkItemPlaceholder', 'Check item text...')}
                            value={item.question_text}
                            onChange={(e) => updateChecklistItem(index, { question_text: e.target.value })}
                            style={{ flex: 1, minWidth: 200 }}
                          />
                          <Select
                            value={item.answer_type}
                            onChange={(val) => updateChecklistItem(index, { answer_type: val })}
                            style={{ width: 110 }}
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
                            placeholder={t('pmTemplate.category', 'Category')}
                            allowClear
                            style={{ width: 110 }}
                          >
                            {CATEGORIES.map((cat) => (
                              <Select.Option key={cat.value} value={cat.value}>
                                {cat.label}
                              </Select.Option>
                            ))}
                          </Select>
                          <Checkbox
                            checked={item.is_required}
                            onChange={(e) => updateChecklistItem(index, { is_required: e.target.checked })}
                          >
                            {t('pmTemplate.required', 'Required')}
                          </Checkbox>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addChecklistItem} style={{ marginTop: 8 }}>
                  {t('pmTemplate.addChecklistItem', 'Add Checklist Item')}
                </Button>
              </>
            ),
          },
          {
            key: 'materials',
            label: (
              <span>
                <ToolOutlined /> {t('pmTemplate.materials', 'Materials')} ({templateMaterials.length})
              </span>
            ),
            children: (
              <>
                {templateMaterials.length === 0 ? (
                  <Empty description={t('pmTemplate.noMaterials', 'No required materials')} />
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
                            placeholder={t('pmTemplate.selectMaterial', 'Select material')}
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
                            addonAfter={t('pmTemplate.qty', 'qty')}
                          />
                        </div>
                      </List.Item>
                    )}
                  />
                )}
                <Button type="dashed" icon={<PlusOutlined />} onClick={addMaterial} style={{ marginTop: 8 }}>
                  {t('pmTemplate.addMaterial', 'Add Material')}
                </Button>
              </>
            ),
          },
        ]}
      />
    </Form>
  );

  // Row selection config
  const rowSelection = {
    selectedRowKeys: selectedRows,
    onChange: (keys: React.Key[]) => setSelectedRows(keys as number[]),
  };

  // Bulk actions menu
  const bulkActionsMenu = {
    items: [
      {
        key: 'delete',
        label: t('common.delete', 'Delete'),
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: t('pmTemplate.bulkDeleteConfirm', 'Delete selected templates?'),
            content: t('pmTemplate.bulkDeleteContent', `This will delete ${selectedRows.length} templates. This action cannot be undone.`),
            okText: t('common.delete', 'Delete'),
            okButtonProps: { danger: true },
            onOk: () => bulkDeleteMutation.mutate(selectedRows),
          });
        },
      },
      {
        key: 'export',
        label: t('common.export', 'Export'),
        icon: <ExportOutlined />,
        onClick: () => {
          message.info(t('pmTemplate.exportStarted', 'Export started...'));
        },
      },
    ],
  };

  return (
    <div>
      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title={t('pmTemplate.totalTemplates', 'Total Templates')}
            value={templateStats.total}
            icon={<UnorderedListOutlined />}
            size="small"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title={t('pmTemplate.activeTemplates', 'Active')}
            value={templateStats.active}
            icon={<CheckCircleOutlined />}
            progress={(templateStats.active / Math.max(templateStats.total, 1)) * 100}
            progressColor="#52c41a"
            size="small"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title={t('pmTemplate.avgChecklist', 'Avg Checklist Items')}
            value={templateStats.avgChecklistItems}
            icon={<CheckSquareOutlined />}
            size="small"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title={t('pmTemplate.avgMaterials', 'Avg Materials')}
            value={templateStats.avgMaterials}
            icon={<ToolOutlined />}
            size="small"
          />
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={18}>
          <Card>
            <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
              <Col>
                <Title level={3} style={{ margin: 0 }}>
                  <UnorderedListOutlined /> {t('pmTemplate.title', 'PM Templates')}
                </Title>
                <Text type="secondary">{t('pmTemplate.subtitle', 'Create templates for preventive maintenance tasks with checklists and materials')}</Text>
              </Col>
              <Col>
                <Space>
                  {selectedRows.length > 0 && (
                    <Dropdown menu={bulkActionsMenu}>
                      <Button>
                        {t('pmTemplate.bulkActions', 'Bulk Actions')} ({selectedRows.length}) <DownOutlined />
                      </Button>
                    </Dropdown>
                  )}
                  <Button
                    icon={<RobotOutlined />}
                    onClick={() => setAiModalOpen(true)}
                  >
                    {t('pmTemplate.aiGenerate', 'AI Generate')}
                  </Button>
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
                    {t('pmTemplate.newTemplate', 'New Template')}
                  </Button>
                </Space>
              </Col>
            </Row>

            {/* Filters */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Select
                  placeholder={t('pmTemplate.filterByEquipment', 'Filter by equipment type')}
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
                  placeholder={t('pmTemplate.filterByCycle', 'Filter by cycle')}
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
              rowSelection={rowSelection}
              pagination={{ pageSize: 10, showTotal: (t) => `${t} ${t === 1 ? 'template' : 'templates'}` }}
            />
          </Card>
        </Col>

        {/* AI Insights Panel */}
        <Col xs={24} lg={6}>
          <AIInsightsPanel
            title={t('pmTemplate.aiInsights', 'Template Insights')}
            insights={templateInsights}
            compact
          />
        </Col>
      </Row>

      {/* Create Modal */}
      <Modal
        title={t('pmTemplate.createTemplate', 'Create PM Template')}
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
        title={t('pmTemplate.editTemplate', 'Edit PM Template')}
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
        title={t('pmTemplate.cloneTemplate', 'Clone PM Template')}
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
          <Form.Item name="cycle_id" label={t('pmTemplate.newCycle', 'New Cycle')} rules={[{ required: true, message: t('pmTemplate.selectCycleRequired', 'Select the target cycle') }]}>
            <Select placeholder={t('pmTemplate.selectCycleForClone', 'Select cycle for clone')}>
              {cycles.map((cycle) => (
                <Select.Option key={cycle.id} value={cycle.id}>
                  <Tag color={cycle.cycle_type === 'running_hours' ? 'orange' : 'green'}>{cycle.display_label}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="name" label={t('pmTemplate.newName', 'New Name (optional)')}>
            <Input placeholder={t('pmTemplate.leaveEmptyAutoGenerate', 'Leave empty to auto-generate')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI Generator Modal */}
      <Modal
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('pmTemplate.aiGenerator', 'AI Template Generator')}
          </Space>
        }
        open={aiModalOpen}
        onCancel={() => setAiModalOpen(false)}
        footer={null}
        width={600}
      >
        <Alert
          message={t('pmTemplate.aiGeneratorInfo', 'Smart Template Generation')}
          description={t('pmTemplate.aiGeneratorDesc', 'AI will analyze your equipment type and generate optimized checklist items based on industry standards and best practices.')}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={aiForm} layout="vertical">
          <Form.Item
            name="equipment_type"
            label={t('pmTemplate.equipmentType', 'Equipment Type')}
            rules={[{ required: true }]}
          >
            <Select placeholder={t('pmTemplate.selectEquipment', 'Select equipment type')}>
              {EQUIPMENT_TYPES.map((type) => (
                <Select.Option key={type} value={type}>
                  {type}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="cycle_id"
            label={t('pmTemplate.maintenanceCycle', 'Maintenance Cycle')}
          >
            <Select placeholder={t('pmTemplate.selectCycle', 'Select cycle')} allowClear>
              {cycles.map((cycle) => (
                <Select.Option key={cycle.id} value={cycle.id}>
                  <Tag color={cycle.cycle_type === 'running_hours' ? 'orange' : 'green'}>
                    {cycle.display_label}
                  </Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            block
            size="large"
            loading={isGeneratingAI}
            onClick={() => {
              const values = aiForm.getFieldsValue();
              if (values.equipment_type) {
                form.setFieldsValue({
                  equipment_type: values.equipment_type,
                  cycle_id: values.cycle_id,
                  name: `${values.equipment_type} PM Template`,
                });
                handleGenerateAIChecklist();
                setAiModalOpen(false);
                setCreateModalOpen(true);
              } else {
                message.warning(t('pmTemplate.selectEquipmentFirst', 'Please select an equipment type first'));
              }
            }}
          >
            {t('pmTemplate.generateTemplate', 'Generate Template')}
          </Button>
        </Form>
      </Modal>

      {/* Analytics Drawer */}
      <Drawer
        title={
          <Space>
            <BarChartOutlined />
            {t('pmTemplate.templateAnalytics', 'Template Analytics')}
          </Space>
        }
        open={analyticsDrawerOpen}
        onClose={() => {
          setAnalyticsDrawerOpen(false);
          setViewingTemplateId(null);
        }}
        width={500}
      >
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Statistic title={t('pmTemplate.timesUsed', 'Times Used')} value={45} />
          </Col>
          <Col span={12}>
            <Statistic title={t('pmTemplate.avgCompletionTime', 'Avg Completion')} value="3.5h" />
          </Col>
          <Col span={12}>
            <Statistic title={t('pmTemplate.completionRate', 'Completion Rate')} value={94} suffix="%" />
          </Col>
          <Col span={12}>
            <Statistic title={t('pmTemplate.issuesFound', 'Issues Found')} value={12} />
          </Col>
        </Row>

        <Divider>{t('pmTemplate.usageTrend', 'Usage Trend')}</Divider>

        <PerformanceChart
          data={[
            { name: 'Jan', value: 8 },
            { name: 'Feb', value: 12 },
            { name: 'Mar', value: 10 },
            { name: 'Apr', value: 15 },
            { name: 'May', value: 18 },
          ]}
          type="area"
          height={200}
          colors={['#1890ff']}
        />

        <Divider>{t('pmTemplate.commonIssues', 'Common Issues')}</Divider>

        <List
          size="small"
          dataSource={[
            { issue: 'Bearing wear detected', count: 5 },
            { issue: 'Oil level low', count: 3 },
            { issue: 'Seal leakage', count: 2 },
          ]}
          renderItem={(item) => (
            <List.Item>
              <Space>
                <WarningOutlined style={{ color: '#faad14' }} />
                {item.issue}
              </Space>
              <Badge count={item.count} />
            </List.Item>
          )}
        />
      </Drawer>

      {/* Version History Drawer */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined />
            {t('pmTemplate.versionHistory', 'Version History')}
          </Space>
        }
        open={historyDrawerOpen}
        onClose={() => {
          setHistoryDrawerOpen(false);
          setViewingTemplateId(null);
        }}
        width={450}
      >
        <Timeline
          items={versionHistory.map((v) => ({
            color: v.version === '1.3' ? 'green' : 'gray',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong>v{v.version}</Text>
                  <Text type="secondary">{v.date}</Text>
                </div>
                <div>
                  <Text type="secondary">{v.author}</Text>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text>{v.changes}</Text>
                </div>
                {v.version !== '1.0' && (
                  <Button type="link" size="small" style={{ padding: 0, marginTop: 4 }}>
                    {t('pmTemplate.viewDiff', 'View Diff')}
                  </Button>
                )}
              </div>
            ),
          }))}
        />

        <Divider />

        <Button type="dashed" block icon={<HistoryOutlined />}>
          {t('pmTemplate.restoreVersion', 'Restore Previous Version')}
        </Button>
      </Drawer>
    </div>
  );
}
