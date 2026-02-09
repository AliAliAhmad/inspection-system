import { useState, useCallback } from 'react';
import {
  Drawer,
  Tabs,
  Button,
  Space,
  Badge,
  Spin,
  Divider,
  Typography,
  Dropdown,
  message,
} from 'antd';
import {
  BellOutlined,
  SettingOutlined,
  CheckOutlined,
  ReloadOutlined,
  MoreOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi,
  Notification,
  NotificationGroup as NotificationGroupType,
  NotificationFilter,
  getNotificationRoute,
} from '@inspection/shared';
import { useNavigate } from 'react-router-dom';
import NotificationCard from './NotificationCard';
import NotificationGroupComponent from './NotificationGroup';
import NotificationSearch from './NotificationSearch';
import NotificationEmpty from './NotificationEmpty';
import NotificationBadge from './NotificationBadge';

const { Text, Title } = Typography;

export interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenPreferences?: () => void;
  userRole?: string;
}

type TabKey = 'all' | 'unread' | 'critical' | 'mentions';

export function NotificationDrawer({
  open,
  onClose,
  onOpenPreferences,
  userRole = 'user',
}: NotificationDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

  // Build query params based on active tab
  const getQueryParams = useCallback(() => {
    const params: any = { per_page: 50 };

    switch (activeTab) {
      case 'unread':
        params.unread_only = true;
        break;
      case 'critical':
        params.priority = 'critical';
        break;
      case 'mentions':
        // This would need a special endpoint or filter
        break;
    }

    if (searchQuery) {
      params.search = searchQuery;
    }

    return params;
  }, [activeTab, searchQuery]);

  // Fetch notifications
  const {
    data: notificationsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['notifications', 'drawer', activeTab, searchQuery],
    queryFn: () => notificationsApi.list(getQueryParams()).then((r) => r.data),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  // Fetch unread counts
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data),
    enabled: open,
  });

  // Fetch groups (when in grouped mode)
  const { data: groupsData, isLoading: groupsLoading } = useQuery({
    queryKey: ['notifications', 'groups'],
    queryFn: () => notificationsApi.listGroups().then((r) => r.data),
    enabled: open && viewMode === 'grouped',
  });

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      message.success(t('notifications.allMarkedRead', 'All notifications marked as read'));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, until }: { id: number; until: string }) =>
      notificationsApi.snooze(id, { snooze_until: until }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const cancelSnoozeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.cancelSnooze(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const notifications: Notification[] = notificationsData?.data || [];
  const groups: NotificationGroupType[] = groupsData?.data || [];
  const unreadCount = unreadCountData?.data?.count || 0;
  const priorityCounts = unreadCountData?.data?.by_priority || {};

  const handleNotificationView = (notification: Notification) => {
    markReadMutation.mutate(notification.id);
    const route = getNotificationRoute(notification, userRole);
    if (route) {
      onClose();
      navigate(route);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const moreMenuItems = [
    {
      key: 'markAllRead',
      icon: <CheckOutlined />,
      label: t('notifications.markAllRead', 'Mark all as read'),
      onClick: () => markAllReadMutation.mutate(),
      disabled: unreadCount === 0,
    },
    {
      key: 'viewMode',
      icon: <InboxOutlined />,
      label: viewMode === 'list'
        ? t('notifications.groupedView', 'Grouped View')
        : t('notifications.listView', 'List View'),
      onClick: () => setViewMode(viewMode === 'list' ? 'grouped' : 'list'),
    },
    { type: 'divider' as const },
    {
      key: 'preferences',
      icon: <SettingOutlined />,
      label: t('notifications.preferences', 'Preferences'),
      onClick: onOpenPreferences,
    },
  ];

  const tabItems = [
    {
      key: 'all',
      label: (
        <Space>
          <InboxOutlined />
          {t('notifications.tabAll', 'All')}
        </Space>
      ),
    },
    {
      key: 'unread',
      label: (
        <Badge count={unreadCount} size="small" offset={[8, 0]}>
          <Space>
            <BellOutlined />
            {t('notifications.tabUnread', 'Unread')}
          </Space>
        </Badge>
      ),
    },
    {
      key: 'critical',
      label: (
        <Badge count={priorityCounts.critical || 0} size="small" offset={[8, 0]}>
          <Space>
            <ExclamationCircleOutlined />
            {t('notifications.tabCritical', 'Critical')}
          </Space>
        </Badge>
      ),
    },
    {
      key: 'mentions',
      label: (
        <Space>
          <MessageOutlined />
          {t('notifications.tabMentions', 'Mentions')}
        </Space>
      ),
    },
  ];

  const renderContent = () => {
    if (isLoading || (viewMode === 'grouped' && groupsLoading)) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      );
    }

    if (viewMode === 'grouped' && groups.length > 0) {
      return (
        <div>
          {groups.map((group) => (
            <NotificationGroupComponent
              key={group.id}
              group={group}
              onMarkGroupRead={() => {
                // Mark all in group as read
                group.notifications.forEach((n) => {
                  if (!n.is_read) markReadMutation.mutate(n.id);
                });
              }}
              onNotificationView={handleNotificationView}
              onNotificationMarkRead={(n) => markReadMutation.mutate(n.id)}
              onNotificationSnooze={(n, until) => snoozeMutation.mutate({ id: n.id, until })}
            />
          ))}
        </div>
      );
    }

    if (notifications.length === 0) {
      return (
        <NotificationEmpty
          type={activeTab === 'unread' ? 'all_read' : searchQuery ? 'no_results' : 'no_notifications'}
          onOpenPreferences={onOpenPreferences}
          onClearFilters={searchQuery ? () => setSearchQuery('') : undefined}
        />
      );
    }

    return (
      <div>
        {notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onView={() => handleNotificationView(notification)}
            onMarkRead={() => markReadMutation.mutate(notification.id)}
            onAcknowledge={() => acknowledgeMutation.mutate(notification.id)}
            onSnooze={(until) => snoozeMutation.mutate({ id: notification.id, until })}
            onCancelSnooze={() => cancelSnoozeMutation.mutate(notification.id)}
            loading={{
              markRead: markReadMutation.isPending,
              acknowledge: acknowledgeMutation.isPending,
              snooze: snoozeMutation.isPending,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <Drawer
      title={
        <Space>
          <NotificationBadge
            count={unreadCount}
            priorityCounts={priorityCounts as any}
            hasCritical={(priorityCounts.critical || 0) > 0}
          >
            <BellOutlined style={{ fontSize: 20 }} />
          </NotificationBadge>
          <Title level={5} style={{ margin: 0 }}>
            {t('notifications.title', 'Notifications')}
          </Title>
        </Space>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            loading={isLoading}
          />
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      }
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <NotificationSearch
          onSearch={handleSearch}
          onSelect={handleNotificationView}
          placeholder={t('notifications.searchPlaceholder', 'Search notifications...')}
          allowVoice={false}
          showSuggestions={false}
        />
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        items={tabItems}
        style={{ padding: '0 16px' }}
        size="small"
      />

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px 16px',
        }}
      >
        {renderContent()}
      </div>

      {/* Footer with quick actions */}
      {unreadCount > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text type="secondary">
            {t('notifications.unreadCountFooter', '{{count}} unread', { count: unreadCount })}
          </Text>
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => markAllReadMutation.mutate()}
            loading={markAllReadMutation.isPending}
          >
            {t('notifications.markAllRead', 'Mark all as read')}
          </Button>
        </div>
      )}
    </Drawer>
  );
}

export default NotificationDrawer;
