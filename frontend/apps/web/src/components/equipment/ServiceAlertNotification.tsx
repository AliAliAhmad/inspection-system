import React from 'react';
import {
  Card,
  List,
  Tag,
  Space,
  Typography,
  Badge,
  Button,
  Empty,
  Spin,
  Tooltip,
  Avatar,
  message,
} from 'antd';
import {
  BellOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  RiseOutlined,
  ClockCircleFilled,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runningHoursApi } from '@inspection/shared';
import type { RunningHoursAlert } from '@inspection/shared';

const { Text, Title } = Typography;

interface ServiceAlertNotificationProps {
  limit?: number;
  showHeader?: boolean;
  onViewAll?: () => void;
  onEquipmentClick?: (equipmentId: number) => void;
}

const alertTypeConfig: Record<string, {
  icon: React.ReactNode;
  color: string;
  label: string;
}> = {
  approaching_service: {
    icon: <WarningOutlined />,
    color: '#faad14',
    label: 'Approaching Service',
  },
  overdue_service: {
    icon: <ExclamationCircleOutlined />,
    color: '#ff4d4f',
    label: 'Service Overdue',
  },
  hours_spike: {
    icon: <RiseOutlined />,
    color: '#1890ff',
    label: 'Hours Spike',
  },
  reading_gap: {
    icon: <ClockCircleFilled />,
    color: '#722ed1',
    label: 'Reading Gap',
  },
};

const severityConfig: Record<string, {
  color: string;
  tagColor: string;
}> = {
  warning: {
    color: '#faad14',
    tagColor: 'warning',
  },
  critical: {
    color: '#ff4d4f',
    tagColor: 'error',
  },
};

export const ServiceAlertNotification: React.FC<ServiceAlertNotificationProps> = ({
  limit = 5,
  showHeader = true,
  onViewAll,
  onEquipmentClick,
}) => {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['running-hours-alerts', { acknowledged: false, limit }],
    queryFn: async () => {
      const response = await runningHoursApi.getAlerts({
        acknowledged: false,
        limit,
      });
      return response.data?.data as RunningHoursAlert[];
    },
    staleTime: 1 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: number) => runningHoursApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      message.success('Alert acknowledged');
      queryClient.invalidateQueries({ queryKey: ['running-hours-alerts'] });
    },
    onError: () => {
      message.error('Failed to acknowledge alert');
    },
  });

  const unacknowledgedCount = alerts?.filter(a => !a.acknowledged_at).length ?? 0;

  if (isLoading) {
    return (
      <Card size="small">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error || !alerts || alerts.length === 0) {
    return (
      <Card
        size="small"
        title={
          showHeader && (
            <Space>
              <BellOutlined />
              <span>Service Alerts</span>
            </Space>
          )
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No service alerts"
          style={{ margin: '20px 0' }}
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        showHeader && (
          <Space>
            <Badge count={unacknowledgedCount} offset={[10, 0]}>
              <BellOutlined style={{ fontSize: 16 }} />
            </Badge>
            <span>Service Alerts</span>
          </Space>
        )
      }
      extra={
        onViewAll && (
          <Button type="link" size="small" onClick={onViewAll}>
            View All
          </Button>
        )
      }
      styles={{
        body: { padding: 0 },
      }}
    >
      <List
        dataSource={alerts}
        renderItem={(alert) => {
          const typeConfig = alertTypeConfig[alert.alert_type] || alertTypeConfig.approaching_service;
          const severity = severityConfig[alert.severity] || severityConfig.warning;

          return (
            <List.Item
              style={{
                padding: '14px 16px',
                borderLeft: `4px solid ${severity.color}`,
                backgroundColor: alert.acknowledged_at ? '#fafafa' : 'white',
              }}
              actions={[
                !alert.acknowledged_at && (
                  <Tooltip title="Acknowledge">
                    <Button
                      type="text"
                      icon={<CheckOutlined />}
                      size="small"
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                      loading={acknowledgeMutation.isPending}
                    />
                  </Tooltip>
                ),
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    style={{
                      backgroundColor: `${typeConfig.color}20`,
                      color: typeConfig.color,
                    }}
                    icon={typeConfig.icon}
                  />
                }
                title={
                  <Space>
                    <a
                      onClick={() => onEquipmentClick?.(alert.equipment_id)}
                      style={{ fontWeight: 700, fontSize: 14 }}
                    >
                      {alert.equipment_name}
                    </a>
                    <Tag color={severity.tagColor} style={{ fontSize: 11, fontWeight: 700 }}>
                      {alert.severity.toUpperCase()}
                    </Tag>
                  </Space>
                }
                description={
                  <div>
                    <Text style={{ color: typeConfig.color, fontSize: 13, fontWeight: 600 }}>
                      {typeConfig.icon} {typeConfig.label}
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {alert.message}
                      </Text>
                    </div>
                    {alert.hours_value !== null && (
                      <div style={{ marginTop: 4 }}>
                        <Space size={4}>
                          <ClockCircleOutlined style={{ fontSize: 10, color: '#8c8c8c' }} />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {alert.hours_value.toLocaleString()} hrs
                            {alert.threshold_value !== null && (
                              <> / {alert.threshold_value.toLocaleString()} hrs threshold</>
                            )}
                          </Text>
                        </Space>
                      </div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {new Date(alert.created_at).toLocaleString()}
                      </Text>
                    </div>
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />
    </Card>
  );
};

// Compact badge version for header notification icon
export const ServiceAlertBadge: React.FC<{
  onClick?: () => void;
}> = ({ onClick }) => {
  const { data: alerts } = useQuery({
    queryKey: ['running-hours-alerts', { acknowledged: false, limit: 10 }],
    queryFn: async () => {
      const response = await runningHoursApi.getAlerts({
        acknowledged: false,
        limit: 10,
      });
      return response.data?.data as RunningHoursAlert[];
    },
    staleTime: 1 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const criticalCount = alerts?.filter(a => a.severity === 'critical').length ?? 0;
  const totalCount = alerts?.length ?? 0;

  if (totalCount === 0) {
    return null;
  }

  return (
    <Tooltip
      title={
        <div>
          <div>{totalCount} service alert{totalCount !== 1 ? 's' : ''}</div>
          {criticalCount > 0 && (
            <div style={{ color: '#ff4d4f' }}>
              {criticalCount} critical
            </div>
          )}
        </div>
      }
    >
      <Badge
        count={totalCount}
        style={{
          backgroundColor: criticalCount > 0 ? '#ff4d4f' : '#faad14',
          cursor: 'pointer',
        }}
        onClick={onClick}
      >
        <ToolOutlined
          style={{
            fontSize: 18,
            cursor: 'pointer',
            color: criticalCount > 0 ? '#ff4d4f' : '#faad14',
          }}
        />
      </Badge>
    </Tooltip>
  );
};

export default ServiceAlertNotification;
