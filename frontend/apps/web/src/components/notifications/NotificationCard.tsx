import { useState } from 'react';
import { Card, Typography, Space, Tag, Tooltip, Button, Avatar, Badge } from 'antd';
import {
  BellOutlined,
  ToolOutlined,
  FileSearchOutlined,
  CalendarOutlined,
  WarningOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Notification, NotificationPriority } from '@inspection/shared';
import NotificationSnoozeMenu from './NotificationSnoozeMenu';
import NotificationQuickActions from './NotificationQuickActions';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

export interface NotificationCardProps {
  notification: Notification;
  onView?: () => void;
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: (until: string) => void;
  onCancelSnooze?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  onAssign?: () => void;
  onRate?: () => void;
  loading?: {
    markRead?: boolean;
    acknowledge?: boolean;
    snooze?: boolean;
    approve?: boolean;
    reject?: boolean;
  };
  compact?: boolean;
  showActions?: boolean;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

const PRIORITY_BG_COLORS: Record<NotificationPriority, string> = {
  critical: '#fff0f6',
  urgent: '#fff2f0',
  warning: '#fffbe6',
  info: '#e6f7ff',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  equipment_alert: <ToolOutlined />,
  inspection_submitted: <FileSearchOutlined />,
  inspection_assigned: <FileSearchOutlined />,
  leave_requested: <CalendarOutlined />,
  leave_approved: <CalendarOutlined />,
  leave_rejected: <CalendarOutlined />,
  defect_created: <WarningOutlined />,
  defect_assigned: <WarningOutlined />,
  specialist_job_assigned: <ToolOutlined />,
  specialist_job_completed: <CheckCircleOutlined />,
  engineer_job_created: <SettingOutlined />,
  engineer_job_completed: <CheckCircleOutlined />,
  quality_review_pending: <SafetyCertificateOutlined />,
  assessment_submitted: <FileSearchOutlined />,
  bonus_star_requested: <StarOutlined />,
  work_plan_published: <CalendarOutlined />,
  mention: <MessageOutlined />,
  team_update: <TeamOutlined />,
  system: <BellOutlined />,
};

const PRIORITY_ICONS: Record<NotificationPriority, React.ReactNode> = {
  critical: <ExclamationCircleOutlined />,
  urgent: <WarningOutlined />,
  warning: <InfoCircleOutlined />,
  info: <BellOutlined />,
};

export function NotificationCard({
  notification,
  onView,
  onMarkRead,
  onAcknowledge,
  onSnooze,
  onCancelSnooze,
  onApprove,
  onReject,
  onAssign,
  onRate,
  loading = {},
  compact = false,
  showActions = true,
}: NotificationCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const priorityColor = PRIORITY_COLORS[notification.priority];
  const bgColor = notification.is_read ? '#fafafa' : PRIORITY_BG_COLORS[notification.priority];
  const typeIcon = TYPE_ICONS[notification.type] || <BellOutlined />;
  const isSnoozed =
    notification.snoozed_until && dayjs(notification.snoozed_until).isAfter(dayjs());

  const formatTime = (dateString: string) => {
    const date = dayjs(dateString);
    const now = dayjs();
    const diffHours = now.diff(date, 'hour');

    if (diffHours < 24) {
      return date.fromNow();
    }
    if (diffHours < 48) {
      return t('common.yesterday', 'Yesterday') + ' ' + date.format('h:mm A');
    }
    return date.format('MMM D, h:mm A');
  };

  const exactTime = dayjs(notification.created_at).format('MMMM D, YYYY [at] h:mm:ss A');

  const handleCardClick = () => {
    if (!notification.is_read) {
      onMarkRead?.();
    }
    onView?.();
  };

  if (compact) {
    return (
      <div
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderLeft: `3px solid ${priorityColor}`,
          background: isHovered ? '#f5f5f5' : bgColor,
          cursor: 'pointer',
          transition: 'background 0.2s',
          opacity: notification.is_read ? 0.7 : 1,
        }}
      >
        <Avatar
          size="small"
          icon={typeIcon}
          style={{ backgroundColor: priorityColor, marginRight: 12 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong ellipsis style={{ display: 'block' }}>
            {notification.title}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {notification.message}
          </Text>
        </div>
        <Tooltip title={exactTime}>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap' }}>
            {formatTime(notification.created_at)}
          </Text>
        </Tooltip>
      </div>
    );
  }

  return (
    <Card
      size="small"
      hoverable
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderLeft: `4px solid ${priorityColor}`,
        background: bgColor,
        marginBottom: 8,
        opacity: notification.is_read ? 0.8 : 1,
        transition: 'all 0.2s',
      }}
      styles={{
        body: { padding: '12px 16px' },
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Badge dot={!notification.is_read} offset={[-4, 4]}>
          <Avatar
            icon={typeIcon}
            style={{
              backgroundColor: priorityColor,
              marginRight: 12,
            }}
          />
        </Badge>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Space size={4} wrap>
              <Text strong>{notification.title}</Text>
              {notification.priority !== 'info' && (
                <Tag
                  color={priorityColor}
                  icon={PRIORITY_ICONS[notification.priority]}
                  style={{ marginLeft: 4 }}
                >
                  {t(`notifications.priority.${notification.priority}`, notification.priority)}
                </Tag>
              )}
              {notification.is_persistent && (
                <Tag icon={<ExclamationCircleOutlined />} color="purple">
                  {t('notifications.persistent', 'Persistent')}
                </Tag>
              )}
              {isSnoozed && (
                <Tag icon={<ClockCircleOutlined />} color="blue">
                  {t('notifications.snoozedUntil', 'Snoozed until {{time}}', {
                    time: dayjs(notification.snoozed_until).format('h:mm A'),
                  })}
                </Tag>
              )}
            </Space>
            <Tooltip title={exactTime}>
              <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap', marginLeft: 8 }}>
                {formatTime(notification.created_at)}
              </Text>
            </Tooltip>
          </div>

          <Paragraph
            type="secondary"
            ellipsis={{ rows: 2, expandable: true, symbol: t('common.more', 'more') }}
            style={{ margin: '8px 0', marginBottom: showActions ? 8 : 0 }}
          >
            {notification.message}
          </Paragraph>

          {notification.sender_name && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <UserOutlined style={{ marginRight: 4 }} />
              {notification.sender_name}
            </Text>
          )}

          {showActions && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #f0f0f0',
              }}
            >
              <NotificationQuickActions
                notification={notification}
                onView={onView}
                onApprove={onApprove}
                onReject={onReject}
                onAssign={onAssign}
                onRate={onRate}
                loading={{
                  approve: loading.approve,
                  reject: loading.reject,
                }}
              />

              <Space size="small">
                {onSnooze && (
                  <NotificationSnoozeMenu
                    snoozedUntil={notification.snoozed_until}
                    onSnooze={onSnooze}
                    onCancelSnooze={onCancelSnooze}
                    loading={loading.snooze}
                  >
                    <Tooltip title={t('notifications.snooze', 'Snooze')}>
                      <Button
                        type="text"
                        size="small"
                        icon={<ClockCircleOutlined />}
                        loading={loading.snooze}
                      />
                    </Tooltip>
                  </NotificationSnoozeMenu>
                )}
                {notification.is_persistent && onAcknowledge && !notification.acknowledged_at && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckCircleOutlined />}
                    loading={loading.acknowledge}
                    onClick={onAcknowledge}
                  >
                    {t('notifications.acknowledge', 'Acknowledge')}
                  </Button>
                )}
              </Space>
            </div>
          )}
        </div>
      </div>

      {/* Mobile swipe hint */}
      <style>{`
        @media (hover: none) {
          .notification-card-mobile-hint {
            display: block;
            text-align: center;
            font-size: 11px;
            color: #999;
            margin-top: 8px;
          }
        }
      `}</style>
    </Card>
  );
}

export default NotificationCard;
