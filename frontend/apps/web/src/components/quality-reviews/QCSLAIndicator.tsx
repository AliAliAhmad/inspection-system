import { Tag, Tooltip, Space, Typography, Progress } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface SLAStatus {
  isCompliant: boolean;
  percentageUsed: number;
  timeRemaining?: string;
  deadline?: string;
  isOverdue?: boolean;
}

interface QCSLAIndicatorProps {
  status: SLAStatus | null;
  complianceRate?: number;
  showProgress?: boolean;
  size?: 'small' | 'default' | 'large';
  variant?: 'badge' | 'tag' | 'inline';
}

/**
 * QCSLAIndicator - SLA compliance indicator badge
 *
 * Displays SLA status with visual indicators:
 * - Green: On track / Compliant
 * - Yellow: Warning (>70% time used)
 * - Red: Overdue / Non-compliant
 */
export function QCSLAIndicator({
  status,
  complianceRate,
  showProgress = false,
  size = 'default',
  variant = 'tag',
}: QCSLAIndicatorProps) {
  const { t } = useTranslation();

  // If no status provided, show compliance rate badge
  if (!status && complianceRate !== undefined) {
    const color = complianceRate >= 90 ? 'green' : complianceRate >= 70 ? 'gold' : 'red';
    const icon = complianceRate >= 90 ? <CheckCircleOutlined /> :
                 complianceRate >= 70 ? <ClockCircleOutlined /> :
                 <ExclamationCircleOutlined />;

    if (variant === 'inline') {
      return (
        <Space size={4}>
          {icon}
          <Text style={{ color: color === 'gold' ? '#faad14' : color === 'green' ? '#52c41a' : '#f5222d' }}>
            {complianceRate.toFixed(0)}%
          </Text>
          <Text type="secondary" style={{ fontSize: size === 'small' ? 11 : 12 }}>
            {t('qc.sla_compliance', 'SLA Compliance')}
          </Text>
        </Space>
      );
    }

    return (
      <Tooltip title={t('qc.sla_compliance_tooltip', 'SLA Compliance Rate: {{rate}}%', { rate: complianceRate.toFixed(1) })}>
        <Tag
          color={color}
          icon={icon}
          style={{
            fontSize: size === 'small' ? 11 : size === 'large' ? 14 : 12,
            padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
          }}
        >
          {complianceRate.toFixed(0)}% {t('qc.sla', 'SLA')}
        </Tag>
      </Tooltip>
    );
  }

  // No status available
  if (!status) {
    return (
      <Tag color="default" icon={<ClockCircleOutlined />}>
        {t('qc.sla_na', 'N/A')}
      </Tag>
    );
  }

  // Determine status color and icon
  const getStatusConfig = () => {
    if (status.isOverdue) {
      return {
        color: 'red' as const,
        icon: <ExclamationCircleOutlined />,
        label: t('qc.sla_overdue', 'Overdue'),
        strokeColor: '#f5222d',
      };
    }
    if (status.percentageUsed >= 90) {
      return {
        color: 'red' as const,
        icon: <WarningOutlined />,
        label: t('qc.sla_critical', 'Critical'),
        strokeColor: '#f5222d',
      };
    }
    if (status.percentageUsed >= 70) {
      return {
        color: 'gold' as const,
        icon: <ClockCircleOutlined />,
        label: t('qc.sla_warning', 'Warning'),
        strokeColor: '#faad14',
      };
    }
    if (status.isCompliant) {
      return {
        color: 'green' as const,
        icon: <CheckCircleOutlined />,
        label: t('qc.sla_on_track', 'On Track'),
        strokeColor: '#52c41a',
      };
    }
    return {
      color: 'blue' as const,
      icon: <ClockCircleOutlined />,
      label: t('qc.sla_pending', 'Pending'),
      strokeColor: '#1890ff',
    };
  };

  const config = getStatusConfig();

  const tooltipContent = (
    <div>
      <div>{config.label}</div>
      {status.timeRemaining && (
        <div>{t('qc.time_remaining', 'Time remaining')}: {status.timeRemaining}</div>
      )}
      {status.deadline && (
        <div>{t('qc.deadline', 'Deadline')}: {new Date(status.deadline).toLocaleString()}</div>
      )}
      <div>{t('qc.time_used', 'Time used')}: {status.percentageUsed.toFixed(0)}%</div>
    </div>
  );

  if (variant === 'badge') {
    return (
      <Tooltip title={tooltipContent}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size === 'small' ? 24 : size === 'large' ? 40 : 32,
            height: size === 'small' ? 24 : size === 'large' ? 40 : 32,
            borderRadius: '50%',
            backgroundColor: config.strokeColor + '20',
            color: config.strokeColor,
            fontSize: size === 'small' ? 12 : size === 'large' ? 20 : 16,
          }}
        >
          {config.icon}
        </div>
      </Tooltip>
    );
  }

  if (variant === 'inline') {
    return (
      <Tooltip title={tooltipContent}>
        <Space size={4}>
          <span style={{ color: config.strokeColor }}>{config.icon}</span>
          <Text style={{ color: config.strokeColor, fontSize: size === 'small' ? 11 : 12 }}>
            {config.label}
          </Text>
          {showProgress && (
            <Progress
              percent={Math.min(status.percentageUsed, 100)}
              size="small"
              showInfo={false}
              strokeColor={config.strokeColor}
              style={{ width: 60 }}
            />
          )}
          {status.timeRemaining && (
            <Text type="secondary" style={{ fontSize: size === 'small' ? 10 : 11 }}>
              ({status.timeRemaining})
            </Text>
          )}
        </Space>
      </Tooltip>
    );
  }

  // Default: tag variant
  return (
    <Tooltip title={tooltipContent}>
      <Tag
        color={config.color}
        icon={config.icon}
        style={{
          fontSize: size === 'small' ? 11 : size === 'large' ? 14 : 12,
          padding: size === 'small' ? '0 4px' : size === 'large' ? '4px 12px' : '2px 8px',
        }}
      >
        {config.label}
        {showProgress && ` (${status.percentageUsed.toFixed(0)}%)`}
      </Tag>
    </Tooltip>
  );
}

/**
 * Utility function to calculate SLA status from deadline
 */
export function calculateSLAStatus(deadline: string | null, completedAt?: string | null): SLAStatus | null {
  if (!deadline) return null;

  const deadlineDate = new Date(deadline);
  const now = completedAt ? new Date(completedAt) : new Date();
  const createdAt = new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000); // Assume 24h SLA if not provided

  const totalTime = deadlineDate.getTime() - createdAt.getTime();
  const elapsedTime = now.getTime() - createdAt.getTime();
  const percentageUsed = (elapsedTime / totalTime) * 100;
  const isOverdue = now > deadlineDate;
  const isCompliant = completedAt ? new Date(completedAt) <= deadlineDate : !isOverdue;

  // Calculate time remaining
  let timeRemaining: string | undefined;
  if (!isOverdue) {
    const remaining = deadlineDate.getTime() - now.getTime();
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    timeRemaining = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  return {
    isCompliant,
    percentageUsed: Math.max(0, Math.min(percentageUsed, 100)),
    timeRemaining,
    deadline,
    isOverdue,
  };
}

export default QCSLAIndicator;
