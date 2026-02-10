import { Progress, Tooltip, Space, Typography, Tag } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export type WorkloadStatus = 'balanced' | 'overloaded' | 'underutilized';

export interface WorkloadBarProps {
  scheduledHours: number;
  standardHours?: number; // Default 40 for weekly
  overtimeHours?: number;
  showLabel?: boolean;
  showStatus?: boolean;
  size?: 'small' | 'default';
}

export function WorkloadBar({
  scheduledHours,
  standardHours = 40,
  overtimeHours = 0,
  showLabel = true,
  showStatus = true,
  size = 'default',
}: WorkloadBarProps) {
  const { t } = useTranslation();

  const utilization = Math.round((scheduledHours / standardHours) * 100);

  const getStatus = (): WorkloadStatus => {
    if (utilization > 110) return 'overloaded';
    if (utilization < 50) return 'underutilized';
    return 'balanced';
  };

  const status = getStatus();

  const getColor = () => {
    switch (status) {
      case 'overloaded':
        return '#ff4d4f';
      case 'underutilized':
        return '#faad14';
      default:
        return '#52c41a';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'overloaded':
        return t('roster.overloaded', 'Overloaded');
      case 'underutilized':
        return t('roster.underutilized', 'Underutilized');
      default:
        return t('roster.balanced', 'Balanced');
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'overloaded':
        return 'red';
      case 'underutilized':
        return 'orange';
      default:
        return 'green';
    }
  };

  return (
    <Tooltip
      title={
        <Space direction="vertical" size={2}>
          <Text style={{ color: 'white' }}>
            {t('roster.scheduledHours', 'Scheduled')}: {scheduledHours}h / {standardHours}h
          </Text>
          {overtimeHours > 0 && (
            <Text style={{ color: '#ff7875' }}>
              {t('roster.overtimeHours', 'Overtime')}: +{overtimeHours}h
            </Text>
          )}
          <Text style={{ color: 'white' }}>
            {t('workPlan.utilization', 'Utilization')}: {utilization}%
          </Text>
        </Space>
      }
    >
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {showLabel && (
          <Space size={4} style={{ justifyContent: 'space-between', width: '100%' }}>
            <Text style={{ fontSize: size === 'small' ? 11 : 13 }}>
              {scheduledHours}h
            </Text>
            {showStatus && (
              <Tag
                color={getStatusColor()}
                style={{ fontSize: size === 'small' ? 10 : 11, margin: 0 }}
              >
                {getStatusLabel()}
              </Tag>
            )}
          </Space>
        )}
        <Progress
          percent={Math.min(utilization, 150)}
          size={size === 'small' ? 'small' : 'default'}
          strokeColor={getColor()}
          trailColor="#f0f0f0"
          showInfo={false}
          style={{ margin: 0 }}
        />
        {overtimeHours > 0 && (
          <Space size={4}>
            <ThunderboltOutlined style={{ color: '#ff4d4f', fontSize: size === 'small' ? 10 : 12 }} />
            <Text type="danger" style={{ fontSize: size === 'small' ? 10 : 11 }}>
              +{overtimeHours}h {t('roster.overtimeHours', 'OT')}
            </Text>
          </Space>
        )}
      </Space>
    </Tooltip>
  );
}

export function getWorkloadStatus(scheduledHours: number, standardHours = 40): WorkloadStatus {
  const utilization = (scheduledHours / standardHours) * 100;
  if (utilization > 110) return 'overloaded';
  if (utilization < 50) return 'underutilized';
  return 'balanced';
}
