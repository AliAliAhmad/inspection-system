import { useState } from 'react';
import { Card, Typography, Space, Button, Badge, Collapse, Tag, Avatar, Divider } from 'antd';
import {
  DownOutlined,
  RightOutlined,
  BellOutlined,
  CheckOutlined,
  ToolOutlined,
  FileSearchOutlined,
  CalendarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { NotificationGroup as NotificationGroupType, Notification } from '@inspection/shared';
import NotificationCard from './NotificationCard';

const { Text, Title } = Typography;

export interface NotificationGroupProps {
  group: NotificationGroupType;
  onMarkGroupRead?: () => void;
  onExpandChange?: (expanded: boolean) => void;
  onNotificationView?: (notification: Notification) => void;
  onNotificationMarkRead?: (notification: Notification) => void;
  onNotificationSnooze?: (notification: Notification, until: string) => void;
  defaultExpanded?: boolean;
  loading?: boolean;
}

const GROUP_TYPE_ICONS: Record<string, React.ReactNode> = {
  equipment_alert: <ToolOutlined />,
  inspection: <FileSearchOutlined />,
  leave: <CalendarOutlined />,
  defect: <WarningOutlined />,
  default: <BellOutlined />,
};

const GROUP_TYPE_COLORS: Record<string, string> = {
  equipment_alert: '#fa8c16',
  inspection: '#1677ff',
  leave: '#52c41a',
  defect: '#f5222d',
  default: '#8c8c8c',
};

export function NotificationGroup({
  group,
  onMarkGroupRead,
  onExpandChange,
  onNotificationView,
  onNotificationMarkRead,
  onNotificationSnooze,
  defaultExpanded = false,
  loading = false,
}: NotificationGroupProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const unreadCount = group.notifications.filter((n) => !n.is_read).length;
  const groupType = group.group_key.split('_')[0] || 'default';
  const groupIcon = GROUP_TYPE_ICONS[groupType] || GROUP_TYPE_ICONS.default;
  const groupColor = GROUP_TYPE_COLORS[groupType] || GROUP_TYPE_COLORS.default;

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  };

  const latestNotification = group.notifications[0];
  const oldestNotification = group.notifications[group.notifications.length - 1];
  const timeRange =
    group.notifications.length > 1
      ? `${dayjs(oldestNotification.created_at).format('h:mm A')} - ${dayjs(latestNotification.created_at).format('h:mm A')}`
      : dayjs(latestNotification.created_at).format('h:mm A');

  // Group by priority for summary
  const priorityCounts = group.notifications.reduce(
    (acc, n) => {
      acc[n.priority] = (acc[n.priority] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderLeft: `4px solid ${groupColor}`,
        background: unreadCount > 0 ? '#fafafa' : '#fff',
      }}
      styles={{
        body: { padding: 0 },
      }}
    >
      {/* Collapsed Header */}
      <div
        onClick={handleToggle}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space>
          <Badge count={unreadCount} size="small" offset={[-2, 2]}>
            <Avatar
              size="small"
              icon={groupIcon}
              style={{ backgroundColor: groupColor }}
            />
          </Badge>
          <div>
            <Space size={4}>
              <Text strong>{group.summary_title}</Text>
              <Tag color="default">{group.notification_count}</Tag>
            </Space>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {group.summary_message}
              </Text>
            </div>
          </div>
        </Space>

        <Space>
          {priorityCounts.critical > 0 && (
            <Tag color="magenta">{priorityCounts.critical} critical</Tag>
          )}
          {priorityCounts.urgent > 0 && (
            <Tag color="red">{priorityCounts.urgent} urgent</Tag>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>
            {timeRange}
          </Text>
          <Button
            type="text"
            size="small"
            icon={isExpanded ? <DownOutlined /> : <RightOutlined />}
          />
        </Space>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <>
          <Divider style={{ margin: 0 }} />
          <div style={{ padding: '8px 12px', background: '#fff' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 8,
              }}
            >
              {unreadCount > 0 && onMarkGroupRead && (
                <Button
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkGroupRead();
                  }}
                >
                  {t('notifications.markAllRead', 'Mark all as read')}
                </Button>
              )}
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {group.notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  compact
                  showActions={false}
                  onView={() => onNotificationView?.(notification)}
                  onMarkRead={() => onNotificationMarkRead?.(notification)}
                  onSnooze={(until) => onNotificationSnooze?.(notification, until)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default NotificationGroup;
