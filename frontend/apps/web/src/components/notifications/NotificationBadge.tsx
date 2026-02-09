import { Badge, Tooltip } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationPriority } from '@inspection/shared';

export interface NotificationBadgeProps {
  count: number;
  hasCritical?: boolean;
  priorityCounts?: Record<NotificationPriority, number>;
  showZero?: boolean;
  onClick?: () => void;
  size?: 'default' | 'small';
  children?: React.ReactNode;
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  critical: '#eb2f96',
  urgent: '#f5222d',
  warning: '#fa8c16',
  info: '#1677ff',
};

export function NotificationBadge({
  count,
  hasCritical = false,
  priorityCounts,
  showZero = false,
  onClick,
  size = 'default',
  children,
}: NotificationBadgeProps) {
  const { t } = useTranslation();

  const displayCount = count > 99 ? '99+' : count;

  const badgeColor = useMemo(() => {
    if (priorityCounts) {
      if (priorityCounts.critical > 0) return PRIORITY_COLORS.critical;
      if (priorityCounts.urgent > 0) return PRIORITY_COLORS.urgent;
      if (priorityCounts.warning > 0) return PRIORITY_COLORS.warning;
    }
    if (hasCritical) return PRIORITY_COLORS.critical;
    return PRIORITY_COLORS.info;
  }, [priorityCounts, hasCritical]);

  const tooltipContent = useMemo(() => {
    if (!priorityCounts) {
      return t('notifications.unreadCount', '{{count}} unread notifications', { count });
    }

    const parts: string[] = [];
    if (priorityCounts.critical > 0) {
      parts.push(
        t('notifications.criticalCount', '{{count}} critical', { count: priorityCounts.critical })
      );
    }
    if (priorityCounts.urgent > 0) {
      parts.push(
        t('notifications.urgentCount', '{{count}} urgent', { count: priorityCounts.urgent })
      );
    }
    if (priorityCounts.warning > 0) {
      parts.push(
        t('notifications.warningCount', '{{count}} warnings', { count: priorityCounts.warning })
      );
    }
    if (priorityCounts.info > 0) {
      parts.push(t('notifications.infoCount', '{{count}} info', { count: priorityCounts.info }));
    }
    return parts.join(', ') || t('notifications.noUnread', 'No unread notifications');
  }, [priorityCounts, count, t]);

  return (
    <Tooltip title={tooltipContent}>
      <div
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default', display: 'inline-block' }}
      >
        <Badge
          count={displayCount}
          showZero={showZero}
          size={size}
          style={{
            backgroundColor: badgeColor,
            boxShadow: hasCritical ? `0 0 0 2px ${PRIORITY_COLORS.critical}40` : undefined,
          }}
          className={hasCritical ? 'notification-badge-pulse' : undefined}
        >
          {children}
        </Badge>
        <style>{`
          @keyframes notification-pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(235, 47, 150, 0.5);
            }
            70% {
              box-shadow: 0 0 0 8px rgba(235, 47, 150, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(235, 47, 150, 0);
            }
          }
          .notification-badge-pulse .ant-badge-count {
            animation: notification-pulse 1.5s infinite;
          }
        `}</style>
      </div>
    </Tooltip>
  );
}

export default NotificationBadge;
