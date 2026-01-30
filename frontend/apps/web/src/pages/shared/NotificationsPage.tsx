import { useState } from 'react';
import { Card, List, Typography, Button, Tag, Space, Badge, Empty, Spin } from 'antd';
import { BellOutlined, CheckOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notificationsApi, Notification, NotificationPriority } from '@inspection/shared';
import { formatDateTime } from '@inspection/shared';

const priorityColors: Record<NotificationPriority, string> = {
  info: 'blue',
  warning: 'orange',
  urgent: 'red',
  critical: 'magenta',
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsApi.list({ page, per_page: 20 }).then(r => r.data),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <Card
      title={
        <Space>
          <BellOutlined />
          <span>{t('nav.notifications')}</span>
        </Space>
      }
      extra={
        <Button
          type="link"
          icon={<CheckOutlined />}
          onClick={() => markAllReadMutation.mutate()}
          loading={markAllReadMutation.isPending}
        >
          {t('notifications.mark_all_read')}
        </Button>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : notifications.length === 0 ? (
        <Empty description={t('notifications.no_notifications')} />
      ) : (
        <List
          dataSource={notifications}
          pagination={pagination ? {
            current: pagination.page,
            total: pagination.total,
            pageSize: pagination.per_page,
            onChange: setPage,
          } : false}
          renderItem={(item: Notification) => (
            <List.Item
              style={{
                backgroundColor: item.is_read ? undefined : '#f6ffed',
                padding: '12px 16px',
                borderRadius: 6,
                marginBottom: 4,
              }}
              actions={[
                !item.is_read && (
                  <Button
                    key="read"
                    type="link"
                    size="small"
                    onClick={() => markReadMutation.mutate(item.id)}
                  >
                    Mark Read
                  </Button>
                ),
                <Button
                  key="delete"
                  type="link"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => deleteMutation.mutate(item.id)}
                />,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {!item.is_read && <Badge status="processing" />}
                    <Typography.Text strong={!item.is_read}>{item.title}</Typography.Text>
                    <Tag color={priorityColors[item.priority]}>{item.priority}</Tag>
                  </Space>
                }
                description={
                  <div>
                    <Typography.Text>{item.message}</Typography.Text>
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDateTime(item.created_at)}
                    </Typography.Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
