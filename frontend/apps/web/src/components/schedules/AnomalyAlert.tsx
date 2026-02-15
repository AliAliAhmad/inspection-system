import React from 'react';
import {
  Alert,
  Card,
  List,
  Tag,
  Typography,
  Space,
  Button,
  Spin,
  Empty,
  Badge,
  Collapse,
  Tooltip,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { ScheduleAnomaly as ScheduleAIAnomaly } from '@inspection/shared';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  RobotOutlined,
  SyncOutlined,
  LineChartOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const getSeverityConfig = (severity: string) => {
  switch (severity) {
    case 'critical':
      return {
        color: '#cf1322',
        tagColor: 'red',
        alertType: 'error' as const,
        icon: <CloseCircleOutlined />,
      };
    case 'high':
      return {
        color: '#fa541c',
        tagColor: 'volcano',
        alertType: 'warning' as const,
        icon: <ExclamationCircleOutlined />,
      };
    case 'medium':
      return {
        color: '#faad14',
        tagColor: 'orange',
        alertType: 'warning' as const,
        icon: <WarningOutlined />,
      };
    case 'low':
      return {
        color: '#1890ff',
        tagColor: 'blue',
        alertType: 'info' as const,
        icon: <InfoCircleOutlined />,
      };
    default:
      return {
        color: '#8c8c8c',
        tagColor: 'default',
        alertType: 'info' as const,
        icon: <InfoCircleOutlined />,
      };
  }
};

const getTypeIcon = (type: ScheduleAIAnomaly['type']) => {
  switch (type) {
    case 'frequency_spike':
      return <ThunderboltOutlined />;
    case 'quality_drop':
      return <ExclamationCircleOutlined />;
    case 'capacity_issue':
      return <SyncOutlined />;
    case 'pattern_change':
      return <LineChartOutlined />;
    default:
      return <WarningOutlined />;
  }
};

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'frequency_spike':
      return 'Frequency Spike';
    case 'quality_drop':
      return 'Quality Drop';
    case 'capacity_issue':
      return 'Capacity Issue';
    case 'pattern_change':
      return 'Pattern Change';
    default:
      return type;
  }
};

interface AnomalyAlertProps {
  onInvestigate?: (anomaly: ScheduleAIAnomaly) => void;
  showBanner?: boolean;
  maxItems?: number;
  days?: number;
}

export const AnomalyAlert: React.FC<AnomalyAlertProps> = ({
  onInvestigate,
  showBanner = true,
  maxItems = 10,
  days = 30,
}) => {
  const {
    data: anomalyData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'anomalies', days],
    queryFn: () => scheduleAIApi.detectAnomalies(days),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span>AI Anomaly Detection</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Scanning for anomalies...</Text>
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
            <ThunderboltOutlined />
            <span>AI Anomaly Detection</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load anomaly data"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const anomalies: ScheduleAIAnomaly[] = (anomalyData || []).slice(0, maxItems);
  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const totalAnomalies = anomalyData?.length || 0;

  return (
    <>
      {showBanner && criticalCount > 0 && (
        <Alert
          type="error"
          message={
            <Space>
              <ExclamationCircleOutlined />
              <Text strong>
                {criticalCount} Critical Anomal{criticalCount > 1 ? 'ies' : 'y'} Detected
              </Text>
            </Space>
          }
          description="Immediate attention required. Critical anomalies may indicate equipment failure risk or scheduling conflicts."
          showIcon={false}
          banner
          closable
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title={
          <Space>
            <ThunderboltOutlined
              style={{ color: criticalCount > 0 ? '#cf1322' : '#1890ff' }}
            />
            <span>AI Anomaly Detection</span>
            <Badge
              count={totalAnomalies}
              style={{
                backgroundColor: criticalCount > 0 ? '#cf1322' : '#1890ff',
              }}
            />
          </Space>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            <RobotOutlined /> Powered by AI
          </Text>
        }
      >
        {anomalies.length === 0 ? (
          <Empty
            description="No anomalies detected"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Collapse
            accordion
            ghost
            expandIconPosition="end"
            items={anomalies.map((anomaly, index) => {
              const severityConfig = getSeverityConfig(anomaly.severity);
              return {
                key: index,
                label: (
                  <Space style={{ width: '100%' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        backgroundColor: severityConfig.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                      }}
                    >
                      {getTypeIcon(anomaly.type)}
                    </div>
                    <Space direction="vertical" size={0}>
                      <Space>
                        <Text strong>{getTypeLabel(anomaly.type)}</Text>
                      </Space>
                      <Space size={4}>
                        <Tag color={severityConfig.tagColor}>
                          {anomaly.severity.toUpperCase()}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(anomaly.detected_at).toLocaleDateString()}
                        </Text>
                      </Space>
                    </Space>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={16}>
                    <Paragraph type="secondary">{anomaly.description}</Paragraph>

                    {anomaly.affected_items && anomaly.affected_items.length > 0 && (
                      <div>
                        <Text strong>Affected Items:</Text>
                        <div style={{ marginTop: 8 }}>
                          {anomaly.affected_items.map((item, idx) => (
                            <Tag key={idx} style={{ marginBottom: 4 }}>{item}</Tag>
                          ))}
                        </div>
                      </div>
                    )}

                    {anomaly.recommendation && (
                      <Alert
                        type="info"
                        message="Recommended Action"
                        description={anomaly.recommendation}
                        showIcon
                        icon={<BulbOutlined />}
                      />
                    )}

                    {onInvestigate && (
                      <Button
                        type="primary"
                        icon={<EyeOutlined />}
                        onClick={() => onInvestigate(anomaly)}
                      >
                        Investigate
                      </Button>
                    )}
                  </Space>
                ),
              };
            })}
          />
        )}

        {totalAnomalies > maxItems && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Text type="secondary">
              Showing {maxItems} of {totalAnomalies} anomalies
            </Text>
          </div>
        )}
      </Card>
    </>
  );
};

// Compact banner for top of page
export const AnomalyBanner: React.FC<{
  onViewAll?: () => void;
  days?: number;
}> = ({ onViewAll, days = 7 }) => {
  const { data: anomalyData } = useQuery({
    queryKey: ['schedule-ai', 'anomalies', days],
    queryFn: () => scheduleAIApi.detectAnomalies(days),
  });

  const criticalAnomalies = (anomalyData || []).filter(
    (a: ScheduleAIAnomaly) => a.severity === 'critical'
  );

  if (criticalAnomalies.length === 0) {
    return null;
  }

  return (
    <Alert
      type="error"
      message={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <ThunderboltOutlined />
            <Text strong>
              {criticalAnomalies.length} Critical Anomal
              {criticalAnomalies.length > 1 ? 'ies' : 'y'} Detected
            </Text>
          </Space>
          {onViewAll && (
            <Button size="small" type="link" onClick={onViewAll}>
              View All
            </Button>
          )}
        </Space>
      }
      banner
    />
  );
};
