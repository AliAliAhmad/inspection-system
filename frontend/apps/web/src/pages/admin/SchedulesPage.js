import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Select, Tag, Popconfirm, message, Typography, Spin, } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { schedulesApi, equipmentApi, } from '@inspection/shared';
const DAYS_OF_WEEK = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];
export default function SchedulesPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [form] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['schedules', 'weekly'],
        queryFn: () => schedulesApi.getWeekly(),
    });
    const { data: equipmentData, isLoading: equipmentLoading } = useQuery({
        queryKey: ['equipment', 'all'],
        queryFn: () => equipmentApi.list({ per_page: 500 }),
        enabled: addModalOpen,
    });
    const createMutation = useMutation({
        mutationFn: (payload) => schedulesApi.create(payload),
        onSuccess: () => {
            message.success(t('schedules.createSuccess', 'Schedule created successfully'));
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            setAddModalOpen(false);
            form.resetFields();
        },
        onError: () => message.error(t('schedules.createError', 'Failed to create schedule')),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => schedulesApi.remove(id),
        onSuccess: () => {
            message.success(t('schedules.deleteSuccess', 'Schedule deleted successfully'));
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
        },
        onError: () => message.error(t('schedules.deleteError', 'Failed to delete schedule')),
    });
    const columns = [
        {
            title: t('schedules.equipment', 'Equipment'),
            dataIndex: 'equipment_name',
            key: 'equipment_name',
            sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
        },
        {
            title: t('schedules.dayOfWeek', 'Day of Week'),
            dataIndex: 'day_of_week',
            key: 'day_of_week',
            render: (day) => DAYS_OF_WEEK[day] || day,
            sorter: (a, b) => a.day_of_week - b.day_of_week,
        },
        {
            title: t('schedules.frequency', 'Frequency'),
            dataIndex: 'frequency',
            key: 'frequency',
            render: (f) => _jsx(Tag, { color: "blue", children: f.toUpperCase() }),
        },
        {
            title: t('schedules.active', 'Active'),
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v) => (_jsx(Tag, { color: v ? 'green' : 'default', children: v ? t('common.yes', 'Yes') : t('common.no', 'No') })),
        },
        {
            title: t('schedules.nextDue', 'Next Due'),
            dataIndex: 'next_due',
            key: 'next_due',
            render: (v) => v || '-',
        },
        {
            title: t('schedules.lastCompleted', 'Last Completed'),
            dataIndex: 'last_completed',
            key: 'last_completed',
            render: (v) => v || '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Popconfirm, { title: t('schedules.deleteConfirm', 'Delete this schedule?'), onConfirm: () => deleteMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(DeleteOutlined, {}), children: t('common.delete', 'Delete') }) })),
        },
    ];
    const schedules = data?.data?.data || [];
    const equipmentOptions = equipmentData?.data?.data || [];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.schedules', 'Schedules') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setAddModalOpen(true), children: t('schedules.add', 'Add Schedule') }), children: [_jsx(Table, { rowKey: "id", columns: columns, dataSource: schedules, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 900 } }), _jsx(Modal, { title: t('schedules.add', 'Add Schedule'), open: addModalOpen, onCancel: () => { setAddModalOpen(false); form.resetFields(); }, onOk: () => form.submit(), confirmLoading: createMutation.isPending, destroyOnClose: true, children: _jsx(Spin, { spinning: equipmentLoading, children: _jsxs(Form, { form: form, layout: "vertical", onFinish: (v) => createMutation.mutate(v), children: [_jsx(Form.Item, { name: "equipment_id", label: t('schedules.equipment', 'Equipment'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('schedules.selectEquipment', 'Select equipment'), children: equipmentOptions.map((eq) => (_jsxs(Select.Option, { value: eq.id, children: [eq.name, " (", eq.serial_number, ")"] }, eq.id))) }) }), _jsx(Form.Item, { name: "day_of_week", label: t('schedules.dayOfWeek', 'Day of Week'), rules: [{ required: true }], children: _jsx(Select, { children: DAYS_OF_WEEK.map((day, index) => (_jsx(Select.Option, { value: index, children: day }, index))) }) }), _jsx(Form.Item, { name: "frequency", label: t('schedules.frequency', 'Frequency'), rules: [{ required: true }], children: _jsx(Select, { children: FREQUENCIES.map((f) => (_jsx(Select.Option, { value: f, children: f.charAt(0).toUpperCase() + f.slice(1) }, f))) }) })] }) }) })] }));
}
//# sourceMappingURL=SchedulesPage.js.map