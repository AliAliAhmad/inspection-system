import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect } from 'react';
import { Card, Typography, Progress, Button, Radio, InputNumber, Upload, Tag, Space, Spin, Alert, List, Badge, message, Popconfirm, Descriptions, } from 'antd';
import { CameraOutlined, PictureOutlined, StarFilled, CheckCircleOutlined, ArrowLeftOutlined, SendOutlined, } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { inspectionsApi, filesApi, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
export default function InspectionChecklistPage() {
    const { t, i18n } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const assignmentId = Number(id);
    const isArabic = i18n.language === 'ar';
    // Warn on page close/refresh if inspection is in draft status
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);
    // Fetch inspection data by assignment ID (auto-creates if needed)
    const { data: inspection, isLoading, error, refetch: refetchInspection, } = useQuery({
        queryKey: ['inspection', 'by-assignment', assignmentId],
        queryFn: () => inspectionsApi.getByAssignment(assignmentId).then((r) => r.data.data),
    });
    const inspectionId = inspection?.id;
    // Fetch progress using actual inspection ID
    const { data: progress, refetch: refetchProgress } = useQuery({
        queryKey: ['inspection-progress', inspectionId],
        queryFn: () => inspectionsApi
            .getProgress(inspectionId)
            .then((r) => {
            const raw = r.data.data ?? r.data.progress;
            return {
                total_items: raw.total_items,
                answered_items: raw.answered_items,
                percentage: raw.percentage ?? raw.progress_percentage ?? 0,
            };
        }),
        enabled: !!inspectionId,
    });
    // Answer mutation using actual inspection ID
    const answerMutation = useMutation({
        mutationFn: (payload) => inspectionsApi.answerQuestion(inspectionId, payload),
        onSuccess: () => {
            refetchProgress();
            refetchInspection();
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    // Submit mutation using actual inspection ID
    const submitMutation = useMutation({
        mutationFn: () => inspectionsApi.submit(inspectionId),
        onSuccess: () => {
            message.success(t('inspection.submit'));
            navigate('/inspector/assignments');
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    // Upload mutation
    const uploadMutation = useMutation({
        mutationFn: (params) => filesApi.upload(params.file, 'inspection_answer', params.checklistItemId),
        onSuccess: () => {
            message.success('Photo uploaded');
            refetchInspection();
        },
        onError: () => {
            message.error(t('common.error'));
        },
    });
    const handleAnswer = useCallback((checklistItemId, value, comment) => {
        answerMutation.mutate({
            checklist_item_id: checklistItemId,
            answer_value: value,
            comment,
        });
    }, [answerMutation]);
    const handleUpload = useCallback((file, checklistItemId) => {
        uploadMutation.mutate({ file, checklistItemId });
        return false; // prevent default upload behavior
    }, [uploadMutation]);
    if (isLoading) {
        return (_jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, { size: "large" }) }));
    }
    if (error) {
        return _jsx(Alert, { type: "error", message: t('common.error'), showIcon: true });
    }
    if (!inspection) {
        return _jsx(Alert, { type: "warning", message: t('common.noData'), showIcon: true });
    }
    const answers = inspection.answers ?? [];
    const answeredMap = new Map();
    answers.forEach((a) => answeredMap.set(a.checklist_item_id, a));
    // Get checklist items: prefer checklist_items from response, fallback to extracting from answers
    const rawChecklistItems = inspection.checklist_items ?? [];
    const itemsFromAnswers = answers
        .filter((a) => a.checklist_item !== null)
        .map((a) => a.checklist_item);
    // Merge and deduplicate by id, sorted by order_index
    const allItems = [...rawChecklistItems, ...itemsFromAnswers];
    const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values()).sort((a, b) => a.order_index - b.order_index);
    const canSubmit = progress &&
        progress.answered_items >= progress.total_items &&
        inspection.status === 'draft';
    const getQuestionText = (item) => {
        if (isArabic && item.question_text_ar) {
            return item.question_text_ar;
        }
        return item.question_text;
    };
    return (_jsxs("div", { children: [_jsx(Space, { style: { marginBottom: 16 }, children: _jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/inspector/assignments'), children: t('common.back') }) }), _jsx(Typography.Title, { level: 4, children: t('inspection.checklist') }), inspection.equipment && (_jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Descriptions, { column: { xs: 1, sm: 2, md: 3 }, size: "small", children: [_jsx(Descriptions.Item, { label: t('equipment.name'), children: inspection.equipment.name }), _jsx(Descriptions.Item, { label: t('equipment.type'), children: inspection.equipment.equipment_type }), _jsx(Descriptions.Item, { label: t('equipment.location'), children: inspection.equipment.location ?? '-' }), _jsx(Descriptions.Item, { label: t('equipment.berth'), children: inspection.equipment.berth ?? '-' }), _jsx(Descriptions.Item, { label: t('common.status'), children: _jsx(Tag, { color: inspection.status === 'draft' ? 'blue' : 'green', children: t(`status.${inspection.status}`, inspection.status) }) })] }) })), progress && (_jsxs(Card, { style: { marginBottom: 16 }, children: [_jsx(Typography.Text, { strong: true, children: t('inspection.progress') }), _jsx(Progress, { percent: Math.round(progress.percentage), status: progress.percentage >= 100 ? 'success' : 'active', format: () => `${progress.answered_items} / ${progress.total_items}` })] })), _jsx(List, { dataSource: uniqueItems, locale: { emptyText: t('common.noData') }, renderItem: (item) => {
                    const existingAnswer = answeredMap.get(item.id);
                    return (_jsx(ChecklistItemCard, { item: item, existingAnswer: existingAnswer, getQuestionText: getQuestionText, onAnswer: handleAnswer, onUpload: handleUpload, isSubmitted: inspection.status !== 'draft' }, item.id));
                } }), inspection.status === 'draft' && (_jsxs(Card, { style: { marginTop: 16, textAlign: 'center' }, children: [_jsx(Popconfirm, { title: t('common.confirm'), onConfirm: () => submitMutation.mutate(), okText: t('common.submit'), cancelText: t('common.cancel'), children: _jsx(Button, { type: "primary", size: "large", icon: _jsx(SendOutlined, {}), loading: submitMutation.isPending, disabled: !canSubmit, children: t('inspection.submit') }) }), !canSubmit && progress && progress.total_items > 0 && (_jsxs(Typography.Text, { type: "secondary", style: { display: 'block', marginTop: 8 }, children: [t('inspection.progress'), ": ", progress.answered_items, " /", ' ', progress.total_items] }))] }))] }));
}
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
function ChecklistItemCard({ item, existingAnswer, getQuestionText, onAnswer, onUpload, isSubmitted, }) {
    const { t } = useTranslation();
    const [comment, setComment] = useState(existingAnswer?.comment ?? '');
    const [showComment, setShowComment] = useState(!!existingAnswer?.comment);
    const renderAnswerInput = () => {
        const currentValue = existingAnswer?.answer_value ?? '';
        const disabled = isSubmitted;
        switch (item.answer_type) {
            case 'yes_no':
                return (_jsxs(Radio.Group, { value: currentValue || undefined, onChange: (e) => onAnswer(item.id, e.target.value, comment || undefined), disabled: disabled, children: [_jsx(Radio.Button, { value: "yes", children: "Yes" }), _jsx(Radio.Button, { value: "no", children: "No" })] }));
            case 'pass_fail':
                return (_jsxs(Radio.Group, { value: currentValue || undefined, onChange: (e) => onAnswer(item.id, e.target.value, comment || undefined), disabled: disabled, children: [_jsx(Radio.Button, { value: "pass", children: "Pass" }), _jsx(Radio.Button, { value: "fail", children: "Fail" })] }));
            case 'text':
                return (_jsx(VoiceTextArea, { defaultValue: currentValue, rows: 2, placeholder: t('inspection.answer', 'Enter answer'), disabled: disabled, onBlur: (e) => {
                        if (e.target.value && e.target.value !== currentValue) {
                            onAnswer(item.id, e.target.value, comment || undefined);
                        }
                    } }));
            case 'numeric':
                return (_jsx(InputNumber, { defaultValue: currentValue ? Number(currentValue) : undefined, placeholder: t('inspection.answer', 'Enter value'), disabled: disabled, onBlur: (e) => {
                        const val = e.target.value;
                        if (val && val !== currentValue) {
                            onAnswer(item.id, val, comment || undefined);
                        }
                    }, style: { width: 200 } }));
            default:
                return null;
        }
    };
    return (_jsx(Card, { style: { marginBottom: 12 }, size: "small", title: _jsxs(Space, { wrap: true, children: [_jsx(Typography.Text, { strong: true, children: getQuestionText(item) }), item.category && (_jsx(Tag, { color: item.category === 'mechanical' ? 'blue' : 'gold', children: item.category })), item.critical_failure && (_jsx(Badge, { count: _jsx(StarFilled, { style: { color: '#f5222d', fontSize: 14 } }) })), existingAnswer && (_jsx(CheckCircleOutlined, { style: { color: '#52c41a' } }))] }), children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: "middle", children: [renderAnswerInput(), _jsxs(Space, { children: [_jsx(Button, { size: "small", type: "link", onClick: () => setShowComment(!showComment), children: t('inspection.comment', 'Comment') }), !isSubmitted && (_jsxs(_Fragment, { children: [_jsx(Button, { size: "small", type: "link", icon: _jsx(CameraOutlined, {}), onClick: () => openCameraInput('image/*', (file) => onUpload(file, item.id)), children: t('inspection.take_photo', 'Take Photo') }), _jsx(Upload, { accept: "image/*", showUploadList: false, beforeUpload: (file) => onUpload(file, item.id), children: _jsx(Button, { size: "small", type: "link", icon: _jsx(PictureOutlined, {}), children: t('inspection.from_gallery', 'From Gallery') }) })] })), existingAnswer?.photo_path && (_jsxs(Tag, { color: "green", children: [t('inspection.photo', 'Photo'), " uploaded"] }))] }), showComment && (_jsx(VoiceTextArea, { value: comment, onChange: (e) => setComment(e.target.value), placeholder: t('inspection.comment', 'Add a comment...'), rows: 2, disabled: isSubmitted, onBlur: () => {
                        if (existingAnswer &&
                            comment !== (existingAnswer.comment ?? '')) {
                            onAnswer(item.id, existingAnswer.answer_value, comment || undefined);
                        }
                    } }))] }) }));
}
//# sourceMappingURL=InspectionChecklistPage.js.map