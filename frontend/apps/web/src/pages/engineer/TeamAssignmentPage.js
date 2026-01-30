import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Select, DatePicker, Alert, message, Collapse, } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { inspectionAssignmentsApi, usersApi, formatDate, } from '@inspection/shared';
export default function TeamAssignmentPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [targetDate, setTargetDate] = useState(dayjs());
    const [shift, setShift] = useState('day');
    // Track team selections per assignment: { assignmentId: { mech: userId, elec: userId } }
    const [teamSelections, setTeamSelections] = useState({});
    const { data: listsData, isLoading: listsLoading, error: listsError } = useQuery({
        queryKey: ['inspection-lists'],
        queryFn: () => inspectionAssignmentsApi.getLists({ per_page: 50 }).then((r) => r.data),
    });
    const lists = listsData?.data ?? [];
    const { data: usersData } = useQuery({
        queryKey: ['users-inspectors'],
        queryFn: () => usersApi.list({ role: 'inspector', per_page: 200 }).then((r) => r.data),
    });
    const inspectors = usersData?.data ?? [];
    const mechanicalInspectors = inspectors.filter((u) => u.specialization === 'mechanical' && u.is_active);
    const electricalInspectors = inspectors.filter((u) => u.specialization === 'electrical' && u.is_active);
    const generateMutation = useMutation({
        mutationFn: () => inspectionAssignmentsApi.generateList({
            target_date: targetDate?.format('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'),
            shift,
        }),
        onSuccess: () => {
            message.success(t('common.success', 'Inspection list generated'));
            queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const assignMutation = useMutation({
        mutationFn: ({ assignmentId, payload, }) => inspectionAssignmentsApi.assignTeam(assignmentId, payload),
        onSuccess: () => {
            message.success(t('common.success', 'Team assigned'));
            queryClient.invalidateQueries({ queryKey: ['inspection-lists'] });
        },
        onError: (err) => {
            message.error(err?.response?.data?.error || t('common.error', 'An error occurred'));
        },
    });
    const handleAssign = (assignmentId) => {
        const sel = teamSelections[assignmentId];
        if (!sel?.mechanical_inspector_id || !sel?.electrical_inspector_id) {
            message.warning(t('common.select_both', 'Please select both inspectors'));
            return;
        }
        assignMutation.mutate({
            assignmentId,
            payload: {
                mechanical_inspector_id: sel.mechanical_inspector_id,
                electrical_inspector_id: sel.electrical_inspector_id,
            },
        });
    };
    const updateSelection = (assignmentId, field, value) => {
        setTeamSelections((prev) => ({
            ...prev,
            [assignmentId]: { ...prev[assignmentId], [field]: value },
        }));
    };
    const assignmentColumns = [
        {
            title: t('equipment.name', 'Equipment'),
            key: 'equipment',
            render: (_, record) => record.equipment?.name ?? `Equipment #${record.equipment_id}`,
        },
        {
            title: t('equipment.type', 'Type'),
            key: 'equipment_type',
            render: (_, record) => record.equipment?.equipment_type ?? '-',
        },
        {
            title: t('equipment.berth', 'Berth'),
            dataIndex: 'berth',
            key: 'berth',
            render: (berth) => berth || '-',
        },
        {
            title: t('common.status', 'Status'),
            dataIndex: 'status',
            key: 'status',
            render: (status) => (_jsx(Tag, { color: status === 'assigned' ? 'blue' : status === 'completed' ? 'green' : 'default', children: t(`status.${status}`, status) })),
        },
        {
            title: t('common.mechanical_inspector', 'Mechanical Inspector'),
            key: 'mechanical',
            width: 220,
            render: (_, record) => {
                if (record.mechanical_inspector_id) {
                    const inspector = inspectors.find((u) => u.id === record.mechanical_inspector_id);
                    return inspector?.full_name ?? `#${record.mechanical_inspector_id}`;
                }
                return (_jsx(Select, { placeholder: t('common.select', 'Select...'), style: { width: '100%' }, showSearch: true, optionFilterProp: "label", value: teamSelections[record.id]?.mechanical_inspector_id, onChange: (val) => updateSelection(record.id, 'mechanical_inspector_id', val), options: mechanicalInspectors.map((u) => ({
                        value: u.id,
                        label: u.full_name,
                    })) }));
            },
        },
        {
            title: t('common.electrical_inspector', 'Electrical Inspector'),
            key: 'electrical',
            width: 220,
            render: (_, record) => {
                if (record.electrical_inspector_id) {
                    const inspector = inspectors.find((u) => u.id === record.electrical_inspector_id);
                    return inspector?.full_name ?? `#${record.electrical_inspector_id}`;
                }
                return (_jsx(Select, { placeholder: t('common.select', 'Select...'), style: { width: '100%' }, showSearch: true, optionFilterProp: "label", value: teamSelections[record.id]?.electrical_inspector_id, onChange: (val) => updateSelection(record.id, 'electrical_inspector_id', val), options: electricalInspectors.map((u) => ({
                        value: u.id,
                        label: u.full_name,
                    })) }));
            },
        },
        {
            title: t('common.actions', 'Actions'),
            key: 'actions',
            width: 120,
            render: (_, record) => {
                if (record.mechanical_inspector_id && record.electrical_inspector_id) {
                    return _jsx(Tag, { color: "green", children: t('status.assigned', 'Assigned') });
                }
                return (_jsx(Button, { type: "primary", size: "small", icon: _jsx(TeamOutlined, {}), onClick: () => handleAssign(record.id), loading: assignMutation.isPending, children: t('common.assign', 'Assign') }));
            },
        },
    ];
    if (listsError) {
        return _jsx(Alert, { type: "error", message: t('common.error', 'An error occurred'), showIcon: true });
    }
    return (_jsxs("div", { children: [_jsx(Typography.Title, { level: 4, children: t('nav.team_assignment', 'Team Assignment') }), _jsx(Card, { style: { marginBottom: 16 }, children: _jsxs(Space, { wrap: true, children: [_jsx(DatePicker, { value: targetDate, onChange: (val) => setTargetDate(val), format: "YYYY-MM-DD" }), _jsx(Select, { value: shift, onChange: (val) => setShift(val), style: { width: 120 }, options: [
                                { value: 'day', label: t('common.day', 'Day') },
                                { value: 'night', label: t('common.night', 'Night') },
                            ] }), _jsx(Button, { type: "primary", icon: _jsx(PlusOutlined, {}), onClick: () => generateMutation.mutate(), loading: generateMutation.isPending, children: t('common.generate_list', 'Generate List') })] }) }), _jsx(Card, { loading: listsLoading, children: lists.length === 0 ? (_jsx(Typography.Text, { type: "secondary", children: t('common.noData', 'No inspection lists found') })) : (_jsx(Collapse, { defaultActiveKey: lists.length > 0 ? [lists[0].id] : [], items: lists.map((list) => ({
                        key: list.id,
                        label: (_jsxs(Space, { children: [_jsxs("span", { children: [formatDate(list.target_date), " -", ' ', _jsx(Tag, { color: list.shift === 'day' ? 'orange' : 'geekblue', children: list.shift === 'day' ? t('common.day', 'Day') : t('common.night', 'Night') })] }), _jsx(Tag, { children: t(`status.${list.status}`, list.status) }), _jsxs(Typography.Text, { type: "secondary", children: [list.assignments.length, " ", t('common.assignments', 'assignments')] })] })),
                        children: (_jsx(Table, { rowKey: "id", columns: assignmentColumns, dataSource: list.assignments, pagination: false, size: "small" })),
                    })) })) })] }));
}
//# sourceMappingURL=TeamAssignmentPage.js.map