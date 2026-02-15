import React from 'react';
import { Card, List, Tag, Avatar, Progress, Badge, Alert, Empty, Button, Tooltip, Space, Typography } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleAIApi } from './api';
import type { FatigueAlert } from './types';
import {
  WarningOutlined,
  UserOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ThunderboltOutlined,
  CoffeeOutlined,
  ReloadOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface FatigueAlertsProps {
  onReassign?: (inspectorId: number, reason: string) => void;
}

export const FatigueAlerts: React.FC<FatigueAlertsProps> = ({ onReassign }) => {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, error, refetch } = useQuery({
    queryKey: ['schedule-ai', 'fatigue-alerts'],
    queryFn: () => scheduleAIApi.getFatigueAlerts(),
    refetchInterval: 60000, // Refresh every minute
  });

  const dismissAlertMutation = useMutation({
    mutationFn: (alertId: number) => scheduleAIApi.dismissFatigueAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-ai', 'fatigue-alerts'] });
    },
  });

  const getRiskColor = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'critical':
        return '#ff4d4f';
      case 'high':
        return '#fa541c';
      case 'medium':
        return '#faad14';
      case 'low':
        return '#52c41a';
      default:
        return '#8c8c8c';
    }
  };

  const getRiskIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return <FireOutlined style={{ color: '#ff4d4f' }} />;
      case 'high':
        return <ThunderboltOutlined style={{ color: '#fa541c' }} />;
      case 'medium':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      default:
        return <CoffeeOutlined style={{ color: '#52c41a' }} />;
    }
  };

  const getFatigueScoreStatus = (score: number): 'success' | 'normal' | 'exception' | 'active' => {
    if (score >= 80) return 'exception';
    if (score >= 60) return 'active';
    if (score >= 40) return 'normal';
    return 'success';
  };

  const formatHoursWorked = (hours: number): string => {
    if (hours >= 10) return `${hours.toFixed(1)}h (excessive)`;
    if (hours >= 8) return `${hours.toFixed(1)}h (high)`;
    return `${hours.toFixed(1)}h`;
  };

  if (error) {
    return (
      <Card title="Fatigue Risk Alerts">
        <Alert
          message="Failed to load fatigue alerts"
          description="Please try refreshing the page."
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  const criticalAlerts = alerts?.filter((a) => a.risk_level === 'critical') || [];
  const highAlerts = alerts?.filter((a) => a.risk_level === 'high') || [];
  const otherAlerts = alerts?.filter((a) => !['critical', 'high'].includes(a.risk_level)) || [];

  const renderAlertItem = (alert: FatigueAlert) => (
    <List.Item
      key={alert.id}
      actions={[
        onReassign && (
          <Button
            key="reassign"
            type="link"
            size="small"
            onClick={() => onReassign(alert.inspector_id, alert.reason)}
          >
            Reassign Work
          </Button>
        ),
        <Tooltip title="Dismiss alert" key="dismiss">
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined />}
            loading={dismissAlertMutation.isPending}
            onClick={() => dismissAlertMutation.mutate(alert.id)}
          />
        </Tooltip>,
      ].filter(Boolean)}
    >
      <List.Item.Meta
        avatar={
          <Badge dot color={getRiskColor(alert.risk_level)}>
            <Avatar icon={<UserOutlined />} />
          </Badge>
        }
        title={
          <Space>
            {getRiskIcon(alert.risk_level)}
            <Text strong>{alert.inspector_name}</Text>
            <Tag color={getRiskColor(alert.risk_level)}>{alert.risk_level.toUpperCase()}</Tag>
          </Space>
        }
        description={
          <div>
            <Paragraph style={{ marginBottom: 8 }} type="secondary">
              {alert.reason}
            </Paragraph>
            <Space size="middle">
              <Tooltip title="Fatigue Score (0-100, higher = more fatigued)">
                <span>
                  <ThunderboltOutlined style={{ marginRight: 4 }} />
                  Fatigue: <Progress
                    percent={alert.fatigue_score}
                    size="small"
                    status={getFatigueScoreStatus(alert.fatigue_score)}
                    style={{ width: 100, display: 'inline-block' }}
                  />
                </span>
              </Tooltip>
              <Tooltip title="Hours worked today">
                <span>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {formatHoursWorked(alert.hours_worked_today)}
                </span>
              </Tooltip>
              <Tooltip title="Consecutive days worked">
                <span>
                  <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                  {alert.consecutive_days} days
                </span>
              </Tooltip>
            </Space>
            {alert.recommendations && alert.recommendations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Recommendations:
                </Text>
                <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                  {alert.recommendations.slice(0, 2).map((rec, idx) => (
                    <li key={idx} style={{ fontSize: 12 }}>
                      <Text type="secondary">{rec}</Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        }
      />
    </List.Item>
  );

  return (
    <Card
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>Fatigue Risk Alerts</span>
          {criticalAlerts.length > 0 && (
            <Badge count={criticalAlerts.length} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
      }
      extra={
        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={() => refetch()}
          loading={isLoading}
        >
          Refresh
        </Button>
      }
      loading={isLoading}
    >
      {alerts && alerts.length > 0 ? (
        <>
          {criticalAlerts.length > 0 && (
            <>
              <Alert
                message={`${criticalAlerts.length} Critical Alert${criticalAlerts.length > 1 ? 's' : ''}`}
                description="These inspectors require immediate attention to prevent burnout or quality issues."
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <List
                itemLayout="horizontal"
                dataSource={criticalAlerts}
                renderItem={renderAlertItem}
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {highAlerts.length > 0 && (
            <>
              <Alert
                message={`${highAlerts.length} High Risk Alert${highAlerts.length > 1 ? 's' : ''}`}
                description="Consider reassigning some work from these inspectors."
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <List
                itemLayout="horizontal"
                dataSource={highAlerts}
                renderItem={renderAlertItem}
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {otherAlerts.length > 0 && (
            <List
              itemLayout="horizontal"
              dataSource={otherAlerts}
              renderItem={renderAlertItem}
            />
          )}
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span>
              <CheckOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              No fatigue alerts - All inspectors are within safe workload limits
            </span>
          }
        />
      )}
    </Card>
  );
};
