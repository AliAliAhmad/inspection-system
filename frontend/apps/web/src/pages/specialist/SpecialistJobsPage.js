import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { Card, Typography, Tabs, Table, Tag, Button, Modal, InputNumber, message, Space, } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialistJobsApi, } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
const STATUS_COLORS = {
    assigned: 'blue',
    in_progress: 'processing',
    paused: 'warning',
    completed: 'success',
    incomplete: 'error',
    qc_approved: 'green',
};
const CATEGORY_COLORS = {
    major: 'red',
    minor: 'orange',
};
export default function SpecialistJobsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('active');
    const [plannedTimeModalOpen, setPlannedTimeModalOpen] = useState(false);
    const [selectedJobId, setSelectedJobId] = useState(null);
    const [plannedHours, setPlannedHours] = useState(null);
    // Queries for each tab
    const pendingQuery = useQuery({
        queryKey: ['specialist-jobs', 'pending-planned-time'],
        queryFn: () => specialistJobsApi.getPendingPlannedTime(),
        select: (res) => res.data?.data ?? res.data ?? [],
        enabled: activeTab === 'pending',
    });
    const activeQuery = useQuery({
        queryKey: ['specialist-jobs', 'list', 'active'],
        queryFn: () => specialistJobsApi.list({ status: 'assigned,in_progress,paused' }),
        select: (res) => res.data?.data ?? [],
        enabled: activeTab === 'active',
    });
    const completedQuery = useQuery({
        queryKey: ['specialist-jobs', 'list', 'completed'],
        queryFn: () => specialistJobsApi.list({ status: 'completed,incomplete,qc_approved' }),
        select: (res) => res.data?.data ?? [],
        enabled: activeTab === 'completed',
    });
    // Mutation for entering planned time
    const enterPlannedTimeMutation = useMutation({
        mutationFn: ({ jobId, hours }) => specialistJobsApi.enterPlannedTime(jobId, hours),
        onSuccess: () => {
            message.success(t('common.save'));
            setPlannedTimeModalOpen(false);
            setSelectedJobId(null);
            setPlannedHours(null);
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    const handleEnterTime = useCallback((jobId) => {
        setSelectedJobId(jobId);
        setPlannedHours(null);
        setPlannedTimeModalOpen(true);
    }, []);
    const handlePlannedTimeSubmit = useCallback(() => {
        if (selectedJobId && plannedHours && plannedHours > 0) {
            enterPlannedTimeMutation.mutate({
                jobId: selectedJobId,
                hours: plannedHours,
            });
        }
    }, [selectedJobId, plannedHours, enterPlannedTimeMutation]);
    const getStatusTag = (status) => (_jsx(Tag, { color: STATUS_COLORS[status], children: t(`status.${status}`) }));
    const getCategoryTag = (category) => {
        if (!category)
            return '-';
        return _jsx(Tag, { color: CATEGORY_COLORS[category], children: category });
    };
    // Column definitions
    const baseColumns = [
        {
            title: t('common.details'),
            dataIndex: 'job_id',
            key: 'job_id',
            render: (text) => _jsx(Typography.Text, { strong: true, children: text }),
        },
        {
            title: t('common.status'),
            dataIndex: 'category',
            key: 'category',
            render: (_, record) => getCategoryTag(record.category),
        },
        {
            title: t('common.status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => getStatusTag(status),
        },
        {
            title: t('jobs.planned_time'),
            dataIndex: 'planned_time_hours',
            key: 'planned_time_hours',
            render: (val) => val != null ? `${val}h` : '-',
        },
        {
            title: t('jobs.actual_time'),
            dataIndex: 'actual_time_hours',
            key: 'actual_time_hours',
            render: (val) => val != null ? `${val.toFixed(1)}h` : '-',
        },
    ];
    const pendingColumns = [
        ...baseColumns,
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "primary", size: "small", onClick: () => handleEnterTime(record.id), children: t('jobs.enter_planned_time') })),
        },
    ];
    const activeColumns = [
        ...baseColumns,
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "link", onClick: () => navigate(`/specialist/jobs/${record.id}`), children: t('common.details') })),
        },
    ];
    const completedColumns = [
        ...baseColumns,
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "link", onClick: () => navigate(`/specialist/jobs/${record.id}`), children: t('common.details') })),
        },
    ];
    const getCurrentData = () => {
        switch (activeTab) {
            case 'pending':
                return {
                    data: pendingQuery.data ?? [],
                    loading: pendingQuery.isLoading,
                };
            case 'active':
                return {
                    data: activeQuery.data ?? [],
                    loading: activeQuery.isLoading,
                };
            case 'completed':
                return {
                    data: completedQuery.data ?? [],
                    loading: completedQuery.isLoading,
                };
        }
    };
    const getCurrentColumns = () => {
        switch (activeTab) {
            case 'pending':
                return pendingColumns;
            case 'active':
                return activeColumns;
            case 'completed':
                return completedColumns;
        }
    };
    const { data, loading } = getCurrentData();
    const tabItems = [
        {
            key: 'pending',
            label: t('jobs.enter_planned_time'),
        },
        {
            key: 'active',
            label: t('status.in_progress'),
        },
        {
            key: 'completed',
            label: t('status.completed'),
        },
    ];
    return (_jsxs(Card, { children: [_jsx(Typography.Title, { level: 4, children: t('nav.my_jobs') }), _jsx(Tabs, { activeKey: activeTab, onChange: (key) => setActiveTab(key), items: tabItems }), _jsx(Table, { rowKey: "id", columns: getCurrentColumns(), dataSource: data, loading: loading, locale: { emptyText: t('common.noData') }, pagination: { pageSize: 10 } }), _jsx(Modal, { title: t('jobs.enter_planned_time'), open: plannedTimeModalOpen, onOk: handlePlannedTimeSubmit, onCancel: () => {
                    setPlannedTimeModalOpen(false);
                    setSelectedJobId(null);
                    setPlannedHours(null);
                }, confirmLoading: enterPlannedTimeMutation.isPending, okText: t('common.save'), cancelText: t('common.cancel'), okButtonProps: { disabled: !plannedHours || plannedHours <= 0 }, children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsx(Typography.Text, { children: t('jobs.planned_time') }), _jsx(InputNumber, { min: 0.5, step: 0.5, value: plannedHours, onChange: (val) => setPlannedHours(val), style: { width: '100%' }, placeholder: "Hours", addonAfter: "h" })] }) })] }));
}
//# sourceMappingURL=SpecialistJobsPage.js.map