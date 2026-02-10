/**
 * AnomalyAlert - Reusable component for displaying detected anomalies
 */

import { Alert, List, Space, Typography, Tag, Collapse, Badge } from 'antd';
import { WarningOutlined, AlertOutlined, InfoCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Anomaly, AnomalyResult, Severity } from '@inspection/shared/src/types/ai-base.types';
import { SeverityBadge } from './SeverityBadge';

const { Text } = Typography;
const { Panel } = Collapse;

interface AnomalyAlertProps {
  anomalies: Anomaly[] | AnomalyResult;
  compact?: boolean;
  showDetails?: boolean;
  maxItems?: number;
  style?: React.CSSProperties;
}

const SEVERITY_ICONS: Record<Severity, React.ReactNode> = {
  critical: <WarningOutlined style={{ color: '#ff4d4f' }} />,
  high: <ExclamationCircleOutlined style={{ color: '#ff7a45' }} />,
  medium: <AlertOutlined style={{ color: '#faad14' }} />,
  low: <InfoCircleOutlined style={{ color: '#52c41a' }} />,
};

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function AnomalyAlert({
  anomalies: anomaliesData,
  compact = false,
  showDetails = true,
  maxItems,
  style,
}: AnomalyAlertProps) {
  const { t } = useTranslation();

  // Handle both Anomaly[] and AnomalyResult formats
  const anomalies: Anomaly[] = Array.isArray(anomaliesData)
    ? anomaliesData
    : anomaliesData.anomalies || [];

  const maxSeverity: Severity = Array.isArray(anomaliesData)
    ? anomalies.reduce<Severity>(
        (max, a) =>
          SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[max] ? a.severity : max,
        'low'
      )
    : (anomaliesData.max_severity as Severity) || 'low';

  if (anomalies.length === 0) {
    return null;
  }

  // Sort by severity
  const sortedAnomalies = [...anomalies].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const displayAnomalies = maxItems ? sortedAnomalies.slice(0, maxItems) : sortedAnomalies;

  const alertType =
    maxSeverity === 'critical' ? 'error' :
    maxSeverity === 'high' ? 'warning' : 'info';

  const alertMessage = t('ai.anomalies_detected', '{{count}} Anomaly Detected', {
    count: anomalies.length,
  });

  if (compact) {
    return (
      <Alert
        message={alertMessage}
        type={alertType}
        showIcon
        icon={SEVERITY_ICONS[maxSeverity]}
        style={style}
      />
    );
  }

  return (
    <Alert
      message={
        <Space>
          {alertMessage}
          <Badge
            count={maxSeverity.toUpperCase()}
            style={{
              backgroundColor:
                maxSeverity === 'critical' ? '#ff4d4f' :
                maxSeverity === 'high' ? '#ff7a45' :
                maxSeverity === 'medium' ? '#faad14' : '#52c41a',
            }}
          />
        </Space>
      }
      description={
        showDetails ? (
          <List
            size="small"
            dataSource={displayAnomalies}
            renderItem={(anomaly) => (
              <List.Item style={{ padding: '8px 0' }}>
                <Space align="start">
                  {SEVERITY_ICONS[anomaly.severity]}
                  <div>
                    <Space>
                      <SeverityBadge severity={anomaly.severity} size="small" />
                      <Tag>{anomaly.type}</Tag>
                    </Space>
                    <br />
                    <Text>{anomaly.description}</Text>
                    {anomaly.baseline !== undefined && (
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        Baseline: {anomaly.baseline}
                      </Text>
                    )}
                  </div>
                </Space>
              </List.Item>
            )}
            footer={
              maxItems && sortedAnomalies.length > maxItems ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  +{sortedAnomalies.length - maxItems} more anomalies
                </Text>
              ) : undefined
            }
          />
        ) : undefined
      }
      type={alertType}
      showIcon
      icon={<WarningOutlined />}
      style={style}
    />
  );
}

export default AnomalyAlert;
