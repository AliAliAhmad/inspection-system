import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Typography, Button, Radio, Tag, Space, Spin, Alert, Descriptions, Result, message, } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, WarningOutlined, SafetyCertificateOutlined, TeamOutlined, LockOutlined, } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { assessmentsApi, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
export default function AssessmentPage() {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const assignmentId = Number(id);
    const [verdict, setVerdict] = useState(null);
    const [urgentReason, setUrgentReason] = useState('');
    // First try to fetch existing assessment, if 404 we create one
    const { data: assessment, isLoading, error, refetch, } = useQuery({
        queryKey: ['assessment', assignmentId],
        queryFn: async () => {
            try {
                const res = await assessmentsApi.get(assignmentId);
                return res.data.data;
            }
            catch (err) {
                // If not found, create one
                if (err?.response?.status === 404) {
                    const createRes = await assessmentsApi.create(assignmentId);
                    return createRes.data.data;
                }
                throw err;
            }
        },
    });
    // Submit verdict mutation
    const verdictMutation = useMutation({
        mutationFn: (payload) => {
            if (!assessment)
                throw new Error('No assessment');
            return assessmentsApi.submitVerdict(assessment.id, payload);
        },
        onSuccess: () => {
            message.success(t('common.submit'));
            queryClient.invalidateQueries({ queryKey: ['assessment', assignmentId] });
            refetch();
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    const handleSubmitVerdict = () => {
        if (!verdict)
            return;
        const payload = { verdict };
        if (verdict === 'urgent' && urgentReason.trim()) {
            payload.urgent_reason = urgentReason.trim();
        }
        verdictMutation.mutate(payload);
    };
    if (isLoading) {
        return (_jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, { size: "large" }) }));
    }
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error'), showIcon: true });
    }
    if (!assessment) {
        return _jsx(Alert, { type: "warning", message: t('common.noData'), showIcon: true });
    }
    // Determine if the current user is mech or elec inspector
    const isMechInspector = user?.id === assessment.mechanical_inspector_id;
    const isElecInspector = user?.id === assessment.electrical_inspector_id;
    // Check if current user has already submitted
    const userHasSubmitted = (isMechInspector && assessment.mech_verdict !== null) ||
        (isElecInspector && assessment.elec_verdict !== null);
    const isFinalized = assessment.finalized_at !== null;
    const getVerdictTag = (v) => {
        if (!v)
            return _jsx(Tag, { children: t('status.pending') });
        if (v === 'operational') {
            return (_jsx(Tag, { color: "success", icon: _jsx(CheckCircleOutlined, {}), children: t('status.operational', 'Operational') }));
        }
        return (_jsx(Tag, { color: "error", icon: _jsx(WarningOutlined, {}), children: t('status.urgent', 'Urgent') }));
    };
    const getResolutionIcon = (method) => {
        switch (method) {
            case 'agreement':
                return _jsx(TeamOutlined, {});
            case 'safety_rule':
                return _jsx(SafetyCertificateOutlined, {});
            case 'admin':
                return _jsx(LockOutlined, {});
            default:
                return null;
        }
    };
    const getResolutionLabel = (method) => {
        switch (method) {
            case 'agreement':
                return 'Resolved by Agreement';
            case 'safety_rule':
                return 'Resolved by Safety Rule';
            case 'admin':
                return 'Resolved by Admin';
            default:
                return 'Pending Resolution';
        }
    };
    return (_jsxs("div", { children: [_jsx(Space, { style: { marginBottom: 16 }, children: _jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/inspector/assignments'), children: t('common.back') }) }), _jsx(Typography.Title, { level: 4, children: t('nav.assessments', 'Assessment') }), isFinalized && (_jsx(Result, { status: assessment.final_status === 'operational' ? 'success' : 'warning', title: assessment.final_status === 'operational'
                    ? t('status.operational', 'Operational')
                    : t('status.urgent', 'Urgent'), subTitle: assessment.urgent_reason
                    ? `${t('status.urgent', 'Urgent')}: ${assessment.urgent_reason}`
                    : undefined, style: { marginBottom: 16 } })), _jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Descriptions, { title: "Inspector Verdicts", column: { xs: 1, sm: 2 }, bordered: true, children: [_jsx(Descriptions.Item, { label: "Mechanical Inspector Verdict", children: getVerdictTag(assessment.mech_verdict) }), _jsx(Descriptions.Item, { label: "Electrical Inspector Verdict", children: getVerdictTag(assessment.elec_verdict) }), _jsx(Descriptions.Item, { label: t('common.status'), children: isFinalized ? (getVerdictTag(assessment.final_status)) : (_jsx(Tag, { color: "processing", children: t('status.pending') })) }), assessment.resolved_by && (_jsx(Descriptions.Item, { label: "Resolution", children: _jsxs(Space, { children: [getResolutionIcon(assessment.resolved_by), _jsx(Typography.Text, { children: getResolutionLabel(assessment.resolved_by) })] }) })), assessment.admin_decision_notes && (_jsx(Descriptions.Item, { label: "Admin Notes", span: 2, children: assessment.admin_decision_notes })), assessment.urgent_reason && (_jsx(Descriptions.Item, { label: "Urgent Reason", span: 2, children: assessment.urgent_reason }))] }) }), (isMechInspector || isElecInspector) &&
                !userHasSubmitted &&
                !isFinalized && (_jsx(Card, { title: "Submit Your Verdict", style: { marginBottom: 16 }, children: _jsxs(Space, { direction: "vertical", size: "large", style: { width: '100%' }, children: [_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, style: { display: 'block', marginBottom: 8 }, children: "Verdict" }), _jsxs(Radio.Group, { value: verdict, onChange: (e) => setVerdict(e.target.value), size: "large", children: [_jsx(Radio.Button, { value: "operational", children: _jsxs(Space, { children: [_jsx(CheckCircleOutlined, {}), t('status.operational', 'Operational')] }) }), _jsx(Radio.Button, { value: "urgent", children: _jsxs(Space, { children: [_jsx(WarningOutlined, {}), t('status.urgent', 'Urgent')] }) })] })] }), verdict === 'urgent' && (_jsxs("div", { children: [_jsx(Typography.Text, { strong: true, style: { display: 'block', marginBottom: 8 }, children: "Urgent Reason *" }), _jsx(VoiceTextArea, { value: urgentReason, onChange: (e) => setUrgentReason(e.target.value), rows: 3, placeholder: "Describe the reason for marking as urgent..." })] })), _jsx(Button, { type: "primary", size: "large", onClick: handleSubmitVerdict, loading: verdictMutation.isPending, disabled: !verdict ||
                                (verdict === 'urgent' && !urgentReason.trim()), children: t('common.submit') })] }) })), (isMechInspector || isElecInspector) &&
                userHasSubmitted &&
                !isFinalized && (_jsx(Card, { style: { marginBottom: 16 }, children: _jsx(Result, { status: "info", title: "Verdict Submitted", subTitle: "Waiting for the other inspector to submit their verdict." }) }))] }));
}
//# sourceMappingURL=AssessmentPage.js.map