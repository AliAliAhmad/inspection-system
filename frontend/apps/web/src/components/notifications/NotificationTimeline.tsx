import { useMemo } from 'react';
import { Timeline, Typography, Space, Tag, Empty } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
import { Notification, NotificationPriority } from '@inspection/shared';
import NotificationCard from './NotificationCard';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

const { Title, Text } = Typography;

export interface NotificationTimelineProps {
  notifications: Notification[];
  onView?: (notification: Notification) => void;
  onMarkRead?: (notification: Notification) => void;
  onAcknowledge?: (notification: Notification) => void;
  onSnooze?: (notification: Notification, until: string) => void;
  onCancelSnooze?: (notification: Notification) => void;
  loading?: Record<number, boolean>;
  showDateSeparators?: boolean;
  alternating?: boolean;
}

interface GroupedNotifications {
  label: string;
  date: string;
  notifications: Notification[];
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

export function NotificationTimeline({
  notifications,
  onView,
  onMarkRead,
  onAcknowledge,
  onSnooze,
  onCancelSnooze,
  loading = {},
  showDateSeparators = true,
  alternating = false,
}: NotificationTimelineProps) {
  const { t } = useTranslation();

  const groupedNotifications = useMemo(() => {
    if (!showDateSeparators) {
      return [{ label: '', date: '', notifications }];
    }

    const groups: GroupedNotifications[] = [];
    const groupMap = new Map<string, Notification[]>();

    notifications.forEach((notification) => {
      const date = dayjs(notification.created_at);
      let dateKey: string;
      let label: string;

      if (date.isToday()) {
        dateKey = 'today';
        label = t('common.today', 'Today');
      } else if (date.isYesterday()) {
        dateKey = 'yesterday';
        label = t('common.yesterday', 'Yesterday');
      } else if (date.isAfter(dayjs().subtract(7, 'day'))) {
        dateKey = date.format('YYYY-MM-DD');
        label = date.format('dddd');
      } else {
        dateKey = date.format('YYYY-MM-DD');
        label = date.format('MMMM D, YYYY');
      }

      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
        groups.push({
          label,
          date: dateKey,
          notifications: groupMap.get(dateKey)!,
        });
      }
      groupMap.get(dateKey)!.push(notification);
    });

    return groups;
  }, [notifications, showDateSeparators, t]);

  if (notifications.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t('notifications.noNotifications', 'No notifications')}
      />
    );
  }

  return (
    <div className="notification-timeline">
      {groupedNotifications.map((group, groupIndex) => (
        <div key={group.date || groupIndex} style={{ marginBottom: 24 }}>
          {showDateSeparators && group.label && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 16,
                marginTop: groupIndex > 0 ? 24 : 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: 'linear-gradient(to right, transparent, #e8e8e8)',
                }}
              />
              <Tag
                icon={<ClockCircleOutlined />}
                style={{
                  margin: '0 12px',
                  padding: '4px 12px',
                  borderRadius: 16,
                }}
              >
                {group.label}
              </Tag>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: 'linear-gradient(to left, transparent, #e8e8e8)',
                }}
              />
            </div>
          )}

          <Timeline
            mode={alternating ? 'alternate' : 'left'}
            items={group.notifications.map((notification, index) => ({
              color: PRIORITY_COLORS[notification.priority],
              dot: notification.is_read ? undefined : (
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: PRIORITY_COLORS[notification.priority],
                    boxShadow: `0 0 0 4px ${PRIORITY_COLORS[notification.priority]}30`,
                  }}
                />
              ),
              children: (
                <div
                  style={{
                    marginLeft: alternating && index % 2 === 0 ? 0 : 8,
                    marginRight: alternating && index % 2 !== 0 ? 0 : 8,
                  }}
                >
                  <NotificationCard
                    notification={notification}
                    onView={() => onView?.(notification)}
                    onMarkRead={() => onMarkRead?.(notification)}
                    onAcknowledge={() => onAcknowledge?.(notification)}
                    onSnooze={(until) => onSnooze?.(notification, until)}
                    onCancelSnooze={() => onCancelSnooze?.(notification)}
                    loading={{
                      markRead: loading[notification.id],
                      acknowledge: loading[notification.id],
                      snooze: loading[notification.id],
                    }}
                    compact={false}
                    showActions={true}
                  />
                </div>
              ),
            }))}
          />
        </div>
      ))}

      <style>{`
        .notification-timeline .ant-timeline-item-content {
          min-height: auto;
        }
        .notification-timeline .ant-timeline-item {
          padding-bottom: 8px;
        }
        .notification-timeline .ant-timeline-item-tail {
          border-left-style: dashed;
        }
      `}</style>
    </div>
  );
}

export default NotificationTimeline;
