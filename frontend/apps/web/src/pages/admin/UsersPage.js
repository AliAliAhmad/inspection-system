import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, Popconfirm, message, Typography, Row, Col, } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usersApi, } from '@inspection/shared';
const ROLES = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];
const roleColorMap = {
    admin: 'red',
    inspector: 'blue',
    specialist: 'green',
    engineer: 'orange',
    quality_engineer: 'purple',
};
export default function UsersPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState();
    const [activeFilter, setActiveFilter] = useState();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [createForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['users', page, perPage, search, roleFilter, activeFilter],
        queryFn: () => usersApi.list({ page, per_page: perPage, search: search || undefined, role: roleFilter, is_active: activeFilter }),
    });
    const createMutation = useMutation({
        mutationFn: (payload) => usersApi.create(payload),
        onSuccess: () => {
            message.success(t('users.createSuccess', 'User created successfully'));
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setCreateModalOpen(false);
            createForm.resetFields();
        },
        onError: (err) => {
            const msg = err?.response?.data?.message || err?.message || 'Failed to create user';
            message.error(msg);
        },
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, payload }) => usersApi.update(id, payload),
        onSuccess: () => {
            message.success(t('users.updateSuccess', 'User updated successfully'));
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setEditModalOpen(false);
            setEditingUser(null);
            editForm.resetFields();
        },
        onError: () => {
            message.error(t('users.updateError', 'Failed to update user'));
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => usersApi.remove(id),
        onSuccess: () => {
            message.success(t('users.deleteSuccess', 'User deleted successfully'));
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: () => {
            message.error(t('users.deleteError', 'Failed to delete user'));
        },
    });
    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }) => usersApi.update(id, { is_active }),
        onSuccess: () => {
            message.success(t('users.statusUpdated', 'User status updated'));
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: () => {
            message.error(t('users.statusError', 'Failed to update user status'));
        },
    });
    const openEdit = (user) => {
        setEditingUser(user);
        editForm.setFieldsValue({
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            minor_role: user.minor_role,
            specialization: user.specialization,
            shift: user.shift,
            language: user.language,
            is_active: user.is_active,
        });
        setEditModalOpen(true);
    };
    const columns = [
        {
            title: t('users.fullName', 'Full Name'),
            dataIndex: 'full_name',
            key: 'full_name',
            sorter: (a, b) => a.full_name.localeCompare(b.full_name),
        },
        {
            title: t('users.email', 'Email'),
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: t('users.employeeId', 'Employee ID'),
            dataIndex: 'employee_id',
            key: 'employee_id',
        },
        {
            title: t('users.role', 'Role'),
            dataIndex: 'role',
            key: 'role',
            render: (role) => (_jsx(Tag, { color: roleColorMap[role], children: role.replace('_', ' ').toUpperCase() })),
        },
        {
            title: t('users.specialization', 'Specialization'),
            dataIndex: 'specialization',
            key: 'specialization',
            render: (val) => val || '-',
        },
        {
            title: t('users.shift', 'Shift'),
            dataIndex: 'shift',
            key: 'shift',
            render: (val) => val ? val.charAt(0).toUpperCase() + val.slice(1) : '-',
        },
        {
            title: t('users.active', 'Active'),
            dataIndex: 'is_active',
            key: 'is_active',
            render: (active, record) => (_jsx(Switch, { checked: active, onChange: (checked) => toggleActiveMutation.mutate({ id: record.id, is_active: checked }), loading: toggleActiveMutation.isPending })),
        },
        {
            title: t('users.points', 'Points'),
            dataIndex: 'total_points',
            key: 'total_points',
            sorter: (a, b) => a.total_points - b.total_points,
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsxs(Space, { children: [_jsx(Button, { type: "link", icon: _jsx(EditOutlined, {}), onClick: () => openEdit(record), children: t('common.edit', 'Edit') }), _jsx(Popconfirm, { title: t('users.deleteConfirm', 'Are you sure you want to delete this user?'), onConfirm: () => deleteMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(DeleteOutlined, {}), children: t('common.delete', 'Delete') }) })] })),
        },
    ];
    const users = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.users', 'Users Management') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setCreateModalOpen(true), children: t('users.create', 'Create User') }), children: [_jsxs(Row, { gutter: [16, 16], style: { marginBottom: 16 }, children: [_jsx(Col, { xs: 24, sm: 8, children: _jsx(Input, { placeholder: t('users.searchPlaceholder', 'Search by name or email...'), prefix: _jsx(SearchOutlined, {}), value: search, onChange: (e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }, allowClear: true }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsx(Select, { placeholder: t('users.filterRole', 'Filter by role'), value: roleFilter, onChange: (val) => {
                                setRoleFilter(val);
                                setPage(1);
                            }, allowClear: true, style: { width: '100%' }, children: ROLES.map((r) => (_jsx(Select.Option, { value: r, children: r.replace('_', ' ').toUpperCase() }, r))) }) }), _jsx(Col, { xs: 12, sm: 6, children: _jsxs(Select, { placeholder: t('users.filterActive', 'Filter by status'), value: activeFilter, onChange: (val) => {
                                setActiveFilter(val);
                                setPage(1);
                            }, allowClear: true, style: { width: '100%' }, children: [_jsx(Select.Option, { value: true, children: t('users.activeOnly', 'Active') }), _jsx(Select.Option, { value: false, children: t('users.inactiveOnly', 'Inactive') })] }) })] }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: users, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
                    onChange: (p, ps) => {
                        setPage(p);
                        setPerPage(ps);
                    },
                }, scroll: { x: 1000 } }), _jsx(Modal, { title: t('users.create', 'Create User'), open: createModalOpen, onCancel: () => {
                    setCreateModalOpen(false);
                    createForm.resetFields();
                }, onOk: () => createForm.submit(), confirmLoading: createMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: createForm, layout: "vertical", onFinish: (values) => createMutation.mutate(values), children: [_jsx(Form.Item, { name: "email", label: t('users.email', 'Email'), rules: [{ required: true, type: 'email' }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "password", label: t('users.password', 'Password'), rules: [{ required: true, min: 6 }], children: _jsx(Input.Password, {}) }), _jsx(Form.Item, { name: "full_name", label: t('users.fullName', 'Full Name'), rules: [{ required: true }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "role", label: t('users.role', 'Role'), rules: [{ required: true }], children: _jsx(Select, { children: ROLES.map((r) => (_jsx(Select.Option, { value: r, children: r.replace('_', ' ').toUpperCase() }, r))) }) }), _jsx(Form.Item, { name: "minor_role", label: t('users.minorRole', 'Minor Role'), children: _jsx(Select, { allowClear: true, children: ROLES.map((r) => (_jsx(Select.Option, { value: r, children: r.replace('_', ' ').toUpperCase() }, r))) }) }), _jsx(Form.Item, { name: "specialization", label: t('users.specialization', 'Specialization'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('users.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('users.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "shift", label: t('users.shift', 'Shift'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "day", children: t('users.day', 'Day') }), _jsx(Select.Option, { value: "night", children: t('users.night', 'Night') })] }) }), _jsx(Form.Item, { name: "language", label: t('users.language', 'Language'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "en", children: "English" }), _jsx(Select.Option, { value: "ar", children: "Arabic" })] }) })] }) }), _jsx(Modal, { title: t('users.editUser', 'Edit User'), open: editModalOpen, onCancel: () => {
                    setEditModalOpen(false);
                    setEditingUser(null);
                    editForm.resetFields();
                }, onOk: () => editForm.submit(), confirmLoading: updateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: editForm, layout: "vertical", onFinish: (values) => editingUser && updateMutation.mutate({ id: editingUser.id, payload: values }), children: [_jsx(Form.Item, { name: "email", label: t('users.email', 'Email'), rules: [{ type: 'email' }], children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "full_name", label: t('users.fullName', 'Full Name'), children: _jsx(Input, {}) }), _jsx(Form.Item, { name: "role", label: t('users.role', 'Role'), children: _jsx(Select, { children: ROLES.map((r) => (_jsx(Select.Option, { value: r, children: r.replace('_', ' ').toUpperCase() }, r))) }) }), _jsx(Form.Item, { name: "minor_role", label: t('users.minorRole', 'Minor Role'), children: _jsx(Select, { allowClear: true, children: ROLES.map((r) => (_jsx(Select.Option, { value: r, children: r.replace('_', ' ').toUpperCase() }, r))) }) }), _jsx(Form.Item, { name: "specialization", label: t('users.specialization', 'Specialization'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "mechanical", children: t('users.mechanical', 'Mechanical') }), _jsx(Select.Option, { value: "electrical", children: t('users.electrical', 'Electrical') })] }) }), _jsx(Form.Item, { name: "shift", label: t('users.shift', 'Shift'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "day", children: t('users.day', 'Day') }), _jsx(Select.Option, { value: "night", children: t('users.night', 'Night') })] }) }), _jsx(Form.Item, { name: "language", label: t('users.language', 'Language'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "en", children: "English" }), _jsx(Select.Option, { value: "ar", children: "Arabic" })] }) }), _jsx(Form.Item, { name: "is_active", label: t('users.active', 'Active'), valuePropName: "checked", children: _jsx(Switch, {}) })] }) })] }));
}
//# sourceMappingURL=UsersPage.js.map