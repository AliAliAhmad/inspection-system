import { Empty, Button, Typography, Space } from 'antd';
import {
  CheckCircleOutlined,
  SettingOutlined,
  InboxOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

export interface NotificationEmptyProps {
  type?: 'all_read' | 'no_notifications' | 'no_results' | 'filtered';
  onOpenPreferences?: () => void;
  onClearFilters?: () => void;
  filterDescription?: string;
}

export function NotificationEmpty({
  type = 'all_read',
  onOpenPreferences,
  onClearFilters,
  filterDescription,
}: NotificationEmptyProps) {
  const { t } = useTranslation();

  const renderContent = () => {
    switch (type) {
      case 'all_read':
        return {
          icon: (
            <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
          ),
          title: t('notifications.allCaughtUp', "All caught up!"),
          description: t(
            'notifications.allReadDescription',
            "You've read all your notifications. Great job staying on top of things!"
          ),
          action: onOpenPreferences && (
            <Button icon={<SettingOutlined />} onClick={onOpenPreferences}>
              {t('notifications.managePreferences', 'Manage Preferences')}
            </Button>
          ),
        };

      case 'no_notifications':
        return {
          icon: <InboxOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 16 }} />,
          title: t('notifications.noNotifications', 'No notifications yet'),
          description: t(
            'notifications.noNotificationsDescription',
            "When you receive notifications, they'll appear here."
          ),
          action: onOpenPreferences && (
            <Button icon={<SettingOutlined />} onClick={onOpenPreferences}>
              {t('notifications.setupPreferences', 'Set Up Preferences')}
            </Button>
          ),
        };

      case 'no_results':
        return {
          icon: <InboxOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 16 }} />,
          title: t('notifications.noResults', 'No results found'),
          description: t(
            'notifications.noResultsDescription',
            'Try adjusting your search or filters to find what you\'re looking for.'
          ),
          action: onClearFilters && (
            <Button icon={<FilterOutlined />} onClick={onClearFilters}>
              {t('notifications.clearFilters', 'Clear Filters')}
            </Button>
          ),
        };

      case 'filtered':
        return {
          icon: <FilterOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 16 }} />,
          title: t('notifications.noMatchingNotifications', 'No matching notifications'),
          description: filterDescription || t(
            'notifications.filteredDescription',
            'No notifications match your current filters.'
          ),
          action: onClearFilters && (
            <Button type="primary" icon={<FilterOutlined />} onClick={onClearFilters}>
              {t('notifications.clearFilters', 'Clear Filters')}
            </Button>
          ),
        };

      default:
        return {
          icon: <InboxOutlined style={{ fontSize: 64, color: '#bfbfbf', marginBottom: 16 }} />,
          title: t('notifications.empty', 'No notifications'),
          description: '',
          action: null,
        };
    }
  };

  const content = renderContent();

  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      imageStyle={{ display: 'none' }}
      description={
        <Space direction="vertical" align="center" style={{ padding: '40px 20px' }}>
          {content.icon}
          <Title level={4} style={{ marginBottom: 8, marginTop: 0 }}>
            {content.title}
          </Title>
          <Text type="secondary" style={{ maxWidth: 300, textAlign: 'center' }}>
            {content.description}
          </Text>
          {content.action && <div style={{ marginTop: 16 }}>{content.action}</div>}
        </Space>
      }
    />
  );
}

export default NotificationEmpty;
