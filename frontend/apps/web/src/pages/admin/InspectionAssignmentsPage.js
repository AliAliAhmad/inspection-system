import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Select, DatePicker, Tag, message, Typography, Descriptions, } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, usersApi, } from '@inspection/shared';
import dayjs from 'dayjs';
export default function InspectionAssignmentsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [generateForm] = Form.useForm();
    const [assignForm] = Form.useForm();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['inspection-assignments', page, perPage],
        queryFn: () => inspectionAssignmentsApi.getLists({ page, per_page: perPage }),
    });
    const { data: inspectorsData } = useQuery({
        queryKey: ['users', 'inspectors'],
        queryFn: () => usersApi.list({ role: 'inspector', is_active: true, per_page: 200 }),
        enabled: assignOpen,
    });
    const generateMutation = useMutation({
        mutationFn: (payload) => inspectionAssignmentsApi.generateList(payload),
        onSuccess: () => {
            message.success(t('assignments.generateSuccess', 'Inspection list generated'));
            queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
            setGenerateOpen(false);
            generateForm.resetFields();
        },
        onError: () => message.error(t('assignments.generateError', 'Failed to generate list')),
    });
    const assignMutation = useMutation({
        mutationFn: ({ id, payload }) => inspectionAssignmentsApi.assignTeam(id, payload),
        onSuccess: () => {
            message.success(t('assignments.assignSuccess', 'Team assigned successfully'));
            queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
            setAssignOpen(false);
            setSelectedAssignment(null);
            assignForm.resetFields();
        },
        onError: () => message.error(t('assignments.assignError', 'Failed to assign team')),
    });
    const openAssign = (assignment) => {
        setSelectedAssignment(assignment);
        assignForm.resetFields();
        setAssignOpen(true);
    };
    const assignmentColumns = [
        {
            title: t('assignments.equipment', 'Equipment'),
            key: 'equipment',
            render: (_, record) => record.equipment?.name || `ID: ${record.equipment_id}`,
        },
        {
            title: t('assignments.berth', 'Berth'),
            dataIndex: 'berth',
            key: 'berth',
            render: (v) => v || '-',
        },
        {
            title: t('assignments.shift', 'Shift'),
            dataIndex: 'shift',
            key: 'shift',
            render: (v) => _jsx(Tag, { color: v === 'day' ? 'gold' : 'geekblue', children: v.toUpperCase() }),
        },
        {
            title: t('assignments.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (v) => _jsx(Tag, { color: v === 'completed' ? 'green' : v === 'assigned' ? 'blue' : 'default', children: v.toUpperCase() }),
        },
        {
            title: t('assignments.mechInspector', 'Mech Inspector'),
            dataIndex: 'mechanical_inspector_id',
            key: 'mechanical_inspector_id',
            render: (v) => v ? `#${v}` : '-',
        },
        {
            title: t('assignments.elecInspector', 'Elec Inspector'),
            dataIndex: 'electrical_inspector_id',
            key: 'electrical_inspector_id',
            render: (v) => v ? `#${v}` : '-',
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            render: (_, record) => (_jsx(Button, { type: "link", icon: _jsx(TeamOutlined, {}), onClick: () => openAssign(record), children: t('assignments.assignTeam', 'Assign Team') })),
        },
    ];
    const listColumns = [
        { title: t('assignments.id', 'ID'), dataIndex: 'id', key: 'id', width: 60 },
        {
            title: t('assignments.targetDate', 'Target Date'),
            dataIndex: 'target_date',
            key: 'target_date',
            render: (v) => dayjs(v).format('YYYY-MM-DD'),
        },
        {
            title: t('assignments.shift', 'Shift'),
            dataIndex: 'shift',
            key: 'shift',
            render: (v) => _jsx(Tag, { color: v === 'day' ? 'gold' : 'geekblue', children: v.toUpperCase() }),
        },
        {
            title: t('assignments.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (v) => _jsx(Tag, { children: v.toUpperCase() }),
        },
        {
            title: t('assignments.totalAssignments', 'Assignments'),
            key: 'count',
            render: (_, record) => record.assignments?.length || 0,
        },
        {
            title: t('assignments.createdAt', 'Created'),
            dataIndex: 'created_at',
            key: 'created_at',
            render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
        },
    ];
    const lists = data?.data?.data || [];
    const pagination = data?.data?.pagination;
    const inspectors = inspectorsData?.data?.data || [];
    const mechInspectors = inspectors.filter((u) => u.specialization === 'mechanical' || !u.specialization);
    const elecInspectors = inspectors.filter((u) => u.specialization === 'electrical' || !u.specialization);
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, children: t('nav.assignments', 'Inspection Assignments') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setGenerateOpen(true), children: t('assignments.generate', 'Generate List') }), children: [_jsx(Table, { rowKey: "id", columns: listColumns, dataSource: lists, loading: isLoading, locale: { emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }, pagination: {
                    current: pagination?.page || page,
                    pageSize: pagination?.per_page || perPage,
                    total: pagination?.total || 0,
                    showSizeChanger: true,
                    onChange: (p, ps) => { setPage(p); setPerPage(ps); },
                }, expandable: {
                    expandedRowRender: (record) => (_jsx(Table, { rowKey: "id", columns: assignmentColumns, dataSource: record.assignments || [], pagination: false, size: "small" })),
                    rowExpandable: (record) => (record.assignments?.length || 0) > 0,
                }, scroll: { x: 800 } }), _jsx(Modal, { title: t('assignments.generate', 'Generate Inspection List'), open: generateOpen, onCancel: () => { setGenerateOpen(false); generateForm.resetFields(); }, onOk: () => generateForm.submit(), confirmLoading: generateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: generateForm, layout: "vertical", onFinish: (values) => generateMutation.mutate({ target_date: values.target_date.format('YYYY-MM-DD'), shift: values.shift }), children: [_jsx(Form.Item, { name: "target_date", label: t('assignments.targetDate', 'Target Date'), rules: [{ required: true }], children: _jsx(DatePicker, { style: { width: '100%' } }) }), _jsx(Form.Item, { name: "shift", label: t('assignments.shift', 'Shift'), rules: [{ required: true }], children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "day", children: t('common.day', 'Day') }), _jsx(Select.Option, { value: "night", children: t('common.night', 'Night') })] }) })] }) }), _jsxs(Modal, { title: t('assignments.assignTeam', 'Assign Inspection Team'), open: assignOpen, onCancel: () => { setAssignOpen(false); setSelectedAssignment(null); assignForm.resetFields(); }, onOk: () => assignForm.submit(), confirmLoading: assignMutation.isPending, destroyOnClose: true, children: [selectedAssignment && (_jsxs(Descriptions, { size: "small", column: 1, style: { marginBottom: 16 }, children: [_jsx(Descriptions.Item, { label: t('assignments.equipment', 'Equipment'), children: selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}` }), _jsx(Descriptions.Item, { label: t('assignments.shift', 'Shift'), children: selectedAssignment.shift?.toUpperCase() })] })), _jsxs(Form, { form: assignForm, layout: "vertical", onFinish: (v) => selectedAssignment && assignMutation.mutate({ id: selectedAssignment.id, payload: v }), children: [_jsx(Form.Item, { name: "mechanical_inspector_id", label: t('assignments.mechInspector', 'Mechanical Inspector'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('assignments.selectInspector', 'Select inspector'), children: mechInspectors.map((u) => (_jsxs(Select.Option, { value: u.id, children: [u.full_name, " (", u.employee_id, ")"] }, u.id))) }) }), _jsx(Form.Item, { name: "electrical_inspector_id", label: t('assignments.elecInspector', 'Electrical Inspector'), rules: [{ required: true }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('assignments.selectInspector', 'Select inspector'), children: elecInspectors.map((u) => (_jsxs(Select.Option, { value: u.id, children: [u.full_name, " (", u.employee_id, ")"] }, u.id))) }) })] })] })] }));
}
//# sourceMappingURL=InspectionAssignmentsPage.js.map