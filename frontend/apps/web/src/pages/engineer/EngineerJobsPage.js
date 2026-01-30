import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, Tabs } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { engineerJobsApi, } from '@inspection/shared';
const STATUS_COLOR = {
    assigned: 'blue',
    in_progress: 'processing',
    paused: 'orange',
    completed: 'success',
    incomplete: 'error',
    qc_approved: 'green',
};
const JOB_TYPE_COLOR = {
    custom_project: 'purple',
    system_review: 'cyan',
    special_task: 'geekblue',
};
export default function EngineerJobsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const { data, isLoading, error } = useQuery({
        queryKey: ['engineer-jobs', statusFilter, page, user?.id],
        queryFn: () => engineerJobsApi
            .list({
            status: statusFilter === 'all' ? undefined : statusFilter,
            engineer_id: user?.id,
            page,
            per_page: pageSize,
        })
            .then((r) => r.data),
    });
    const jobs = data?.data ?? [];
    const pagination = data?.pagination;
    const columns = [
        {
            title: t('common.id', 'Job ID'),
            dataIndex: 'job_id',
            key: 'job_id',
            width: 120,
        },
        {
            title: t('common.title', 'Title'),
            dataIndex: 'title',
            key: 'title',
            ellipsis: true,
        },
        {
            title: t('common.type', 'Type'),
            dataIndex: 'job_type',
            key: 'job_type',
            render: (type) => (_jsx(Tag, { color: JOB_TYPE_COLOR[type] ?? 'default', children: t(`jobs.type_${type}`, type.replace(/_/g, ' ')) })),
        },
        {
            title: t('common.category', 'Category'),
            dataIndex: 'category',
            key: 'category',
            render: (cat) => cat ? (_jsx(Tag, { color: cat === 'major' ? 'red' : 'blue', children: t(`status.${cat}`, cat) })) : ('-'),
        },
        {
            title: t('common.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: STATUS_COLOR[status] ?? 'default', children: t(`status.${status}`, status) })),
        },
        {
            title: t('jobs.planned_time', 'Planned Time'),
            key: 'planned_time',
            render: (_, record) => {
                const parts = [];
                if (record.planned_time_days)
                    parts.push(`${record.planned_time_days}d`);
                if (record.planned_time_hours)
                    parts.push(`${record.planned_time_hours}h`);
                return parts.length > 0 ? parts.join(' ') : '-';
            },
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 100,
            render: (_, record) => (_jsx(Button, { icon: _jsx(EyeOutlined, {}), onClick: (e) => {
                    e.stopPropagation();
                    navigate(`/engineer/jobs/${record.id}`);
                }, children: t('common.view', 'View') })),
        },
    ];
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'An error occurred'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsxs(Space, { style: { width: '100%', justifyContent: 'space-between', marginBottom: 16 }, children: [_jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.my_jobs', 'My Jobs') }), _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => navigate('/engineer/jobs/create'), children: t('nav.create_job', 'Create Job') })] }), _jsx(Tabs, { activeKey: statusFilter, onChange: (key) => {
                    setStatusFilter(key);
                    setPage(1);
                }, items: [
                    { key: 'all', label: t('common.all', 'All') },
                    { key: 'in_progress', label: t('status.active', 'Active') },
                    { key: 'completed', label: t('status.completed', 'Completed') },
                ] }), _jsx(Card, { children: _jsx(Table, { rowKey: "id", columns: columns, dataSource: jobs, loading: isLoading, locale: { emptyText: t('common.noData', 'No data') }, onRow: (record) => ({
                        onClick: () => navigate(`/engineer/jobs/${record.id}`),
                        style: { cursor: 'pointer' },
                    }), pagination: {
                        current: pagination?.page ?? page,
                        pageSize: pagination?.per_page ?? pageSize,
                        total: pagination?.total ?? 0,
                        showSizeChanger: false,
                        onChange: (p) => setPage(p),
                    } }) })] }));
}
//# sourceMappingURL=EngineerJobsPage.js.map