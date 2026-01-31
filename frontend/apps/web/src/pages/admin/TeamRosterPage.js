import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tag, Button, Space, Upload, Modal, Drawer, Radio, Collapse, message, Typography, Alert, Badge, } from 'antd';
import { UploadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rosterApi } from '@inspection/shared';
import dayjs from 'dayjs';
const { Text } = Typography;
const ROLE_ORDER = {
    inspector: 0,
    specialist: 1,
    engineer: 2,
    quality_engineer: 3,
};
const ROLE_COLORS = {
    inspector: 'blue',
    specialist: 'orange',
    engineer: 'green',
    quality_engineer: 'purple',
    admin: 'red',
};
function shiftTag(value) {
    if (!value)
        return _jsx(Text, { type: "secondary", children: "-" });
    switch (value) {
        case 'day':
            return _jsx(Tag, { color: "blue", children: "D" });
        case 'night':
            return _jsx(Tag, { color: "purple", children: "N" });
        case 'off':
            return _jsx(Tag, { color: "default", children: "Off" });
        case 'leave':
            return _jsx(Tag, { color: "red", children: "Leave" });
        default:
            return _jsx(Text, { type: "secondary", children: "-" });
    }
}
export default function TeamRosterPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [weekOffset, setWeekOffset] = useState(0);
    const [drawerDate, setDrawerDate] = useState(null);
    const [drawerShift, setDrawerShift] = useState('all');
    const [uploadResult, setUploadResult] = useState(null);
    const baseDate = dayjs().add(weekOffset * 7, 'day').format('YYYY-MM-DD');
    // Fetch week data
    const { data: weekData, isLoading } = useQuery({
        queryKey: ['roster', 'week', baseDate],
        queryFn: () => rosterApi.getWeek(baseDate).then((r) => r.data.data),
    });
    // Fetch day availability when drawer is open
    const { data: dayAvailability, isLoading: dayLoading } = useQuery({
        queryKey: ['roster', 'day-availability', drawerDate, drawerShift],
        queryFn: () => rosterApi
            .getDayAvailability(drawerDate, drawerShift !== 'all' ? drawerShift : undefined)
            .then((r) => r.data.data),
        enabled: !!drawerDate,
    });
    // Upload mutation
    const uploadMutation = useMutation({
        mutationFn: (file) => rosterApi.upload(file),
        onSuccess: (res) => {
            const result = res.data.data ?? res.data;
            setUploadResult({
                imported: result.imported ?? 0,
                users_processed: result.users_processed ?? 0,
                errors: result.errors ?? [],
            });
            queryClient.invalidateQueries({ queryKey: ['roster'] });
            message.success(t('roster.uploadSuccess', '{{count}} entries imported', { count: result.imported ?? 0 }));
        },
        onError: (err) => {
            const msg = err?.response?.data?.message || err?.message || 'Failed to upload roster';
            message.error(msg);
        },
    });
    // Sort users by role order
    const sortedUsers = [...(weekData?.users ?? [])].sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
    const dates = weekData?.dates ?? [];
    // Calculate date range for display
    const rangeStart = dates.length > 0 ? dayjs(dates[0]) : dayjs().add(weekOffset * 7, 'day');
    const rangeEnd = dates.length > 0 ? dayjs(dates[dates.length - 1]) : rangeStart.add(7, 'day');
    // Build table columns
    const columns = [
        {
            title: t('roster.teamMember', 'Team Member'),
            key: 'user',
            fixed: 'left',
            width: 220,
            render: (_, record) => (_jsxs(Space, { direction: "vertical", size: 2, children: [_jsx(Text, { strong: true, children: record.full_name }), _jsxs(Space, { size: 4, children: [_jsx(Tag, { color: ROLE_COLORS[record.role] ?? 'default', children: record.role }), record.specialization && _jsx(Tag, { children: record.specialization })] })] })),
        },
        ...dates.map((date) => ({
            title: (_jsx(Button, { type: "link", size: "small", onClick: () => {
                    setDrawerDate(date);
                    setDrawerShift('all');
                }, style: { padding: 0, height: 'auto', lineHeight: 1.2 }, children: _jsxs("div", { style: { textAlign: 'center' }, children: [_jsx("div", { children: dayjs(date).format('ddd') }), _jsx("div", { children: dayjs(date).format('DD/MM') })] }) })),
            key: date,
            width: 80,
            align: 'center',
            render: (_, record) => shiftTag(record.entries[date]),
        })),
    ];
    return (_jsxs(Card, { title: _jsx(Typography.Title, { level: 4, style: { margin: 0 }, children: t('nav.roster', 'Team Roster') }), extra: _jsx(Space, { children: _jsx(Upload, { accept: ".xlsx,.xls", showUploadList: false, beforeUpload: (file) => {
                    uploadMutation.mutate(file);
                    return false;
                }, children: _jsx(Button, { icon: _jsx(UploadOutlined, {}), loading: uploadMutation.isPending, children: t('roster.importRoster', 'Import Roster') }) }) }), children: [_jsxs(Space, { style: { marginBottom: 16, display: 'flex', justifyContent: 'center' }, children: [_jsx(Button, { icon: _jsx(LeftOutlined, {}), onClick: () => setWeekOffset((o) => o - 1), children: t('roster.prevWeek', 'Prev Week') }), _jsx(Button, { type: "text", onClick: () => setWeekOffset(0), children: _jsxs(Text, { strong: true, children: [rangeStart.format('DD MMM'), " - ", rangeEnd.format('DD MMM YYYY')] }) }), _jsxs(Button, { onClick: () => setWeekOffset((o) => o + 1), children: [t('roster.nextWeek', 'Next Week'), " ", _jsx(RightOutlined, {})] })] }), _jsx(Table, { rowKey: "id", columns: columns, dataSource: sortedUsers, loading: isLoading, pagination: false, scroll: { x: 900 }, size: "small", bordered: true, locale: { emptyText: t('common.noData', 'No data available') } }), _jsx(Drawer, { title: `${t('roster.teamAvailability', 'Team Availability')} - ${drawerDate ? dayjs(drawerDate).format('dddd, DD MMM YYYY') : ''}`, open: !!drawerDate, onClose: () => setDrawerDate(null), width: 480, footer: null, children: _jsxs(Space, { direction: "vertical", style: { width: '100%' }, size: "middle", children: [_jsxs(Radio.Group, { value: drawerShift, onChange: (e) => setDrawerShift(e.target.value), optionType: "button", buttonStyle: "solid", children: [_jsx(Radio.Button, { value: "all", children: t('common.all', 'All') }), _jsx(Radio.Button, { value: "day", children: t('roster.dayShift', 'Day') }), _jsx(Radio.Button, { value: "night", children: t('roster.nightShift', 'Night') })] }), dayLoading ? (_jsx(Text, { type: "secondary", children: t('common.loading', 'Loading...') })) : (_jsx(Collapse, { defaultActiveKey: ['available', 'on_leave', 'off'], items: [
                                {
                                    key: 'available',
                                    label: (_jsxs(Space, { children: [_jsx(Badge, { status: "success" }), t('roster.available', 'Available'), _jsx(Tag, { children: dayAvailability?.available?.length ?? 0 })] })),
                                    children: (_jsx(_Fragment, { children: (dayAvailability?.available ?? []).length === 0 ? (_jsx(Text, { type: "secondary", children: t('common.noData', 'No data') })) : ((dayAvailability?.available ?? []).map((u) => (_jsxs("div", { style: {
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '6px 0',
                                                borderBottom: '1px solid #f0f0f0',
                                            }, children: [_jsxs(Space, { direction: "vertical", size: 0, children: [_jsx(Text, { strong: true, children: u.full_name }), _jsxs(Space, { size: 4, children: [_jsx(Tag, { color: ROLE_COLORS[u.role] ?? 'default', children: u.role }), u.specialization && _jsx(Tag, { children: u.specialization })] })] }), u.shift === 'day' ? (_jsx(Tag, { color: "blue", children: "Day" })) : (_jsx(Tag, { color: "purple", children: "Night" }))] }, u.id)))) })),
                                },
                                {
                                    key: 'on_leave',
                                    label: (_jsxs(Space, { children: [_jsx(Badge, { status: "error" }), t('roster.onLeave', 'On Leave'), _jsx(Tag, { children: dayAvailability?.on_leave?.length ?? 0 })] })),
                                    children: (_jsx(_Fragment, { children: (dayAvailability?.on_leave ?? []).length === 0 ? (_jsx(Text, { type: "secondary", children: t('common.noData', 'No data') })) : ((dayAvailability?.on_leave ?? []).map((u) => (_jsx("div", { style: {
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '6px 0',
                                                borderBottom: '1px solid #f0f0f0',
                                            }, children: _jsxs(Space, { direction: "vertical", size: 0, children: [_jsx(Text, { strong: true, children: u.full_name }), _jsxs(Space, { size: 4, children: [_jsx(Tag, { color: ROLE_COLORS[u.role] ?? 'default', children: u.role }), u.specialization && _jsx(Tag, { children: u.specialization })] })] }) }, u.id)))) })),
                                },
                                {
                                    key: 'off',
                                    label: (_jsxs(Space, { children: [_jsx(Badge, { status: "default" }), t('roster.offDuty', 'Off'), _jsx(Tag, { children: dayAvailability?.off?.length ?? 0 })] })),
                                    children: (_jsx(_Fragment, { children: (dayAvailability?.off ?? []).length === 0 ? (_jsx(Text, { type: "secondary", children: t('common.noData', 'No data') })) : ((dayAvailability?.off ?? []).map((u) => (_jsx("div", { style: {
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '6px 0',
                                                borderBottom: '1px solid #f0f0f0',
                                            }, children: _jsxs(Space, { direction: "vertical", size: 0, children: [_jsx(Text, { strong: true, children: u.full_name }), _jsxs(Space, { size: 4, children: [_jsx(Tag, { color: ROLE_COLORS[u.role] ?? 'default', children: u.role }), u.specialization && _jsx(Tag, { children: u.specialization })] })] }) }, u.id)))) })),
                                },
                            ] }))] }) }), _jsx(Modal, { title: t('roster.uploadResult', 'Roster Upload Result'), open: uploadResult !== null, onCancel: () => setUploadResult(null), onOk: () => setUploadResult(null), cancelButtonProps: { style: { display: 'none' } }, children: uploadResult && (_jsxs(_Fragment, { children: [_jsxs("p", { children: [_jsx("strong", { children: uploadResult.imported }), ' ', t('roster.entriesImported', 'entries imported'), " ", t('roster.forUsers', 'for'), ' ', _jsx("strong", { children: uploadResult.users_processed }), " ", t('roster.users', 'users'), "."] }), uploadResult.errors.length > 0 && (_jsx(Alert, { type: "warning", showIcon: true, message: t('roster.uploadWarnings', '{{count}} warnings', {
                                count: uploadResult.errors.length,
                            }), description: _jsx("ul", { style: {
                                    maxHeight: 200,
                                    overflow: 'auto',
                                    paddingLeft: 16,
                                    margin: 0,
                                }, children: uploadResult.errors.map((err, i) => (_jsx("li", { children: err }, i))) }) }))] })) })] }));
}
//# sourceMappingURL=TeamRosterPage.js.map