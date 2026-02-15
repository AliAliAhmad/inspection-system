import React from 'react';
import {
  Card,
  List,
  Tag,
  Typography,
  Spin,
  Empty,
  Space,
  Button,
  Badge,
  Tooltip,
  Alert,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { SLAWarning } from '@inspection/shared';
import {
  ClockCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  RightOutlined,
  AlertOutlined,
  UserOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const getRiskConfig = (level: string) => {
  switch (level) {
    case 'critical':
      return {
        color: '#cf1322',
        tagColor: 'red',
        icon: <ExclamationCircleOutlined />,
        label: 'Critical',
      };
    case 'high':
      return {
        color: '#fa541c',
        tagColor: 'volcano',
        icon: <AlertOutlined />,
        label: 'High',
      };
    case 'medium':
      return {
        color: '#faad14',
        tagColor: 'orange',
        icon: <WarningOutlined />,
        label: 'Medium',
      };
    case 'low':
      return {
        color: '#52c41a',
        tagColor: 'green',
        icon: <ClockCircleOutlined />,
        label: 'Low',
      };
    default:
      return {
        color: '#8c8c8c',
        tagColor: 'default',
        icon: <ClockCircleOutlined />,
        label: level,
      };
  }
};

interface SLAWarningCardProps {
  onViewDetails?: (equipmentId: number) => void;
  onScheduleInspection?: (equipmentId: number) => void;
  daysAhead?: number;
  maxItems?: number;
}

export const SLAWarningCard: React.FC<SLAWarningCardProps> = ({
  onViewDetails,
  onScheduleInspection,
  daysAhead = 7,
  maxItems = 5,
}) => {
  const {
    data: slaData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'sla-warnings', daysAhead],
    queryFn: () => scheduleAIApi.getSLAWarnings(daysAhead),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>SLA Warnings</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Checking SLA status...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={
          <Space>
            <ClockCircleOutlined />
            <span>SLA Warnings</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load SLA warnings"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const warnings: SLAWarning[] = (slaData || []).slice(0, maxItems);
  const totalWarnings = slaData?.length || 0;
  const criticalCount = warnings.filter((w) => w.risk_level === 'critical').length;
  const overdueCount = warnings.filter((w) => w.days_until_due < 0).length;

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined
            style={{ color: criticalCount > 0 ? '#cf1322' : '#faad14' }}
          />
          <span>SLA Warnings</span>
          <Badge
            count={totalWarnings}
            style={{
              backgroundColor: criticalCount > 0 ? '#cf1322' : '#faad14',
            }}
          />
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          Next {daysAhead} days
        </Text>
      }
    >
      {overdueCount > 0 && (
        <Alert
          type="error"
          message={`${overdueCount} SLA${overdueCount > 1 ? 's' : ''} overdue - immediate action required`}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {warnings.length === 0 ? (
        <Empty
          description="No SLA warnings"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={warnings}
          renderItem={(warning: SLAWarning) => {
            const riskConfig = getRiskConfig(warning.risk_level);
            return (
              <List.Item
                key={warning.equipment_id}
                actions={[
                  onScheduleInspection && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onScheduleInspection(warning.equipment_id)}
                    >
                      Schedule
                    </Button>
                  ),
                  onViewDetails && (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => onViewDetails(warning.equipment_id)}
                      icon={<RightOutlined />}
                    >
                      Details
                    </Button>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Tooltip title={riskConfig.label}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          backgroundColor: riskConfig.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 18,
                        }}
                      >
                        {riskConfig.icon}
                      </div>
                    </Tooltip>
                  }
                  title={
                    <Space>
                      <Text strong>{warning.equipment_name}</Text>
                      <Tag color={riskConfig.tagColor}>
                        {riskConfig.label}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={2}>
                      <Space>
                        <CalendarOutlined />
                        <Text
                          type={
                            warning.days_until_due < 0
                              ? 'danger'
                              : 'secondary'
                          }
                        >
                          {warning.days_until_due < 0
                            ? `${Math.abs(warning.days_until_due)} days overdue`
                            : warning.days_until_due === 0
                              ? 'Due today'
                              : `${warning.days_until_due} days remaining`}
                        </Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Due: {new Date(warning.sla_due_date).toLocaleDateString()}
                      </Text>
                      {warning.assigned_inspector && (
                        <Space>
                          <UserOutlined />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Assigned: {warning.assigned_inspector}
                          </Text>
                        </Space>
                      )}
                      {warning.recommended_action && (
                        <Text
                          type="secondary"
                          style={{ fontSize: 12, fontStyle: 'italic' }}
                        >
                          {warning.recommended_action}
                        </Text>
                      )}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}

      {totalWarnings > maxItems && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">
            Showing {maxItems} of {totalWarnings} warnings
          </Text>
        </div>
      )}
    </Card>
  );
};

// Individual SLA Warning item for use in other components
export const SLAWarningItem: React.FC<{
  warning: SLAWarning;
  compact?: boolean;
}> = ({ warning, compact = false }) => {
  const riskConfig = getRiskConfig(warning.risk_level);

  if (compact) {
    return (
      <Space>
        <Tag color={riskConfig.tagColor} icon={riskConfig.icon}>
          {warning.equipment_name}
        </Tag>
        <Text type="secondary">
          {warning.days_until_due < 0
            ? `${Math.abs(warning.days_until_due)}d overdue`
            : `${warning.days_until_due}d left`}
        </Text>
      </Space>
    );
  }

  return (
    <Card size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          <Text strong>{warning.equipment_name}</Text>
          <Tag color={riskConfig.tagColor}>{riskConfig.label}</Tag>
        </Space>
        <Text type={warning.days_until_due < 0 ? 'danger' : 'secondary'}>
          {warning.days_until_due < 0
            ? `${Math.abs(warning.days_until_due)} days overdue`
            : `${warning.days_until_due} days remaining`}
        </Text>
      </Space>
    </Card>
  );
};
