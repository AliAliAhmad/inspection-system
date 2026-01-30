import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Tabs, Typography, } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { defectsApi, } from '@inspection/shared';
const severityColors = {
    critical: 'red',
    high: 'orange',
    medium: 'gold',
    low: 'green',
};
const statusColors = {
    open: 'red',
    in_progress: 'blue',
    resolved: 'green',
    closed: 'default',
    false_alarm: 'purple',
};
const statusLabels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
    false_alarm: 'False Alarm',
};
export default function DefectsPage() {
    const { t } = useTranslation();
    const [activeStatus, setActiveStatus] = useState();
    const [page, setPage] = useState(1);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['defects', activeStatus, page],
        queryFn: () => defectsApi.list({ status: activeStatus, page, per_page: 20 }).then(r => r.data),
    });
    const columns = [
        {
            title: t('defects.id', 'ID'),
            dataIndex: 'id',
            key: 'id',
            width: 70,
        },
        {
            title: t('defects.description', 'Description'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: t('defects.severity', 'Severity'),
            dataIndex: 'severity',
            key: 'severity',
            render: (severity) => (_jsx(Tag, { color: severityColors[severity] || 'default', children: severity?.toUpperCase() })),
        },
        {
            title: t('defects.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: statusColors[status] || 'default', children: statusLabels[status] || status?.toUpperCase() })),
        },
        {
            title: t('defects.category', 'Category'),
            dataIndex: 'category',
            key: 'category',
            render: (category) => category ? (_jsx(Tag, { color: category === 'mechanical' ? 'blue' : 'gold', children: category.toUpperCase() })) : ('-'),
        },
        {
            title: t('defects.priority', 'Priority'),
            dataIndex: 'priority',
            key: 'priority',
            render: (priority) => _jsx(Tag, { children: priority?.toUpperCase() }),
        },
        {
            title: t('defects.dueDate', 'Due Date'),
            dataIndex: 'due_date',
            key: 'due_date',
            render: (v) => v || '-',
        },
        {
            title: t('defects.createdAt', 'Created At'),
            dataIndex: 'created_at',
            key: 'created_at',
            render: (v) => v || '-',
        },
    ];
    const defects = data?.data || [];
    const pagination = data?.pagination;
    const tabItems = [
        { key: 'all', label: t('defects.all', 'All') },
        { key: 'open', label: t('defects.open', 'Open') },
        { key: 'in_progress', label: t('defects.inProgress', 'In Progress') },
        { key: 'resolved', label: t('defects.resolved', 'Resolved') },
        { key: 'closed', label: t('defects.closed', 'Closed') },
        { key: 'false_alarm', label: t('defects.falseAlarm', 'False Alarm') },
    ];
    const handleTabChange = (key) => {
        setActiveStatus(key === 'all' ? undefined : key);
        setPage(1);
    };
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.defects', 'Defects') }), children: [_jsx(Tabs, { activeKey: activeStatus || 'all', onChange: handleTabChange, items: tabItems }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: defects, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || 20,
                    total: pagination?.total || 0,
                    showSizeChanger: false,
                    onChange: (p) => setPage(p),
                }, scroll: { x: 1000 } })] }));
}
//# sourceMappingURL=DefectsPage.js.map