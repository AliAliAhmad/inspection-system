import React from 'react';
import { Card, Progress, Statistic, Tag, Tooltip, Space, Typography, Row, Col, Spin, Alert } from 'antd';
import {
  DashboardOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { runningHoursApi } from '@inspection/shared';
import type { RunningHoursData, ServiceStatus } from '@inspection/shared';

const { Text } = Typography;

interface RunningHoursCardProps {
  equipmentId: number;
  compact?: boolean;
  showLastReading?: boolean;
  onServiceClick?: () => void;
}

const statusConfig: Record<ServiceStatus, {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  label: string;
  progressColor: string;
}> = {
  ok: {
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: <CheckCircleOutlined />,
    label: 'OK',
    progressColor: '#52c41a',
  },
  approaching: {
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: <WarningOutlined />,
    label: 'Approaching Service',
    progressColor: '#faad14',
  },
  overdue: {
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    icon: <ExclamationCircleOutlined />,
    label: 'Service Overdue',
    progressColor: '#ff4d4f',
  },
};

export const RunningHoursCard: React.FC<RunningHoursCardProps> = ({
  equipmentId,
  compact = false,
  showLastReading = true,
  onServiceClick,
}) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['equipment-running-hours', equipmentId],
    queryFn: async () => {
      const response = await runningHoursApi.getRunningHours(equipmentId);
      return response.data?.data as RunningHoursData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card
        title={compact ? undefined : <span><DashboardOutlined style={{ marginRight: 8 }} />Running Hours</span>}
        size={compact ? 'small' : 'default'}
        style={{ height: '100%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: compact ? 16 : 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card
        title={compact ? undefined : <span><DashboardOutlined style={{ marginRight: 8 }} />Running Hours</span>}
        size={compact ? 'small' : 'default'}
        style={{ height: '100%' }}
      >
        <Alert type="warning" message="Unable to load running hours data" showIcon />
      </Card>
    );
  }

  const status = statusConfig[data.service_status];
  const hasServiceInterval = data.service_interval !== null;

  // Calculate progress percentage
  const progressPercent = Math.min(100, Math.max(0, data.progress_percent));

  if (compact) {
    return (
      <Tooltip
        title={
          <div>
            <div>Running Hours: {data.current_hours.toLocaleString()} hrs</div>
            {hasServiceInterval && (
              <>
                <div>
                  {data.service_status === 'overdue'
                    ? `Overdue by ${data.hours_overdue?.toLocaleString()} hrs`
                    : `${data.hours_until_service?.toLocaleString()} hrs until service`}
                </div>
                <div>Status: {status.label}</div>
              </>
            )}
          </div>
        }
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            borderRadius: 16,
            background: hasServiceInterval ? status.bgColor : '#f5f5f5',
            border: `1px solid ${hasServiceInterval ? status.color : '#d9d9d9'}40`,
            cursor: onServiceClick ? 'pointer' : 'default',
          }}
          onClick={onServiceClick}
        >
          <DashboardOutlined style={{ color: hasServiceInterval ? status.color : '#8c8c8c', fontSize: 12 }} />
          <Text strong style={{ fontSize: 12, color: hasServiceInterval ? status.color : '#595959' }}>
            {data.current_hours.toLocaleString()} hrs
          </Text>
          {hasServiceInterval && (
            <span style={{ color: status.color, fontSize: 10 }}>{status.icon}</span>
          )}
        </div>
      </Tooltip>
    );
  }

  return (
    <Card
      title={
        <Space>
          <DashboardOutlined />
          <span>Running Hours</span>
          {hasServiceInterval && (
            <Tag color={status.color} icon={status.icon}>
              {status.label}
            </Tag>
          )}
        </Space>
      }
      extra={
        onServiceClick && (
          <Tooltip title="Service Settings">
            <ToolOutlined
              style={{ cursor: 'pointer', color: '#1890ff' }}
              onClick={onServiceClick}
            />
          </Tooltip>
        )
      }
      style={{
        height: '100%',
        borderLeft: hasServiceInterval ? `4px solid ${status.color}` : undefined,
      }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={hasServiceInterval ? 12 : 24}>
          <Statistic
            title={
              <Space>
                <ClockCircleOutlined />
                <span>Current Hours</span>
              </Space>
            }
            value={data.current_hours}
            suffix="hrs"
            valueStyle={{ fontSize: 32, fontWeight: 600, color: status.color }}
          />
        </Col>

        {hasServiceInterval && (
          <Col xs={24} sm={12}>
            <Statistic
              title={
                <Space>
                  <ToolOutlined />
                  <span>{data.service_status === 'overdue' ? 'Hours Overdue' : 'Until Service'}</span>
                </Space>
              }
              value={(data.service_status === 'overdue' ? data.hours_overdue : data.hours_until_service) ?? undefined}
              suffix="hrs"
              valueStyle={{
                fontSize: 24,
                fontWeight: 500,
                color: status.color,
              }}
            />
          </Col>
        )}
      </Row>

      {hasServiceInterval && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text type="secondary">Progress to Next Service</Text>
            <Text strong style={{ color: status.color }}>
              {progressPercent.toFixed(0)}%
            </Text>
          </div>
          <Progress
            percent={progressPercent}
            showInfo={false}
            strokeColor={status.progressColor}
            trailColor="#f0f0f0"
            size="default"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Last Service: {data.service_interval?.last_service_hours?.toLocaleString() ?? 0} hrs
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Next Service: {data.service_interval?.next_service_hours?.toLocaleString() ?? 'N/A'} hrs
            </Text>
          </div>
        </div>
      )}

      {showLastReading && data.last_reading && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#fafafa',
            borderRadius: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>Last Reading</Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div>
              <Text strong>{data.last_reading.hours.toLocaleString()} hrs</Text>
              {data.last_reading.hours_since_last !== null && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                  (+{data.last_reading.hours_since_last.toLocaleString()} hrs)
                </Text>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {new Date(data.last_reading.recorded_at).toLocaleDateString()}
              </Text>
              {data.last_reading.recorded_by && (
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    by {data.last_reading.recorded_by.full_name}
                  </Text>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasServiceInterval && (
        <Alert
          type="info"
          message="Service interval not configured"
          description="Set up a service interval to track maintenance schedules."
          showIcon
          style={{ marginTop: 16 }}
          action={
            onServiceClick && (
              <a onClick={onServiceClick}>Configure</a>
            )
          }
        />
      )}
    </Card>
  );
};

export default RunningHoursCard;
