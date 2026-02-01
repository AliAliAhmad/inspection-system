import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Button, Modal, Upload, Tag, Row, Col, Alert, message, Typography, } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { inspectionRoutinesApi, } from '@inspection/shared';
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const shiftTag = (value) => {
    if (!value)
        return _jsx(Tag, { children: "-" });
    switch (value) {
        case 'day':
            return _jsx(Tag, { color: "blue", children: "D" });
        case 'night':
            return _jsx(Tag, { color: "purple", children: "N" });
        case 'both':
            return _jsx(Tag, { color: "orange", children: "D+N" });
        default:
            return _jsx(Tag, { children: value });
    }
};
export default function SchedulesPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [uploadResult, setUploadResult] = useState(null);
    // Equipment schedule grid
    const { data: schedules, isLoading: schedulesLoading } = useQuery({
        queryKey: ['inspection-schedules'],
        queryFn: () => inspectionRoutinesApi
            .getSchedules()
            .then((r) => r.data.data),
    });
    // Today & tomorrow inspections
    const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
        queryKey: ['inspection-schedules', 'upcoming'],
        queryFn: () => inspectionRoutinesApi.getUpcoming().then((r) => r.data.data),
    });
    const uploadMutation = useMutation({
        mutationFn: (file) => inspectionRoutinesApi.uploadSchedule(file),
        onSuccess: (res) => {
            const result = res.data;
            setUploadResult({
                created: result.created ?? 0,
                equipment_processed: result.equipment_processed ?? 0,
                errors: result.errors ?? [],
            });
            queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
            message.success(t('schedules.uploadSuccess', '{{count}} schedule entries created', {
                count: result.created ?? 0,
            }));
        },
        onError: () => message.error(t('schedules.uploadError', 'Failed to upload schedule')),
    });
    const scheduleColumns = [
        {
            title: t('equipment.name', 'Equipment'),
            dataIndex: 'equipment_name',
            key: 'equipment_name',
            fixed: 'left',
            width: 180,
            sorter: (a, b) => a.equipment_name.localeCompare(b.equipment_name),
        },
        {
            title: t('equipment.type', 'Type'),
            dataIndex: 'equipment_type',
            key: 'equipment_type',
            width: 130,
            render: (v) => (v ? _jsx(Tag, { children: v }) : '-'),
            filters: [
                ...new Set((schedules || []).map((s) => s.equipment_type).filter(Boolean)),
            ].map((tp) => ({ text: tp, value: tp })),
            onFilter: (value, record) => record.equipment_type === value,
        },
        {
            title: t('equipment.berth', 'Berth'),
            dataIndex: 'berth',
            key: 'berth',
            width: 100,
            render: (v) => v || '-',
            filters: [
                ...new Set((schedules || []).map((s) => s.berth).filter(Boolean)),
            ].map((b) => ({ text: b, value: b })),
            onFilter: (value, record) => record.berth === value,
        },
        ...DAY_NAMES.map((day, idx) => ({
            title: day,
            key: `day_${idx}`,
            width: 70,
            align: 'center',
            render: (_, record) => shiftTag(record.days[String(idx)]),
        })),
    ];
    const todayEntries = upcomingData?.today ?? [];
    const tomorrowEntries = upcomingData?.tomorrow ?? [];
    const todayDate = upcomingData?.today_date ?? '';
    const tomorrowDate = upcomingData?.tomorrow_date ?? '';
    const groupByBerth = (entries) => {
        const map = {};
        for (const e of entries) {
            const key = e.berth || 'Unknown';
            if (!map[key])
                map[key] = { day: [], night: [] };
            if (e.shift === 'day')
                map[key].day.push(e);
            else
                map[key].night.push(e);
        }
        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([berth, shifts]) => ({ berth, ...shifts }));
    };
    const berthColumns = [
        {
            title: t('schedules.berth', 'Berth'),
            dataIndex: 'berth',
            key: 'berth',
            width: 90,
            render: (v) => _jsx(Tag, { color: "geekblue", children: v }),
        },
        {
            title: _jsxs(_Fragment, { children: [_jsx(Tag, { color: "gold", children: "D" }), " ", t('schedules.dayShift', 'Day')] }),
            key: 'day',
            render: (_, record) => record.day.length === 0 ? (_jsx(Typography.Text, { type: "secondary", children: "\u2014" })) : (record.day.map((e) => (_jsx(Tag, { style: { marginBottom: 4 }, children: e.equipment_name }, e.equipment_id)))),
        },
        {
            title: _jsxs(_Fragment, { children: [_jsx(Tag, { color: "purple", children: "N" }), " ", t('schedules.nightShift', 'Night')] }),
            key: 'night',
            render: (_, record) => record.night.length === 0 ? (_jsx(Typography.Text, { type: "secondary", children: "\u2014" })) : (record.night.map((e) => (_jsx(Tag, { style: { marginBottom: 4 }, children: e.equipment_name }, e.equipment_id)))),
        },
    ];
    const todayBerths = groupByBerth(todayEntries);
    const tomorrowBerths = groupByBerth(tomorrowEntries);
    return (_jsxs("div", { children: [_jsxs(Row, { gutter: 16, style: { marginBottom: 16 }, children: [_jsx(Col, { xs: 24, md: 12, children: _jsx(Card, { title: _jsxs(Typography.Text, { strong: true, children: [t('schedules.todayInspections', "Today's Inspections"), todayDate && ` — ${todayDate}`] }), size: "small", loading: upcomingLoading, children: todayBerths.length === 0 ? (_jsx(Typography.Text, { type: "secondary", children: t('schedules.noInspectionsToday', 'No inspections scheduled for today') })) : (_jsx(Table, { rowKey: "berth", columns: berthColumns, dataSource: todayBerths, pagination: false, size: "small", bordered: true })) }) }), _jsx(Col, { xs: 24, md: 12, children: _jsx(Card, { title: _jsxs(Typography.Text, { strong: true, children: [t('schedules.tomorrowInspections', "Tomorrow's Inspections"), tomorrowDate && ` — ${tomorrowDate}`] }), size: "small", loading: upcomingLoading, children: tomorrowBerths.length === 0 ? (_jsx(Typography.Text, { type: "secondary", children: t('schedules.noInspectionsTomorrow', 'No inspections scheduled for tomorrow') })) : (_jsx(Table, { rowKey: "berth", columns: berthColumns, dataSource: tomorrowBerths, pagination: false, size: "small", bordered: true })) }) })] }), _jsx(Card, { title: _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.inspectionSchedule', 'Inspection Schedule') }), extra: _jsx(Upload, { accept: ".xlsx,.xls", showUploadList: false, beforeUpload: (file) => {
                        uploadMutation.mutate(file);
                        return false;
                    }, children: _jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: uploadMutation.isPending, type: "primary", children: t('schedules.importSchedule', 'Import Schedule') }) }), children: _jsx(Table, { rowKey: "equipment_id", columns: scheduleColumns, dataSource: schedules || [], loading: schedulesLoading, locale: {
                        emptyText: t('schedules.noSchedule', 'No schedule imported yet. Click "Import Schedule" to upload an Excel file.'),
                    }, pagination: { pageSize: 20, showSizeChanger: true }, scroll: { x: 900 }, size: "small" }) }), _jsx(Modal, { title: t('schedules.uploadResult', 'Schedule Upload Result'), open: uploadResult !== null, onCancel: () => setUploadResult(null), onOk: () => setUploadResult(null), cancelButtonProps: { style: { display: 'none' } }, children: uploadResult && (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsx("strong", { children: uploadResult.created }), ' ', t('schedules.entriesCreated', 'schedule entries created'), " ", t('schedules.forEquipment', 'for'), ' ', _jsx("strong", { children: uploadResult.equipment_processed }), ' ', t('schedules.equipment', 'equipment'), "."] }), uploadResult.errors.length > 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: t('schedules.uploadWarnings', '{{count}} warnings', {
                                count: uploadResult.errors.length,
                            }), description: _jsx("ul", { style: {
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    paddingLeft: 16,
                                    margin: 0,
                                }, children: uploadResult.errors.map((err, i) => (_jsx("li", { children: err }, i))) }) }))] })) })] }));
}
//# sourceMappingURL=SchedulesPage.js.map