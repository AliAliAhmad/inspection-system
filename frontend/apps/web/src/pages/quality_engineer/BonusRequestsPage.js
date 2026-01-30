import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Form, Select, InputNumber, Input, message, } from 'antd';
import { StarOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { bonusStarsApi, usersApi, formatDateTime, } from '@inspection/shared';
const STATUS_COLOR = {
    pending: 'orange',
    approved: 'green',
    denied: 'red',
};
export default function BonusRequestsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [form] = Form.useForm();
    const [showForm, setShowForm] = useState(false);
    const { data: bonusData, isLoading: bonusLoading } = useQuery({
        queryKey: ['bonus-stars'],
        queryFn: () => bonusStarsApi.list().then((r) => r.data),
    });
    const bonuses = bonusData?.data ?? [];
    const { data: usersData } = useQuery({
        queryKey: ['users-all'],
        queryFn: () => usersApi.list({ per_page: 200 }).then((r) => r.data),
    });
    const users = usersData?.data ?? [];
    const requestMutation = useMutation({
        mutationFn: (payload) => bonusStarsApi.requestBonus(payload),
        onSuccess: () => {
            message.success(t('common.success', 'Bonus request submitted'));
            queryClient.invalidateQueries({ queryKey: ['bonus-stars'] });
            form.resetFields();
            setShowForm(false);
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const handleSubmit = (values) => {
        requestMutation.mutate({
            user_id: values.user_id,
            amount: values.amount,
            reason: values.reason,
            related_job_type: values.related_job_type || undefined,
            related_job_id: values.related_job_id || undefined,
        });
    };
    const getUserName = (userId) => {
        const user = users.find((u) => u.id === userId);
        return user?.full_name ?? `User #${userId}`;
    };
    const columns = [
        {
            title: t('common.user', 'User'),
            dataIndex: 'user_id',
            key: 'user_id',
            render: (userId) => getUserName(userId),
        },
        {
            title: t('common.amount', 'Amount'),
            dataIndex: 'amount',
            key: 'amount',
            render: (amount) => (_jsxs(Space, { children: [_jsx(StarOutlined, { style: { color: '#faad14' } }), _jsx("span", { style: { fontWeight: 'bold' }, children: amount })] })),
        },
        {
            title: t('common.reason', 'Reason'),
            dataIndex: 'reason',
            key: 'reason',
            ellipsis: true,
        },
        {
            title: t('common.related_job', 'Related Job'),
            key: 'related_job',
            render: (_, record) => {
                if (!record.related_job_type || !record.related_job_id)
                    return '-';
                return `${record.related_job_type} #${record.related_job_id}`;
            },
        },
        {
            title: t('common.status', 'Status'),
            key: 'status',
            render: (_, record) => {
                if (record.request_status) {
                    return (_jsx(Tag, { color: STATUS_COLOR[record.request_status] ?? 'default', children: t(`status.${record.request_status}`, record.request_status) }));
                }
                return (_jsx(Tag, { color: "green", children: t('status.awarded', 'Awarded') }));
            },
        },
        {
            title: t('common.date', 'Date'),
            dataIndex: 'awarded_at',
            key: 'awarded_at',
            render: (val) => formatDateTime(val),
        },
    ];
    return (_jsxs("div", { children: [_jsxs(Space, { style: { width: '100%', justifyContent: 'space-between', marginBottom: 16 }, children: [_jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.bonus_requests', 'Bonus Requests') }), _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setShowForm(!showForm), children: showForm
                            ? t('common.cancel', 'Cancel')
                            : t('common.request_bonus', 'Request Bonus') })] }), showForm && (_jsx(Card, { title: t('common.request_bonus', 'Request Bonus'), style: { marginBottom: 16 }, children: _jsxs(Form, { form: form, layout: "vertical", onFinish: handleSubmit, style: { maxWidth: 500 }, children: [_jsx(Form.Item, { name: "user_id", label: t('common.user', 'User'), rules: [{ required: true, message: t('common.required', 'Required') }], children: _jsx(Select, { showSearch: true, placeholder: t('common.select', 'Select user...'), optionFilterProp: "label", options: users.map((u) => ({
                                    value: u.id,
                                    label: `${u.full_name} (${u.role})`,
                                })) }) }), _jsx(Form.Item, { name: "amount", label: t('common.amount', 'Amount'), rules: [{ required: true, message: t('common.required', 'Required') }], children: _jsx(InputNumber, { min: 1, max: 10, style: { width: '100%' }, placeholder: "1-10" }) }), _jsx(Form.Item, { name: "reason", label: t('common.reason', 'Reason'), rules: [{ required: true, message: t('common.required', 'Required') }], children: _jsx(Input.TextArea, { rows: 3, placeholder: t('common.reason', 'Reason for bonus...') }) }), _jsx(Form.Item, { name: "related_job_type", label: t('common.related_job_type', 'Related Job Type (optional)'), children: _jsx(Select, { allowClear: true, placeholder: t('common.select', 'Select...'), options: [
                                    { value: 'specialist', label: t('common.specialist', 'Specialist') },
                                    { value: 'engineer', label: t('common.engineer', 'Engineer') },
                                ] }) }), _jsx(Form.Item, { name: "related_job_id", label: t('common.related_job_id', 'Related Job ID (optional)'), children: _jsx(InputNumber, { style: { width: '100%' }, placeholder: "Job ID" }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: requestMutation.isPending, block: true, children: t('common.submit', 'Submit Request') }) })] }) })), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: bonuses, loading: bonusLoading, locale: { emptyText: t('common.noData', 'No bonus requests') }, pagination: { pageSize: 15 } }) })] }));
}
//# sourceMappingURL=BonusRequestsPage.js.map