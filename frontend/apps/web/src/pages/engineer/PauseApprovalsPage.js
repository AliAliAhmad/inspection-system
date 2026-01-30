import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Table, Tag, Button, Space, Typography, Alert, Popconfirm, message } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { specialistJobsApi, formatDateTime } from '@inspection/shared';
const PAUSE_STATUS_COLOR = {
    pending: 'orange',
    approved: 'green',
    denied: 'red',
};
const REASON_CATEGORY_COLOR = {
    parts: 'blue',
    duty_finish: 'purple',
    tools: 'cyan',
    manpower: 'geekblue',
    oem: 'magenta',
    other: 'default',
};
export default function PauseApprovalsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ['pending-pauses'],
        queryFn: () => specialistJobsApi.getPendingPauses().then((r) => r.data),
    });
    const pauses = data?.data ?? [];
    const approveMutation = useMutation({
        mutationFn: (pauseId) => specialistJobsApi.approvePause(pauseId),
        onSuccess: () => {
            message.success(t('common.success', 'Pause approved'));
            queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const denyMutation = useMutation({
        mutationFn: (pauseId) => specialistJobsApi.denyPause(pauseId),
        onSuccess: () => {
            message.success(t('common.success', 'Pause denied'));
            queryClient.invalidateQueries({ queryKey: ['pending-pauses'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const columns = [
        {
            title: t('common.id', 'Job ID'),
            key: 'job_ref',
            render: (_, record) => `${record.job_type} #${record.job_id}`,
        },
        {
            title: t('common.reason_category', 'Reason Category'),
            dataIndex: 'reason_category',
            key: 'reason_category',
            render: (cat) => (_jsx(Tag, { color: REASON_CATEGORY_COLOR[cat] ?? 'default', children: t(`pause.${cat}`, cat.replace(/_/g, ' ')) })),
        },
        {
            title: t('common.details', 'Details'),
            dataIndex: 'reason_details',
            key: 'reason_details',
            ellipsis: true,
            render: (text) => text || '-',
        },
        {
            title: t('common.requested_at', 'Requested At'),
            dataIndex: 'requested_at',
            key: 'requested_at',
            render: (val) => formatDateTime(val),
        },
        {
            title: t('common.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: PAUSE_STATUS_COLOR[status] ?? 'default', children: t(`status.${status}`, status) })),
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 200,
            render: (_, record) => {
                if (record.status !== 'pending')
                    return null;
                return (_jsxs(Space, { children: [_jsx(Popconfirm, { title: t('common.confirm_approve', 'Approve this pause request?'), onConfirm: () => approveMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { type: "primary", icon: _jsx(CheckOutlined, {}), loading: approveMutation.isPending, size: "small", children: t('common.approve', 'Approve') }) }), _jsx(Popconfirm, { title: t('common.confirm_deny', 'Deny this pause request?'), onConfirm: () => denyMutation.mutate(record.id), okText: t('common.yes', 'Yes'), cancelText: t('common.no', 'No'), children: _jsx(Button, { danger: true, icon: _jsx(CloseOutlined, {}), loading: denyMutation.isPending, size: "small", children: t('common.deny', 'Deny') }) })] }));
            },
        },
    ];
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'An error occurred'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsx(Typography.Title, { level: 4, children: t('nav.pause_approvals', 'Pause Approvals') }), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: pauses, loading: isLoading, locale: { emptyText: t('common.noData', 'No pending pause requests') }, pagination: false }) })] }));
}
//# sourceMappingURL=PauseApprovalsPage.js.map