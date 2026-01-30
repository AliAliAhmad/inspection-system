import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Typography, Tag, Button, Modal, Select, Input, Radio, Timeline, Upload, Rate, Statistic, Descriptions, Space, Spin, Alert, message, } from 'antd';
import { ArrowLeftOutlined, PlayCircleOutlined, PauseCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, UploadOutlined, ClockCircleOutlined, } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { specialistJobsApi, defectAssessmentsApi, filesApi, } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
const STATUS_COLORS = {
    assigned: 'blue',
    in_progress: 'processing',
    paused: 'warning',
    completed: 'success',
    incomplete: 'error',
    qc_approved: 'green',
};
const PAUSE_CATEGORIES = [
    'parts',
    'duty_finish',
    'tools',
    'manpower',
    'oem',
    'other',
];
function formatElapsed(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export default function SpecialistJobDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const jobId = Number(id);
    // State for modals
    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [pauseCategory, setPauseCategory] = useState(null);
    const [pauseDetails, setPauseDetails] = useState('');
    const [completeModalOpen, setCompleteModalOpen] = useState(false);
    const [workNotes, setWorkNotes] = useState('');
    const [completionStatus, setCompletionStatus] = useState('pass');
    const [incompleteModalOpen, setIncompleteModalOpen] = useState(false);
    const [incompleteReason, setIncompleteReason] = useState('');
    // Defect assessment state
    const [assessmentVerdict, setAssessmentVerdict] = useState('confirm');
    const [technicalNotes, setTechnicalNotes] = useState('');
    // Live timer state
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef(null);
    // Queries
    const jobQuery = useQuery({
        queryKey: ['specialist-jobs', jobId],
        queryFn: () => specialistJobsApi.get(jobId),
        select: (res) => (res.data?.data ?? res.data),
        enabled: !!jobId && !isNaN(jobId),
    });
    const pauseHistoryQuery = useQuery({
        queryKey: ['specialist-jobs', jobId, 'pause-history'],
        queryFn: () => specialistJobsApi.getPauseHistory(jobId),
        select: (res) => (res.data?.data ?? res.data ?? []),
        enabled: !!jobId && !isNaN(jobId),
    });
    const pendingAssessmentsQuery = useQuery({
        queryKey: ['defect-assessments', 'pending'],
        queryFn: () => defectAssessmentsApi.getPending(),
        select: (res) => (res.data?.data ?? res.data ?? []),
        enabled: !!jobId && !isNaN(jobId),
    });
    const job = jobQuery.data;
    // Live timer effect
    useEffect(() => {
        if (job?.is_running && job?.started_at) {
            const startTime = new Date(job.started_at).getTime();
            const updateElapsed = () => {
                const now = Date.now();
                setElapsed(Math.floor((now - startTime) / 1000));
            };
            updateElapsed();
            intervalRef.current = setInterval(updateElapsed, 1000);
            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            };
        }
        else {
            setElapsed(0);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    }, [job?.is_running, job?.started_at]);
    // Mutations
    const startMutation = useMutation({
        mutationFn: () => specialistJobsApi.start(jobId),
        onSuccess: () => {
            message.success(t('jobs.start'));
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
        },
        onError: () => message.error(t('common.error')),
    });
    const pauseMutation = useMutation({
        mutationFn: (payload) => specialistJobsApi.requestPause(jobId, payload),
        onSuccess: () => {
            message.success(t('jobs.pause'));
            setPauseModalOpen(false);
            setPauseCategory(null);
            setPauseDetails('');
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId, 'pause-history'] });
        },
        onError: () => message.error(t('common.error')),
    });
    const completeMutation = useMutation({
        mutationFn: (payload) => specialistJobsApi.complete(jobId, payload),
        onSuccess: () => {
            message.success(t('jobs.complete'));
            setCompleteModalOpen(false);
            setWorkNotes('');
            setCompletionStatus('pass');
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
        },
        onError: () => message.error(t('common.error')),
    });
    const incompleteMarkMutation = useMutation({
        mutationFn: (reason) => specialistJobsApi.markIncomplete(jobId, reason),
        onSuccess: () => {
            message.success(t('jobs.mark_incomplete'));
            setIncompleteModalOpen(false);
            setIncompleteReason('');
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs'] });
        },
        onError: () => message.error(t('common.error')),
    });
    const cleaningUploadMutation = useMutation({
        mutationFn: () => specialistJobsApi.uploadCleaning(jobId),
        onSuccess: () => {
            message.success(t('common.save'));
            queryClient.invalidateQueries({ queryKey: ['specialist-jobs', jobId] });
        },
        onError: () => message.error(t('common.error')),
    });
    const fileUploadMutation = useMutation({
        mutationFn: (file) => filesApi.upload(file, 'specialist_job', jobId, 'cleaning'),
        onSuccess: () => {
            message.success(t('common.save'));
            cleaningUploadMutation.mutate();
        },
        onError: () => message.error(t('common.error')),
    });
    const defectAssessmentMutation = useMutation({
        mutationFn: (payload) => defectAssessmentsApi.create(payload),
        onSuccess: () => {
            message.success(t('common.save'));
            setAssessmentVerdict('confirm');
            setTechnicalNotes('');
            queryClient.invalidateQueries({ queryKey: ['defect-assessments'] });
        },
        onError: () => message.error(t('common.error')),
    });
    // Handlers
    const handleStart = useCallback(() => {
        Modal.confirm({
            title: t('common.confirm'),
            content: t('jobs.start'),
            onOk: () => startMutation.mutate(),
        });
    }, [startMutation, t]);
    const handlePauseSubmit = useCallback(() => {
        if (!pauseCategory)
            return;
        pauseMutation.mutate({
            reason_category: pauseCategory,
            reason_details: pauseDetails || undefined,
        });
    }, [pauseCategory, pauseDetails, pauseMutation]);
    const handleCompleteSubmit = useCallback(() => {
        completeMutation.mutate({
            work_notes: workNotes || undefined,
            completion_status: completionStatus,
        });
    }, [workNotes, completionStatus, completeMutation]);
    const handleIncompleteSubmit = useCallback(() => {
        if (!incompleteReason.trim())
            return;
        incompleteMarkMutation.mutate(incompleteReason);
    }, [incompleteReason, incompleteMarkMutation]);
    const handleFileUpload = useCallback((file) => {
        fileUploadMutation.mutate(file);
        return false; // prevent default upload
    }, [fileUploadMutation]);
    const handleDefectAssessment = useCallback((defectId) => {
        if (!technicalNotes.trim()) {
            message.warning(t('common.error'));
            return;
        }
        defectAssessmentMutation.mutate({
            defect_id: defectId,
            verdict: assessmentVerdict,
            technical_notes: technicalNotes,
        });
    }, [assessmentVerdict, technicalNotes, defectAssessmentMutation, t]);
    if (jobQuery.isLoading) {
        return (_jsx(Card, { children: _jsx(Spin, { size: "large", style: { display: 'block', textAlign: 'center', padding: 48 } }) }));
    }
    if (jobQuery.isError || !job) {
        return (_jsx(Card, { children: _jsx(Alert, { type: "error", message: t('common.error'), action: _jsx(Button, { onClick: () => jobQuery.refetch(), children: t('common.retry') }) }) }));
    }
    const pauseHistory = (pauseHistoryQuery.data ?? []);
    const pendingAssessments = (pendingAssessmentsQuery.data ?? []);
    // Filter assessments related to this job's defect_id
    const jobAssessments = pendingAssessments.filter((a) => a.defect_id === job.defect_id);
    const isCompleted = job.status === 'completed' || job.status === 'qc_approved';
    const isIncomplete = job.status === 'incomplete';
    return (_jsxs("div", { children: [_jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsx(Space, { children: _jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/specialist/jobs'), children: t('common.back') }) }), _jsxs(Space, { size: "middle", align: "center", children: [_jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: job.job_id }), _jsx(Tag, { color: STATUS_COLORS[job.status], children: t(`status.${job.status}`) }), job.category && (_jsx(Tag, { color: job.category === 'major' ? 'red' : 'orange', children: job.category }))] })] }) }), _jsx(Card, { title: t('common.details'), style: { marginBottom: 16 }, children: _jsxs(Descriptions, { bordered: true, column: { xs: 1, sm: 2 }, children: [_jsx(Descriptions.Item, { label: t('jobs.planned_time'), children: job.planned_time_hours != null ? `${job.planned_time_hours}h` : '-' }), _jsx(Descriptions.Item, { label: t('jobs.actual_time'), children: job.actual_time_hours != null ? `${job.actual_time_hours.toFixed(1)}h` : '-' }), _jsx(Descriptions.Item, { label: "Started At", children: job.started_at ? new Date(job.started_at).toLocaleString() : '-' }), _jsx(Descriptions.Item, { label: "Completed At", children: job.completed_at ? new Date(job.completed_at).toLocaleString() : '-' }), job.work_notes && (_jsx(Descriptions.Item, { label: t('jobs.work_notes'), span: 2, children: job.work_notes })), job.incomplete_reason && (_jsx(Descriptions.Item, { label: t('jobs.incomplete_reason'), span: 2, children: job.incomplete_reason }))] }) }), _jsxs(Card, { title: t('common.actions'), style: { marginBottom: 16 }, children: [job.status === 'assigned' && job.has_planned_time && (_jsx(Button, { type: "primary", icon: _jsx(PlayCircleOutlined, {}), size: "large", onClick: handleStart, loading: startMutation.isPending, children: t('jobs.start') })), job.status === 'assigned' && !job.has_planned_time && (_jsx(Alert, { type: "info", message: t('jobs.enter_planned_time'), description: t('jobs.planned_time') })), job.status === 'in_progress' && job.is_running && (_jsxs(Space, { direction: "vertical", size: "large", style: { width: '100%' }, children: [_jsx("div", { style: { textAlign: 'center' }, children: _jsx(Statistic, { title: t('jobs.actual_time'), value: formatElapsed(elapsed), prefix: _jsx(ClockCircleOutlined, {}), valueStyle: { fontSize: 36, fontFamily: 'monospace' } }) }), _jsxs(Space, { wrap: true, children: [_jsx(Button, { icon: _jsx(PauseCircleOutlined, {}), onClick: () => setPauseModalOpen(true), children: t('jobs.pause') }), _jsx(Button, { type: "primary", icon: _jsx(CheckCircleOutlined, {}), onClick: () => setCompleteModalOpen(true), children: t('jobs.complete') }), _jsx(Button, { danger: true, icon: _jsx(CloseCircleOutlined, {}), onClick: () => setIncompleteModalOpen(true), children: t('jobs.mark_incomplete') })] })] })), job.status === 'paused' && (_jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsx(Alert, { type: "warning", message: t('status.paused'), description: pauseHistory.length > 0
                                    ? `${pauseHistory[pauseHistory.length - 1].reason_category}${pauseHistory[pauseHistory.length - 1].reason_details
                                        ? ': ' + pauseHistory[pauseHistory.length - 1].reason_details
                                        : ''}`
                                    : undefined }), pauseHistory.length > 0 &&
                                pauseHistory[pauseHistory.length - 1].status === 'approved' && (_jsxs(Typography.Text, { type: "secondary", children: [t('status.approved'), " - ", t('jobs.resume')] }))] })), (isCompleted || isIncomplete) && (_jsx(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: _jsxs(Descriptions, { bordered: true, column: { xs: 1, sm: 2 }, children: [job.time_rating != null && (_jsx(Descriptions.Item, { label: t('jobs.time_rating'), children: _jsx(Rate, { disabled: true, value: job.time_rating }) })), job.qc_rating != null && (_jsx(Descriptions.Item, { label: t('jobs.qc_rating'), children: _jsx(Rate, { disabled: true, value: job.qc_rating }) })), job.cleaning_rating != null && (_jsx(Descriptions.Item, { label: t('jobs.cleaning_rating'), children: _jsx(Rate, { disabled: true, value: job.cleaning_rating }) })), job.admin_bonus != null && job.admin_bonus > 0 && (_jsx(Descriptions.Item, { label: t('jobs.admin_bonus'), children: job.admin_bonus }))] }) }))] }), pauseHistory.length > 0 && (_jsx(Card, { title: t('jobs.pause'), style: { marginBottom: 16 }, children: _jsx(Timeline, { items: pauseHistory.map((pause) => ({
                        color: pause.status === 'approved'
                            ? 'green'
                            : pause.status === 'denied'
                                ? 'red'
                                : 'blue',
                        children: (_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: pause.reason_category }), pause.reason_details && (_jsx(Typography.Paragraph, { type: "secondary", style: { margin: 0 }, children: pause.reason_details })), _jsxs(Space, { size: "small", children: [_jsx(Tag, { color: pause.status === 'approved'
                                                ? 'success'
                                                : pause.status === 'denied'
                                                    ? 'error'
                                                    : 'processing', children: t(`status.${pause.status}`) }), _jsx(Typography.Text, { type: "secondary", children: new Date(pause.requested_at).toLocaleString() }), pause.duration_minutes != null && (_jsxs(Typography.Text, { type: "secondary", children: ["(", pause.duration_minutes, " min)"] }))] })] })),
                    })) }) })), isCompleted && (_jsx(Card, { title: "Cleaning", style: { marginBottom: 16 }, children: _jsx(Upload, { beforeUpload: (file) => {
                        handleFileUpload(file);
                        return false;
                    }, maxCount: 1, accept: "image/*", showUploadList: true, children: _jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: fileUploadMutation.isPending || cleaningUploadMutation.isPending, children: "Upload Cleaning Photo" }) }) })), jobAssessments.length === 0 && job.defect_id && (_jsx(Card, { title: t('nav.defect_assessments'), style: { marginBottom: 16 }, children: _jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: "Verdict" }), _jsxs(Radio.Group, { value: assessmentVerdict, onChange: (e) => setAssessmentVerdict(e.target.value), style: { display: 'block', marginTop: 8 }, children: [_jsx(Radio.Button, { value: "confirm", children: t('status.approved') }), _jsx(Radio.Button, { value: "reject", children: t('status.rejected') }), _jsx(Radio.Button, { value: "minor", children: "Minor" })] })] }), _jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: "Technical Notes" }), _jsx(Input.TextArea, { rows: 3, value: technicalNotes, onChange: (e) => setTechnicalNotes(e.target.value), style: { marginTop: 8 } })] }), _jsx(Button, { type: "primary", onClick: () => handleDefectAssessment(job.defect_id), loading: defectAssessmentMutation.isPending, children: t('common.submit') })] }) })), _jsx(Modal, { title: t('jobs.pause'), open: pauseModalOpen, onOk: handlePauseSubmit, onCancel: () => {
                    setPauseModalOpen(false);
                    setPauseCategory(null);
                    setPauseDetails('');
                }, confirmLoading: pauseMutation.isPending, okText: t('common.submit'), cancelText: t('common.cancel'), okButtonProps: { disabled: !pauseCategory }, children: _jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: "Reason Category" }), _jsx(Select, { value: pauseCategory, onChange: (val) => setPauseCategory(val), style: { width: '100%', marginTop: 8 }, placeholder: "Select reason", options: PAUSE_CATEGORIES.map((cat) => ({
                                        value: cat,
                                        label: cat.replace('_', ' '),
                                    })) })] }), _jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: "Details" }), _jsx(Input.TextArea, { rows: 3, value: pauseDetails, onChange: (e) => setPauseDetails(e.target.value), style: { marginTop: 8 } })] })] }) }), _jsx(Modal, { title: t('jobs.complete'), open: completeModalOpen, onOk: handleCompleteSubmit, onCancel: () => {
                    setCompleteModalOpen(false);
                    setWorkNotes('');
                    setCompletionStatus('pass');
                }, confirmLoading: completeMutation.isPending, okText: t('common.submit'), cancelText: t('common.cancel'), children: _jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: t('jobs.work_notes') }), _jsx(Input.TextArea, { rows: 4, value: workNotes, onChange: (e) => setWorkNotes(e.target.value), style: { marginTop: 8 } })] }), _jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: t('common.status') }), _jsxs(Radio.Group, { value: completionStatus, onChange: (e) => setCompletionStatus(e.target.value), style: { display: 'block', marginTop: 8 }, children: [_jsx(Radio, { value: "pass", children: t('status.completed') }), _jsx(Radio, { value: "incomplete", children: t('status.incomplete') })] })] })] }) }), _jsx(Modal, { title: t('jobs.mark_incomplete'), open: incompleteModalOpen, onOk: handleIncompleteSubmit, onCancel: () => {
                    setIncompleteModalOpen(false);
                    setIncompleteReason('');
                }, confirmLoading: incompleteMarkMutation.isPending, okText: t('common.submit'), cancelText: t('common.cancel'), okButtonProps: { disabled: !incompleteReason.trim() }, children: _jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsx(Typography.Text, { strong: true, children: t('jobs.incomplete_reason') }), _jsx(Input.TextArea, { rows: 4, value: incompleteReason, onChange: (e) => setIncompleteReason(e.target.value) })] }) })] }));
}
//# sourceMappingURL=SpecialistJobDetailPage.js.map