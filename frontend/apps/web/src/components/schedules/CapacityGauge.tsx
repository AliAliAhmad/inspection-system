import { Card, Progress, Typography, Space, Tooltip, Tag } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

export interface CapacityGaugeProps {
  utilization: number; // 0-1 or 0-100
  title?: string;
  showRecommendations?: boolean;
}

export function CapacityGauge({
  utilization,
  title,
  showRecommendations = true,
}: CapacityGaugeProps) {
  const { t } = useTranslation();

  // Normalize to 0-100 range
  const percentage = utilization > 1 ? utilization : utilization * 100;

  // Determine status and color
  const getStatus = () => {
    if (percentage < 70) return 'good';
    if (percentage < 90) return 'high';
    return 'overloaded';
  };

  const status = getStatus();

  const statusConfig = {
    good: {
      color: '#52c41a',
      strokeColor: '#52c41a',
      label: t('schedules.ai.goodCapacity', 'Good Capacity'),
      icon: <CheckCircleOutlined />,
      recommendations: [
        t('schedules.ai.rec.goodCapacity', 'Current utilization is optimal'),
        t('schedules.ai.rec.maintainBalance', 'Maintain balanced workload distribution'),
      ],
      bgColor: '#f6ffed',
      borderColor: '#b7eb8f',
    },
    high: {
      color: '#faad14',
      strokeColor: '#faad14',
      label: t('schedules.ai.highUtilization', 'High Utilization'),
      icon: <WarningOutlined />,
      recommendations: [
        t('schedules.ai.rec.monitorWorkload', 'Monitor workload closely'),
        t('schedules.ai.rec.prepareBackup', 'Prepare backup resources'),
        t('schedules.ai.rec.avoidNewTasks', 'Avoid scheduling non-critical tasks'),
      ],
      bgColor: '#fffbe6',
      borderColor: '#ffe58f',
    },
    overloaded: {
      color: '#ff4d4f',
      strokeColor: '#ff4d4f',
      label: t('schedules.ai.overloaded', 'Overloaded'),
      icon: <ExclamationCircleOutlined />,
      recommendations: [
        t('schedules.ai.rec.redistributeTasks', 'Redistribute tasks immediately'),
        t('schedules.ai.rec.addResources', 'Consider adding additional resources'),
        t('schedules.ai.rec.postponeNonCritical', 'Postpone non-critical inspections'),
        t('schedules.ai.rec.escalateManagement', 'Escalate to management'),
      ],
      bgColor: '#fff2f0',
      borderColor: '#ffccc7',
    },
  };

  const config = statusConfig[status];

  const tooltipContent = (
    <div>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
        {config.label}
      </div>
      <div style={{ fontSize: 12 }}>
        {percentage < 70 && t('schedules.ai.tooltip.good', 'System has available capacity for additional work')}
        {percentage >= 70 && percentage < 90 && t('schedules.ai.tooltip.high', 'Approaching maximum capacity - plan carefully')}
        {percentage >= 90 && t('schedules.ai.tooltip.overloaded', 'Operating at or above optimal capacity - immediate action required')}
      </div>
    </div>
  );

  return (
    <Card
      title={
        title && (
          <Space>
            {config.icon}
            <Title level={5} style={{ margin: 0 }}>
              {title}
            </Title>
          </Space>
        )
      }
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        borderWidth: 2,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <Tooltip title={tooltipContent}>
          <Progress
            type="circle"
            percent={Math.round(percentage)}
            strokeColor={config.strokeColor}
            strokeWidth={8}
            width={180}
            format={(percent) => (
              <div>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: config.color }}>
                  {percent}%
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {t('schedules.ai.utilization', 'Utilization')}
                </div>
              </div>
            )}
          />
        </Tooltip>

        <div style={{ marginTop: 16 }}>
          <Tag
            color={
              status === 'good'
                ? 'success'
                : status === 'high'
                ? 'warning'
                : 'error'
            }
            icon={config.icon}
            style={{ fontSize: 14, padding: '4px 12px' }}
          >
            {config.label}
          </Tag>
        </div>

        {showRecommendations && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderRadius: 8,
              textAlign: 'left',
            }}
          >
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              {t('schedules.ai.recommendations', 'Recommendations')}:
            </Text>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
              {config.recommendations.map((rec, idx) => (
                <li key={idx} style={{ marginBottom: 4 }}>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export default CapacityGauge;
