import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Upload, Modal, Drawer, Form, Select, DatePicker, Input, InputNumber, message, Typography, Alert, Statistic, Divider, } from 'antd';
import { UploadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rosterApi, leavesApi, usersApi } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import dayjs from 'dayjs';
const { Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;
const ROLE_ORDER = {
    inspector: 0,
    specialist: 1,
    engineer: 2,
    quality_engineer: 3,
};
const ROLE_COLORS = {
    inspector: 'blue',
    specialist: 'orange',
    engineer: 'green',
    quality_engineer: 'purple',
    admin: 'red',
};
function shiftTag(value) {
    if (!value)
        return _jsx(Text, { type: "secondary", children: "-" });
    switch (value) {
        case 'day':
            return _jsx(Tag, { color: "blue", children: "D" });
        case 'night':
            return _jsx(Tag, { color: "purple", children: "N" });
        case 'off':
            return _jsx(Tag, { color: "default", children: "Off" });
        case 'leave':
            return _jsx(Tag, { color: "red", children: "Leave" });
        default:
            return _jsx(Text, { type: "secondary", children: "-" });
    }
}
export default function TeamRosterPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { user: currentUser } = useAuth();
    const [weekOffset, setWeekOffset] = useState(0);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedUserName, setSelectedUserName] = useState('');
    const [selectedUserRole, setSelectedUserRole] = useState('');
    const [selectedUserSpec, setSelectedUserSpec] = useState('');
    const [uploadResult, setUploadResult] = useState(null);
    const [leaveForm] = Form.useForm();
    const [addDaysForm] = Form.useForm();
    const baseDate = dayjs().add(weekOffset * 7, 'day').format('YYYY-MM-DD');
    // Fetch week data
    const { data: weekData, isLoading } = useQuery({
        queryKey: ['roster', 'week', baseDate],
        queryFn: () => rosterApi.getWeek(baseDate).then((r) => r.data.data),
    });
    // Fetch leave balance when drawer is open
    const { data: balanceData, isLoading: balanceLoading } = useQuery({
        queryKey: ['leaves', 'balance', selectedUserId],
        queryFn: () => leavesApi.getBalance(selectedUserId).then((r) => r.data.data ?? r.data.data),
        enabled: !!selectedUserId,
    });
    // Fetch active users for coverage dropdown
    const { data: activeUsersRaw } = useQuery({
        queryKey: ['users', 'active-list'],
        queryFn: () => usersApi.list({ per_page: 500 }),
        enabled: !!selectedUserId,
    });
    const allActiveUsers = activeUsersRaw?.data?.data ?? [];
    // Upload mutation
    const uploadMutation = useMutation({
        mutationFn: (file) => rosterApi.upload(file),
        onSuccess: (res) => {
            const result = res.data.data ?? res.data;
            setUploadResult({
                imported: result.imported ?? 0,
                users_processed: result.users_processed ?? 0,
                errors: result.errors ?? [],
            });
            queryClient.invalidateQueries({ queryKey: ['roster'] });
            message.success(t('roster.uploadSuccess', '{{count}} entries imported', { count: result.imported ?? 0 }));
        },
        onError: (err) => {
            const msg = err?.response?.data?.message || err?.message || 'Failed to upload roster';
            message.error(msg);
        },
    });
    // Leave request mutation
    const leaveRequestMutation = useMutation({
        mutationFn: (payload) => leavesApi.request(payload),
        onSuccess: () => {
            message.success(t('leaves.requestSuccess', 'Leave request submitted successfully'));
            leaveForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['leaves', 'balance', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['roster'] });
        },
        onError: (err) => {
            const msg = err?.response?.data?.message || err?.message || 'Failed to submit leave request';
            message.error(msg);
        },
    });
    // Add leave days mutation
    const addDaysMutation = useMutation({
        mutationFn: (payload) => leavesApi.addDays(payload.userId, payload.days, payload.reason),
        onSuccess: () => {
            message.success(t('leaves.addDaysSuccess', 'Leave days added successfully'));
            addDaysForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['leaves', 'balance', selectedUserId] });
            queryClient.invalidateQueries({ queryKey: ['roster'] });
        },
        onError: (err) => {
            const msg = err?.response?.data?.message || err?.message || 'Failed to add leave days';
            message.error(msg);
        },
    });
    // Sort users by role order
    const sortedUsers = [...(weekData?.users ?? [])].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
    const dates = weekData?.dates ?? [];
    // Calculate date range for display
    const rangeStart = dates.length > 0 ? dayjs(dates[0]) : dayjs().add(weekOffset * 7, 'day');
    const rangeEnd = dates.length > 0 ? dayjs(dates[dates.length - 1]) : rangeStart.add(7, 'day');
    // Coverage user options: inspectors covered by specialists, specialists covered by inspectors
    // Same specialization required for inspector/specialist
    const coverageUsers = allActiveUsers.filter((u) => {
        if (u.id === selectedUserId)
            return false;
        if (selectedUserRole === 'inspector') {
            return u.role === 'specialist' && (!selectedUserSpec || !u.specialization || u.specialization === selectedUserSpec);
        }
        if (selectedUserRole === 'specialist') {
            return u.role === 'inspector' && (!selectedUserSpec || !u.specialization || u.specialization === selectedUserSpec);
        }
        return true;
    });
    // Leave history columns
    const leaveHistoryColumns = [
        {
            title: t('leaves.type', 'Type'),
            dataIndex: 'leave_type',
            key: 'leave_type',
            render: (val) => _jsx(Tag, { children: val }),
        },
        {
            title: t('leaves.from', 'From'),
            dataIndex: 'date_from',
            key: 'date_from',
            render: (val) => dayjs(val).format('DD/MM/YYYY'),
        },
        {
            title: t('leaves.to', 'To'),
            dataIndex: 'date_to',
            key: 'date_to',
            render: (val) => dayjs(val).format('DD/MM/YYYY'),
        },
        {
            title: t('leaves.days', 'Days'),
            dataIndex: 'total_days',
            key: 'total_days',
        },
        {
            title: t('leaves.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (val) => {
                const color = val === 'approved' ? 'green' : val === 'rejected' ? 'red' : 'orange';
                return _jsx(Tag, { color: color, children: val });
            },
        },
        {
            title: t('leaves.coverage', 'Coverage'),
            dataIndex: 'coverage_user',
            key: 'coverage_user',
            render: (val) => val?.full_name ?? '-',
        },
    ];
    // Handle leave form submit
    const handleLeaveSubmit = (values) => {
        const [dateFrom, dateTo] = values.date_range;
        leaveRequestMutation.mutate({
            user_id: selectedUserId,
            leave_type: values.leave_type,
            date_from: dateFrom.format('YYYY-MM-DD'),
            date_to: dateTo.format('YYYY-MM-DD'),
            reason: values.reason,
            scope: values.scope,
            coverage_user_id: values.coverage_user_id,
        });
    };
    // Handle add days submit
    const handleAddDays = (values) => {
        addDaysMutation.mutate({
            userId: selectedUserId,
            days: values.days,
            reason: values.reason,
        });
    };
    // Build table columns
    const columns = [
        {
            title: t('roster.teamMember', 'Team Member'),
            key: 'user',
            fixed: 'left',
            width: 220,
            render: (_, record) => {
                const leaveUsed = record.leave_used ?? 0;
                const leaveBalance = record.leave_remaining ?? 0;
                return (_jsxs(Space, { direction: "vertical", size: 2, children: [_jsx(Text, { strong: true, children: record.full_name }), _jsxs(Space, { size: 4, children: [_jsx(Tag, { color: ROLE_COLORS[record.role] ?? 'default', children: record.role }), record.specialization && _jsx(Tag, { children: record.specialization })] }), _jsxs(Space, { size: 8, children: [_jsxs(Text, { type: "secondary", style: { fontSize: 11 }, children: ["Taken: ", leaveUsed] }), _jsxs(Text, { style: {
                                        fontSize: 11,
                                        color: leaveBalance === 0 ? '#ff4d4f' : undefined,
                                    }, type: leaveBalance === 0 ? undefined : 'secondary', children: ["Balance: ", leaveBalance] })] })] }));
            },
        },
        ...dates.map((date) => ({
            title: (_jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { children: dayjs(date).format('ddd') }), _jsx("div", { children: dayjs(date).format('DD/MM') })] })),
            key: date,
            width: 80,
            align: 'center',
            render: (_, record) => shiftTag(record.entries[date]),
        })),
    ];
    const isAdmin = currentUser?.role === 'admin';
    const remaining = balanceData?.remaining ?? 0;
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.roster', 'Team Roster') }), extra: _jsx(Space, { children: _jsx(Upload, { accept: ".xlsx,.xls", showUploadList: false, beforeUpload: (file) => {
                    uploadMutation.mutate(file);
                    return false;
                }, children: _jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: uploadMutation.isPending, children: t('roster.importRoster', 'Import Roster') }) }) }), children: [_jsxs(Space, { style: { marginBottom: 16, display: 'flex', justifyContent: 'center' }, children: [_jsx(Button, { icon: _jsx(LeftOutlined, {}), onClick: () => setWeekOffset((o) => o - 1), children: t('roster.prevWeek', 'Prev Week') }), _jsx(Button, { type: "text", onClick: () => setWeekOffset(0), children: _jsxs(Text, { strong: true, children: [rangeStart.format('DD MMM'), " - ", rangeEnd.format('DD MMM YYYY')] }) }), _jsxs(Button, { onClick: () => setWeekOffset((o) => o + 1), children: [t('roster.nextWeek', 'Next Week'), " ", _jsx(RightOutlined, {})] })] }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: sortedUsers, loading: isLoading, pagination: false, scroll: { x: 900 }, size: "small", bordered: true, locale: { emptyText: t('common.noData', 'No data available') }, onRow: (record) => ({
                    onClick: () => {
                        setSelectedUserId(record.id);
                        setSelectedUserName(record.full_name);
                        setSelectedUserRole(record.role);
                        setSelectedUserSpec(record.specialization ?? '');
                    },
                    style: { cursor: 'pointer' },
                }) }), _jsx(Drawer, { title: selectedUserName, open: !!selectedUserId, onClose: () => {
                    setSelectedUserId(null);
                    setSelectedUserName('');
                    setSelectedUserRole('');
                    setSelectedUserSpec('');
                    leaveForm.resetFields();
                    addDaysForm.resetFields();
                }, width: 600, footer: null, children: balanceLoading ? (_jsx(Text, { type: "secondary", children: t('common.loading', 'Loading...') })) : (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: "middle", children: [_jsxs(Space, { size: "large", children: [_jsx(Statistic, { title: t('leaves.totalBalance', 'Total Balance'), value: balanceData?.total_balance ?? 0 }), _jsx(Statistic, { title: t('leaves.used', 'Used'), value: balanceData?.used ?? 0 }), _jsx(Statistic, { title: t('leaves.remaining', 'Remaining'), value: remaining, valueStyle: remaining === 0 ? { color: '#ff4d4f' } : undefined })] }), remaining === 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: t('leaves.noBalanceRemaining', 'No leave balance remaining') })), _jsx(Divider, {}), _jsx(Typography.Title, { level: 5, children: t('leaves.history', 'Leave History') }), _jsx(Table, { rowKey: (record) => record.id ?? `${record.date_from}-${record.date_to}`, columns: leaveHistoryColumns, dataSource: balanceData?.leaves ?? [], pagination: false, size: "small", bordered: true, locale: { emptyText: t('leaves.noHistory', 'No leave history') } }), remaining > 0 && (_jsxs(_Fragment, { children: [_jsx(Divider, {}), _jsx(Typography.Title, { level: 5, children: t('leaves.requestLeave', 'Request Leave') }), _jsxs(Form, { form: leaveForm, layout: "vertical", onFinish: handleLeaveSubmit, children: [_jsx(Form.Item, { name: "leave_type", label: t('leaves.leaveType', 'Leave Type'), rules: [{ required: true, message: t('leaves.leaveTypeRequired', 'Please select a leave type') }], children: _jsxs(Select, { placeholder: t('leaves.selectType', 'Select leave type'), children: [_jsx(Select.Option, { value: "sick", children: t('leaves.sick', 'Sick') }), _jsx(Select.Option, { value: "annual", children: t('leaves.annual', 'Annual') }), _jsx(Select.Option, { value: "emergency", children: t('leaves.emergency', 'Emergency') }), _jsx(Select.Option, { value: "training", children: t('leaves.training', 'Training') }), _jsx(Select.Option, { value: "other", children: t('leaves.other', 'Other') })] }) }), _jsx(Form.Item, { name: "date_range", label: t('leaves.dateRange', 'Date Range'), rules: [{ required: true, message: t('leaves.dateRangeRequired', 'Please select date range') }], children: _jsx(RangePicker, { style: { width: '100%' } }) }), _jsx(Form.Item, { name: "reason", label: t('leaves.reason', 'Reason'), rules: [{ required: true, message: t('leaves.reasonRequired', 'Please provide a reason') }], children: _jsx(TextArea, { rows: 3, placeholder: t('leaves.reasonPlaceholder', 'Enter reason for leave') }) }), _jsx(Form.Item, { name: "coverage_user_id", label: t('leaves.coverageEmployee', 'Coverage Employee'), rules: [{ required: true, message: t('leaves.coverageRequired', 'Coverage employee is required') }], children: _jsx(Select, { placeholder: t('leaves.selectCoverage', 'Select coverage employee'), showSearch: true, optionFilterProp: "label", options: coverageUsers.map((u) => ({
                                                    value: u.id,
                                                    label: `${u.full_name} — ${u.employee_id ?? u.id} (${u.role})`,
                                                })) }) }), _jsx(Form.Item, { name: "scope", label: t('leaves.scope', 'Scope'), rules: [{ required: true, message: t('leaves.scopeRequired', 'Please select scope') }], children: _jsxs(Select, { placeholder: t('leaves.selectScope', 'Select scope'), children: [_jsx(Select.Option, { value: "full", children: t('leaves.full', 'Full') }), _jsx(Select.Option, { value: "major_only", children: t('leaves.majorOnly', 'Major Only') })] }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: leaveRequestMutation.isPending, block: true, children: t('leaves.submitRequest', 'Submit Leave Request') }) })] })] })), isAdmin && (_jsxs(_Fragment, { children: [_jsx(Divider, {}), _jsx(Typography.Title, { level: 5, children: t('leaves.addLeaveDays', 'Add Leave Days') }), _jsxs(Form, { form: addDaysForm, layout: "vertical", onFinish: handleAddDays, children: [_jsx(Form.Item, { name: "days", label: t('leaves.numberOfDays', 'Number of Days'), rules: [{ required: true, message: t('leaves.daysRequired', 'Please enter number of days') }], children: _jsx(InputNumber, { min: 1, style: { width: '100%' }, placeholder: t('leaves.enterDays', 'Enter days') }) }), _jsx(Form.Item, { name: "reason", label: t('leaves.reason', 'Reason'), rules: [{ required: true, message: t('leaves.reasonRequired', 'Please provide a reason') }], children: _jsx(TextArea, { rows: 2, placeholder: t('leaves.addDaysReasonPlaceholder', 'Reason for adding days') }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "default", htmlType: "submit", loading: addDaysMutation.isPending, block: true, children: t('leaves.addDaysButton', 'Add Days') }) })] })] }))] })) }), _jsx(Modal, { title: t('roster.uploadResult', 'Roster Upload Result'), open: uploadResult !== null, onCancel: () => setUploadResult(null), onOk: () => setUploadResult(null), cancelButtonProps: { style: { display: 'none' } }, children: uploadResult && (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsx("strong", { children: uploadResult.imported }), ' ', t('roster.entriesImported', 'entries imported'), " ", t('roster.forUsers', 'for'), ' ', _jsx("strong", { children: uploadResult.users_processed }), " ", t('roster.users', 'users'), "."] }), uploadResult.errors.length > 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: t('roster.uploadWarnings', '{{count}} warnings', {
                                count: uploadResult.errors.length,
                            }), description: _jsx("ul", { style: {
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    paddingLeft: 16,
                                    margin: 0,
                                }, children: uploadResult.errors.map((err, i) => (_jsx("li", { children: err }, i))) }) }))] })) })] }));
}
//# sourceMappingURL=TeamRosterPage.js.map