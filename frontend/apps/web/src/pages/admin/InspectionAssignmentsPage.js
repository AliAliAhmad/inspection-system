import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Select, DatePicker, Tag, message, Typography, Descriptions, } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionAssignmentsApi, rosterApi, } from '@inspection/shared';
import dayjs from 'dayjs';
export default function InspectionAssignmentsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [generateOpen, setGenerateOpen] = useState(false);
    const [assignOpen, setAssignOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [generateForm] = Form.useForm();
    const [assignForm] = Form.useForm();
    // Fetch all lists with their assignments
    const { data, isLoading } = useQuery({
        queryKey: ['inspection-assignments'],
        queryFn: () => inspectionAssignmentsApi.getLists({}),
    });
    // Fetch roster availability for the selected assignment's date + shift
    const assignmentDate = selectedAssignment?.list_target_date;
    const assignmentShift = selectedAssignment?.list_shift;
    const { data: availabilityData } = useQuery({
        queryKey: ['roster', 'day-availability', assignmentDate, assignmentShift],
        queryFn: () => rosterApi.getDayAvailability(assignmentDate, assignmentShift),
        enabled: assignOpen && !!assignmentDate && !!assignmentShift,
    });
    const generateMutation = useMutation({
        mutationFn: (payload) => inspectionAssignmentsApi.generateList(payload),
        onSuccess: (res) => {
            const result = res.data?.data ?? res.data;
            message.success(t('assignments.generateSuccess', 'Inspection list generated — {{count}} assignments created', {
                count: result?.total_assets ?? 0,
            }));
            queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
            setGenerateOpen(false);
            generateForm.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.message || t('assignments.generateError', 'Failed to generate list'));
        },
    });
    const assignMutation = useMutation({
        mutationFn: ({ id, payload }) => inspectionAssignmentsApi.assignTeam(id, payload),
        onSuccess: (res) => {
            const data = res.data;
            const autoCount = data.auto_assigned || 0;
            const msg = autoCount > 0
                ? `Team assigned successfully (also auto-assigned to ${autoCount} other equipment at same berth)`
                : t('assignments.assignSuccess', 'Team assigned successfully');
            message.success(msg);
            queryClient.invalidateQueries({ queryKey: ['inspection-assignments'] });
            setAssignOpen(false);
            setSelectedAssignment(null);
            assignForm.resetFields();
        },
        onError: (err) => {
            message.error(err?.response?.data?.message || t('assignments.assignError', 'Failed to assign team'));
        },
    });
    // Flatten: extract all assignments from all lists
    const rawLists = data?.data?.data || data?.data?.data || [];
    const allAssignments = [];
    for (const list of rawLists) {
        const assignments = list.assignments || [];
        for (const a of assignments) {
            allAssignments.push({
                ...a,
                list_target_date: list.target_date,
                list_shift: list.shift,
                list_status: list.status,
            });
        }
    }
    // Sort by date descending
    allAssignments.sort((a, b) => (b.list_target_date || '').localeCompare(a.list_target_date || ''));
    // Build inspector lists from roster availability (only those on the right shift)
    const availData = availabilityData?.data?.data ?? availabilityData?.data;
    const availableUsers = availData?.available ?? [];
    const onLeaveUsers = availData?.on_leave ?? [];
    // Filter available users: inspectors + specialists who are covering for an inspector
    const mechAvailable = availableUsers.filter((u) => u.specialization === 'mechanical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)));
    const elecAvailable = availableUsers.filter((u) => u.specialization === 'electrical' && (u.role === 'inspector' || (u.role === 'specialist' && u.covering_for)));
    // On-leave inspectors to show as disabled (red)
    const mechOnLeave = onLeaveUsers.filter((u) => u.role === 'inspector' && u.specialization === 'mechanical');
    const elecOnLeave = onLeaveUsers.filter((u) => u.role === 'inspector' && u.specialization === 'electrical');
    // Combine: available first, then on-leave (disabled)
    const mechOptions = [...mechAvailable, ...mechOnLeave];
    const elecOptions = [...elecAvailable, ...elecOnLeave];
    // Set of cover user IDs
    const coverUserIds = new Set();
    for (const u of availableUsers) {
        if (u.covering_for)
            coverUserIds.add(u.id);
    }
    const statusColor = (s) => {
        switch (s) {
            case 'completed': return 'green';
            case 'assigned': return 'blue';
            case 'in_progress': return 'processing';
            case 'unassigned': return 'default';
            default: return 'default';
        }
    };
    const columns = [
        {
            title: t('assignments.targetDate', 'Date'),
            dataIndex: 'list_target_date',
            key: 'date',
            width: 110,
            render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '-',
        },
        {
            title: t('assignments.shift', 'Shift'),
            dataIndex: 'list_shift',
            key: 'shift',
            width: 80,
            render: (v) => v ? _jsx(Tag, { color: v === 'day' ? 'gold' : 'geekblue', children: v.toUpperCase() }) : '-',
        },
        {
            title: t('assignments.equipment', 'Equipment'),
            key: 'equipment_name',
            render: (_, record) => record.equipment?.name || `ID: ${record.equipment_id}`,
        },
        {
            title: t('assignments.equipmentType', 'Type'),
            key: 'equipment_type',
            render: (_, record) => record.equipment?.equipment_type || '-',
        },
        {
            title: t('assignments.serialNumber', 'Serial #'),
            key: 'serial',
            render: (_, record) => record.equipment?.serial_number || '-',
        },
        {
            title: t('assignments.berth', 'Berth'),
            key: 'berth',
            width: 80,
            render: (_, record) => record.berth || record.equipment?.berth || '-',
        },
        {
            title: t('assignments.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (v) => _jsx(Tag, { color: statusColor(v), children: (v || 'unknown').toUpperCase() }),
        },
        {
            title: t('assignments.mechInspector', 'Mech Inspector'),
            key: 'mech',
            render: (_, record) => record.mechanical_inspector
                ? `${record.mechanical_inspector.full_name}`
                : _jsx(Typography.Text, { type: "secondary", children: "\u2014" }),
        },
        {
            title: t('assignments.elecInspector', 'Elec Inspector'),
            key: 'elec',
            render: (_, record) => record.electrical_inspector
                ? `${record.electrical_inspector.full_name}`
                : _jsx(Typography.Text, { type: "secondary", children: "\u2014" }),
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 130,
            render: (_, record) => (_jsx(Button, { type: "primary", size: "small", icon: _jsx(TeamOutlined, {}), onClick: () => {
                    setSelectedAssignment(record);
                    assignForm.resetFields();
                    setAssignOpen(true);
                }, disabled: record.status === 'completed', children: record.mechanical_inspector_id ? 'Reassign' : 'Assign' })),
        },
    ];
    const renderInspectorOption = (u) => {
        const onLeave = onLeaveUsers.some((ol) => ol.id === u.id);
        const isCover = coverUserIds.has(u.id);
        return (_jsx(Select.Option, { value: u.id, disabled: onLeave, children: _jsxs("span", { style: {
                    color: onLeave ? '#ff4d4f' : isCover ? '#52c41a' : undefined,
                    fontWeight: onLeave || isCover ? 600 : undefined,
                }, children: [u.full_name, " (", u.role_id, ")", onLeave && u.leave_cover ? ` — Cover: ${u.leave_cover.full_name}` : '', onLeave && !u.leave_cover ? ' — On Leave' : '', isCover && u.covering_for ? ` — Covering ${u.covering_for.full_name}` : ''] }) }, u.id));
    };
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.assignments', 'Inspection Assignments') }), extra: _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => setGenerateOpen(true), children: t('assignments.generate', 'Generate List') }), children: [_jsx(Table, { rowKey: "id", columns: columns, dataSource: allAssignments, loading: isLoading, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 1200 }, size: "small", bordered: true, locale: { emptyText: t('common.noData', 'No inspection assignments. Click "Generate List" to create one.') } }), _jsx(Modal, { title: t('assignments.generate', 'Generate Inspection List'), open: generateOpen, onCancel: () => { setGenerateOpen(false); generateForm.resetFields(); }, onOk: () => generateForm.submit(), confirmLoading: generateMutation.isPending, destroyOnClose: true, children: _jsxs(Form, { form: generateForm, layout: "vertical", onFinish: (values) => generateMutation.mutate({
                        target_date: values.target_date.format('YYYY-MM-DD'),
                        shift: values.shift,
                    }), children: [_jsx(Form.Item, { name: "target_date", label: t('assignments.targetDate', 'Target Date'), rules: [{ required: true }], children: _jsx(DatePicker, { style: { width: '100%' } }) }), _jsx(Form.Item, { name: "shift", label: t('assignments.shift', 'Shift'), rules: [{ required: true }], children: _jsxs(Select, { children: [_jsx(Select.Option, { value: "day", children: t('common.day', 'Day') }), _jsx(Select.Option, { value: "night", children: t('common.night', 'Night') })] }) })] }) }), _jsxs(Modal, { title: t('assignments.assignTeam', 'Assign Inspection Team'), open: assignOpen, onCancel: () => { setAssignOpen(false); setSelectedAssignment(null); assignForm.resetFields(); }, onOk: () => assignForm.submit(), confirmLoading: assignMutation.isPending, destroyOnClose: true, children: [selectedAssignment && (_jsxs(Descriptions, { size: "small", column: 1, bordered: true, style: { marginBottom: 16 }, children: [_jsx(Descriptions.Item, { label: "Equipment", children: selectedAssignment.equipment?.name || `ID: ${selectedAssignment.equipment_id}` }), _jsx(Descriptions.Item, { label: "Type", children: selectedAssignment.equipment?.equipment_type || '-' }), _jsx(Descriptions.Item, { label: "Serial #", children: selectedAssignment.equipment?.serial_number || '-' }), _jsx(Descriptions.Item, { label: "Berth", children: selectedAssignment.berth || selectedAssignment.equipment?.berth || '-' }), _jsx(Descriptions.Item, { label: "Shift", children: selectedAssignment.list_shift?.toUpperCase() || '-' }), _jsx(Descriptions.Item, { label: "Date", children: selectedAssignment.list_target_date ? dayjs(selectedAssignment.list_target_date).format('DD/MM/YYYY') : '-' })] })), _jsxs(Form, { form: assignForm, layout: "vertical", onFinish: (v) => selectedAssignment && assignMutation.mutate({ id: selectedAssignment.id, payload: v }), children: [_jsx(Form.Item, { name: "mechanical_inspector_id", label: t('assignments.mechInspector', 'Mechanical Inspector'), rules: [{ required: true, message: 'Please select a mechanical inspector' }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('assignments.selectInspector', 'Select mechanical inspector'), children: mechOptions.map(renderInspectorOption) }) }), _jsx(Form.Item, { name: "electrical_inspector_id", label: t('assignments.elecInspector', 'Electrical Inspector'), rules: [{ required: true, message: 'Please select an electrical inspector' }], children: _jsx(Select, { showSearch: true, optionFilterProp: "children", placeholder: t('assignments.selectInspector', 'Select electrical inspector'), children: elecOptions.map(renderInspectorOption) }) })] })] })] }));
}
//# sourceMappingURL=InspectionAssignmentsPage.js.map