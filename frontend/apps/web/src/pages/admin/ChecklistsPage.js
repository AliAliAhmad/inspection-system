import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, Popconfirm, message, Typography, } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checklistsApi, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
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
            critical_failure: item.critical_failure,
        });
        setEditItemOpen(true);
    };
    const itemColumns = [
        { title: '#', dataIndex: 'order_index', key: 'order_index', width: 50 },
        { title: t('checklists.question', 'Question'), dataIndex: 'question_text', key: 'question_text' },
        { title: t('checklists.questionAr', 'Question (AR)'), dataIndex: 'question_text_ar', key: 'question_text_ar', render: (v) => v || '-' },
        {
            title: t('checklists.answerType', 'Answer Type'),
            dataIndex: 'answer_type',
            key: 'answer_type',
            render: (v) => _jsx(Tag, { children: v?.replace('_', ' ').toUpperCase() }),
        },
        {
            title: t('checklists.category', 'Category'),
            dataIndex: 'category',
            key: 'category',
            render: (v) => v ? _jsx(Tag, { color: v === 'mechanical' ? 'blue' : 'gold', children: v.toUpperCase() }) : '-',
        },
        {
            title: t('checklists.critical', 'Critical'),
            dataIndex: 'critical_failure',
            key: 'critical_failure',
            render: (v) => v ? _jsx(Tag, { color: "red", children: t('common.yes', 'Yes') }) : _jsx(Tag, { children: t('common.no', 'No') }),
        },
    ];
    const templates = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const templateColumns = [
        { title: t('checklists.title', 'Title'), dataIndex: 'name', key: 'name' },
        { title: t('checklists.function', 'Function'), dataIndex: 'function', key: 'function', render: (v) => v || '-' },
        { title: t('checklists.assembly', 'Assembly'), dataIndex: 'assembly', key: 'assembly', render: (v) => v || '-' },
        { title: t('checklists.part', 'Part'), dataIndex: 'part', key: 'part', render: (v) => v || '-' },
        { title: t('checklists.description', 'Description'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v) => v || '-' },
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
                }, scroll: { x: 800 } }), _jsx(Modal, { title: t('checklists.createTemplate', 'Create Template'), open: createTemplateOpen, onCancel: () => { setCreateTemplateOpen(false); templateForm.resetFields(); }, onOk: () => templateForm.submit(), confirmLoading: createTemplateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: templateForm, layout: "vertical", onFinish: (v) => createTemplateMutation.mutate(v), children: [_jsx(Form.Item, { name: "name", label: t('checklists.title', 'Title'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "name_ar", label: t('checklists.titleAr', 'Title (Arabic)'), children: _jsx(Input, { dir: "rtl" }) }), _jsx(Form.Item, { name: "function", label: t('checklists.function', 'Function'), rules: [{ required: true }], children: _jsx(Input, { placeholder: "e.g. Pumping, Cooling" }) }), _jsx(Form.Item, { name: "assembly", label: t('checklists.assembly', 'Assembly'), rules: [{ required: true }], children: _jsx(Input, { placeholder: "e.g. Motor Assembly, Valve Assembly" }) }), _jsx(Form.Item, { name: "part", label: t('checklists.part', 'Part'), children: _jsx(Input, { placeholder: "e.g. Impeller, Bearing (optional)" }) }), _jsx(Form.Item, { name: "description", label: t('checklists.description', 'Description'), rules: [{ required: true }], children: _jsx(VoiceTextArea, { rows: 3, placeholder: "What this checklist covers" }) }), _jsx(Form.Item, { name: "version", label: t('checklists.version', 'Version'), rules: [{ required: true }], initialValue: "1.0", children: _jsx(Input, { placeholder: "e.g. 1.0" }) }), _jsx(Form.Item, { name: "is_active", label: t('checklists.active', 'Active'), valuePropName: "checked", initialValue: true, children: _jsx(Switch, {}) })] }) }), _jsx(Modal, { title: t('checklists.addItem', 'Add Checklist Item'), open: addItemOpen, onCancel: () => { setAddItemOpen(false); itemForm.resetFields(); }, onOk: () => itemForm.submit(), confirmLoading: addItemMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: itemForm, layout: "vertical", onFinish: (v) => selectedTemplate && addItemMutation.mutate({ templateId: selectedTemplate.id, payload: v }), children: [_jsx(Form.Item, { name: "question_text", label: t('checklists.question', 'Question'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "question_text_ar", label: t('checklists.questionAr', 'Question (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "answer_type", label: t('checklists.answerType', 'Answer Type'), rules: [{ required: true }], children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "pass_fail", children: "Pass / Fail" }), _jsx(Select.Option, { value: "yes_no", children: "Yes / No" }), _jsx(Select.Option, { value: "numeric", children: "Numeric" }), _jsx(Select.Option, { value: "text", children: "Text" })] }) }), _jsx(Form.Item, { name: "category", label: t('checklists.category', 'Category'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('checklists.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('checklists.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "critical_failure", label: t('checklists.critical', 'Critical Failure'), valuePropName: "checked", initialValue: false, children: _jsx(Switch, {}) })] }) }), _jsx(Modal, { title: t('checklists.editItem', 'Edit Checklist Item'), open: editItemOpen, onCancel: () => { setEditItemOpen(false); setEditingItem(null); editItemForm.resetFields(); }, onOk: () => editItemForm.submit(), confirmLoading: updateItemMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: editItemForm, layout: "vertical", onFinish: (v) => selectedTemplate &&
                        editingItem &&
                        updateItemMutation.mutate({ templateId: selectedTemplate.id, itemId: editingItem.id, payload: v }), children: [_jsx(Form.Item, { name: "question_text", label: t('checklists.question', 'Question'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "question_text_ar", label: t('checklists.questionAr', 'Question (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "answer_type", label: t('checklists.answerType', 'Answer Type'), children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "pass_fail", children: "Pass / Fail" }), _jsx(Select.Option, { value: "yes_no", children: "Yes / No" }), _jsx(Select.Option, { value: "numeric", children: "Numeric" }), _jsx(Select.Option, { value: "text", children: "Text" })] }) }), _jsx(Form.Item, { name: "category", label: t('checklists.category', 'Category'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('checklists.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('checklists.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "critical_failure", label: t('checklists.critical', 'Critical Failure'), valuePropName: "checked", children: _jsx(Switch, {}) })] }) })] }));
}
//# sourceMappingURL=ChecklistsPage.js.map