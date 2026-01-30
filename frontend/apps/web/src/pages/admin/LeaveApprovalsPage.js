import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, message, Typography, Tabs, Spin, } from 'antd';
import { CheckOutlined, CloseOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leavesApi, } from '@inspection/shared';
import dayjs from 'dayjs';
const statusColorMap = {
    pending: 'processing',
    approved: 'success',
    rejected: 'error',
};
const leaveTypeColorMap = {
    sick: 'red',
    annual: 'blue',
    emergency: 'orange',
    training: 'purple',
    other: 'default',
};
export default function LeaveApprovalsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [statusFilter, setStatusFilter] = useState();
    const [approveOpen, setApproveOpen] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [coverageOpen, setCoverageOpen] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [approveForm] = Form.useForm();
    const [rejectForm] = Form.useForm();
    const [coverageForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['leaves', page, perPage, statusFilter],
        queryFn: () => leavesApi.list({ page, per_page: perPage, status: statusFilter }),
    });
    const { data: candidatesData, isLoading: candidatesLoading } = useQuery({
        queryKey: ['leave-coverage-candidates', selectedLeave?.id],
        queryFn: () => leavesApi.getCoverageCandidates(selectedLeave.id),
        enabled: coverageOpen && !!selectedLeave,
    });
    const approveMutation = useMutation({
        mutationFn: ({ id, notes }) => leavesApi.approve(id, notes ? { notes } : undefined),
        onSuccess: () => {
            message.success(t('leaves.approveSuccess', 'Leave approved'));
            queryClient.invalidateQueries({ queryKey: ['leaves'] });
            setApproveOpen(false);
            setSelectedLeave(null);
            approveForm.resetFields();
        },
        onError: () => message.error(t('leaves.approveError', 'Failed to approve leave')),
    });
    const rejectMutation = useMutation({
        mutationFn: ({ id, rejection_reason }) => leavesApi.reject(id, rejection_reason ? { rejection_reason } : undefined),
        onSuccess: () => {
            message.success(t('leaves.rejectSuccess', 'Leave rejected'));
            queryClient.invalidateQueries({ queryKey: ['leaves'] });
            setRejectOpen(false);
            setSelectedLeave(null);
            rejectForm.resetFields();
        },
        onError: () => message.error(t('leaves.rejectError', 'Failed to reject leave')),
    });
    const coverageMutation = useMutation({
        mutationFn: ({ leaveId, userId }) => leavesApi.assignCoverage(leaveId, userId),
        onSuccess: () => {
            message.success(t('leaves.coverageSuccess', 'Coverage assigned'));
            queryClient.invalidateQueries({ queryKey: ['leaves'] });
            setCoverageOpen(false);
            setSelectedLeave(null);
            coverageForm.resetFields();
        },
        onError: () => message.error(t('leaves.coverageError', 'Failed to assign coverage')),
    });
    const columns = [
        {
            title: t('leaves.user', 'User'),
            key: 'user',
            render: (_, r) => r.user?.full_name || `#${r.user_id}`,
        },
        {
            title: t('leaves.leaveType', 'Leave Type'),
            dataIndex: 'leave_type',
            key: 'leave_type',
            render: (v) => _jsx(Tag, { color: leaveTypeColorMap[v] || 'default', children: v.toUpperCase() }),
        },
        {
            title: t('leaves.dateFrom', 'From'),
            dataIndex: 'date_from',
            key: 'date_from',
            render: (v) => dayjs(v).format('YYYY-MM-DD'),
        },
        {
            title: t('leaves.dateTo', 'To'),
            dataIndex: 'date_to',
            key: 'date_to',
            render: (v) => dayjs(v).format('YYYY-MM-DD'),
        },
        {
            title: t('leaves.totalDays', 'Days'),
            dataIndex: 'total_days',
            key: 'total_days',
        },
        {
            title: t('leaves.reason', 'Reason'),
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
            render: (v) => v || '-',
        },
        {
            title: t('leaves.scope', 'Scope'),
            dataIndex: 'scope',
            key: 'scope',
            render: (v) => _jsx(Tag, { children: v.replace(/_/g, ' ').toUpperCase() }),
        },
        {
            title: t('leaves.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (s) => _jsx(Tag, { color: statusColorMap[s], children: s.toUpperCase() }),
        },
        {
            title: t('leaves.coverage', 'Coverage'),
            key: 'coverage',
            render: (_, r) => r.coverage_user?.full_name || '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 250,
            render: (_, record) => (_jsxs(Space, { wrap: true, children: [record.status === 'pending' && (_jsxs(_Fragment, { children: [_jsx(Button, { type: "link", icon: _jsx(CheckOutlined, {}), onClick: () => { setSelectedLeave(record); setApproveOpen(true); approveForm.resetFields(); }, children: t('leaves.approve', 'Approve') }), _jsx(Button, { type: "link", danger: true, icon: _jsx(CloseOutlined, {}), onClick: () => { setSelectedLeave(record); setRejectOpen(true); rejectForm.resetFields(); }, children: t('leaves.reject', 'Reject') })] })), record.status === 'approved' && !record.coverage_user_id && (_jsx(Button, { type: "link", icon: _jsx(UserSwitchOutlined, {}), onClick: () => { setSelectedLeave(record); setCoverageOpen(true); coverageForm.resetFields(); }, children: t('leaves.assignCoverage', 'Assign Coverage') }))] })),
        },
    ];
    const leaves = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const candidates = candidatesData?.data?.data || [];
    const tabItems = [
        { key: 'all', label: t('common.all', 'All') },
        { key: 'pending', label: t('leaves.pending', 'Pending') },
        { key: 'approved', label: t('leaves.approved', 'Approved') },
        { key: 'rejected', label: t('leaves.rejected', 'Rejected') },
    ];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.leaveApprovals', 'Leave Approvals') }), children: [_jsx(Tabs, { activeKey: statusFilter || 'all', onChange: (key) => { setStatusFilter(key === 'all' ? undefined : key); setPage(1); }, items: tabItems }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: leaves, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, scroll: { x: 1200 } }), _jsxs(Modal, { title: t('leaves.approveLeave', 'Approve Leave'), open: approveOpen, onCancel: () => { setApproveOpen(false); setSelectedLeave(null); approveForm.resetFields(); }, onOk: () => approveForm.submit(), confirmLoading: approveMutation.isPending, destroyOnClose: true, children: [_jsx(Typography.Paragraph, { type: "secondary", children: t('leaves.approveDescription', 'Approve leave for {{user}}', {
                            user: selectedLeave?.user?.full_name || '',
                        }) }), _jsx(Form, { form: approveForm, layout: "vertical", onFinish: (v) => selectedLeave && approveMutation.mutate({ id: selectedLeave.id, notes: v.notes }), children: _jsx(Form.Item, { name: "notes", label: t('leaves.notes', 'Notes (optional)'), children: _jsx(Input.TextArea, { rows: 3 }) }) })] }), _jsx(Modal, { title: t('leaves.rejectLeave', 'Reject Leave'), open: rejectOpen, onCancel: () => { setRejectOpen(false); setSelectedLeave(null); rejectForm.resetFields(); }, onOk: () => rejectForm.submit(), confirmLoading: rejectMutation.isPending, destroyOnClose: true, children: _jsx(Form, { form: rejectForm, layout: "vertical", onFinish: (v) => selectedLeave && rejectMutation.mutate({ id: selectedLeave.id, rejection_reason: v.rejection_reason }), children: _jsx(Form.Item, { name: "rejection_reason", label: t('leaves.rejectionReason', 'Rejection Reason'), children: _jsx(Input.TextArea, { rows: 3 }) }) }) }), _jsx(Modal, { title: t('leaves.assignCoverage', 'Assign Coverage'), open: coverageOpen, onCancel: () => { setCoverageOpen(false); setSelectedLeave(null); coverageForm.resetFields(); }, onOk: () => coverageForm.submit(), confirmLoading: coverageMutation.isPending, destroyOnClose: true, children: _jsx(Spin, { spinning: candidatesLoading, children: _jsx(Form, { form: coverageForm, layout: "vertical", onFinish: (v) => selectedLeave && coverageMutation.mutate({ leaveId: selectedLeave.id, userId: v.user_id }), children: _jsx(Form.Item, { name: "user_id", label: t('leaves.coverageUser', 'Coverage User'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('leaves.selectUser', 'Select a user'), children: candidates.map((u) => (_jsxs(Select.Option, { value: u.id, children: [u.full_name, " (", u.employee_id, ") - ", u.role] }, u.id))) }) }) }) }) })] }));
}
//# sourceMappingURL=LeaveApprovalsPage.js.map