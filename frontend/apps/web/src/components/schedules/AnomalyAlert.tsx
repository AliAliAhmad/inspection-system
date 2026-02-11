import { Alert, Space, Typography, Button } from 'antd';
import {
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ScheduleAIAnomaly } from '@inspection/shared';

const { Text } = Typography;

export interface AnomalyAlertProps {
  anomaly: ScheduleAIAnomaly;
  onDismiss?: () => void;
  onViewDetails?: () => void;
}

const SEVERITY_CONFIG = {
  critical: {
    type: 'error' as const,
    icon: <ThunderboltOutlined />,
  },
  high: {
    type: 'error' as const,
    icon: <ExclamationCircleOutlined />,
  },
  medium: {
    type: 'warning' as const,
    icon: <WarningOutlined />,
  },
  low: {
    type: 'info' as const,
    icon: <InfoCircleOutlined />,
  },
};

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  frequency_spike: 'Frequency Spike',
  quality_drop: 'Quality Drop',
  capacity_issue: 'Capacity Issue',
  pattern_change: 'Pattern Change',
};

export function AnomalyAlert({ anomaly, onDismiss, onViewDetails }: AnomalyAlertProps) {
  const { t } = useTranslation();

  const config = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.low;

  const message = (
    <Space>
      <Text strong style={{ textTransform: 'uppercase' }}>
        [{anomaly.severity}]
      </Text>
      <Text strong>
        {ANOMALY_TYPE_LABELS[anomaly.type] || anomaly.type}
      </Text>
    </Space>
  );

  const description = (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Text>{anomaly.description}</Text>
      </div>

      {anomaly.affected_items && anomaly.affected_items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 12 }}>
            {t('schedules.ai.affectedItems', 'Affected Items')}:
          </Text>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {anomaly.affected_items.slice(0, 5).map((item, idx) => (
              <div key={idx}>• {item}</div>
            ))}
            {anomaly.affected_items.length > 5 && (
              <div style={{ color: '#666', fontStyle: 'italic', marginTop: 4 }}>
                ...and {anomaly.affected_items.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {anomaly.recommendation && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            backgroundColor: 'rgba(255,255,255,0.5)',
            borderRadius: 4,
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          <Text strong style={{ fontSize: 12 }}>
            {t('schedules.ai.recommendation', 'Recommendation')}:
          </Text>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            {anomaly.recommendation}
          </div>
        </div>
      )}

      {anomaly.detected_at && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {t('schedules.ai.detectedAt', 'Detected at')}:{' '}
            {new Date(anomaly.detected_at).toLocaleString()}
          </Text>
        </div>
      )}

      {/* Action Buttons */}
      {(onViewDetails || onDismiss) && (
        <div style={{ marginTop: 12 }}>
          <Space>
            {onViewDetails && (
              <Button type="link" size="small" onClick={onViewDetails} style={{ padding: 0 }}>
                {t('schedules.ai.viewDetails', 'View Details')}
              </Button>
            )}
            {onDismiss && (
              <Button
                type="link"
                size="small"
                onClick={onDismiss}
                icon={<CloseCircleOutlined />}
                style={{ padding: 0, color: '#666' }}
              >
                {t('schedules.ai.dismiss', 'Dismiss')}
              </Button>
            )}
          </Space>
        </div>
      )}
    </div>
  );

  return (
    <Alert
      type={config.type}
      message={message}
      description={description}
      icon={config.icon}
      showIcon
      closable={!!onDismiss}
      onClose={onDismiss}
      style={{ marginBottom: 16 }}
    />
  );
}

export default AnomalyAlert;
