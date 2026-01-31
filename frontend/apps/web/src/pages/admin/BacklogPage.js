import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, Table, Tag, Badge, Typography, } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, } from '@inspection/shared';
function formatDateTime(iso) {
    if (!iso)
        return '-';
    return new Date(iso).toLocaleString();
}
function getOverdueHours(deadline) {
    if (!deadline)
        return 0;
    const diff = Date.now() - new Date(deadline).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
}
function getOverdueLabel(hours) {
    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remaining = hours % 24;
        return `${days}d ${remaining}h`;
    }
    return `${hours}h`;
}
export default function BacklogPage() {
    const { t } = useTranslation();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['backlog-assignments'],
        queryFn: () => inspectionAssignmentsApi.getBacklog().then(r => {
            const d = r.data;
            return Array.isArray(d) ? d : d.data ?? [];
        }),
    });
    const assignments = data || [];
    const columns = [
        {
            title: t('backlog.equipment', 'Equipment'),
            key: 'equipment',
            render: (_, record) => record.equipment?.name || `#${record.equipment_id}`,
            sorter: (a, b) => (a.equipment?.name || '').localeCompare(b.equipment?.name || ''),
        },
        {
            title: t('backlog.shift', 'Shift'),
            dataIndex: 'shift',
            key: 'shift',
            render: (shift) => (_jsx(Tag, { color: shift === 'day' ? 'blue' : 'purple', children: shift === 'day' ? t('routines.day', 'Day') : t('routines.night', 'Night') })),
        },
        {
            title: t('backlog.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => _jsx(Tag, { children: status.replace(/_/g, ' ').toUpperCase() }),
        },
        {
            title: t('backlog.deadline', 'Deadline'),
            dataIndex: 'deadline',
            key: 'deadline',
            render: (deadline) => (_jsx("span", { style: { color: '#ff4d4f' }, children: formatDateTime(deadline) })),
            sorter: (a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime(),
        },
        {
            title: t('backlog.overdueBy', 'Overdue By'),
            key: 'overdue_by',
            render: (_, record) => {
                const hours = getOverdueHours(record.deadline);
                if (hours >= 24) {
                    return _jsx(Badge, { status: "error", text: _jsx(Tag, { color: "red", children: getOverdueLabel(hours) }) });
                }
                if (hours >= 8) {
                    return _jsx(Badge, { status: "warning", text: _jsx(Tag, { color: "orange", children: getOverdueLabel(hours) }) });
                }
                return _jsx(Badge, { status: "processing", text: _jsx(Tag, { color: "gold", children: getOverdueLabel(hours) }) });
            },
            sorter: (a, b) => getOverdueHours(a.deadline) - getOverdueHours(b.deadline),
            defaultSortOrder: 'descend',
        },
        {
            title: t('backlog.assignedAt', 'Assigned At'),
            dataIndex: 'assigned_at',
            key: 'assigned_at',
            render: (v) => formatDateTime(v),
        },
    ];
    return (_jsx(Card, { title: _jsxs(Typography.Title, { level: 4, children: [t('nav.backlog', 'Overdue Inspections'), ' ', assignments.length > 0 && (_jsx(Tag, { color: "red", children: assignments.length }))] }), children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: assignments, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('backlog.noOverdue', 'No overdue inspections') }, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 800 } }) }));
}
//# sourceMappingURL=BacklogPage.js.map