import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Radio, Tag, Space, message, Typography, Tabs, } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionsApi, } from '@inspection/shared';
import dayjs from 'dayjs';
import VoiceTextArea from '../../components/VoiceTextArea';
const statusColorMap = {
    draft: 'default',
    submitted: 'processing',
    reviewed: 'success',
};
const resultColorMap = {
    pass: 'green',
    fail: 'red',
    incomplete: 'orange',
};
export default function AllInspectionsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [statusFilter, setStatusFilter] = useState();
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewingInspection, setReviewingInspection] = useState(null);
    const [reviewForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['inspections', page, perPage, statusFilter],
        queryFn: () => inspectionsApi.list({ page, per_page: perPage, status: statusFilter }),
    });
    const reviewMutation = useMutation({
        mutationFn: ({ id, payload }) => inspectionsApi.review(id, payload),
        onSuccess: () => {
            message.success(t('inspections.reviewSuccess', 'Inspection reviewed successfully'));
            queryClient.invalidateQueries({ queryKey: ['inspections'] });
            setReviewOpen(false);
            setReviewingInspection(null);
            reviewForm.resetFields();
        },
        onError: () => message.error(t('inspections.reviewError', 'Failed to review inspection')),
    });
    const openReview = (record) => {
        setReviewingInspection(record);
        reviewForm.resetFields();
        setReviewOpen(true);
    };
    const columns = [
        { title: t('inspections.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
        {
            title: t('inspections.equipment', 'Equipment'),
            key: 'equipment',
            render: (_, r) => r.equipment?.name || `ID: ${r.equipment_id}`,
        },
        {
            title: t('inspections.technician', 'Technician'),
            key: 'technician',
            render: (_, r) => r.technician?.full_name || `ID: ${r.technician_id}`,
        },
        {
            title: t('inspections.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (s) => (_jsx(Tag, { color: statusColorMap[s], children: s.toUpperCase() })),
        },
        {
            title: t('inspections.result', 'Result'),
            dataIndex: 'result',
            key: 'result',
            render: (r) => r ? _jsx(Tag, { color: resultColorMap[r], children: r.toUpperCase() }) : '-',
        },
        {
            title: t('inspections.startedAt', 'Started'),
            dataIndex: 'started_at',
            key: 'started_at',
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        },
        {
            title: t('inspections.submittedAt', 'Submitted'),
            dataIndex: 'submitted_at',
            key: 'submitted_at',
            render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Space, { children: record.status === 'submitted' && (_jsx(Button, { type: "link", icon: _jsx(CheckCircleOutlined, {}), onClick: () => openReview(record), children: t('inspections.review', 'Review') })) })),
        },
    ];
    const inspections = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const tabItems = [
        { key: 'all', label: t('inspections.all', 'All') },
        { key: 'draft', label: t('inspections.draft', 'Draft') },
        { key: 'submitted', label: t('inspections.submitted', 'Submitted') },
        { key: 'reviewed', label: t('inspections.reviewed', 'Reviewed') },
    ];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.inspections', 'All Inspections') }), children: [_jsx(Tabs, { activeKey: statusFilter || 'all', onChange: (key) => {
                    setStatusFilter(key === 'all' ? undefined : key);
                    setPage(1);
                }, items: tabItems }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: inspections, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, scroll: { x: 900 } }), _jsxs(Modal, { title: t('inspections.reviewInspection', 'Review Inspection'), open: reviewOpen, onCancel: () => { setReviewOpen(false); setReviewingInspection(null); reviewForm.resetFields(); }, onOk: () => reviewForm.submit(), confirmLoading: reviewMutation.isPending, destroyOnClose: true, children: [reviewingInspection && (_jsx(Typography.Paragraph, { type: "secondary", style: { marginBottom: 16 }, children: t('inspections.reviewFor', 'Reviewing inspection #{{id}} for {{equipment}}', {
                            id: reviewingInspection.id,
                            equipment: reviewingInspection.equipment?.name || reviewingInspection.equipment_id,
                        }) })), _jsxs(Form, { form: reviewForm, layout: "vertical", onFinish: (v) => reviewingInspection && reviewMutation.mutate({ id: reviewingInspection.id, payload: v }), children: [_jsx(Form.Item, { name: "result", label: t('inspections.result', 'Result'), rules: [{ required: true }], children: _jsxs(Radio.Group, { children: [_jsx(Radio.Button, { value: "pass", children: t('inspections.pass', 'Pass') }), _jsx(Radio.Button, { value: "fail", children: t('inspections.fail', 'Fail') }), _jsx(Radio.Button, { value: "incomplete", children: t('inspections.incomplete', 'Incomplete') })] }) }), _jsx(Form.Item, { name: "notes", label: t('inspections.notes', 'Notes'), children: _jsx(VoiceTextArea, { rows: 3 }) })] })] })] }));
}
//# sourceMappingURL=AllInspectionsPage.js.map