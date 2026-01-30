import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Table, Tag, Button, Typography, Alert, Space } from 'antd';
import { EyeOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { qualityReviewsApi, formatDateTime } from '@inspection/shared';
export default function PendingReviewsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data, isLoading, error } = useQuery({
        queryKey: ['pending-reviews'],
        queryFn: () => qualityReviewsApi.getPending().then((r) => r.data),
    });
    const reviews = data?.data ?? [];
    const isOverdue = (slaDeadline) => {
        if (!slaDeadline)
            return false;
        return new Date(slaDeadline).getTime() < Date.now();
    };
    const columns = [
        {
            title: t('common.type', 'Job Type'),
            dataIndex: 'job_type',
            key: 'job_type',
            render: (type) => (_jsx(Tag, { color: type === 'specialist' ? 'blue' : 'purple', children: t(`common.${type}`, type) })),
        },
        {
            title: t('common.id', 'Job ID'),
            dataIndex: 'job_id',
            key: 'job_id',
        },
        {
            title: t('quality.sla_deadline', 'SLA Deadline'),
            dataIndex: 'sla_deadline',
            key: 'sla_deadline',
            render: (deadline) => {
                if (!deadline)
                    return '-';
                const overdue = isOverdue(deadline);
                return (_jsxs(Space, { children: [_jsx("span", { style: { color: overdue ? '#ff4d4f' : undefined }, children: formatDateTime(deadline) }), overdue && (_jsx(Tag, { color: "red", icon: _jsx(WarningOutlined, {}), children: t('status.overdue', 'Overdue') }))] }));
            },
        },
        {
            title: t('common.created_at', 'Created At'),
            dataIndex: 'created_at',
            key: 'created_at',
            render: (val) => formatDateTime(val),
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 120,
            render: (_, record) => (_jsx(Button, { type: "primary", icon: _jsx(EyeOutlined, {}), onClick: () => navigate(`/quality/reviews/${record.id}`), children: t('common.review', 'Review') })),
        },
    ];
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'An error occurred'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsx(Typography.Title, { level: 4, children: t('nav.pending_reviews', 'Pending Reviews') }), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: reviews, loading: isLoading, locale: { emptyText: t('common.noData', 'No pending reviews') }, onRow: (record) => ({
                        onClick: () => navigate(`/quality/reviews/${record.id}`),
                        style: { cursor: 'pointer' },
                    }), pagination: false }) })] }));
}
//# sourceMappingURL=PendingReviewsPage.js.map