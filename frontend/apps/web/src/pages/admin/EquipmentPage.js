import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm, message, Typography, Row, Col, DatePicker, } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi, } from '@inspection/shared';
import dayjs from 'dayjs';
const STATUSES = ['active', 'under_maintenance', 'out_of_service', 'stopped', 'paused'];
const statusColorMap = {
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
    const [statusFilter, setStatusFilter] = useState();
    const [typeFilter, setTypeFilter] = useState();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState(null);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['equipment', page, perPage, search, statusFilter, typeFilter],
        queryFn: () => equipmentApi.list({
            page,
            per_page: perPage,
            search: search || undefined,
            status: statusFilter,
            equipment_type: typeFilter,
        }),
    });
    const createMutation = useMutation({
        mutationFn: (payload) => equipmentApi.create(payload),
        onSuccess: () => {
            message.success(t('equipment.createSuccess', 'Equipment created successfully'));
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            setCreateModalOpen(false);
            createForm.resetFields();
        },
        onError: () => message.error(t('equipment.createError', 'Failed to create equipment')),
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => equipmentApi.update(id, payload),
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
        mutationFn: (id) => equipmentApi.remove(id),
        onSuccess: () => {
            message.success(t('equipment.deleteSuccess', 'Equipment deleted successfully'));
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
        },
        onError: () => message.error(t('equipment.deleteError', 'Failed to delete equipment')),
    });
    const openEdit = (record) => {
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
    const handleCreateFinish = (values) => {
        const payload = {
            ...values,
            installation_date: values.installation_date
                ? values.installation_date.format('YYYY-MM-DD')
                : undefined,
        };
        createMutation.mutate(payload);
    };
    const handleEditFinish = (values) => {
        if (!editingEquipment)
            return;
        const payload = {
            ...values,
            installation_date: values.installation_date
                ? values.installation_date.format('YYYY-MM-DD')
                : undefined,
        };
        updateMutation.mutate({ id: editingEquipment.id, payload });
    };
    const columns = [
        { title: t('equipment.name', 'Name'), dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
        { title: t('equipment.type', 'Type'), dataIndex: 'equipment_type', key: 'equipment_type' },
        { title: t('equipment.serialNumber', 'Serial Number'), dataIndex: 'serial_number', key: 'serial_number' },
        { title: t('equipment.location', 'Location'), dataIndex: 'location', key: 'location' },
        { title: t('equipment.berth', 'Berth'), dataIndex: 'berth', key: 'berth', render: (v) => v || '-' },
        {
            title: t('equipment.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: statusColorMap[status], children: status.replace(/_/g, ' ').toUpperCase() })),
        },
        { title: t('equipment.manufacturer', 'Manufacturer'), dataIndex: 'manufacturer', key: 'manufacturer', render: (v) => v || '-' },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsxs(Space, { children: [_jsx(Button, { type: "link", icon: _jsx(EditOutlined, {}), onClick: () => openEdit(record), children: t('common.edit', 'Edit') }), _jsx(Popconfirm, { title: t('equipment.deleteConfirm', 'Are you sure you want to delete this equipment?'), onConfirm: () => deleteMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(DeleteOutlined, {}), children: t('common.delete', 'Delete') }) })] })),
        },
    ];
    const items = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const formFields = (_jsxs(_Fragment, { children: [_jsx(Form.Item, { name: "name", label: t('equipment.name', 'Name'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "equipment_type", label: t('equipment.type', 'Equipment Type'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "serial_number", label: t('equipment.serialNumber', 'Serial Number'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "location", label: t('equipment.location', 'Location'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "status", label: t('equipment.status', 'Status'), children: _jsx(Select, { allowClear: true, children: STATUSES.map((s) => (_jsx(Select.Option, { value: s, children: s.replace(/_/g, ' ').toUpperCase() }, s))) }) }), _jsx(Form.Item, { name: "berth", label: t('equipment.berth', 'Berth'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "manufacturer", label: t('equipment.manufacturer', 'Manufacturer'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "model_number", label: t('equipment.modelNumber', 'Model Number'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "installation_date", label: t('equipment.installationDate', 'Installation Date'), children: _jsx(DatePicker, { style: { width: '100%' } }) })] }));
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.equipment', 'Equipment Management') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setCreateModalOpen(true), children: t('equipment.create', 'Add Equipment') }), children: [_jsxs(Row, { gutter: [16, 16], style: { marginBottom: 16 }, children: [_jsx(Col, { xs: 24, sm: 8, children: _jsx(Input, { placeholder: t('equipment.searchPlaceholder', 'Search equipment...'), prefix: _jsx(SearchOutlined, {}), value: search, onChange: (e) => { setSearch(e.target.value); setPage(1); }, allowClear: true }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsx(Select, { placeholder: t('equipment.filterStatus', 'Filter by status'), value: statusFilter, onChange: (v) => { setStatusFilter(v); setPage(1); }, allowClear: true, style: { width: '100%' }, children: STATUSES.map((s) => (_jsx(Select.Option, { value: s, children: s.replace(/_/g, ' ').toUpperCase() }, s))) }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsx(Input, { placeholder: t('equipment.filterType', 'Filter by type'), value: typeFilter, onChange: (e) => { setTypeFilter(e.target.value || undefined); setPage(1); }, allowClear: true }) })] }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: items, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, scroll: { x: 1100 } }), _jsx(Modal, { title: t('equipment.create', 'Add Equipment'), open: createModalOpen, onCancel: () => { setCreateModalOpen(false); createForm.resetFields(); }, onOk: () => createForm.submit(), confirmLoading: createMutation.isPending, destroyOnClose: true, children: _jsx(Form, { form: createForm, layout: "vertical", onFinish: handleCreateFinish, children: formFields }) }), _jsx(Modal, { title: t('equipment.edit', 'Edit Equipment'), open: editModalOpen, onCancel: () => { setEditModalOpen(false); setEditingEquipment(null); editForm.resetFields(); }, onOk: () => editForm.submit(), confirmLoading: updateMutation.isPending, destroyOnClose: true, children: _jsx(Form, { form: editForm, layout: "vertical", onFinish: handleEditFinish, children: formFields }) })] }));
}
//# sourceMappingURL=EquipmentPage.js.map