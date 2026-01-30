import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, Table, Tabs, Tag, Space, Typography, Avatar } from 'antd';
import { TrophyOutlined, CrownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leaderboardsApi } from '@inspection/shared';
const fetchers = {
    overall: (p) => leaderboardsApi.getOverall(p).then(r => r.data.data),
    inspectors: (p) => leaderboardsApi.getInspectors(p).then(r => r.data.data),
    specialists: (p) => leaderboardsApi.getSpecialists(p).then(r => r.data.data),
    engineers: (p) => leaderboardsApi.getEngineers(p).then(r => r.data.data),
    quality: (p) => leaderboardsApi.getQualityEngineers(p).then(r => r.data.data),
};
function getRankColor(rank) {
    if (rank === 1)
        return '#ffd700';
    if (rank === 2)
        return '#c0c0c0';
    if (rank === 3)
        return '#cd7f32';
    return undefined;
}
export default function LeaderboardPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('overall');
    const { data, isLoading } = useQuery({
        queryKey: ['leaderboard', activeTab],
        queryFn: () => fetchers[activeTab](),
    });
    const columns = [
        {
            title: '#',
            dataIndex: 'rank',
            width: 60,
            render: (rank) => {
                const color = getRankColor(rank);
                return color ? (_jsxs(Space, { children: [_jsx(CrownOutlined, { style: { color, fontSize: 18 } }), _jsx("strong", { children: rank })] })) : rank;
            },
        },
        {
            title: t('common.name'),
            dataIndex: 'full_name',
            render: (name, record) => (_jsxs(Space, { children: [_jsx(Avatar, { size: "small", style: { backgroundColor: '#1677ff' }, children: name.charAt(0) }), _jsx("span", { children: name }), _jsxs(Typography.Text, { type: "secondary", style: { fontSize: 12 }, children: ["(", record.employee_id, ")"] })] })),
        },
        {
            title: t('common.role'),
            dataIndex: 'role',
            render: (role) => _jsx(Tag, { children: role }),
        },
        {
            title: 'Points',
            dataIndex: 'total_points',
            sorter: (a, b) => a.total_points - b.total_points,
            render: (points) => (_jsx(Typography.Text, { strong: true, style: { color: '#1677ff' }, children: points })),
        },
    ];
    const tabs = [
        { key: 'overall', label: t('common.all') },
        { key: 'inspectors', label: 'Inspectors' },
        { key: 'specialists', label: 'Specialists' },
        { key: 'engineers', label: 'Engineers' },
        { key: 'quality', label: 'Quality Engineers' },
    ];
    return (_jsxs(Card, { title: _jsxs(Space, { children: [_jsx(TrophyOutlined, {}), _jsx("span", { children: t('nav.leaderboard') })] }), children: [_jsx(Tabs, { activeKey: activeTab, onChange: (key) => setActiveTab(key), items: tabs.map(tab => ({ key: tab.key, label: tab.label })) }), _jsx(Table, { columns: columns, dataSource: Array.isArray(data) ? data : [], loading: isLoading, rowKey: "user_id", pagination: { pageSize: 20 } })] }));
}
//# sourceMappingURL=LeaderboardPage.js.map