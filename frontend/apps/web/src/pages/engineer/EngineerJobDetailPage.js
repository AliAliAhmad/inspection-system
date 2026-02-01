import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { Card, Descriptions, Tag, Button, Space, Typography, Modal, Form, InputNumber, Input, Select, Rate, Spin, Alert, Statistic, Timeline, message, } from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, PlayCircleOutlined, CheckCircleOutlined, PauseCircleOutlined, } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { engineerJobsApi, formatDateTime, formatHours, } from '@inspection/shared';
const STATUS_COLOR = {
    assigned: 'blue',
    in_progress: 'processing',
    paused: 'orange',
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
    'error_record',
    'other',
];
export default function EngineerJobDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [plannedTimeOpen, setPlannedTimeOpen] = useState(false);
    const [completeOpen, setCompleteOpen] = useState(false);
    const [pauseModalOpen, setPauseModalOpen] = useState(false);
    const [pauseCategory, setPauseCategory] = useState(null);
    const [pauseDetails, setPauseDetails] = useState('');
    const [plannedForm] = Form.useForm();
    const [completeForm] = Form.useForm();
    // Live timer state
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef(null);
    const { data, isLoading, error } = useQuery({
        queryKey: ['engineer-job', id],
        queryFn: () => engineerJobsApi.get(Number(id)).then((r) => r.data),
        enabled: !!id,
    });
    const job = data?.data;
    // Live timer effect
    useEffect(() => {
        if (job?.status === 'in_progress' && job.started_at) {
            const startTime = new Date(job.started_at).getTime();
            const updateElapsed = () => {
                setElapsed(Math.floor((Date.now() - startTime) / 1000));
            };
            updateElapsed();
            timerRef.current = setInterval(updateElapsed, 1000);
            return () => {
                if (timerRef.current)
                    clearInterval(timerRef.current);
            };
        }
        return () => {
            if (timerRef.current)
                clearInterval(timerRef.current);
        };
    }, [job?.status, job?.started_at]);
    const plannedTimeMutation = useMutation({
        mutationFn: (payload) => engineerJobsApi.enterPlannedTime(Number(id), payload),
        onSuccess: () => {
            message.success(t('common.success', 'Planned time saved'));
            queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
            setPlannedTimeOpen(false);
            plannedForm.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const startMutation = useMutation({
        mutationFn: () => engineerJobsApi.start(Number(id)),
        onSuccess: () => {
            message.success(t('common.success', 'Job started'));
            queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const completeMutation = useMutation({
        mutationFn: (payload) => engineerJobsApi.complete(Number(id), payload),
        onSuccess: () => {
            message.success(t('common.success', 'Job completed'));
            queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
            setCompleteOpen(false);
            completeForm.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const pauseMutation = useMutation({
        mutationFn: (payload) => engineerJobsApi.requestPause(Number(id), payload),
        onSuccess: () => {
            message.success(t('jobs.pause', 'Pause requested'));
            setPauseModalOpen(false);
            setPauseCategory(null);
            setPauseDetails('');
            queryClient.invalidateQueries({ queryKey: ['engineer-job', id] });
            queryClient.invalidateQueries({ queryKey: ['engineer-job', id, 'pause-history'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const pauseHistoryQuery = useQuery({
        queryKey: ['engineer-job', id, 'pause-history'],
        queryFn: () => engineerJobsApi.getPauseHistory(Number(id)),
        select: (res) => (res.data?.data ?? res.data ?? []),
        enabled: !!id,
    });
    const pauseHistory = (pauseHistoryQuery.data ?? []);
    const formatElapsed = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    if (isLoading) {
        return (_jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, { size: "large" }) }));
    }
    if (error || !job) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'Failed to load job details'), showIcon: true });
    }
    const plannedParts = [];
    if (job.planned_time_days)
        plannedParts.push(`${job.planned_time_days} ${t('common.days', 'days')}`);
    if (job.planned_time_hours)
        plannedParts.push(`${job.planned_time_hours} ${t('common.hours', 'hours')}`);
    return (_jsxs("div", { children: [_jsx(Space, { style: { marginBottom: 16 }, children: _jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/engineer/jobs'), children: t('common.back', 'Back') }) }), _jsxs(Space, { style: { width: '100%', justifyContent: 'space-between', marginBottom: 16 }, align: "start", children: [_jsxs("div", { children: [_jsxs(Typography.Title, { level: 4, style: { margin: 0 }, children: [job.job_id, " - ", job.title] }), _jsxs(Space, { style: { marginTop: 8 }, children: [_jsx(Tag, { color: STATUS_COLOR[job.status] ?? 'default', children: t(`status.${job.status}`, job.status) }), job.category && (_jsx(Tag, { color: job.category === 'major' ? 'red' : 'blue', children: t(`status.${job.category}`, job.category) }))] })] }), _jsxs(Space, { children: [job.status === 'assigned' && (_jsxs(_Fragment, { children: [_jsx(Button, { icon: _jsx(ClockCircleOutlined, {}), onClick: () => setPlannedTimeOpen(true), children: t('jobs.enter_planned_time', 'Enter Planned Time') }), _jsx(Button, { type: "primary", icon: _jsx(PlayCircleOutlined, {}), onClick: () => startMutation.mutate(), loading: startMutation.isPending, children: t('jobs.start', 'Start') })] })), job.status === 'in_progress' && (_jsxs(_Fragment, { children: [_jsx(Button, { icon: _jsx(PauseCircleOutlined, {}), onClick: () => setPauseModalOpen(true), children: t('jobs.pause', 'Pause') }), _jsx(Button, { type: "primary", icon: _jsx(CheckCircleOutlined, {}), onClick: () => setCompleteOpen(true), children: t('jobs.complete', 'Complete') })] }))] })] }), job.status === 'in_progress' && (_jsx(Card, { style: { marginBottom: 16, textAlign: 'center' }, children: _jsx(Statistic, { title: t('jobs.elapsed_time', 'Elapsed Time'), value: formatElapsed(elapsed), prefix: _jsx(ClockCircleOutlined, {}), valueStyle: { color: '#1677ff', fontSize: 32 } }) })), _jsx(Card, { title: t('common.details', 'Details'), children: _jsxs(Descriptions, { column: { xs: 1, sm: 2 }, bordered: true, children: [_jsx(Descriptions.Item, { label: t('common.type', 'Type'), children: t(`jobs.type_${job.job_type}`, job.job_type.replace(/_/g, ' ')) }), _jsx(Descriptions.Item, { label: t('common.description', 'Description'), children: job.description || '-' }), _jsx(Descriptions.Item, { label: t('jobs.planned_time', 'Planned Time'), children: plannedParts.length > 0 ? plannedParts.join(' ') : '-' }), _jsx(Descriptions.Item, { label: t('jobs.actual_time', 'Actual Time'), children: job.actual_time_hours !== null ? formatHours(job.actual_time_hours) : '-' }), _jsx(Descriptions.Item, { label: t('common.created_at', 'Created At'), children: formatDateTime(job.created_at) }), _jsx(Descriptions.Item, { label: t('common.started_at', 'Started At'), children: formatDateTime(job.started_at) }), _jsx(Descriptions.Item, { label: t('common.completed_at', 'Completed At'), children: formatDateTime(job.completed_at) }), job.major_reason && (_jsx(Descriptions.Item, { label: t('jobs.major_reason', 'Major Reason'), children: job.major_reason })), job.work_notes && (_jsx(Descriptions.Item, { label: t('jobs.work_notes', 'Work Notes'), span: 2, children: job.work_notes })), job.completion_status && (_jsx(Descriptions.Item, { label: t('common.completion_status', 'Completion Status'), children: _jsx(Tag, { color: job.completion_status === 'pass' ? 'green' : 'red', children: t(`status.${job.completion_status}`, job.completion_status) }) }))] }) }), (job.status === 'completed' || job.status === 'qc_approved') && (_jsx(Card, { title: t('common.ratings', 'Ratings'), style: { marginTop: 16 }, children: _jsxs(Descriptions, { column: { xs: 1, sm: 3 }, bordered: true, children: [_jsx(Descriptions.Item, { label: t('jobs.time_rating', 'Time Rating'), children: job.time_rating !== null ? (_jsx(Rate, { disabled: true, value: job.time_rating })) : (_jsx(Typography.Text, { type: "secondary", children: t('common.not_rated', 'Not rated') })) }), _jsx(Descriptions.Item, { label: t('jobs.qc_rating', 'QC Rating'), children: job.qc_rating !== null ? (_jsx(Rate, { disabled: true, value: job.qc_rating })) : (_jsx(Typography.Text, { type: "secondary", children: t('common.not_rated', 'Not rated') })) }), _jsx(Descriptions.Item, { label: t('jobs.admin_bonus', 'Admin Bonus'), children: job.admin_bonus ?? 0 })] }) })), pauseHistory.length > 0 && (_jsx(Card, { title: t('jobs.pause', 'Pause History'), style: { marginTop: 16 }, children: _jsx(Timeline, { items: pauseHistory.map((pause) => ({
                        color: pause.status === 'approved'
                            ? 'green'
                            : pause.status === 'denied'
                                ? 'red'
                                : 'blue',
                        children: (_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: pause.reason_category.replace(/_/g, ' ') }), pause.reason_details && (_jsx(Typography.Paragraph, { type: "secondary", style: { margin: 0 }, children: pause.reason_details })), _jsxs(Space, { size: "small", children: [_jsx(Tag, { color: pause.status === 'approved'
                                                ? 'success'
                                                : pause.status === 'denied'
                                                    ? 'error'
                                                    : 'processing', children: t(`status.${pause.status}`, pause.status) }), _jsx(Typography.Text, { type: "secondary", children: new Date(pause.requested_at).toLocaleString() }), pause.duration_minutes != null && (_jsxs(Typography.Text, { type: "secondary", children: ["(", pause.duration_minutes, " min)"] }))] })] })),
                    })) }) })), _jsx(Modal, { title: t('jobs.pause', 'Request Pause'), open: pauseModalOpen, onOk: () => {
                    if (!pauseCategory)
                        return;
                    pauseMutation.mutate({
                        reason_category: pauseCategory,
                        reason_details: pauseDetails || undefined,
                    });
                }, onCancel: () => {
                    setPauseModalOpen(false);
                    setPauseCategory(null);
                    setPauseDetails('');
                }, confirmLoading: pauseMutation.isPending, okText: t('common.submit', 'Submit'), cancelText: t('common.cancel', 'Cancel'), okButtonProps: { disabled: !pauseCategory }, children: _jsxs(Space, { direction: "vertical", size: "middle", style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: t('jobs.pause_reason', 'Reason Category') }), _jsx(Select, { value: pauseCategory, onChange: (val) => setPauseCategory(val), style: { width: '100%', marginTop: 8 }, placeholder: t('common.select', 'Select reason'), options: PAUSE_CATEGORIES.map((cat) => ({
                                        value: cat,
                                        label: cat.replace(/_/g, ' '),
                                    })) })] }), _jsxs("div", { children: [_jsx(Typography.Text, { strong: true, children: t('common.details', 'Details') }), _jsx(Input.TextArea, { rows: 3, value: pauseDetails, onChange: (e) => setPauseDetails(e.target.value), style: { marginTop: 8 } })] })] }) }), _jsx(Modal, { title: t('jobs.enter_planned_time', 'Enter Planned Time'), open: plannedTimeOpen, onCancel: () => setPlannedTimeOpen(false), footer: null, children: _jsxs(Form, { form: plannedForm, layout: "vertical", onFinish: (values) => plannedTimeMutation.mutate({
                        planned_time_days: values.planned_time_days,
                        planned_time_hours: values.planned_time_hours,
                    }), children: [_jsx(Form.Item, { name: "planned_time_days", label: t('common.days', 'Days'), children: _jsx(InputNumber, { min: 0, style: { width: '100%' }, placeholder: "0" }) }), _jsx(Form.Item, { name: "planned_time_hours", label: t('common.hours', 'Hours'), children: _jsx(InputNumber, { min: 0, max: 23, style: { width: '100%' }, placeholder: "0" }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: plannedTimeMutation.isPending, block: true, children: t('common.save', 'Save') }) })] }) }), _jsx(Modal, { title: t('jobs.complete', 'Complete Job'), open: completeOpen, onCancel: () => setCompleteOpen(false), footer: null, children: _jsxs(Form, { form: completeForm, layout: "vertical", onFinish: (values) => completeMutation.mutate({
                        work_notes: values.work_notes,
                        completion_status: values.completion_status,
                    }), children: [_jsx(Form.Item, { name: "completion_status", label: t('common.completion_status', 'Completion Status'), rules: [{ required: true, message: t('common.required', 'This field is required') }], children: _jsx(Select, { placeholder: t('common.select', 'Select...'), options: [
                                    { value: 'pass', label: t('status.pass', 'Pass') },
                                    { value: 'incomplete', label: t('status.incomplete', 'Incomplete') },
                                ] }) }), _jsx(Form.Item, { name: "work_notes", label: t('jobs.work_notes', 'Work Notes'), children: _jsx(Input.TextArea, { rows: 4, placeholder: t('jobs.work_notes', 'Work notes...') }) }), _jsx(Form.Item, { children: _jsx(Button, { type: "primary", htmlType: "submit", loading: completeMutation.isPending, block: true, children: t('jobs.complete', 'Complete') }) })] }) })] }));
}
//# sourceMappingURL=EngineerJobDetailPage.js.map