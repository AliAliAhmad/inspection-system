import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Form, Input, Select, Radio, Button, Space, Typography, message, } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { engineerJobsApi, equipmentApi, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
export default function CreateJobPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [form] = Form.useForm();
    const [category, setCategory] = useState();
    const { data: equipmentData } = useQuery({
        queryKey: ['equipment-list'],
        queryFn: () => equipmentApi.list({ per_page: 200 }).then((r) => r.data),
    });
    const equipmentList = equipmentData?.data ?? [];
    const createMutation = useMutation({
        mutationFn: (payload) => engineerJobsApi.create(payload),
        onSuccess: () => {
            message.success(t('common.success', 'Job created successfully'));
            navigate('/engineer/jobs');
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const handleSubmit = (values) => {
        const payload = {
            engineer_id: user?.id,
            job_type: values.job_type,
            title: values.title,
            description: values.description,
            equipment_id: values.equipment_id,
            category: values.category,
            major_reason: values.category === 'major' ? values.major_reason : undefined,
        };
        createMutation.mutate(payload);
    };
    return (_jsxs("div", { children: [_jsxs(Space, { style: { marginBottom: 16 }, children: [_jsx(Button, { icon: _jsx(ArrowLeftOutlined, {}), onClick: () => navigate('/engineer/jobs'), children: t('common.back', 'Back') }), _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.create_job', 'Create Job') })] }), _jsx(Card, { children: _jsxs(Form, { form: form, layout: "vertical", onFinish: handleSubmit, style: { maxWidth: 600 }, children: [_jsx(Form.Item, { name: "job_type", label: t('common.type', 'Job Type'), rules: [{ required: true, message: t('common.required', 'This field is required') }], children: _jsx(Select, { placeholder: t('common.select', 'Select...'), options: [
                                    { value: 'custom_project', label: t('jobs.type_custom_project', 'Custom Project') },
                                    { value: 'system_review', label: t('jobs.type_system_review', 'System Review') },
                                    { value: 'special_task', label: t('jobs.type_special_task', 'Special Task') },
                                ] }) }), _jsx(Form.Item, { name: "title", label: t('common.title', 'Title'), rules: [{ required: true, message: t('common.required', 'This field is required') }], children: _jsx(Input, { placeholder: t('common.title', 'Title') }) }), _jsx(Form.Item, { name: "description", label: t('common.description', 'Description'), rules: [{ required: true, message: t('common.required', 'This field is required') }], children: _jsx(VoiceTextArea, { rows: 4, placeholder: t('common.description', 'Description') }) }), _jsx(Form.Item, { name: "equipment_id", label: t('equipment.name', 'Equipment'), children: _jsx(Select, { allowClear: true, showSearch: true, placeholder: t('common.select', 'Select equipment...'), optionFilterProp: "label", options: equipmentList.map((eq) => ({
                                    value: eq.id,
                                    label: `${eq.name} (${eq.equipment_type})`,
                                })) }) }), _jsx(Form.Item, { name: "category", label: t('common.category', 'Category'), children: _jsx(Radio.Group, { onChange: (e) => setCategory(e.target.value), options: [
                                    { value: 'major', label: t('status.major', 'Major') },
                                    { value: 'minor', label: t('status.minor', 'Minor') },
                                ] }) }), category === 'major' && (_jsx(Form.Item, { name: "major_reason", label: t('jobs.major_reason', 'Major Reason'), rules: [{ required: true, message: t('common.required', 'This field is required') }], children: _jsx(VoiceTextArea, { rows: 3, placeholder: t('jobs.major_reason', 'Explain why this is major...') }) })), _jsx(Form.Item, { children: _jsxs(Space, { children: [_jsx(Button, { type: "primary", htmlType: "submit", loading: createMutation.isPending, children: t('common.submit', 'Submit') }), _jsx(Button, { onClick: () => navigate('/engineer/jobs'), children: t('common.cancel', 'Cancel') })] }) })] }) })] }));
}
//# sourceMappingURL=CreateJobPage.js.map