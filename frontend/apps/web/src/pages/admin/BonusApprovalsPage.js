import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, Popconfirm, message, Typography, Divider, Empty, Spin, } from 'antd';
import { CheckOutlined, CloseOutlined, GiftOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { bonusStarsApi, usersApi, } from '@inspection/shared';
import dayjs from 'dayjs';
export default function BonusApprovalsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [awardOpen, setAwardOpen] = useState(false);
    const [awardForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['bonus-stars'],
        queryFn: () => bonusStarsApi.list(),
    });
    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ['users', 'all-active'],
        queryFn: () => usersApi.list({ is_active: true, per_page: 500 }),
        enabled: awardOpen,
    });
    const approveMutation = useMutation({
        mutationFn: (bonusId) => bonusStarsApi.approveRequest(bonusId),
        onSuccess: () => {
            message.success(t('bonus.approveSuccess', 'Bonus request approved'));
            queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
        },
        onError: () => message.error(t('bonus.approveError', 'Failed to approve request')),
    });
    const denyMutation = useMutation({
        mutationFn: (bonusId) => bonusStarsApi.denyRequest(bonusId),
        onSuccess: () => {
            message.success(t('bonus.denySuccess', 'Bonus request denied'));
            queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
        },
        onError: () => message.error(t('bonus.denyError', 'Failed to deny request')),
    });
    const awardMutation = useMutation({
        mutationFn: (payload) => bonusStarsApi.award(payload),
        onSuccess: () => {
            message.success(t('bonus.awardSuccess', 'Bonus awarded successfully'));
            queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
            setAwardOpen(false);
            awardForm.resetFields();
        },
        onError: () => message.error(t('bonus.awardError', 'Failed to award bonus')),
    });
    const allBonuses = data?.data?.data || [];
    const pendingRequests = allBonuses.filter((b) => b.is_qe_request && b.request_status === 'pending');
    const allUsers = usersData?.data?.data || [];
    const requestStatusColor = {
        pending: 'processing',
        approved: 'success',
        denied: 'error',
    };
    const pendingColumns = [
        { title: t('bonus.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
        {
            title: t('bonus.userId', 'User ID'),
            dataIndex: 'user_id',
            key: 'user_id',
            render: (v) => `#${v}`,
        },
        {
            title: t('bonus.amount', 'Amount'),
            dataIndex: 'amount',
            key: 'amount',
            render: (v) => _jsx(Tag, { color: "gold", children: v }),
        },
        {
            title: t('bonus.reason', 'Reason'),
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: t('bonus.relatedJob', 'Related Job'),
            key: 'related',
            render: (_, r) => r.related_job_type ? `${r.related_job_type} #${r.related_job_id}` : '-',
        },
        {
            title: t('bonus.awardedAt', 'Requested At'),
            dataIndex: 'awarded_at',
            key: 'awarded_at',
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsxs(Space, { children: [_jsx(Popconfirm, { title: t('bonus.approveConfirm', 'Approve this bonus request?'), onConfirm: () => approveMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", icon: _jsx(CheckOutlined, {}), children: t('bonus.approve', 'Approve') }) }), _jsx(Popconfirm, { title: t('bonus.denyConfirm', 'Deny this bonus request?'), onConfirm: () => denyMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "link", danger: true, icon: _jsx(CloseOutlined, {}), children: t('bonus.deny', 'Deny') }) })] })),
        },
    ];
    const historyColumns = [
        { title: t('bonus.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
        {
            title: t('bonus.userId', 'User ID'),
            dataIndex: 'user_id',
            key: 'user_id',
            render: (v) => `#${v}`,
        },
        {
            title: t('bonus.awardedBy', 'Awarded By'),
            dataIndex: 'awarded_by',
            key: 'awarded_by',
            render: (v) => v ? `#${v}` : '-',
        },
        {
            title: t('bonus.amount', 'Amount'),
            dataIndex: 'amount',
            key: 'amount',
            render: (v) => _jsx(Tag, { color: "gold", children: v }),
        },
        {
            title: t('bonus.reason', 'Reason'),
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: t('bonus.relatedJob', 'Related Job'),
            key: 'related',
            render: (_, r) => r.related_job_type ? `${r.related_job_type} #${r.related_job_id}` : '-',
        },
        {
            title: t('bonus.qeRequest', 'QE Request'),
            dataIndex: 'is_qe_request',
            key: 'is_qe_request',
            render: (v) => v ? _jsx(Tag, { color: "purple", children: t('common.yes', 'Yes') }) : '-',
        },
        {
            title: t('bonus.requestStatus', 'Status'),
            dataIndex: 'request_status',
            key: 'request_status',
            render: (v) => v ? _jsx(Tag, { color: requestStatusColor[v] || 'default', children: v.toUpperCase() }) : '-',
        },
        {
            title: t('bonus.awardedAt', 'Awarded At'),
            dataIndex: 'awarded_at',
            key: 'awarded_at',
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        },
    ];
    return (_jsxs("div", { children: [_jsx(Card, { title: _jsx(Typography.Title, { level: 4, children: t('bonus.pendingRequests', 'Pending Bonus Requests') }), style: { marginBottom: 24 }, children: pendingRequests.length === 0 ? (_jsx(Empty, { description: t('bonus.noPending', 'No pending bonus requests') })) : (_jsx(Table, { rowKey: "id", columns: pendingColumns, dataSource: pendingRequests, loading: isLoading, pagination: false, scroll: { x: 800 } })) }), _jsx(Card, { title: _jsx(Typography.Title, { level: 4, children: t('bonus.history', 'Bonus History') }), extra: _jsx(Button, { type: "primary", icon: _jsx(GiftOutlined, {}), onClick: () => setAwardOpen(true), children: t('bonus.awardBonus', 'Award Bonus') }), children: _jsx(Table, { rowKey: "id", columns: historyColumns, dataSource: allBonuses, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 1000 } }) }), _jsx(Modal, { title: t('bonus.awardBonus', 'Award Bonus'), open: awardOpen, onCancel: () => { setAwardOpen(false); awardForm.resetFields(); }, onOk: () => awardForm.submit(), confirmLoading: awardMutation.isPending, destroyOnClose: true, children: _jsx(Spin, { spinning: usersLoading, children: _jsxs(Form, { form: awardForm, layout: "vertical", onFinish: (v) => awardMutation.mutate(v), children: [_jsx(Form.Item, { name: "user_id", label: t('bonus.user', 'User'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('bonus.selectUser', 'Select a user'), children: allUsers.map((u) => (_jsxs(Select.Option, { value: u.id, children: [u.full_name, " (", u.employee_id, ") - ", u.role] }, u.id))) }) }), _jsx(Form.Item, { name: "amount", label: t('bonus.amount', 'Amount'), rules: [{ required: true }], children: _jsx(InputNumber, { min: 1, max: 100, style: { width: '100%' } }) }), _jsx(Form.Item, { name: "reason", label: t('bonus.reason', 'Reason'), rules: [{ required: true }], children: _jsx(Input.TextArea, { rows: 3 }) }), _jsx(Divider, { children: t('bonus.optionalFields', 'Optional - Related Job') }), _jsx(Form.Item, { name: "related_job_type", label: t('bonus.relatedJobType', 'Related Job Type'), children: _jsxs(Select, { allowClear: true, children: [_jsx(Select.Option, { value: "specialist", children: "Specialist" }), _jsx(Select.Option, { value: "engineer", children: "Engineer" })] }) }), _jsx(Form.Item, { name: "related_job_id", label: t('bonus.relatedJobId', 'Related Job ID'), children: _jsx(InputNumber, { min: 1, style: { width: '100%' } }) })] }) }) })] }));
}
//# sourceMappingURL=BonusApprovalsPage.js.map