import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Table, Tag, Button, Badge, Typography, Alert, Space } from 'antd';
import { EyeOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { qualityReviewsApi, formatDateTime } from '@inspection/shared';
export default function OverdueReviewsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { data, isLoading, error } = useQuery({
        queryKey: ['overdue-reviews'],
        queryFn: () => qualityReviewsApi.getOverdue().then((r) => r.data),
    });
    const reviews = data?.data ?? [];
    const getOverdueHours = (deadline) => {
        if (!deadline)
            return 0;
        const diff = Date.now() - new Date(deadline).getTime();
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
    };
    const columns = [
        {
            title: t('common.urgency', 'Urgency'),
            key: 'urgency',
            width: 100,
            render: (_, record) => {
                const hours = getOverdueHours(record.sla_deadline);
                if (hours >= 24) {
                    return _jsx(Badge, { status: "error", text: _jsx(Tag, { color: "red", children: t('status.critical', 'Critical') }) });
                }
                if (hours >= 8) {
                    return _jsx(Badge, { status: "warning", text: _jsx(Tag, { color: "orange", children: t('status.high', 'High') }) });
                }
                return _jsx(Badge, { status: "processing", text: _jsx(Tag, { color: "gold", children: t('status.overdue', 'Overdue') }) });
            },
        },
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
                return (_jsxs(Space, { children: [_jsx(WarningOutlined, { style: { color: '#ff4d4f' } }), _jsx("span", { style: { color: '#ff4d4f', fontWeight: 'bold' }, children: formatDateTime(deadline) })] }));
            },
        },
        {
            title: t('common.overdue_by', 'Overdue By'),
            key: 'overdue_by',
            render: (_, record) => {
                const hours = getOverdueHours(record.sla_deadline);
                if (hours >= 24) {
                    const days = Math.floor(hours / 24);
                    return (_jsxs(Tag, { color: "red", icon: _jsx(ClockCircleOutlined, {}), children: [days, "d ", hours % 24, "h"] }));
                }
                return (_jsxs(Tag, { color: "orange", icon: _jsx(ClockCircleOutlined, {}), children: [hours, "h"] }));
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
            render: (_, record) => (_jsx(Button, { type: "primary", danger: true, icon: _jsx(EyeOutlined, {}), onClick: () => navigate(`/quality/reviews/${record.id}`), children: t('common.review', 'Review Now') })),
        },
    ];
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'An error occurred'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsxs(Space, { style: { width: '100%', justifyContent: 'space-between', marginBottom: 16 }, children: [_jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.overdue_reviews', 'Overdue Reviews') }), reviews.length > 0 && (_jsx(Badge, { count: reviews.length, overflowCount: 99, children: _jsx(Tag, { color: "red", style: { fontSize: 14, padding: '4px 12px' }, children: t('common.requires_attention', 'Requires Attention') }) }))] }), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: reviews, loading: isLoading, locale: { emptyText: t('common.noData', 'No overdue reviews') }, onRow: (record) => ({
                        onClick: () => navigate(`/quality/reviews/${record.id}`),
                        style: { cursor: 'pointer' },
                    }), pagination: false }) })] }));
}
//# sourceMappingURL=OverdueReviewsPage.js.map