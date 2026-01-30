import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, Popconfirm, message, Typography, InputNumber, } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checklistsApi, } from '@inspection/shared';
export default function ChecklistsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
    const [addItemOpen, setAddItemOpen] = useState(false);
    const [editItemOpen, setEditItemOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [templateForm] = Form.useForm();
    const [itemForm] = Form.useForm();
    const [editItemForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['checklists', page, perPage],
        queryFn: () => checklistsApi.listTemplates({ page, per_page: perPage }),
    });
    const createTemplateMutation = useMutation({
        mutationFn: (payload) => checklistsApi.createTemplate(payload),
        onSuccess: () => {
            message.success(t('checklists.templateCreated', 'Template created successfully'));
            queryClient.invalidateQueries({ queryKey: ['checklists'] });
            setCreateTemplateOpen(false);
            templateForm.resetFields();
        },
        onError: () => message.error(t('checklists.templateCreateError', 'Failed to create template')),
    });
    const addItemMutation = useMutation({
        mutationFn: ({ templateId, payload }) => checklistsApi.addItem(templateId, payload),
        onSuccess: () => {
            message.success(t('checklists.itemAdded', 'Item added successfully'));
            queryClient.invalidateQueries({ queryKey: ['checklists'] });
            setAddItemOpen(false);
            itemForm.resetFields();
        },
        onError: () => message.error(t('checklists.itemAddError', 'Failed to add item')),
    });
    const updateItemMutation = useMutation({
        mutationFn: ({ templateId, itemId, payload, }) => checklistsApi.updateItem(templateId, itemId, payload),
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
        mutationFn: ({ templateId, itemId }) => checklistsApi.deleteItem(templateId, itemId),
        onSuccess: () => {
            message.success(t('checklists.itemDeleted', 'Item deleted successfully'));
            queryClient.invalidateQueries({ queryKey: ['checklists'] });
        },
        onError: () => message.error(t('checklists.itemDeleteError', 'Failed to delete item')),
    });
    const openAddItem = (template) => {
        setSelectedTemplate(template);
        itemForm.resetFields();
        setAddItemOpen(true);
    };
    const openEditItem = (template, item) => {
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
    const itemColumns = [
        { title: t('checklists.order', 'Order'), dataIndex: 'order', key: 'order', width: 70 },
        { title: t('checklists.question', 'Question'), dataIndex: 'question_text', key: 'question_text' },
        { title: t('checklists.questionAr', 'Question (AR)'), dataIndex: 'question_text_ar', key: 'question_text_ar', render: (v) => v || '-' },
        {
            title: t('checklists.answerType', 'Answer Type'),
            dataIndex: 'answer_type',
            key: 'answer_type',
            render: (v) => _jsx(Tag, { children: v.toUpperCase() }),
        },
        {
            title: t('checklists.category', 'Category'),
            dataIndex: 'category',
            key: 'category',
            render: (v) => v ? _jsx(Tag, { color: v === 'mechanical' ? 'blue' : 'gold', children: v.toUpperCase() }) : '-',
        },
        {
            title: t('checklists.critical', 'Critical'),
            dataIndex: 'is_critical',
            key: 'is_critical',
            render: (v) => v ? _jsx(Tag, { color: "red", children: t('common.yes', 'Yes') }) : _jsx(Tag, { children: t('common.no', 'No') }),
        },
    ];
    const templates = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const templateColumns = [
        { title: t('checklists.name', 'Name'), dataIndex: 'name', key: 'name' },
        { title: t('checklists.nameAr', 'Name (AR)'), dataIndex: 'name_ar', key: 'name_ar', render: (v) => v || '-' },
        { title: t('checklists.description', 'Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
        {
            title: t('checklists.active', 'Active'),
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v) => _jsx(Tag, { color: v ? 'green' : 'default', children: v ? t('common.yes', 'Yes') : t('common.no', 'No') }),
        },
        {
            title: t('checklists.items', 'Items'),
            key: 'items_count',
            render: (_, record) => record.items?.length || 0,
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "link", icon: _jsx(PlusOutlined, {}), onClick: () => openAddItem(record), children: t('checklists.addItem', 'Add Item') })),
        },
    ];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.checklists', 'Checklists Management') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setCreateTemplateOpen(true), children: t('checklists.createTemplate', 'Create Template') }), children: [_jsx(Table, { rowKey: "id", columns: templateColumns, dataSource: templates, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, expandable: {
                    expandedRowRender: (record) => (_jsx(Table, { rowKey: "id", columns: [
                            ...itemColumns,
                            {
                                title: t('common.actions', 'Actions'),
                                key: 'actions',
                                render: (_, item) => (_jsxs(Space, { children: [_jsx(Button, { type: "link", icon: _jsx(EditOutlined, {}), onClick: () => openEditItem(record, item), children: t('common.edit', 'Edit') }), _jsx(Popconfirm, { title: t('checklists.deleteItemConfirm', 'Delete this item?'), onConfirm: () => deleteItemMutation.mutate({ templateId: record.id, itemId: item.id }), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(DeleteOutlined, {}), children: t('common.delete', 'Delete') }) })] })),
                            },
                        ], dataSource: record.items || [], pagination: false, size: "small" })),
                    rowExpandable: () => true,
                }, scroll: { x: 800 } }), _jsx(Modal, { title: t('checklists.createTemplate', 'Create Template'), open: createTemplateOpen, onCancel: () => { setCreateTemplateOpen(false); templateForm.resetFields(); }, onOk: () => templateForm.submit(), confirmLoading: createTemplateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: templateForm, layout: "vertical", onFinish: (v) => createTemplateMutation.mutate(v), children: [_jsx(Form.Item, { name: "name", label: t('checklists.name', 'Name'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "name_ar", label: t('checklists.nameAr', 'Name (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "description", label: t('checklists.description', 'Description'), children: _jsx(Input.TextArea, { rows: 3 }) }), _jsx(Form.Item, { name: "is_active", label: t('checklists.active', 'Active'), valuePropName: "checked", initialValue: true, children: _jsx(Switch, {}) })] }) }), _jsx(Modal, { title: t('checklists.addItem', 'Add Checklist Item'), open: addItemOpen, onCancel: () => { setAddItemOpen(false); itemForm.resetFields(); }, onOk: () => itemForm.submit(), confirmLoading: addItemMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: itemForm, layout: "vertical", onFinish: (v) => selectedTemplate && addItemMutation.mutate({ templateId: selectedTemplate.id, payload: v }), children: [_jsx(Form.Item, { name: "question_text", label: t('checklists.question', 'Question'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "question_text_ar", label: t('checklists.questionAr', 'Question (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "answer_type", label: t('checklists.answerType', 'Answer Type'), rules: [{ required: true }], children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "yes_no", children: "Yes / No" }), _jsx(Select.Option, { value: "rating", children: "Rating" }), _jsx(Select.Option, { value: "text", children: "Text" }), _jsx(Select.Option, { value: "number", children: "Number" })] }) }), _jsx(Form.Item, { name: "category", label: t('checklists.category', 'Category'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('checklists.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('checklists.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "is_critical", label: t('checklists.critical', 'Critical'), valuePropName: "checked", initialValue: false, children: _jsx(Switch, {}) }), _jsx(Form.Item, { name: "order", label: t('checklists.order', 'Order'), children: _jsx(InputNumber, { min: 0, style: { width: '100%' } }) })] }) }), _jsx(Modal, { title: t('checklists.editItem', 'Edit Checklist Item'), open: editItemOpen, onCancel: () => { setEditItemOpen(false); setEditingItem(null); editItemForm.resetFields(); }, onOk: () => editItemForm.submit(), confirmLoading: updateItemMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: editItemForm, layout: "vertical", onFinish: (v) => selectedTemplate &&
                        editingItem &&
                        updateItemMutation.mutate({ templateId: selectedTemplate.id, itemId: editingItem.id, payload: v }), children: [_jsx(Form.Item, { name: "question_text", label: t('checklists.question', 'Question'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "question_text_ar", label: t('checklists.questionAr', 'Question (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "answer_type", label: t('checklists.answerType', 'Answer Type'), children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "yes_no", children: "Yes / No" }), _jsx(Select.Option, { value: "rating", children: "Rating" }), _jsx(Select.Option, { value: "text", children: "Text" }), _jsx(Select.Option, { value: "number", children: "Number" })] }) }), _jsx(Form.Item, { name: "category", label: t('checklists.category', 'Category'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('checklists.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('checklists.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "is_critical", label: t('checklists.critical', 'Critical'), valuePropName: "checked", children: _jsx(Switch, {}) }), _jsx(Form.Item, { name: "order", label: t('checklists.order', 'Order'), children: _jsx(InputNumber, { min: 0, style: { width: '100%' } }) })] }) })] }));
}
//# sourceMappingURL=ChecklistsPage.js.map