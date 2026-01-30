import { useState } from 'react';
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
  Popconfirm,
  message,
  Typography,
  InputNumber,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  checklistsApi,
  type ChecklistTemplate,
  type ChecklistItem,
  type CreateTemplatePayload,
  type CreateChecklistItemPayload,
  type UpdateChecklistItemPayload,
} from '@inspection/shared';

export default function ChecklistsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  const [templateForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [editItemForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['checklists', page, perPage],
    queryFn: () => checklistsApi.listTemplates({ page, per_page: perPage }),
  });

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
      is_critical: item.is_critical,
      order: item.order,
    });
    setEditItemOpen(true);
  };

  const itemColumns: ColumnsType<ChecklistItem> = [
    { title: t('checklists.order', 'Order'), dataIndex: 'order', key: 'order', width: 70 },
    { title: t('checklists.question', 'Question'), dataIndex: 'question_text', key: 'question_text' },
    { title: t('checklists.questionAr', 'Question (AR)'), dataIndex: 'question_text_ar', key: 'question_text_ar', render: (v: string | null) => v || '-' },
    {
      title: t('checklists.answerType', 'Answer Type'),
      dataIndex: 'answer_type',
      key: 'answer_type',
      render: (v: string) => <Tag>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('checklists.category', 'Category'),
      dataIndex: 'category',
      key: 'category',
      render: (v: string | null) => v ? <Tag color={v === 'mechanical' ? 'blue' : 'gold'}>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: t('checklists.critical', 'Critical'),
      dataIndex: 'is_critical',
      key: 'is_critical',
      render: (v: boolean) => v ? <Tag color="red">{t('common.yes', 'Yes')}</Tag> : <Tag>{t('common.no', 'No')}</Tag>,
    },
  ];

  const templates = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  const templateColumns: ColumnsType<ChecklistTemplate> = [
    { title: t('checklists.name', 'Name'), dataIndex: 'name', key: 'name' },
    { title: t('checklists.nameAr', 'Name (AR)'), dataIndex: 'name_ar', key: 'name_ar', render: (v: string | null) => v || '-' },
    { title: t('checklists.description', 'Description'), dataIndex: 'description', key: 'description', render: (v: string | null) => v || '-' },
    {
      title: t('checklists.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? t('common.yes', 'Yes') : t('common.no', 'No')}</Tag>,
    },
    {
      title: t('checklists.items', 'Items'),
      key: 'items_count',
      render: (_: unknown, record: ChecklistTemplate) => record.items?.length || 0,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: ChecklistTemplate) => (
        <Button type="link" icon={<PlusOutlined />} onClick={() => openAddItem(record)}>
          {t('checklists.addItem', 'Add Item')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.checklists', 'Checklists Management')}</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateTemplateOpen(true)}>
          {t('checklists.createTemplate', 'Create Template')}
        </Button>
      }
    >
      <Table
        rowKey="id"
        columns={templateColumns}
        dataSource={templates}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPerPage(ps); },
        }}
        expandable={{
          expandedRowRender: (record: ChecklistTemplate) => (
            <Table
              rowKey="id"
              columns={[
                ...itemColumns,
                {
                  title: t('common.actions', 'Actions'),
                  key: 'actions',
                  render: (_: unknown, item: ChecklistItem) => (
                    <Space>
                      <Button type="link" icon={<EditOutlined />} onClick={() => openEditItem(record, item)}>
                        {t('common.edit', 'Edit')}
                      </Button>
                      <Popconfirm
                        title={t('checklists.deleteItemConfirm', 'Delete this item?')}
                        onConfirm={() => deleteItemMutation.mutate({ templateId: record.id, itemId: item.id })}
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
              ]}
              dataSource={record.items || []}
              pagination={false}
              size="small"
            />
          ),
          rowExpandable: () => true,
        }}
        scroll={{ x: 800 }}
      />

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
          <Form.Item name="name" label={t('checklists.name', 'Name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_ar" label={t('checklists.nameAr', 'Name (Arabic)')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('checklists.description', 'Description')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="is_active" label={t('checklists.active', 'Active')} valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
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
          <Form.Item name="question_text" label={t('checklists.question', 'Question')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="question_text_ar" label={t('checklists.questionAr', 'Question (Arabic)')}>
            <Input />
          </Form.Item>
          <Form.Item name="answer_type" label={t('checklists.answerType', 'Answer Type')} rules={[{ required: true }]}>
            <Select>
              <Select.Option value="yes_no">Yes / No</Select.Option>
              <Select.Option value="rating">Rating</Select.Option>
              <Select.Option value="text">Text</Select.Option>
              <Select.Option value="number">Number</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="category" label={t('checklists.category', 'Category')}>
            <Select allowClear>
              <Select.Option value="mechanical">{t('checklists.mechanical', 'Mechanical')}</Select.Option>
              <Select.Option value="electrical">{t('checklists.electrical', 'Electrical')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_critical" label={t('checklists.critical', 'Critical')} valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
          <Form.Item name="order" label={t('checklists.order', 'Order')}>
            <InputNumber min={0} style={{ width: '100%' }} />
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
          <Form.Item name="question_text" label={t('checklists.question', 'Question')}>
            <Input />
          </Form.Item>
          <Form.Item name="question_text_ar" label={t('checklists.questionAr', 'Question (Arabic)')}>
            <Input />
          </Form.Item>
          <Form.Item name="answer_type" label={t('checklists.answerType', 'Answer Type')}>
            <Select>
              <Select.Option value="yes_no">Yes / No</Select.Option>
              <Select.Option value="rating">Rating</Select.Option>
              <Select.Option value="text">Text</Select.Option>
              <Select.Option value="number">Number</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="category" label={t('checklists.category', 'Category')}>
            <Select allowClear>
              <Select.Option value="mechanical">{t('checklists.mechanical', 'Mechanical')}</Select.Option>
              <Select.Option value="electrical">{t('checklists.electrical', 'Electrical')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_critical" label={t('checklists.critical', 'Critical')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="order" label={t('checklists.order', 'Order')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
