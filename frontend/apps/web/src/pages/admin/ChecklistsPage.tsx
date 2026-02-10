import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  message,
  Typography,
  Row,
  Col,
  Upload,
  Tooltip,
  Statistic,
  Progress,
  Badge,
  Drawer,
  Tabs,
  List,
  Spin,
  Empty,
  Alert,
  Popconfirm,
  Collapse,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
  CopyOutlined,
  RobotOutlined,
  BarChartOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
  DragOutlined,
  OrderedListOutlined,
  PieChartOutlined,
  FileTextOutlined,
  SafetyOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  checklistsApi,
  type ChecklistTemplate,
  type ChecklistItem,
  type ChecklistCreateTemplatePayload as CreateTemplatePayload,
  type CreateChecklistItemPayload,
  type UpdateChecklistItemPayload,
  type ChecklistStats,
  type TemplateAnalytics,
  type AISuggestion,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text, Title } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

const EQUIPMENT_TYPES = ['pump', 'crane', 'generator', 'compressor', 'conveyor', 'motor', 'valve', 'hvac'];

// Sortable Item Row Component
function SortableItemRow({ item, template, onEdit, onDelete }: {
  item: ChecklistItem;
  template: ChecklistTemplate;
  onEdit: (template: ChecklistTemplate, item: ChecklistItem) => void;
  onDelete: (templateId: number, itemId: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? '#f0f0f0' : 'white',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
        <span {...listeners} style={{ cursor: 'grab', marginRight: 12, color: '#999' }}>
          <DragOutlined />
        </span>
        <Tag color="purple" style={{ marginRight: 8 }}>{item.item_code || `#${item.order_index}`}</Tag>
        <span style={{ flex: 1 }}>{item.question_text}</span>
        <Space>
          <Tag>{item.answer_type?.replace('_', ' ')}</Tag>
          {item.category && (
            <Tag color={item.category === 'mechanical' ? 'blue' : 'gold'}>{item.category.slice(0, 4).toUpperCase()}</Tag>
          )}
          {item.critical_failure && <Tag color="red">CRITICAL</Tag>}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(template, item)} />
          <Popconfirm title="Delete this item?" onConfirm={() => onDelete(template.id, item.id)} okText="Yes" cancelText="No">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>
    </div>
  );
}

