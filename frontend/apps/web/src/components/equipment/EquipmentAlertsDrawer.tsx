import { useState } from 'react';
import {
  Drawer,
  List,
  Tag,
  Button,
  Space,
  Typography,
  Empty,
  Segmented,
  Badge,
  Tooltip,
  Popconfirm,
  Spin,
  message,
} from 'antd';
import {
  BellOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi, EquipmentAlert, AlertSeverity } from '@inspection/shared';

const { Text, Title } = Typography;

interface AlertsDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewEquipment?: (equipmentId: number) => void;
}

const severityConfig: Record<AlertSeverity, { color: string; icon: React.ReactNode; label: string }> = {
  critical: { color: 'red', icon: <ExclamationCircleOutlined />, label: 'Critical' },
  high: { color: 'orange', icon: <WarningOutlined />, label: 'High' },
  medium: { color: 'gold', icon: <WarningOutlined />, label: 'Medium' },
  low: { color: 'blue', icon: <InfoCircleOutlined />, label: 'Low' },
};

const alertTypeLabels: Record<string, string> = {
  maintenance_overdue: 'Maintenance Overdue',
  inspection_overdue: 'Inspection Overdue',
  anomaly_detected: 'Anomaly Detected',
  downtime_extended: 'Extended Downtime',
  risk_threshold: 'Risk Threshold Exceeded',
};

export function EquipmentAlertsDrawer({ open, onClose, onViewEquipment }: AlertsDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['equipment-alerts', filterSeverity],
    queryFn: async () => {
      const params: { severity?: string; is_read?: boolean } = {};
      if (filterSeverity !== 'all') {
        params.severity = filterSeverity;
      }
      const res = await equipmentApi.getAlerts(params);
      return res.data?.data || [];
    },
    enabled: open,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: number) => equipmentApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      message.success(t('equipment.alertAcknowledged', 'Alert acknowledged'));
      queryClient.invalidateQueries({ queryKey: ['equipment-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-kpis'] });
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId: number) => equipmentApi.dismissAlert(alertId),
    onSuccess: () => {
      message.success(t('equipment.alertDismissed', 'Alert dismissed'));
      queryClient.invalidateQueries({ queryKey: ['equipment-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-kpis'] });
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const groupedAlerts = alerts.reduce((acc: Record<AlertSeverity, EquipmentAlert[]>, alert: EquipmentAlert) => {
    if (!acc[alert.severity]) {
      acc[alert.severity] = [];
    }
    acc[alert.severity].push(alert);
    return acc;
  }, {} as Record<AlertSeverity, EquipmentAlert[]>);

  const severityOrder: AlertSeverity[] = ['critical', 'high', 'medium', 'low'];

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const unreadCount = alerts.filter((a: EquipmentAlert) => !a.is_read).length;

  return (
    <Drawer
      title={
        <Space>
          <BellOutlined />
          {t('equipment.alerts', 'Equipment Alerts')}
          {unreadCount > 0 && (
            <Badge count={unreadCount} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
      }
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      extra={
        <Segmented
          size="small"
          value={filterSeverity}
          onChange={(value) => setFilterSeverity(value as string)}
          options={[
            { label: 'All', value: 'all' },
            { label: <Tag color="red">Critical</Tag>, value: 'critical' },
            { label: <Tag color="orange">High</Tag>, value: 'high' },
            { label: <Tag color="gold">Medium</Tag>, value: 'medium' },
            { label: <Tag color="blue">Low</Tag>, value: 'low' },
          ]}
        />
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : alerts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('equipment.noAlerts', 'No alerts')}
        />
      ) : (
        <div>
          {severityOrder.map((severity) => {
            const sevAlerts = groupedAlerts[severity];
            if (!sevAlerts || sevAlerts.length === 0) return null;

            const config = severityConfig[severity];
            return (
              <div key={severity} style={{ marginBottom: 24 }}>
                <Title level={5} style={{ color: config.color, marginBottom: 12 }}>
                  {config.icon} {config.label} ({sevAlerts.length})
                </Title>
                <List
                  dataSource={sevAlerts}
                  renderItem={(alert: EquipmentAlert) => (
                    <List.Item
                      style={{
                        background: alert.is_read ? '#fafafa' : '#fff',
                        borderLeft: `3px solid ${config.color}`,
                        marginBottom: 8,
                        padding: '12px 16px',
                        borderRadius: 4,
                        opacity: alert.is_read ? 0.7 : 1,
                      }}
                      actions={[
                        <Tooltip key="view" title={t('common.view', 'View')}>
                          <Button
                            type="text"
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => onViewEquipment?.(alert.equipment_id)}
                          />
                        </Tooltip>,
                        !alert.acknowledged_at && (
                          <Tooltip key="ack" title={t('equipment.acknowledge', 'Acknowledge')}>
                            <Button
                              type="text"
                              icon={<CheckOutlined />}
                              size="small"
                              loading={acknowledgeMutation.isPending}
                              onClick={() => acknowledgeMutation.mutate(alert.id)}
                            />
                          </Tooltip>
                        ),
                        <Popconfirm
                          key="dismiss"
                          title={t('equipment.dismissAlert', 'Dismiss this alert?')}
                          onConfirm={() => dismissMutation.mutate(alert.id)}
                          okText={t('common.yes', 'Yes')}
                          cancelText={t('common.no', 'No')}
                        >
                          <Tooltip title={t('common.dismiss', 'Dismiss')}>
                            <Button
                              type="text"
                              danger
                              icon={<CloseOutlined />}
                              size="small"
                              loading={dismissMutation.isPending}
                            />
                          </Tooltip>
                        </Popconfirm>,
                      ].filter(Boolean)}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong>{alert.equipment_name}</Text>
                            <Tag color={config.color} style={{ marginLeft: 8 }}>
                              {alertTypeLabels[alert.type] || alert.type}
                            </Tag>
                          </Space>
                        }
                        description={
                          <div>
                            <Text>{alert.message}</Text>
                            {alert.details && (
                              <div style={{ marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {alert.details}
                                </Text>
                              </div>
                            )}
                            <div style={{ marginTop: 8 }}>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {formatTime(alert.created_at)}
                                {alert.acknowledged_at && (
                                  <span style={{ marginLeft: 8 }}>
                                    <CheckOutlined style={{ color: '#52c41a' }} /> Acknowledged
                                  </span>
                                )}
                              </Text>
                            </div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

export default EquipmentAlertsDrawer;
