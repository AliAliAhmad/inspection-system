import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Tabs, Typography, Button, Modal, Form, Select, Space, message, } from 'antd';
import { ToolOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { defectsApi, usersApi, } from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';
const severityColors = {
    critical: 'red',
    high: 'orange',
    medium: 'gold',
    low: 'green',
};
const statusColors = {
    open: 'red',
    in_progress: 'blue',
    resolved: 'green',
    closed: 'default',
    false_alarm: 'purple',
};
const statusLabels = {
    open: 'Open',
    in_progress: 'In Progress',
    resolved: 'Resolved',
    closed: 'Closed',
    false_alarm: 'False Alarm',
};
export default function DefectsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [activeStatus, setActiveStatus] = useState();
    const [page, setPage] = useState(1);
    const [assignOpen, setAssignOpen] = useState(false);
    const [selectedDefect, setSelectedDefect] = useState(null);
    const [assignForm] = Form.useForm();
    const [category, setCategory] = useState();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['defects', activeStatus, page],
        queryFn: () => defectsApi.list({ status: activeStatus, page, per_page: 20 }).then(r => r.data),
    });
    // Fetch specialists when modal is open
    const { data: specialistsData } = useQuery({
        queryKey: ['users', 'specialists'],
        queryFn: () => usersApi.list({ role: 'specialist', per_page: 200, is_active: true }),
        enabled: assignOpen,
    });
    const assignMutation = useMutation({
        mutationFn: ({ id, payload }) => defectsApi.assignSpecialist(id, payload),
        onSuccess: (res) => {
            const job = res.data?.data;
            message.success(t('defects.assignSuccess', 'Specialist job {{jobId}} created', {
                jobId: job?.job_id || '',
            }));
            queryClient.invalidateQueries({ queryKey: ['defects'] });
            setAssignOpen(false);
            setSelectedDefect(null);
            assignForm.resetFields();
            setCategory(undefined);
        },
        onError: (err) => {
            message.error(err?.response?.data?.message || t('defects.assignError', 'Failed to assign specialist'));
        },
    });
    const specialists = specialistsData?.data?.data || specialistsData?.data?.data || [];
    const columns = [
        {
            title: t('defects.id', 'ID'),
            dataIndex: 'id',
            key: 'id',
            width: 70,
        },
        {
            title: t('defects.description', 'Description'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: t('defects.severity', 'Severity'),
            dataIndex: 'severity',
            key: 'severity',
            render: (severity) => (_jsx(Tag, { color: severityColors[severity] || 'default', children: severity?.toUpperCase() })),
        },
        {
            title: t('defects.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: statusColors[status] || 'default', children: statusLabels[status] || status?.toUpperCase() })),
        },
        {
            title: t('defects.category', 'Category'),
            dataIndex: 'category',
            key: 'category',
            render: (cat) => cat ? (_jsx(Tag, { color: cat === 'mechanical' ? 'blue' : 'gold', children: cat.toUpperCase() })) : ('-'),
        },
        {
            title: t('defects.priority', 'Priority'),
            dataIndex: 'priority',
            key: 'priority',
            render: (priority) => _jsx(Tag, { children: priority?.toUpperCase() }),
        },
        {
            title: t('defects.dueDate', 'Due Date'),
            dataIndex: 'due_date',
            key: 'due_date',
            render: (v) => v || '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 160,
            render: (_, record) => {
                const hasJob = !!record.specialist_job;
                return (_jsx(Button, { type: "primary", size: "small", icon: _jsx(ToolOutlined, {}), onClick: () => {
                        setSelectedDefect(record);
                        assignForm.resetFields();
                        setCategory(undefined);
                        setAssignOpen(true);
                    }, disabled: hasJob || record.status === 'closed' || record.status === 'resolved', children: hasJob
                        ? t('defects.assigned', 'Assigned')
                        : t('defects.assignSpecialist', 'Assign Specialist') }));
            },
        },
    ];
    const defects = data?.data || [];
    const pagination = data?.pagination;
    const tabItems = [
        { key: 'all', label: t('defects.all', 'All') },
        { key: 'open', label: t('defects.open', 'Open') },
        { key: 'in_progress', label: t('defects.inProgress', 'In Progress') },
        { key: 'resolved', label: t('defects.resolved', 'Resolved') },
        { key: 'closed', label: t('defects.closed', 'Closed') },
        { key: 'false_alarm', label: t('defects.falseAlarm', 'False Alarm') },
    ];
    const handleTabChange = (key) => {
        setActiveStatus(key === 'all' ? undefined : key);
        setPage(1);
    };
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.defects', 'Defects') }), children: [_jsx(Tabs, { activeKey: activeStatus || 'all', onChange: handleTabChange, items: tabItems }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: defects, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || 20,
                    total: pagination?.total || 0,
                    showSizeChanger: false,
                    onChange: (p) => setPage(p),
                }, scroll: { x: 1100 } }), _jsxs(Modal, { title: t('defects.assignSpecialist', 'Assign Specialist'), open: assignOpen, onCancel: () => {
                    setAssignOpen(false);
                    setSelectedDefect(null);
                    assignForm.resetFields();
                    setCategory(undefined);
                }, onOk: () => assignForm.submit(), confirmLoading: assignMutation.isPending, destroyOnClose: true, children: [selectedDefect && (_jsxs("div", { style: { marginBottom: 16 }, children: [_jsxs(Typography.Text, { strong: true, children: ["Defect #", selectedDefect.id, ": "] }), _jsx(Typography.Text, { children: selectedDefect.description }), _jsx("br", {}), _jsxs(Space, { style: { marginTop: 4 }, children: [_jsx(Tag, { color: severityColors[selectedDefect.severity || ''], children: selectedDefect.severity?.toUpperCase() }), selectedDefect.category && (_jsx(Tag, { color: selectedDefect.category === 'mechanical' ? 'blue' : 'gold', children: selectedDefect.category.toUpperCase() }))] })] })), _jsxs(Form, { form: assignForm, layout: "vertical", onFinish: (values) => selectedDefect &&
                            assignMutation.mutate({ id: selectedDefect.id, payload: values }), children: [_jsx(Form.Item, { name: "specialist_id", label: t('defects.specialist', 'Specialist'), rules: [{ required: true, message: 'Please select a specialist' }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('defects.selectSpecialist', 'Select specialist'), children: specialists.map((s) => (_jsxs(Select.Option, { value: s.id, children: [s.full_name, " (", s.role_id, ")"] }, s.id))) }) }), _jsx(Form.Item, { name: "category", label: t('defects.jobCategory', 'Job Category'), children: _jsxs(Select, { allowClear: true, placeholder: t('defects.selectCategory', 'Select category (optional)'), onChange: (v) => setCategory(v), children: [_jsx(Select.Option, { value: "minor", children: "Minor" }), _jsx(Select.Option, { value: "major", children: "Major" })] }) }), category === 'major' && (_jsx(Form.Item, { name: "major_reason", label: t('defects.majorReason', 'Major Reason'), rules: [{ required: true, message: 'Reason is required for major category' }], children: _jsx(VoiceTextArea, { rows: 3, placeholder: t('defects.enterMajorReason', 'Explain why this is a major job') }) }))] })] })] }));
}
//# sourceMappingURL=DefectsPage.js.map