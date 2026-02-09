import { useState, useCallback } from 'react';
import {
  Card,
  Tabs,
  List,
  Typography,
  Button,
  Space,
  Badge,
  Empty,
  Spin,
  Divider,
  message,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  ReloadOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
  MessageOutlined,
  SettingOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  notificationsApi,
  Notification,
  NotificationPriority,
  NotificationFilter,
  getNotificationRoute,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import NotificationCard from '../../components/notifications/NotificationCard';
import NotificationFilters from '../../components/notifications/NotificationFilters';
import NotificationAISummary from '../../components/notifications/NotificationAISummary';
import NotificationPreferencesModal from '../../components/notifications/NotificationPreferencesModal';
import NotificationSearch from '../../components/notifications/NotificationSearch';

const { Title, Text } = Typography;

type TabKey = 'all' | 'unread' | 'critical' | 'mentions';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [filters, setFilters] = useState<NotificationFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Build query params based on active tab and filters
  const getQueryParams = useCallback(() => {
    const params: any = { page, per_page: 20 };

    switch (activeTab) {
      case 'unread':
        params.unread_only = true;
        break;
      case 'critical':
        params.priority = 'critical';
        break;
      case 'mentions':
        // Would need a special filter for mentions
        break;
    }

    if (searchQuery) {
      params.search = searchQuery;
    }

    if (filters.types?.length) {
      params.type = filters.types[0];
    }
    if (filters.priorities?.length) {
      params.priority = filters.priorities[0];
    }
    if (filters.date_from) {
      params.date_from = filters.date_from;
    }
    if (filters.date_to) {
      params.date_to = filters.date_to;
    }

    return params;
  }, [page, activeTab, filters, searchQuery]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['notifications', 'page', page, activeTab, filters, searchQuery],
    queryFn: () => notificationsApi.list(getQueryParams()).then((r) => r.data),
    refetchInterval: 30000,
  });

  // Fetch unread counts for tabs
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.getUnreadCount().then((r) => r.data),
    staleTime: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, until }: { id: number; until: string }) =>
      notificationsApi.snooze(id, { snooze_until: until }),
    onSuccess: () => {
      message.success(t('notifications.snoozed', 'Notification snoozed'));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const cancelSnoozeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.cancelSnooze(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications: Notification[] = data?.data ?? [];
  const pagination = data?.pagination;
  const unreadCount = unreadCountData?.data?.count || 0;
  const priorityCounts = unreadCountData?.data?.by_priority || {};

  const handleNotificationView = (item: Notification) => {
    if (!item.is_read) markReadMutation.mutate(item.id);
    const route = user ? getNotificationRoute(item, user.role) : null;
    if (route) navigate(route);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.priorities && filters.priorities.length > 0) ||
    filters.date_from ||
    filters.date_to ||
    searchQuery;

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

  return (
    <div style={{ padding: '0 8px' }}>
      {/* AI Summary Section */}
      <NotificationAISummary
        onActionClick={(actionId, actionType) => {
          // Navigate to the action
          console.log('Action clicked:', actionId, actionType);
        }}
        showPredictions
        showTips
        compact={false}
      />

      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('notifications.totalUnread', 'Unread')}
              value={unreadCount}
              prefix={<BellOutlined />}
              valueStyle={{ color: unreadCount > 0 ? '#1677ff' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('notifications.critical', 'Critical')}
              value={priorityCounts.critical || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: (priorityCounts.critical || 0) > 0 ? '#eb2f96' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('notifications.urgent', 'Urgent')}
              value={priorityCounts.urgent || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: (priorityCounts.urgent || 0) > 0 ? '#f5222d' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title={t('notifications.warnings', 'Warnings')}
              value={priorityCounts.warning || 0}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: (priorityCounts.warning || 0) > 0 ? '#fa8c16' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Card */}
      <Card
        title={
          <Space>
            <BellOutlined style={{ fontSize: 20 }} />
            <Title level={4} style={{ margin: 0 }}>
              {t('nav.notifications', 'Notifications')}
            </Title>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="text"
              icon={<FilterOutlined />}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters
                ? t('notifications.hideFilters', 'Hide Filters')
                : t('notifications.showFilters', 'Filters')}
              {hasActiveFilters && <Badge dot style={{ marginLeft: 4 }} />}
            </Button>
            <Button
              type="text"
              icon={<ReloadOutlined spin={isFetching} />}
              onClick={() => refetch()}
            />
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => markAllReadMutation.mutate()}
              loading={markAllReadMutation.isPending}
              disabled={unreadCount === 0}
            >
              {t('notifications.markAllRead', 'Mark All Read')}
            </Button>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setPreferencesOpen(true)}
            />
          </Space>
        }
      >
        {/* Search Bar */}
        <div style={{ marginBottom: 16 }}>
          <NotificationSearch
            onSearch={handleSearch}
            onSelect={handleNotificationView}
            placeholder={t('notifications.searchPlaceholder', 'Search notifications...')}
            allowVoice={false}
            showSuggestions={false}
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <NotificationFilters
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPage(1);
            }}
            onClear={handleClearFilters}
            collapsible={false}
          />
        )}

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as TabKey);
            setPage(1);
          }}
          items={tabItems}
          style={{ marginBottom: 8 }}
        />

        <Divider style={{ margin: '8px 0 16px' }} />

        {/* Notification List */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : notifications.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              hasActiveFilters
                ? t('notifications.noMatchingNotifications', 'No notifications match your filters')
                : activeTab === 'unread'
                  ? t('notifications.allCaughtUp', "You're all caught up!")
                  : t('notifications.no_notifications', 'No notifications')
            }
          >
            {hasActiveFilters && (
              <Button type="primary" onClick={handleClearFilters}>
                {t('notifications.clearFilters', 'Clear Filters')}
              </Button>
            )}
          </Empty>
        ) : (
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
                showActions
              />
            ))}

            {/* Pagination */}
            {pagination && pagination.total > pagination.per_page && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Space>
                  <Button
                    disabled={pagination.page === 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    {t('common.previous', 'Previous')}
                  </Button>
                  <Text type="secondary">
                    {t('common.pageOf', 'Page {{current}} of {{total}}', {
                      current: pagination.page,
                      total: Math.ceil(pagination.total / pagination.per_page),
                    })}
                  </Text>
                  <Button
                    disabled={pagination.page * pagination.per_page >= pagination.total}
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    {t('common.next', 'Next')}
                  </Button>
                </Space>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Preferences Modal */}
      <NotificationPreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
      />
    </div>
  );
}
