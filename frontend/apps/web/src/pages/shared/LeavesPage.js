import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, Select, DatePicker, message, Typography, Statistic, Row, Col, Alert, } from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { leavesApi, usersApi } from '@inspection/shared';
import { formatDate } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
const statusColors = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
};
const leaveTypes = ['sick', 'annual', 'emergency', 'training', 'other'];
export default function LeavesPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState();
    const [page, setPage] = useState(1);
    const [form] = Form.useForm();
    const { data, isLoading } = useQuery({
        queryKey: ['leaves', page, statusFilter],
        queryFn: () => leavesApi.list({ page, per_page: 15, status: statusFilter }).then(r => r.data),
    });
    // Fetch current user's leave balance
    const { data: balanceData } = useQuery({
        queryKey: ['leaves', 'balance', user?.id],
        queryFn: () => leavesApi.getBalance(user.id).then(r => r.data.data ?? r.data.data),
        enabled: !!user?.id,
    });
    const totalBalance = balanceData?.total_balance ?? 0;
    const usedDays = balanceData?.used ?? 0;
    const remaining = balanceData?.remaining ?? 0;
    // Fetch all active users for coverage dropdown
    const { data: allUsersData } = useQuery({
        queryKey: ['users', 'all-active'],
        queryFn: () => usersApi.list({ per_page: 500, is_active: true }),
    });
    const allUsers = allUsersData?.data?.data ?? [];
    const requestMutation = useMutation({
        mutationFn: leavesApi.request,
        onSuccess: () => {
            message.success('Leave request submitted');
            queryClient.invalidateQueries({ queryKey: ['leaves'] });
            setModalOpen(false);
            form.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error'));
        },
    });
    const handleSubmit = (values) => {
        requestMutation.mutate({
            leave_type: values.leave_type,
            date_from: values.dates[0].format('YYYY-MM-DD'),
            date_to: values.dates[1].format('YYYY-MM-DD'),
            reason: values.reason,
            scope: values.scope,
            coverage_user_id: values.coverage_user_id,
        });
    };
    const isAdmin = user?.role === 'admin';
    const canRequestLeave = user?.role === 'admin' || user?.role === 'engineer';
    const columns = [
        ...(isAdmin ? [{
                title: t('leave.employee', 'Employee'),
                dataIndex: 'user',
                key: 'user',
                render: (u) => u ? (_jsxs(Space, { direction: "vertical", size: 0, children: [_jsx(Typography.Text, { strong: true, children: u.full_name }), _jsxs(Typography.Text, { type: "secondary", style: { fontSize: 12 }, children: [u.employee_id ?? u.role_id, " \u00B7 ", u.role] })] })) : '-',
            }] : []),
        {
            title: t('leave.type'),
            dataIndex: 'leave_type',
            render: (type) => _jsx(Tag, { children: t(`leave.${type}`) }),
        },
        {
            title: t('leave.date_from'),
            dataIndex: 'date_from',
            render: (d) => formatDate(d),
        },
        {
            title: t('leave.date_to'),
            dataIndex: 'date_to',
            render: (d) => formatDate(d),
        },
        {
            title: 'Days',
            dataIndex: 'total_days',
            width: 80,
        },
        {
            title: t('leave.reason'),
            dataIndex: 'reason',
            ellipsis: true,
        },
        {
            title: t('leaves.coverage', 'Coverage'),
            dataIndex: 'coverage_user',
            key: 'coverage_user',
            render: (u) => u ? u.full_name : '-',
        },
        {
            title: t('leave.scope', 'Scope'),
            dataIndex: 'scope',
            key: 'scope',
            render: (s) => s === 'major_only' ? 'Major Only' : 'Full',
        },
        {
            title: t('common.status'),
            dataIndex: 'status',
            render: (status) => (_jsx(Tag, { color: statusColors[status], children: t(`status.${status}`) })),
        },
    ];
    const leaves = data?.data ?? [];
    const pagination = data?.pagination;
    return (_jsxs(_Fragment, { children: [_jsxs(Card, { style: { marginBottom: 16 }, children: [_jsxs(Row, { gutter: 32, children: [_jsx(Col, { children: _jsx(Statistic, { title: t('leaves.totalBalance', 'Total Balance'), value: totalBalance, suffix: t('leaves.daysUnit', 'days') }) }), _jsx(Col, { children: _jsx(Statistic, { title: t('leaves.used', 'Used'), value: usedDays, suffix: t('leaves.daysUnit', 'days'), valueStyle: usedDays > 0 ? { color: '#faad14' } : undefined }) }), _jsx(Col, { children: _jsx(Statistic, { title: t('leaves.remaining', 'Remaining'), value: remaining, suffix: t('leaves.daysUnit', 'days'), valueStyle: remaining === 0 ? { color: '#ff4d4f' } : { color: '#52c41a' } }) }), _jsx(Col, { children: _jsx(Statistic, { title: t('leaves.employeeId', 'Employee ID'), value: user?.employee_id ?? '-', valueStyle: { fontSize: 16 } }) }), _jsx(Col, { children: _jsx(Statistic, { title: t('leaves.role', 'Role'), value: user?.role ?? '-', valueStyle: { fontSize: 16 } }) })] }), remaining === 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: t('leaves.noBalanceRemaining', 'No leave balance remaining'), style: { marginTop: 12 } }))] }), _jsx(Card, { title: _jsxs(Space, { children: [_jsx(CalendarOutlined, {}), _jsx("span", { children: t('nav.leaves') })] }), extra: _jsxs(Space, { children: [_jsx(Select, { placeholder: "Filter by status", allowClear: true, style: { width: 150 }, value: statusFilter, onChange: setStatusFilter, options: [
                                { value: 'pending', label: t('status.pending') },
                                { value: 'approved', label: t('status.approved') },
                                { value: 'rejected', label: t('status.rejected') },
                            ] }), canRequestLeave && (_jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setModalOpen(true), disabled: remaining === 0, children: t('leave.request') }))] }), children: _jsx(Table, { columns: columns, dataSource: leaves, loading: isLoading, rowKey: "id", pagination: pagination ? {
                        current: pagination.page,
                        total: pagination.total,
                        pageSize: pagination.per_page,
                        onChange: setPage,
                    } : false }) }), _jsx(Modal, { title: t('leave.request'), open: modalOpen, onCancel: () => setModalOpen(false), footer: null, children: _jsxs(Form, { form: form, layout: "vertical", onFinish: handleSubmit, children: [_jsx(Form.Item, { name: "leave_type", label: t('leave.type'), rules: [{ required: true }], children: _jsx(Select, { options: leaveTypes.map(lt => ({ value: lt, label: t(`leave.${lt}`) })) }) }), _jsx(Form.Item, { name: "dates", label: `${t('leave.date_from')} - ${t('leave.date_to')}`, rules: [{ required: true }], children: _jsx(DatePicker.RangePicker, { style: { width: '100%' } }) }), _jsx(Form.Item, { name: "reason", label: t('leave.reason'), rules: [{ required: true }], children: _jsx(VoiceTextArea, { rows: 3 }) }), _jsx(Form.Item, { name: "coverage_user_id", label: t('leave.coverage', 'Coverage Employee'), rules: [{ required: true, message: t('leave.coverageRequired', 'Please select a coverage employee') }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('leave.assign_coverage', 'Select coverage employee'), children: allUsers
                                    .filter((u) => {
                                    if (u.id === user?.id)
                                        return false;
                                    if (user?.role === 'inspector') {
                                        return u.role === 'specialist' && (!user.specialization || !u.specialization || u.specialization === user.specialization);
                                    }
                                    if (user?.role === 'specialist') {
                                        return u.role === 'inspector' && (!user.specialization || !u.specialization || u.specialization === user.specialization);
                                    }
                                    return true;
                                })
                                    .map((u) => (_jsxs(Select.Option, { value: u.id, children: [u.full_name, " \u2014 ", u.employee_id, " (", u.role, ")"] }, u.id))) }) }), _jsx(Form.Item, { name: "scope", label: "Scope", initialValue: "full", children: _jsx(Select, { options: [
                                    { value: 'full', label: 'Full Leave' },
                                    { value: 'major_only', label: 'Major Tasks Only' },
                                ] }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: requestMutation.isPending, block: true, children: t('common.submit') }) })] }) })] }));
}
//# sourceMappingURL=LeavesPage.js.map