import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, message, Typography, } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionRoutinesApi, checklistsApi, } from '@inspection/shared';
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export default function InspectionRoutinesPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingRoutine, setEditingRoutine] = useState(null);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['inspection-routines'],
        queryFn: () => inspectionRoutinesApi.list().then(r => r.data.data),
    });
    const { data: templates } = useQuery({
        queryKey: ['checklists', 'all'],
        queryFn: () => checklistsApi.listTemplates({ per_page: 500 }).then(r => r.data.data),
        enabled: createModalOpen || editModalOpen,
    });
    const createMutation = useMutation({
        mutationFn: (values) => inspectionRoutinesApi.create(values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
            message.success(t('routines.createSuccess', 'Routine created successfully'));
            setCreateModalOpen(false);
            createForm.resetFields();
        },
        onError: () => message.error(t('routines.createError', 'Failed to create routine')),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => inspectionRoutinesApi.update(id, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
            message.success(t('routines.updateSuccess', 'Routine updated successfully'));
            setEditModalOpen(false);
            setEditingRoutine(null);
            editForm.resetFields();
        },
        onError: () => message.error(t('routines.updateError', 'Failed to update routine')),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => inspectionRoutinesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inspection-routines'] });
            message.success(t('routines.deleteSuccess', 'Routine deleted successfully'));
        },
        onError: () => message.error(t('routines.deleteError', 'Failed to delete routine')),
    });
    const openEditModal = (record) => {
        setEditingRoutine(record);
        editForm.setFieldsValue({
            name: record.name,
            name_ar: record.name_ar,
            asset_types: record.asset_types,
            shift: record.shift,
            days_of_week: record.days_of_week,
            template_id: record.template_id,
            is_active: record.is_active,
        });
        setEditModalOpen(true);
    };
    const columns = [
        {
            title: t('routines.name', 'Name'),
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: t('routines.assetTypes', 'Asset Types'),
            dataIndex: 'asset_types',
            key: 'asset_types',
            render: (types) => types?.map((type) => (_jsx(Tag, { children: type }, type))) || '-',
        },
        {
            title: t('routines.shift', 'Shift'),
            dataIndex: 'shift',
            key: 'shift',
            render: (shift) => (_jsx(Tag, { color: shift === 'day' ? 'blue' : 'purple', children: shift === 'day' ? t('routines.day', 'Day') : t('routines.night', 'Night') })),
        },
        {
            title: t('routines.daysOfWeek', 'Days of Week'),
            dataIndex: 'days_of_week',
            key: 'days_of_week',
            render: (days) => days?.map((day) => (_jsx(Tag, { children: dayNames[day] }, day))) || '-',
        },
        {
            title: t('routines.templateId', 'Template ID'),
            dataIndex: 'template_id',
            key: 'template_id',
        },
        {
            title: t('routines.active', 'Active'),
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v) => (_jsx(Tag, { color: v ? 'green' : 'default', children: v ? t('common.yes', 'Yes') : t('common.no', 'No') })),
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsxs(Space, { children: [_jsx(Button, { type: "link", icon: _jsx(EditOutlined, {}), onClick: () => openEditModal(record), children: t('common.edit', 'Edit') }), _jsx(Popconfirm, { title: t('routines.deleteConfirm', 'Delete this routine?'), onConfirm: () => deleteMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(DeleteOutlined, {}), children: t('common.delete', 'Delete') }) })] })),
        },
    ];
    const routines = data || [];
    const templateOptions = templates || [];
    const routineFormFields = (_jsxs(_Fragment, { children: [_jsx(Form.Item, { name: "name", label: t('routines.name', 'Name'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "name_ar", label: t('routines.nameAr', 'Name (Arabic)'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "asset_types", label: t('routines.assetTypes', 'Asset Types'), rules: [{ required: true }], children: _jsx(Select, { mode: "tags", placeholder: t('routines.assetTypesPlaceholder', 'Type and press enter to add') }) }), _jsx(Form.Item, { name: "shift", label: t('routines.shift', 'Shift'), rules: [{ required: true }], children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "day", children: t('routines.day', 'Day') }), _jsx(Select.Option, { value: "night", children: t('routines.night', 'Night') })] }) }), _jsx(Form.Item, { name: "days_of_week", label: t('routines.daysOfWeek', 'Days of Week'), rules: [{ required: true }], children: _jsx(Select, { mode: "multiple", placeholder: t('routines.selectDays', 'Select days'), children: dayNames.map((day, index) => (_jsx(Select.Option, { value: index, children: day }, index))) }) }), _jsx(Form.Item, { name: "template_id", label: t('routines.template', 'Template'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('routines.selectTemplate', 'Select template'), children: templateOptions.map((tpl) => (_jsx(Select.Option, { value: tpl.id, children: tpl.name }, tpl.id))) }) })] }));
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.inspectionRoutines', 'Inspection Routines') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setCreateModalOpen(true), children: t('routines.create', 'Create Routine') }), children: [_jsx(Table, { rowKey: "id", columns: columns, dataSource: routines, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 1000 } }), _jsx(Modal, { title: t('routines.create', 'Create Routine'), open: createModalOpen, onCancel: () => { setCreateModalOpen(false); createForm.resetFields(); }, onOk: () => createForm.submit(), confirmLoading: createMutation.isPending, destroyOnClose: true, children: _jsx(Form, { form: createForm, layout: "vertical", onFinish: (v) => createMutation.mutate(v), children: routineFormFields }) }), _jsx(Modal, { title: t('routines.edit', 'Edit Routine'), open: editModalOpen, onCancel: () => { setEditModalOpen(false); setEditingRoutine(null); editForm.resetFields(); }, onOk: () => editForm.submit(), confirmLoading: updateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: editForm, layout: "vertical", onFinish: (v) => editingRoutine && updateMutation.mutate({ id: editingRoutine.id, payload: v }), children: [routineFormFields, _jsx(Form.Item, { name: "is_active", label: t('routines.active', 'Active'), children: _jsxs(Select, { children: [_jsx(Select.Option, { value: true, children: t('common.yes', 'Yes') }), _jsx(Select.Option, { value: false, children: t('common.no', 'No') })] }) })] }) })] }));
}
//# sourceMappingURL=InspectionRoutinesPage.js.map