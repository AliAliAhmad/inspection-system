import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { Card, Typography, Tabs, Table, Tag, Button, Modal, InputNumber, Upload, message, Space, Divider, Alert, } from 'antd';
import { CameraOutlined, PictureOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialistJobsApi, filesApi, } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import VoiceTextArea from '../../components/VoiceTextArea';
function openCameraInput(accept, onFile) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.capture = 'environment';
    input.onchange = () => {
        const file = input.files?.[0];
        if (file)
            onFile(file);
    };
    input.click();
}
const STATUS_COLORS = {
    assigned: 'blue',
    in_progress: 'processing',
    paused: 'warning',
    completed: 'success',
    incomplete: 'error',
    qc_approved: 'green',
    cancelled: 'default',
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
    const [activeTab, setActiveTab] = useState('pending');
    // Start Job Modal state
    const [startModalOpen, setStartModalOpen] = useState(false);
    const [selectedJobId, setSelectedJobId] = useState(null);
    const [plannedHours, setPlannedHours] = useState(null);
    // Wrong Finding state (within start modal)
    const [showWrongFinding, setShowWrongFinding] = useState(false);
    const [wrongFindingReason, setWrongFindingReason] = useState('');
    const [wrongFindingPhotoPath, setWrongFindingPhotoPath] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    // Pending tab: assigned jobs (not started yet)
    const pendingQuery = useQuery({
        queryKey: ['specialist-jobs', 'list', 'pending'],
        queryFn: () => specialistJobsApi.list({ status: 'assigned' }),
        select: (res) => res.data?.data ?? [],
        enabled: activeTab === 'pending',
        refetchOnMount: 'always',
    });
    // Active tab: in_progress + paused
    const activeQuery = useQuery({
        queryKey: ['specialist-jobs', 'list', 'active'],
        queryFn: () => specialistJobsApi.list({ status: 'in_progress,paused' }),
        select: (res) => res.data?.data ?? [],
        enabled: activeTab === 'active',
        refetchOnMount: 'always',
    });
    const completedQuery = useQuery({
        queryKey: ['specialist-jobs', 'list', 'completed'],
        queryFn: () => specialistJobsApi.list({ status: 'completed,incomplete,qc_approved,cancelled' }),
        select: (res) => res.data?.data ?? [],
        enabled: activeTab === 'completed',
        refetchOnMount: 'always',
    });
    // Start job mutation (combined: set planned time + start)
    const startJobMutation = useMutation({
        mutationFn: ({ jobId, hours }) => specialistJobsApi.start(jobId, hours),
        onSuccess: (_, variables) => {
            message.success(t('jobs.start'));
            closeStartModal();
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
            navigate(`/specialist/jobs/${variables.jobId}`);
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    // Wrong finding mutation
    const wrongFindingMutation = useMutation({
        mutationFn: ({ jobId, reason, photoPath }) => specialistJobsApi.wrongFinding(jobId, reason, photoPath),
        onSuccess: () => {
            message.success(t('jobs.wrong_finding_success'));
            closeStartModal();
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    const openStartModal = useCallback((jobId) => {
        setSelectedJobId(jobId);
        setPlannedHours(null);
        setShowWrongFinding(false);
        setWrongFindingReason('');
        setWrongFindingPhotoPath('');
        setStartModalOpen(true);
    }, []);
    const closeStartModal = useCallback(() => {
        setStartModalOpen(false);
        setSelectedJobId(null);
        setPlannedHours(null);
        setShowWrongFinding(false);
        setWrongFindingReason('');
        setWrongFindingPhotoPath('');
    }, []);
    const handleStartJob = useCallback(() => {
        if (selectedJobId && plannedHours && plannedHours > 0) {
            startJobMutation.mutate({ jobId: selectedJobId, hours: plannedHours });
        }
    }, [selectedJobId, plannedHours, startJobMutation]);
    const handleWrongFinding = useCallback(() => {
        if (selectedJobId && wrongFindingReason.trim() && wrongFindingPhotoPath) {
            wrongFindingMutation.mutate({
                jobId: selectedJobId,
                reason: wrongFindingReason.trim(),
                photoPath: wrongFindingPhotoPath,
            });
        }
    }, [selectedJobId, wrongFindingReason, wrongFindingPhotoPath, wrongFindingMutation]);
    const handlePhotoUpload = useCallback(async (file) => {
        if (!selectedJobId)
            return false;
        setUploadingPhoto(true);
        try {
            const res = await filesApi.upload(file, 'specialist_job', selectedJobId, 'wrong_finding');
            const fileData = res.data?.data;
            const filePath = fileData?.filename ? `/uploads/${fileData.filename}` : `/uploads/${file.name}`;
            setWrongFindingPhotoPath(filePath);
            message.success(t('common.save'));
        }
        catch {
            message.error(t('common.error'));
        }
        finally {
            setUploadingPhoto(false);
        }
        return false;
    }, [selectedJobId, t]);
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
    // Pending tab columns: "Start" button opens the start modal
    const pendingColumns = [
        ...baseColumns,
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "primary", size: "small", onClick: () => openStartModal(record.id), children: t('jobs.start') })),
        },
    ];
    // Active tab columns: "Details" link
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
            label: t('jobs.pending_jobs'),
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
    return (_jsxs(Card, { children: [_jsx(Typography.Title, { level: 4, children: t('nav.my_jobs') }), _jsx(Tabs, { activeKey: activeTab, onChange: (key) => setActiveTab(key), items: tabItems }), _jsx(Table, { rowKey: "id", columns: getCurrentColumns(), dataSource: data, loading: loading, locale: { emptyText: t('common.noData') }, pagination: { pageSize: 10 } }), _jsx(Modal, { title: t('jobs.start'), open: startModalOpen, onCancel: closeStartModal, footer: null, width: 520, children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: "middle", children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: t('jobs.planned_time') }), _jsx(InputNumber, { min: 0.5, step: 0.5, value: plannedHours, onChange: (val) => setPlannedHours(val), style: { width: '100%', marginTop: 8 }, placeholder: t('jobs.planned_time'), addonAfter: "h" })] }), _jsx(Button, { type: "primary", size: "large", block: true, onClick: handleStartJob, loading: startJobMutation.isPending, disabled: !plannedHours || plannedHours <= 0, children: t('jobs.start') }), _jsx(Divider, {}), !showWrongFinding ? (_jsx(Button, { danger: true, block: true, icon: _jsx(ExclamationCircleOutlined, {}), onClick: () => setShowWrongFinding(true), children: t('jobs.wrong_finding') })) : (_jsxs("div", { children: [_jsx(Alert, { type: "warning", message: t('jobs.wrong_finding'), description: t('jobs.wrong_finding_description'), style: { marginBottom: 16 } }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx(Typography.Text, { strong: true, children: t('jobs.wrong_finding_reason') }), _jsx(VoiceTextArea, { rows: 3, value: wrongFindingReason, onChange: (e) => setWrongFindingReason(e.target.value), placeholder: t('jobs.wrong_finding_reason'), style: { marginTop: 8 } })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx(Typography.Text, { strong: true, children: t('jobs.wrong_finding_photo') }), _jsxs("div", { style: { marginTop: 8 }, children: [_jsxs(Space, { children: [_jsx(Button, { icon: _jsx(CameraOutlined, {}), loading: uploadingPhoto, onClick: () => openCameraInput('image/*,video/*', (file) => handlePhotoUpload(file)), children: t('inspection.take_photo', 'Take Photo') }), _jsx(Upload, { beforeUpload: (file) => {
                                                                handlePhotoUpload(file);
                                                                return false;
                                                            }, maxCount: 1, accept: "image/*,video/*", showUploadList: true, children: _jsx(Button, { icon: _jsx(PictureOutlined, {}), loading: uploadingPhoto, children: t('inspection.from_gallery', 'From Gallery') }) })] }), wrongFindingPhotoPath && (_jsx(Typography.Text, { type: "success", style: { display: 'block', marginTop: 4 }, children: t('common.save') }))] })] }), _jsx(Button, { danger: true, type: "primary", block: true, onClick: handleWrongFinding, loading: wrongFindingMutation.isPending, disabled: !wrongFindingReason.trim() || !wrongFindingPhotoPath, children: t('jobs.submit_wrong_finding') })] }))] }) })] }));
}
//# sourceMappingURL=SpecialistJobsPage.js.map