import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Typography, Alert, Tabs } from 'antd';
import { PlayCircleOutlined, ArrowRightOutlined, EyeOutlined, } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { inspectionAssignmentsApi, } from '@inspection/shared';
const STATUS_COLOR = {
    pending: 'default',
    assigned: 'blue',
    in_progress: 'processing',
    completed: 'success',
};
export default function MyAssignmentsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const { data, isLoading, error } = useQuery({
        queryKey: ['my-assignments', statusFilter, page],
        queryFn: () => inspectionAssignmentsApi
            .getMyAssignments({
            status: statusFilter === 'all' ? undefined : statusFilter,
            page,
            per_page: pageSize,
        })
            .then((r) => r.data),
    });
    const assignments = data?.data ?? [];
    const pagination = data?.pagination;
    const columns = [
        {
            title: t('equipment.name'),
            dataIndex: ['equipment', 'name'],
            key: 'equipment_name',
            render: (_, record) => record.equipment?.name ?? '-',
        },
        {
            title: t('equipment.type'),
            dataIndex: ['equipment', 'equipment_type'],
            key: 'equipment_type',
            render: (_, record) => record.equipment?.equipment_type ?? '-',
        },
        {
            title: `${t('equipment.location')} / ${t('equipment.berth')}`,
            key: 'location',
            render: (_, record) => {
                const location = record.equipment?.location ?? '';
                const berth = record.berth ?? record.equipment?.berth ?? '';
                return [location, berth].filter(Boolean).join(' / ') || '-';
            },
        },
        {
            title: 'Shift',
            dataIndex: 'shift',
            key: 'shift',
            render: (shift) => (_jsx(Tag, { color: shift === 'day' ? 'orange' : 'geekblue', children: shift === 'day' ? 'Day' : 'Night' })),
        },
        {
            title: t('common.status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: STATUS_COLOR[status] ?? 'default', children: t(`status.${status}`, status) })),
        },
        {
            title: 'Deadline',
            dataIndex: 'deadline',
            key: 'deadline',
            render: (deadline) => deadline ? new Date(deadline).toLocaleDateString() : '-',
        },
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => {
                const status = record.status;
                if (status === 'assigned') {
                    return (_jsx(Button, { type: "primary", icon: _jsx(PlayCircleOutlined, {}), onClick: () => navigate(`/inspector/inspection/${record.id}`), children: t('inspection.start') }));
                }
                if (status === 'in_progress') {
                    return (_jsx(Button, { type: "primary", icon: _jsx(ArrowRightOutlined, {}), onClick: () => navigate(`/inspector/inspection/${record.id}`), children: t('common.details', 'Continue') }));
                }
                if (status === 'completed') {
                    return (_jsx(Button, { icon: _jsx(EyeOutlined, {}), onClick: () => navigate(`/inspector/assessment/${record.id}`), children: t('nav.assessments', 'View Assessment') }));
                }
                return null;
            },
        },
    ];
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsx(Typography.Title, { level: 4, children: t('nav.my_assignments') }), _jsx(Tabs, { activeKey: statusFilter, onChange: (key) => {
                    setStatusFilter(key);
                    setPage(1);
                }, items: [
                    { key: 'all', label: t('common.all') },
                    { key: 'assigned', label: t('status.assigned') },
                    { key: 'in_progress', label: t('status.in_progress') },
                    { key: 'completed', label: t('status.completed') },
                ] }), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: assignments, loading: isLoading, locale: { emptyText: t('common.noData') }, pagination: {
                        current: pagination?.page ?? page,
                        pageSize: pagination?.per_page ?? pageSize,
                        total: pagination?.total ?? 0,
                        showSizeChanger: false,
                        onChange: (p) => setPage(p),
                    } }) })] }));
}
//# sourceMappingURL=MyAssignmentsPage.js.map