export default function ChecklistsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Table state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState<string | undefined>();

  // Modal states
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  // Enhanced feature states
  const [showStats, setShowStats] = useState(true);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [analyticsDrawerOpen, setAnalyticsDrawerOpen] = useState(false);
  const [suggestionsDrawerOpen, setSuggestionsDrawerOpen] = useState(false);
  const [reorderModeTemplate, setReorderModeTemplate] = useState<ChecklistTemplate | null>(null);

  const [templateForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [editItemForm] = Form.useForm();
  const [aiForm] = Form.useForm();
  const [cloneForm] = Form.useForm();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch templates
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['checklists', page, perPage],
    queryFn: () => checklistsApi.listTemplates({ page, per_page: perPage }),
  });

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['checklists', 'stats'],
    queryFn: () => checklistsApi.getStats().then((r) => r.data?.data),
    staleTime: 60000,
  });

  // Search
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['checklists', 'search', searchQuery, equipmentFilter],
    queryFn: () => checklistsApi.search({
      q: searchQuery || undefined,
      equipment_type: equipmentFilter,
    }).then((r) => r.data),
    enabled: !!(searchQuery || equipmentFilter),
  });

  // Template analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['checklists', selectedTemplate?.id, 'analytics'],
    queryFn: () => checklistsApi.getTemplateAnalytics(selectedTemplate!.id).then((r) => r.data?.data),
    enabled: analyticsDrawerOpen && !!selectedTemplate,
  });

  // AI Suggestions
  const { data: suggestionsData, isLoading: suggestionsLoading, refetch: refetchSuggestions } = useQuery({
    queryKey: ['checklists', selectedTemplate?.id, 'suggestions'],
    queryFn: () => checklistsApi.aiSuggestItems({
      equipment_type: selectedTemplate?.equipment_type || '',
      existing_items: (selectedTemplate?.items || []).map((i) => i.question_text),
    }).then((r) => r.data?.data),
    enabled: suggestionsDrawerOpen && !!selectedTemplate,
  });

  // Mutations
  const createTemplateMutation = useMutation({
    mutationFn: (payload: CreateTemplatePayload) => checklistsApi.createTemplate(payload),
    onSuccess: () => {
      message.success(t('checklists.templateCreated', 'Template created successfully'));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setCreateTemplateOpen(false);
      templateForm.resetFields();
    },
    onError: () => message.error(t('checklists.templateCreateError', 'Failed to create template')),
  });

  const addItemMutation = useMutation({
    mutationFn: ({ templateId, payload }: { templateId: number; payload: CreateChecklistItemPayload }) =>
      checklistsApi.addItem(templateId, payload),
    onSuccess: () => {
      message.success(t('checklists.itemAdded', 'Item added successfully'));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setAddItemOpen(false);
      itemForm.resetFields();
    },
    onError: () => message.error(t('checklists.itemAddError', 'Failed to add item')),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      templateId,
      itemId,
      payload,
    }: {
      templateId: number;
      itemId: number;
      payload: UpdateChecklistItemPayload;
    }) => checklistsApi.updateItem(templateId, itemId, payload),
    onSuccess: () => {
      message.success(t('checklists.itemUpdated', 'Item updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setEditItemOpen(false);
      setEditingItem(null);
      editItemForm.resetFields();
    },
    onError: () => message.error(t('checklists.itemUpdateError', 'Failed to update item')),
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ templateId, itemId }: { templateId: number; itemId: number }) =>
      checklistsApi.deleteItem(templateId, itemId),
    onSuccess: () => {
      message.success(t('checklists.itemDeleted', 'Item deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
    onError: () => message.error(t('checklists.itemDeleteError', 'Failed to delete item')),
  });

  const cloneMutation = useMutation({
    mutationFn: ({ templateId, options }: { templateId: number; options?: { name?: string; equipment_type?: string } }) =>
      checklistsApi.cloneTemplate(templateId, options),
    onSuccess: () => {
      message.success(t('checklists.cloneSuccess', 'Template cloned successfully'));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setCloneModalOpen(false);
      setSelectedTemplate(null);
      cloneForm.resetFields();
    },
    onError: () => message.error(t('checklists.cloneError', 'Failed to clone template')),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: (payload: { equipment_type: string; description?: string; include_electrical?: boolean; include_mechanical?: boolean }) =>
      checklistsApi.aiGenerate(payload),
    onSuccess: (res) => {
      const count = (res.data as any)?.items_count || 0;
      message.success(t('checklists.aiGenerateSuccess', `AI generated checklist with ${count} items`));
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setAiGeneratorOpen(false);
      aiForm.resetFields();
    },
    onError: () => message.error(t('checklists.aiGenerateError', 'AI generation failed')),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ templateId, itemOrders }: { templateId: number; itemOrders: Array<{ id: number; order_index: number }> }) =>
      checklistsApi.reorderItems(templateId, itemOrders),
    onSuccess: () => {
      message.success('Items reordered');
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
    onError: () => message.error('Failed to reorder items'),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => checklistsApi.import(file),
    onSuccess: (res) => {
      const itemsCount = res.data?.data?.items_count || 0;
      message.success(`Template imported successfully with ${itemsCount} items`);
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to import template');
    },
  });

  const handleDownloadTemplate = async () => {
    try {
      const response = await checklistsApi.downloadTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'checklist_import_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      message.error(t('checklists.downloadError', 'Failed to download template'));
    }
  };

  const handleImportFile = (file: File) => {
    importMutation.mutate(file);
    return false;
  };

  const openAddItem = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    itemForm.resetFields();
    setAddItemOpen(true);
  };

  const openEditItem = (template: ChecklistTemplate, item: ChecklistItem) => {
    setSelectedTemplate(template);
    setEditingItem(item);
    editItemForm.setFieldsValue({
      question_text: item.question_text,
      question_text_ar: item.question_text_ar,
      answer_type: item.answer_type,
      category: item.category,
      critical_failure: item.critical_failure,
    });
    setEditItemOpen(true);
  };

  const openClone = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    cloneForm.setFieldsValue({
      name: `${template.name} (Copy)`,
      equipment_type: template.equipment_type,
    });
    setCloneModalOpen(true);
  };

  const openAnalytics = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    setAnalyticsDrawerOpen(true);
  };

  const openSuggestions = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    setSuggestionsDrawerOpen(true);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !reorderModeTemplate) return;

    const items = reorderModeTemplate.items || [];
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(items, oldIndex, newIndex);
      const itemOrders = newItems.map((item, idx) => ({
        id: item.id,
        order_index: idx + 1,
      }));
      reorderMutation.mutate({ templateId: reorderModeTemplate.id, itemOrders });
    }
  }, [reorderModeTemplate, reorderMutation]);

  const addSuggestedItem = (suggestion: AISuggestion) => {
    if (selectedTemplate) {
      addItemMutation.mutate({
        templateId: selectedTemplate.id,
        payload: {
          question_text: suggestion.question_text,
          question_text_ar: suggestion.question_text_ar,
          answer_type: suggestion.answer_type as any,
          category: suggestion.category,
          critical_failure: suggestion.critical_failure,
        },
      });
    }
  };

  // Use search results if searching, otherwise use paginated data
  const displayTemplates = useMemo(() => {
    if (searchQuery || equipmentFilter) {
      return searchData?.templates || [];
    }
    return data?.data?.data || [];
  }, [searchQuery, equipmentFilter, searchData, data]);

  const pagination = data?.data?.pagination;

  const templateColumns: ColumnsType<ChecklistTemplate> = [
    {
      title: t('checklists.title', 'Title'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ChecklistTemplate) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.equipment_type && (
            <Tag color="blue">{record.equipment_type.toUpperCase()}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: t('checklists.function', 'Function'),
      dataIndex: 'function',
      key: 'function',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('checklists.assembly', 'Assembly'),
      dataIndex: 'assembly',
      key: 'assembly',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('checklists.items', 'Items'),
      key: 'items_count',
      width: 80,
      render: (_: unknown, record: ChecklistTemplate) => (
        <Badge count={record.items?.length || 0} style={{ backgroundColor: '#1890ff' }} />
      ),
    },
    {
      title: 'Coverage',
      key: 'coverage',
      width: 150,
      render: (_: unknown, record: ChecklistTemplate) => {
        const items = record.items || [];
        const mech = items.filter((i) => i.category === 'mechanical').length;
        const elec = items.filter((i) => i.category === 'electrical').length;
        const critical = items.filter((i) => i.critical_failure).length;
        const total = items.length || 1;
        return (
          <Space size={4}>
            <Tooltip title={`Mechanical: ${mech}`}>
              <Tag color="blue">{Math.round((mech / total) * 100)}%M</Tag>
            </Tooltip>
            <Tooltip title={`Electrical: ${elec}`}>
              <Tag color="gold">{Math.round((elec / total) * 100)}%E</Tag>
            </Tooltip>
            <Tooltip title={`Critical: ${critical}`}>
              <Tag color="red">{critical}C</Tag>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: t('checklists.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: ChecklistTemplate) => (
        <Space wrap size={4}>
          <Tooltip title="Add Item">
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openAddItem(record)} />
          </Tooltip>
          <Tooltip title="Clone">
            <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => openClone(record)} />
          </Tooltip>
          <Tooltip title="Analytics">
            <Button type="link" size="small" icon={<BarChartOutlined />} onClick={() => openAnalytics(record)} />
          </Tooltip>
          <Tooltip title="AI Suggestions">
            <Button type="link" size="small" icon={<BulbOutlined />} onClick={() => openSuggestions(record)} />
          </Tooltip>
          <Tooltip title="Reorder Items">
            <Button
              type="link"
              size="small"
              icon={<OrderedListOutlined />}
              onClick={() => setReorderModeTemplate(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* Stats Dashboard */}
      {showStats && statsData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><FileTextOutlined /> Templates</>}
                value={statsData.total_templates}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><CheckCircleOutlined /> Active</>}
                value={statsData.active_templates}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><SettingOutlined /> Total Items</>}
                value={statsData.total_items}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><ExclamationCircleOutlined /> Critical</>}
                value={statsData.critical_items}
                valueStyle={{ color: '#ff4d4f' }}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>({statsData.critical_ratio}%)</Text>}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" title={<><PieChartOutlined /> Category Balance</>}>
              <Space>
                <Tag color="blue">Mechanical: {statsData.by_category?.mechanical || 0}</Tag>
                <Tag color="gold">Electrical: {statsData.by_category?.electrical || 0}</Tag>
                <Tag>Other: {statsData.by_category?.uncategorized || 0}</Tag>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title={<Title level={4}><SafetyOutlined /> {t('nav.checklists', 'Checklists Management')}</Title>}
        extra={
          <Space wrap>
            <Tooltip title="Toggle Stats">
              <Button
                type={showStats ? 'primary' : 'default'}
                icon={<BarChartOutlined />}
                onClick={() => setShowStats(!showStats)}
              />
            </Tooltip>
            <Button icon={<RobotOutlined />} onClick={() => setAiGeneratorOpen(true)}>
              AI Generate
            </Button>
            <Tooltip title="Download import template">
              <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                Template
              </Button>
            </Tooltip>
            <Upload
              accept=".xlsx,.xls"
              showUploadList={false}
              beforeUpload={handleImportFile}
            >
              <Button icon={<UploadOutlined />} loading={importMutation.isPending}>
                Import
              </Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateTemplateOpen(true)}>
              Create
            </Button>
          </Space>
        }
      >
        {/* Search & Filters */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Search templates or items..."
              prefix={<SearchOutlined />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Equipment Type"
              value={equipmentFilter}
              onChange={setEquipmentFilter}
              allowClear
              style={{ width: '100%' }}
            >
              {EQUIPMENT_TYPES.map((t) => (
                <Select.Option key={t} value={t}>{t.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
          </Col>
        </Row>

        {/* Search Results Info */}
        {(searchQuery || equipmentFilter) && searchData && (
          <Alert
            style={{ marginBottom: 16 }}
            message={`Found ${searchData.total_templates} templates and ${searchData.total_items} matching items`}
            type="info"
            showIcon
            closable
            onClose={() => { setSearchQuery(''); setEquipmentFilter(undefined); }}
          />
        )}

        <Table
          rowKey="id"
          columns={templateColumns}
          dataSource={displayTemplates}
          loading={isLoading || searchLoading}
          locale={{ emptyText: isError ? 'Error loading data' : 'No templates' }}
          pagination={!searchQuery && !equipmentFilter ? {
            current: pagination?.page || page,
            pageSize: pagination?.per_page || perPage,
            total: pagination?.total || 0,
            showSizeChanger: true,
            onChange: (p, ps) => { setPage(p); setPerPage(ps); },
          } : false}
          expandable={{
            expandedRowRender: (record: ChecklistTemplate) => (
              <Table
                rowKey="id"
                columns={[
                  { title: '#', dataIndex: 'order_index', key: 'order_index', width: 50 },
                  { title: 'Code', dataIndex: 'item_code', key: 'item_code', width: 100, render: (v: string | null) => v ? <Tag color="purple">{v}</Tag> : '-' },
                  { title: 'Question', dataIndex: 'question_text', key: 'question_text' },
                  { title: 'Type', dataIndex: 'answer_type', key: 'answer_type', width: 100, render: (v: string) => <Tag>{v?.replace('_', ' ')}</Tag> },
                  { title: 'Category', dataIndex: 'category', key: 'category', width: 100, render: (v: string | null) => v ? <Tag color={v === 'mechanical' ? 'blue' : 'gold'}>{v.toUpperCase()}</Tag> : '-' },
                  { title: 'Critical', dataIndex: 'critical_failure', key: 'critical_failure', width: 80, render: (v: boolean) => v ? <Tag color="red">YES</Tag> : <Tag>No</Tag> },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 100,
                    render: (_: unknown, item: ChecklistItem) => (
                      <Space>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditItem(record, item)} />
                        <Popconfirm
                          title="Delete this item?"
                          onConfirm={() => deleteItemMutation.mutate({ templateId: record.id, itemId: item.id })}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
                dataSource={record.items || []}
                pagination={false}
                size="small"
              />
            ),
            rowExpandable: () => true,
          }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>

      {/* AI Generator Modal */}
      <Modal
        title={<><RobotOutlined /> AI Checklist Generator</>}
        open={aiGeneratorOpen}
        onCancel={() => { setAiGeneratorOpen(false); aiForm.resetFields(); }}
        onOk={() => aiForm.submit()}
        confirmLoading={aiGenerateMutation.isPending}
        width={500}
      >
        <Alert
          style={{ marginBottom: 16 }}
          message="AI will generate inspection checklist items based on equipment type"
          type="info"
          showIcon
        />
        <Form
          form={aiForm}
          layout="vertical"
          onFinish={(values) => aiGenerateMutation.mutate(values)}
          initialValues={{ include_electrical: true, include_mechanical: true }}
        >
          <Form.Item name="equipment_type" label="Equipment Type" rules={[{ required: true }]}>
            <Select placeholder="Select equipment type">
              {EQUIPMENT_TYPES.map((t) => (
                <Select.Option key={t} value={t}>{t.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input placeholder="e.g., Centrifugal pump for water circulation" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="include_mechanical" valuePropName="checked">
                <Switch /> Include Mechanical Items
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="include_electrical" valuePropName="checked">
                <Switch /> Include Electrical Items
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Clone Modal */}
      <Modal
        title={<><CopyOutlined /> Clone Template</>}
        open={cloneModalOpen}
        onCancel={() => { setCloneModalOpen(false); cloneForm.resetFields(); setSelectedTemplate(null); }}
        onOk={() => {
          const values = cloneForm.getFieldsValue();
          if (selectedTemplate) {
            cloneMutation.mutate({ templateId: selectedTemplate.id, options: values });
          }
        }}
        confirmLoading={cloneMutation.isPending}
      >
        <Form form={cloneForm} layout="vertical">
          <Form.Item name="name" label="New Template Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="equipment_type" label="Equipment Type">
            <Select allowClear>
              {EQUIPMENT_TYPES.map((t) => (
                <Select.Option key={t} value={t}>{t.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Analytics Drawer */}
      <Drawer
        title={<><BarChartOutlined /> Template Analytics</>}
        open={analyticsDrawerOpen}
        onClose={() => { setAnalyticsDrawerOpen(false); setSelectedTemplate(null); }}
        width={500}
      >
        {analyticsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : analyticsData ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Card size="small" title={selectedTemplate?.name}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="Items" value={analyticsData.item_count} />
                </Col>
                <Col span={8}>
                  <Statistic title="Critical" value={analyticsData.critical_count} valueStyle={{ color: '#ff4d4f' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Defect Rate" value={analyticsData.defect_rate} suffix="x" />
                </Col>
              </Row>
            </Card>

            <Card size="small" title="Usage Statistics">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="Total Uses" value={analyticsData.usage.total} />
                </Col>
                <Col span={8}>
                  <Statistic title="Completed" value={analyticsData.usage.completed} valueStyle={{ color: '#52c41a' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Last 30 Days" value={analyticsData.usage.recent_30_days} />
                </Col>
              </Row>
              <Progress percent={analyticsData.usage.completion_rate} status="active" style={{ marginTop: 16 }} />
            </Card>

            <Card size="small" title="Coverage Analysis">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text>Mechanical: {analyticsData.coverage.mechanical_ratio}%</Text>
                  <Progress percent={analyticsData.coverage.mechanical_ratio} strokeColor="#1890ff" size="small" />
                </div>
                <div>
                  <Text>Electrical: {analyticsData.coverage.electrical_ratio}%</Text>
                  <Progress percent={analyticsData.coverage.electrical_ratio} strokeColor="#faad14" size="small" />
                </div>
                <div>
                  <Text>Critical: {analyticsData.coverage.critical_ratio}%</Text>
                  <Progress percent={analyticsData.coverage.critical_ratio} strokeColor="#ff4d4f" size="small" />
                </div>
                <Divider />
                <Statistic
                  title="Balance Score"
                  value={analyticsData.coverage.balance_score}
                  suffix="%"
                  valueStyle={{ color: analyticsData.coverage.balance_score > 70 ? '#52c41a' : '#faad14' }}
                />
              </Space>
            </Card>
          </Space>
        ) : (
          <Empty description="No analytics data" />
        )}
      </Drawer>

      {/* AI Suggestions Drawer */}
      <Drawer
        title={<><BulbOutlined /> AI Item Suggestions</>}
        open={suggestionsDrawerOpen}
        onClose={() => { setSuggestionsDrawerOpen(false); setSelectedTemplate(null); }}
        width={500}
      >
        {suggestionsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : suggestionsData?.suggestions ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              message={`${suggestionsData.suggestions.length} suggestions based on ${selectedTemplate?.equipment_type || 'equipment type'}`}
              type="info"
              showIcon
              action={<Button size="small" onClick={() => refetchSuggestions()}>Refresh</Button>}
            />
            <List
              size="small"
              dataSource={suggestionsData.suggestions}
              renderItem={(suggestion: AISuggestion) => (
                <List.Item
                  actions={[
                    <Button
                      key="add"
                      type="primary"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => addSuggestedItem(suggestion)}
                      loading={addItemMutation.isPending}
                    >
                      Add
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Tag color={suggestion.category === 'mechanical' ? 'blue' : 'gold'}>
                          {suggestion.category.toUpperCase()}
                        </Tag>
                        {suggestion.question_text}
                      </Space>
                    }
                    description={suggestion.question_text_ar}
                  />
                </List.Item>
              )}
            />
          </Space>
        ) : (
          <Empty description="No suggestions available" />
        )}
      </Drawer>

      {/* Reorder Modal */}
      <Modal
        title={<><OrderedListOutlined /> Reorder Items: {reorderModeTemplate?.name}</>}
        open={!!reorderModeTemplate}
        onCancel={() => setReorderModeTemplate(null)}
        footer={[<Button key="done" type="primary" onClick={() => setReorderModeTemplate(null)}>Done</Button>]}
        width={700}
      >
        {reorderModeTemplate && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={(reorderModeTemplate.items || []).map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {(reorderModeTemplate.items || [])
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((item) => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      template={reorderModeTemplate}
                      onEdit={openEditItem}
                      onDelete={(tid, iid) => deleteItemMutation.mutate({ templateId: tid, itemId: iid })}
                    />
                  ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Modal>

      {/* Create Template Modal */}
      <Modal
        title={t('checklists.createTemplate', 'Create Template')}
        open={createTemplateOpen}
        onCancel={() => { setCreateTemplateOpen(false); templateForm.resetFields(); }}
        onOk={() => templateForm.submit()}
        confirmLoading={createTemplateMutation.isPending}
        destroyOnClose
      >
        <Form form={templateForm} layout="vertical" onFinish={(v: CreateTemplatePayload) => createTemplateMutation.mutate(v)}>
          <Form.Item name="name" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_ar" label="Title (Arabic)">
            <Input dir="rtl" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="function" label="Function" rules={[{ required: true }]}>
                <Input placeholder="e.g. Pumping, Cooling" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assembly" label="Assembly" rules={[{ required: true }]}>
                <Input placeholder="e.g. Motor Assembly" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="part" label="Part">
            <Input placeholder="e.g. Impeller, Bearing (optional)" />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <VoiceTextArea rows={3} placeholder="What this checklist covers" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="version" label="Version" rules={[{ required: true }]} initialValue="1.0">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_active" label="Active" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Add Item Modal */}
      <Modal
        title={t('checklists.addItem', 'Add Checklist Item')}
        open={addItemOpen}
        onCancel={() => { setAddItemOpen(false); itemForm.resetFields(); }}
        onOk={() => itemForm.submit()}
        confirmLoading={addItemMutation.isPending}
        destroyOnClose
      >
        <Form
          form={itemForm}
          layout="vertical"
          onFinish={(v: CreateChecklistItemPayload) =>
            selectedTemplate && addItemMutation.mutate({ templateId: selectedTemplate.id, payload: v })
          }
        >
          <Form.Item name="question_text" label="Question" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="question_text_ar" label="Question (Arabic)">
            <Input dir="rtl" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="answer_type" label="Answer Type" rules={[{ required: true }]}>
                <Select>
                  <Select.Option value="pass_fail">Pass / Fail</Select.Option>
                  <Select.Option value="yes_no">Yes / No</Select.Option>
                  <Select.Option value="numeric">Numeric</Select.Option>
                  <Select.Option value="text">Text</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear>
                  <Select.Option value="mechanical">Mechanical</Select.Option>
                  <Select.Option value="electrical">Electrical</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="critical_failure" valuePropName="checked" initialValue={false}>
            <Switch /> Critical Failure Item
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        title={t('checklists.editItem', 'Edit Checklist Item')}
        open={editItemOpen}
        onCancel={() => { setEditItemOpen(false); setEditingItem(null); editItemForm.resetFields(); }}
        onOk={() => editItemForm.submit()}
        confirmLoading={updateItemMutation.isPending}
        destroyOnClose
      >
        <Form
          form={editItemForm}
          layout="vertical"
          onFinish={(v: UpdateChecklistItemPayload) =>
            selectedTemplate &&
            editingItem &&
            updateItemMutation.mutate({ templateId: selectedTemplate.id, itemId: editingItem.id, payload: v })
          }
        >
          <Form.Item name="question_text" label="Question">
            <Input />
          </Form.Item>
          <Form.Item name="question_text_ar" label="Question (Arabic)">
            <Input dir="rtl" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="answer_type" label="Answer Type">
                <Select>
                  <Select.Option value="pass_fail">Pass / Fail</Select.Option>
                  <Select.Option value="yes_no">Yes / No</Select.Option>
                  <Select.Option value="numeric">Numeric</Select.Option>
                  <Select.Option value="text">Text</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear>
                  <Select.Option value="mechanical">Mechanical</Select.Option>
                  <Select.Option value="electrical">Electrical</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="critical_failure" valuePropName="checked">
            <Switch /> Critical Failure Item
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
