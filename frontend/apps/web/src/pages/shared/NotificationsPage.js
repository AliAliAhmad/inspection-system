import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Card, List, Typography, Button, Tag, Space, Badge, Empty, Spin } from 'antd';
import { BellOutlined, CheckOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, getNotificationRoute } from '@inspection/shared';
import { formatDateTime } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
const priorityColors = {
    info: 'blue',
    warning: 'orange',
    urgent: 'red',
    critical: 'magenta',
};
export default function NotificationsPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const { data, isLoading } = useQuery({
        queryKey: ['notifications', page],
        queryFn: () => notificationsApi.list({ page, per_page: 20 }).then(r => r.data),
        refetchInterval: 30000,
    });
    const markReadMutation = useMutation({
        mutationFn: (id) => notificationsApi.markRead(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const markAllReadMutation = useMutation({
        mutationFn: () => notificationsApi.markAllRead(),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => notificationsApi.remove(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const notifications = data?.data ?? [];
    const pagination = data?.pagination;
    const handleNotificationClick = (item) => {
        if (!item.is_read)
            markReadMutation.mutate(item.id);
        const route = user ? getNotificationRoute(item, user.role) : null;
        if (route)
            navigate(route);
    };
    return (_jsx(Card, { title: _jsxs(Space, { children: [_jsx(BellOutlined, {}), _jsx("span", { children: t('nav.notifications') })] }), extra: _jsx(Button, { type: "link", icon: _jsx(CheckOutlined, {}), onClick: () => markAllReadMutation.mutate(), loading: markAllReadMutation.isPending, children: t('notifications.mark_all_read') }), children: isLoading ? (_jsx("div", { style: { textAlign: 'center', padding: 48 }, children: _jsx(Spin, {}) })) : notifications.length === 0 ? (_jsx(Empty, { description: t('notifications.no_notifications') })) : (_jsx(List, { dataSource: notifications, pagination: pagination ? {
                current: pagination.page,
                total: pagination.total,
                pageSize: pagination.per_page,
                onChange: setPage,
            } : false, renderItem: (item) => {
                const route = user ? getNotificationRoute(item, user.role) : null;
                return (_jsx(List.Item, { style: {
                        backgroundColor: item.is_read ? undefined : '#f6ffed',
                        padding: '12px 16px',
                        borderRadius: 6,
                        marginBottom: 4,
                        cursor: route ? 'pointer' : undefined,
                        transition: 'background-color 0.2s',
                    }, onClick: () => handleNotificationClick(item), actions: [
                        !item.is_read && (_jsx(Button, { type: "link", size: "small", onClick: (e) => { e.stopPropagation(); markReadMutation.mutate(item.id); }, children: t('notifications.mark_all_read', 'Mark Read') }, "read")),
                        _jsx(Button, { type: "link", danger: true, size: "small", icon: _jsx(DeleteOutlined, {}), onClick: (e) => { e.stopPropagation(); deleteMutation.mutate(item.id); } }, "delete"),
                        route && (_jsx(RightOutlined, { style: { color: '#1677ff', fontSize: 12 } }, "go")),
                    ].filter(Boolean), children: _jsx(List.Item.Meta, { title: _jsxs(Space, { children: [!item.is_read && _jsx(Badge, { status: "processing" }), _jsx(Typography.Text, { strong: !item.is_read, children: item.title }), _jsx(Tag, { color: priorityColors[item.priority], children: item.priority })] }), description: _jsxs("div", { children: [_jsx(Typography.Text, { children: item.message }), _jsx("br", {}), _jsx(Typography.Text, { type: "secondary", style: { fontSize: 12 }, children: formatDateTime(item.created_at) })] }) }) }));
            } })) }));
}
//# sourceMappingURL=NotificationsPage.js.map