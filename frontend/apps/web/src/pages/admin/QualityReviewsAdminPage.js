import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Radio, Tag, message, Typography, Tabs, } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi, } from '@inspection/shared';
import dayjs from 'dayjs';
import VoiceTextArea from '../../components/VoiceTextArea';
const statusColorMap = {
    pending: 'processing',
    approved: 'success',
    rejected: 'error',
};
export default function QualityReviewsAdminPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [statusFilter, setStatusFilter] = useState();
    const [validateOpen, setValidateOpen] = useState(false);
    const [selectedReview, setSelectedReview] = useState(null);
    const [validateForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['quality-reviews', page, perPage, statusFilter],
        queryFn: () => qualityReviewsApi.list({
            page,
            per_page: perPage,
            status: statusFilter,
        }),
    });
    const validateMutation = useMutation({
        mutationFn: ({ id, payload }) => qualityReviewsApi.validate(id, payload),
        onSuccess: () => {
            message.success(t('qualityReviews.validateSuccess', 'Review validated'));
            queryClient.invalidateQueries({ queryKey: ['quality-reviews'] });
            setValidateOpen(false);
            setSelectedReview(null);
            validateForm.resetFields();
        },
        onError: () => message.error(t('qualityReviews.validateError', 'Failed to validate review')),
    });
    const openValidate = (record) => {
        setSelectedReview(record);
        validateForm.resetFields();
        setValidateOpen(true);
    };
    const columns = [
        { title: t('qualityReviews.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
        {
            title: t('qualityReviews.jobType', 'Job Type'),
            dataIndex: 'job_type',
            key: 'job_type',
            render: (v) => _jsx(Tag, { children: v.toUpperCase() }),
        },
        { title: t('qualityReviews.jobId', 'Job ID'), dataIndex: 'job_id', key: 'job_id' },
        {
            title: t('qualityReviews.qeName', 'Quality Engineer'),
            key: 'qe_name',
            render: (_, r) => r.quality_engineer?.full_name || `#${r.qe_id}`,
        },
        {
            title: t('qualityReviews.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (s) => (_jsx(Tag, { color: statusColorMap[s], children: s.toUpperCase() })),
        },
        {
            title: t('qualityReviews.rejectionCategory', 'Rejection Category'),
            dataIndex: 'rejection_category',
            key: 'rejection_category',
            render: (v) => v ? _jsx(Tag, { color: "orange", children: v.replace(/_/g, ' ').toUpperCase() }) : '-',
        },
        {
            title: t('qualityReviews.slaMet', 'SLA Met'),
            dataIndex: 'sla_met',
            key: 'sla_met',
            render: (v) => v === null ? '-' : v ? _jsx(Tag, { color: "green", children: t('common.yes', 'Yes') }) : _jsx(Tag, { color: "red", children: t('common.no', 'No') }),
        },
        {
            title: t('qualityReviews.adminValidation', 'Admin Validation'),
            dataIndex: 'admin_validation',
            key: 'admin_validation',
            render: (v) => v ? _jsx(Tag, { color: v === 'valid' ? 'green' : 'red', children: v.toUpperCase() }) : '-',
        },
        {
            title: t('qualityReviews.reviewedAt', 'Reviewed At'),
            dataIndex: 'reviewed_at',
            key: 'reviewed_at',
            render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsx(_Fragment, { children: !record.admin_validation && (record.status === 'approved' || record.status === 'rejected') && (_jsx(Button, { type: "link", icon: _jsx(CheckCircleOutlined, {}), onClick: () => openValidate(record), children: t('qualityReviews.validate', 'Validate') })) })),
        },
    ];
    const reviews = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const tabItems = [
        { key: 'all', label: t('common.all', 'All') },
        { key: 'pending', label: t('qualityReviews.pending', 'Pending') },
        { key: 'approved', label: t('qualityReviews.approved', 'Approved') },
        { key: 'rejected', label: t('qualityReviews.rejected', 'Rejected') },
    ];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.qualityReviews', 'Quality Reviews') }), children: [_jsx(Tabs, { activeKey: statusFilter || 'all', onChange: (key) => { setStatusFilter(key === 'all' ? undefined : key); setPage(1); }, items: tabItems }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: reviews, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, scroll: { x: 1200 } }), _jsxs(Modal, { title: t('qualityReviews.validateReview', 'Validate Quality Review'), open: validateOpen, onCancel: () => { setValidateOpen(false); setSelectedReview(null); validateForm.resetFields(); }, onOk: () => validateForm.submit(), confirmLoading: validateMutation.isPending, destroyOnClose: true, children: [selectedReview && (_jsx(Typography.Paragraph, { type: "secondary", style: { marginBottom: 16 }, children: t('qualityReviews.validateDescription', 'Validating review #{{id}} for {{type}} job #{{jobId}}', {
                            id: selectedReview.id,
                            type: selectedReview.job_type,
                            jobId: selectedReview.job_id,
                        }) })), _jsxs(Form, { form: validateForm, layout: "vertical", onFinish: (v) => selectedReview && validateMutation.mutate({ id: selectedReview.id, payload: v }), children: [_jsx(Form.Item, { name: "admin_validation", label: t('qualityReviews.validation', 'Validation'), rules: [{ required: true }], children: _jsxs(Radio.Group, { children: [_jsx(Radio.Button, { value: "valid", children: t('qualityReviews.valid', 'Valid') }), _jsx(Radio.Button, { value: "wrong", children: t('qualityReviews.wrong', 'Wrong') })] }) }), _jsx(Form.Item, { name: "admin_validation_notes", label: t('qualityReviews.validationNotes', 'Notes'), children: _jsx(VoiceTextArea, { rows: 3 }) })] })] })] }));
}
//# sourceMappingURL=QualityReviewsAdminPage.js.map