import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Space, Typography, Progress, Tooltip } from 'antd';
import {
  CloseOutlined,
  CheckOutlined,
  EyeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Notification, NotificationPriority } from '@inspection/shared';

const { Text, Title } = Typography;

export interface NotificationToastProps {
  notification: Notification;
  onClose: () => void;
  onMarkRead?: () => void;
  onView?: () => void;
  onSnooze?: () => void;
  autoDismiss?: boolean;
  autoDismissDelay?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
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

export function NotificationToast({
  notification,
  onClose,
  onMarkRead,
  onView,
  onSnooze,
  autoDismiss = true,
  autoDismissDelay = 8000,
}: NotificationToastProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const priorityColor = PRIORITY_COLORS[notification.priority];
  const bgColor = PRIORITY_BG_COLORS[notification.priority];

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!autoDismiss || isPaused) return;

    const startTime = Date.now();
    const remainingTime = (progress / 100) * autoDismissDelay;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.max(0, ((remainingTime - elapsed) / autoDismissDelay) * 100);
      setProgress(newProgress);

      if (newProgress <= 0) {
        clearInterval(interval);
        handleClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [autoDismiss, autoDismissDelay, isPaused, progress, handleClose]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  const handleView = () => {
    onMarkRead?.();
    onView?.();
    handleClose();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: isVisible ? 'translateX(0)' : 'translateX(120%)',
        opacity: isVisible ? 1 : 0,
        transition: 'all 0.3s ease-in-out',
        maxWidth: 400,
        minWidth: 320,
      }}
    >
      <Card
        size="small"
        style={{
          borderLeft: `4px solid ${priorityColor}`,
          background: bgColor,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
        styles={{
          body: { padding: '12px 16px', paddingBottom: 8 },
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            <Title
              level={5}
              style={{
                margin: 0,
                marginBottom: 4,
                fontSize: 14,
                color: priorityColor,
              }}
            >
              {notification.title}
            </Title>
            <Text
              type="secondary"
              style={{
                fontSize: 13,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {notification.message}
            </Text>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={handleClose}
            style={{ marginTop: -4, marginRight: -8 }}
          />
        </div>

        <Space size="small" style={{ marginTop: 12 }}>
          {onView && (
            <Button size="small" type="primary" icon={<EyeOutlined />} onClick={handleView}>
              {t('common.view', 'View')}
            </Button>
          )}
          {onMarkRead && !onView && (
            <Button size="small" icon={<CheckOutlined />} onClick={onMarkRead}>
              {t('notifications.markRead', 'Mark Read')}
            </Button>
          )}
          {onSnooze && (
            <Tooltip title={t('notifications.snooze', 'Snooze')}>
              <Button size="small" icon={<ClockCircleOutlined />} onClick={onSnooze} />
            </Tooltip>
          )}
        </Space>

        {autoDismiss && (
          <Progress
            percent={progress}
            showInfo={false}
            strokeColor={priorityColor}
            trailColor="transparent"
            size="small"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              margin: 0,
              lineHeight: 0,
            }}
          />
        )}
      </Card>
    </div>
  );
}

export default NotificationToast;
