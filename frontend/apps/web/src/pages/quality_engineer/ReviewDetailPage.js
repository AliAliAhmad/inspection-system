import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Descriptions, Tag, Button, Space, Typography, Select, Form, Spin, Alert, message, } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { qualityReviewsApi, formatDateTime, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
const STATUS_COLOR = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red',
};
const REJECTION_CATEGORIES = [
    'incomplete_work',
    'wrong_parts',
    'safety_issue',
    'poor_workmanship',
    'did_not_follow_procedure',
    'equipment_still_faulty',
    'other',
];
export default function ReviewDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const queryClient = useQueryClient();
    const [showRejectForm, setShowRejectForm] = useState(false);
    const [approveNotes, setApproveNotes] = useState('');
    const [rejectForm] = Form.useForm();
    const { data, isLoading, error } = useQuery({
        queryKey: ['quality-review', id],
        queryFn: () => qualityReviewsApi.get(Number(id)).then((r) => r.data),
        enabled: !!id,
    });
    const review = data?.data;
    const approveMutation = useMutation({
        mutationFn: (notes) => qualityReviewsApi.approve(Number(id), { notes }),
        onSuccess: () => {
            message.success(t('common.success', 'Review approved'));
            queryClient.invalidateQueries({ queryKey: ['quality-review', id] });
            queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const rejectMutation = useMutation({
        mutationFn: (payload) => qualityReviewsApi.reject(Number(id), payload),
        onSuccess: () => {
            message.success(t('common.success', 'Review rejected'));
            queryClient.invalidateQueries({ queryKey: ['quality-review', id] });
            queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
            setShowRejectForm(false);
            rejectForm.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    if (isLoading) {
        return (_jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, { size: "large" }) }));
    }
    if (error || !review) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'Failed to load review'), showIcon: true });
    }
    const isPending = review.status === 'pending';
    return (_jsxs("div", { children: [_jsx(Space, { style: { marginBottom: 16 }, children: _jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/quality/reviews'), children: t('common.back', 'Back') }) }), _jsxs(Typography.Title, { level: 4, children: [t('common.review', 'Review'), " #", review.id] }), _jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Descriptions, { column: { xs: 1, sm: 2 }, bordered: true, children: [_jsx(Descriptions.Item, { label: t('common.type', 'Job Type'), children: _jsx(Tag, { color: review.job_type === 'specialist' ? 'blue' : 'purple', children: t(`common.${review.job_type}`, review.job_type) }) }), _jsx(Descriptions.Item, { label: t('common.id', 'Job ID'), children: review.job_id }), _jsx(Descriptions.Item, { label: t('common.status', 'Status'), children: _jsx(Tag, { color: STATUS_COLOR[review.status] ?? 'default', children: t(`status.${review.status}`, review.status) }) }), _jsx(Descriptions.Item, { label: t('quality.sla_deadline', 'SLA Deadline'), children: review.sla_deadline ? (_jsx("span", { style: {
                                    color: new Date(review.sla_deadline).getTime() < Date.now()
                                        ? '#ff4d4f'
                                        : undefined,
                                }, children: formatDateTime(review.sla_deadline) })) : ('-') }), _jsx(Descriptions.Item, { label: t('common.created_at', 'Created At'), children: formatDateTime(review.created_at) }), review.reviewed_at && (_jsx(Descriptions.Item, { label: t('common.reviewed_at', 'Reviewed At'), children: formatDateTime(review.reviewed_at) })), review.quality_engineer && (_jsx(Descriptions.Item, { label: t('common.quality_engineer', 'Quality Engineer'), children: review.quality_engineer.full_name })), review.sla_met !== null && (_jsx(Descriptions.Item, { label: t('quality.sla_met', 'SLA Met'), children: _jsx(Tag, { color: review.sla_met ? 'green' : 'red', children: review.sla_met ? t('common.yes', 'Yes') : t('common.no', 'No') }) }))] }) }), isPending && (_jsx(Card, { title: t('common.actions', 'Actions'), style: { marginBottom: 16 }, children: !showRejectForm ? (_jsxs(Space, { direction: "vertical", style: { width: '100%' }, children: [_jsx(VoiceTextArea, { rows: 2, placeholder: t('common.notes_optional', 'Notes (optional)'), value: approveNotes, onChange: (e) => setApproveNotes(e.target.value) }), _jsxs(Space, { children: [_jsx(Button, { type: "primary", icon: _jsx(CheckCircleOutlined, {}), loading: approveMutation.isPending, onClick: () => approveMutation.mutate(approveNotes || undefined), children: t('quality.approve', 'Approve') }), _jsx(Button, { danger: true, icon: _jsx(CloseCircleOutlined, {}), onClick: () => setShowRejectForm(true), children: t('quality.reject', 'Reject') })] })] })) : (_jsxs(Form, { form: rejectForm, layout: "vertical", onFinish: (values) => rejectMutation.mutate({
                        rejection_reason: values.rejection_reason,
                        rejection_category: values.rejection_category,
                        notes: values.notes,
                        evidence_notes: values.evidence_notes,
                    }), children: [_jsx(Form.Item, { name: "rejection_category", label: t('quality.rejection_category', 'Rejection Category'), rules: [{ required: true, message: t('common.required', 'Required') }], children: _jsx(Select, { placeholder: t('common.select', 'Select...'), options: REJECTION_CATEGORIES.map((cat) => ({
                                    value: cat,
                                    label: t(`quality.cat_${cat}`, cat.replace(/_/g, ' ')),
                                })) }) }), _jsx(Form.Item, { name: "rejection_reason", label: t('quality.rejection_reason', 'Rejection Reason'), rules: [{ required: true, message: t('common.required', 'Required') }], children: _jsx(VoiceTextArea, { rows: 3, placeholder: t('quality.rejection_reason', 'Reason...') }) }), _jsx(Form.Item, { name: "evidence_notes", label: t('quality.evidence', 'Evidence Notes'), children: _jsx(VoiceTextArea, { rows: 2, placeholder: t('quality.evidence', 'Evidence notes...') }) }), _jsx(Form.Item, { name: "notes", label: t('common.notes', 'Notes'), children: _jsx(VoiceTextArea, { rows: 2, placeholder: t('common.notes', 'Additional notes...') }) }), _jsx(Form.Item, { children: _jsxs(Space, { children: [_jsx(Button, { danger: true, type: "primary", htmlType: "submit", loading: rejectMutation.isPending, children: t('quality.reject', 'Reject') }), _jsx(Button, { onClick: () => setShowRejectForm(false), children: t('common.cancel', 'Cancel') })] }) })] })) })), review.status === 'rejected' && (_jsx(Card, { title: t('quality.rejection_details', 'Rejection Details'), style: { marginBottom: 16 }, children: _jsxs(Descriptions, { column: 1, bordered: true, children: [_jsx(Descriptions.Item, { label: t('quality.rejection_category', 'Category'), children: _jsx(Tag, { color: "red", children: t(`quality.cat_${review.rejection_category}`, review.rejection_category?.replace(/_/g, ' ') ?? '-') }) }), _jsx(Descriptions.Item, { label: t('quality.rejection_reason', 'Reason'), children: review.rejection_reason || '-' }), review.evidence_notes && (_jsx(Descriptions.Item, { label: t('quality.evidence', 'Evidence Notes'), children: review.evidence_notes })), review.notes && (_jsx(Descriptions.Item, { label: t('common.notes', 'Notes'), children: review.notes }))] }) })), review.status === 'approved' && review.notes && (_jsx(Card, { title: t('common.notes', 'Notes'), style: { marginBottom: 16 }, children: _jsx(Typography.Paragraph, { children: review.notes }) })), review.admin_validation && (_jsx(Card, { title: t('quality.admin_validation', 'Admin Validation'), style: { marginBottom: 16 }, children: _jsxs(Descriptions, { column: 1, bordered: true, children: [_jsx(Descriptions.Item, { label: t('quality.validate_rejection', 'Validation'), children: _jsx(Tag, { color: review.admin_validation === 'valid' ? 'green' : 'red', children: t(`quality.${review.admin_validation}`, review.admin_validation) }) }), review.admin_validation_notes && (_jsx(Descriptions.Item, { label: t('common.notes', 'Notes'), children: review.admin_validation_notes }))] }) }))] }));
}
//# sourceMappingURL=ReviewDetailPage.js.map