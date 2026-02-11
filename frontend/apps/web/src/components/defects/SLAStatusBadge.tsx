import React from 'react';
import { Tag, Tooltip } from 'antd';
import { ClockCircleOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { SLAStatus } from '@inspection/shared';

export interface SLAStatusBadgeProps {
  status: SLAStatus;
  hoursRemaining?: number;
  deadline?: string;
  showIcon?: boolean;
  size?: 'small' | 'default' | 'large';
}

const SLA_CONFIG: Record<SLAStatus, { color: string; bgClass: string; textClass: string }> = {
  on_track: { color: '#52c41a', bgClass: 'bg-green-50', textClass: 'text-green-600' },
  warning: { color: '#faad14', bgClass: 'bg-yellow-50', textClass: 'text-yellow-600' },
  at_risk: { color: '#fa8c16', bgClass: 'bg-orange-50', textClass: 'text-orange-600' },
  breached: { color: '#ff4d4f', bgClass: 'bg-red-50', textClass: 'text-red-600' },
  critical: { color: '#cf1322', bgClass: 'bg-red-100', textClass: 'text-red-800' },
};

export function SLAStatusBadge({
  status,
  hoursRemaining,
  deadline,
  showIcon = true,
  size = 'default',
}: SLAStatusBadgeProps) {
  const { t } = useTranslation();
  const config = SLA_CONFIG[status] || SLA_CONFIG.on_track;

  const formatTimeRemaining = (hours: number): string => {
    if (hours <= 0) {
      return t('defects.sla.breached', 'Breached');
    }
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return t('defects.sla.minutesRemaining', '{{count}}m left', { count: minutes });
    }
    if (hours < 24) {
      return t('defects.sla.hoursRemaining', '{{count}}h left', { count: Math.round(hours) });
    }
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    if (remainingHours === 0) {
      return t('defects.sla.daysRemaining', '{{count}}d left', { count: days });
    }
    return t('defects.sla.daysHoursRemaining', '{{days}}d {{hours}}h left', {
      days,
      hours: remainingHours,
    });
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case 'on_track':
        return t('defects.sla.onTrack', 'On Track');
      case 'warning':
        return t('defects.sla.warning', 'Warning');
      case 'at_risk':
        return t('defects.sla.atRisk', 'At Risk');
      case 'breached':
        return t('defects.sla.breached', 'Breached');
      case 'critical':
        return t('defects.sla.critical', 'Critical');
      default:
        return status;
    }
  };

  const getIcon = () => {
    if (!showIcon) return null;
    switch (status) {
      case 'on_track':
        return <ClockCircleOutlined />;
      case 'warning':
        return <ClockCircleOutlined />;
      case 'at_risk':
        return <WarningOutlined />;
      case 'breached':
      case 'critical':
        return <ExclamationCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
  };

  const displayText =
    hoursRemaining !== undefined
      ? formatTimeRemaining(hoursRemaining)
      : getStatusLabel();

  const tooltipContent = (
    <div>
      <div><strong>{t('defects.sla.status', 'Status')}:</strong> {getStatusLabel()}</div>
      {hoursRemaining !== undefined && (
        <div>
          <strong>{t('defects.sla.timeRemaining', 'Time Remaining')}:</strong>{' '}
          {formatTimeRemaining(hoursRemaining)}
        </div>
      )}
      {deadline && (
        <div>
          <strong>{t('defects.sla.deadline', 'Deadline')}:</strong>{' '}
          {new Date(deadline).toLocaleString()}
        </div>
      )}
    </div>
  );

  const fontSize = size === 'small' ? 11 : size === 'large' ? 14 : 12;
  const padding = size === 'small' ? '0 4px' : size === 'large' ? '4px 10px' : '2px 7px';

  return (
    <Tooltip title={tooltipContent}>
      <Tag
        icon={getIcon()}
        color={config.color}
        style={{
          fontSize,
          padding,
          margin: 0,
          fontWeight: 500,
        }}
        className={status === 'critical' ? 'animate-pulse' : ''}
      >
        {displayText}
      </Tag>
    </Tooltip>
  );
}

export default SLAStatusBadge;
