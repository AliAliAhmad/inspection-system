import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Spin,
  Empty,
  Tag,
  List,
  Alert,
  Collapse,
  Badge,
  Segmented,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  reportsAIApi,
  type ReportsAnomalyResult,
  type ReportAnomaly,
} from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

export interface AnomalyAlertsPanelProps {
  compact?: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
    icon: <ThunderboltOutlined />,
    tagColor: 'error',
  },
  high: {
    color: '#fa8c16',
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    icon: <ExclamationCircleOutlined />,
    tagColor: 'warning',
  },
  medium: {
    color: '#faad14',
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    icon: <WarningOutlined />,
    tagColor: 'gold',
  },
  low: {
    color: '#1677ff',
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    icon: <InfoCircleOutlined />,
    tagColor: 'processing',
  },
};

type LookbackPeriod = 7 | 14 | 30;

export function AnomalyAlertsPanel({ compact = false }: AnomalyAlertsPanelProps) {
  const { t } = useTranslation();
  const [lookbackDays, setLookbackDays] = useState<LookbackPeriod>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports-ai', 'anomalies', lookbackDays],
    queryFn: () => reportsAIApi.detectAnomalies(lookbackDays),
  });

  const anomalyResult: ReportsAnomalyResult | null = data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message={t('reports.ai.error', 'Failed to load anomaly data')}
        showIcon
      />
    );
  }

  if (!anomalyResult) {
    return (
      <Card
        title={
          <Space>
            <AlertOutlined style={{ color: '#faad14' }} />
            {t('reports.ai.anomalyAlerts', 'Anomaly Alerts')}
          </Space>
        }
      >
        <Empty description={t('reports.ai.noAnomalies', 'No anomaly data available')} />
      </Card>
    );
  }

  const { anomalies, max_severity, total_severity_score, status } = anomalyResult;

  // Group anomalies by severity
  const groupedAnomalies = anomalies.reduce<Record<string, ReportAnomaly[]>>((acc, anomaly) => {
    if (!acc[anomaly.severity]) {
      acc[anomaly.severity] = [];
    }
    acc[anomaly.severity].push(anomaly);
    return acc;
  }, {});

  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const sortedGroups = severityOrder.filter((s) => groupedAnomalies[s]?.length > 0);

  if (compact) {
    const criticalCount = groupedAnomalies['critical']?.length || 0;
    const highCount = groupedAnomalies['high']?.length || 0;
    const totalAnomalies = anomalies.length;

    if (totalAnomalies === 0) {
      return (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message={t('reports.ai.noAnomaliesDetected', 'No anomalies detected')}
          description={t('reports.ai.systemNormal', 'All metrics are within normal ranges')}
          showIcon
        />
      );
    }

    return (
      <Alert
        type={criticalCount > 0 ? 'error' : highCount > 0 ? 'warning' : 'info'}
        icon={SEVERITY_CONFIG[max_severity as keyof typeof SEVERITY_CONFIG]?.icon}
        message={
          <Space>
            <Text strong>
              {totalAnomalies} {t('reports.ai.anomaliesDetected', 'anomalies detected')}
            </Text>
            {criticalCount > 0 && <Tag color="error">{criticalCount} Critical</Tag>}
            {highCount > 0 && <Tag color="warning">{highCount} High</Tag>}
          </Space>
        }
        description={anomalies[0]?.description}
        showIcon
      />
    );
  }

  return (
    <Card
      title={
        <Space>
          <AlertOutlined style={{ color: '#faad14' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('reports.ai.anomalyAlerts', 'Anomaly Alerts')}
          </Title>
          {anomalies.length > 0 && (
            <Badge count={anomalies.length} style={{ marginLeft: 8 }} />
          )}
        </Space>
      }
      extra={
        <Segmented
          value={lookbackDays}
          onChange={(val) => setLookbackDays(val as LookbackPeriod)}
          options={[
            { label: t('reports.ai.7days', '7 Days'), value: 7 },
            { label: t('reports.ai.14days', '14 Days'), value: 14 },
            { label: t('reports.ai.30days', '30 Days'), value: 30 },
          ]}
          size="small"
        />
      }
    >
      {/* Status Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{
              backgroundColor:
                anomalies.length === 0
                  ? '#f6ffed'
                  : SEVERITY_CONFIG[max_severity as keyof typeof SEVERITY_CONFIG]?.bgColor,
              borderColor:
                anomalies.length === 0
                  ? '#b7eb8f'
                  : SEVERITY_CONFIG[max_severity as keyof typeof SEVERITY_CONFIG]?.borderColor,
            }}
          >
            <Statistic
              title={t('reports.ai.status', 'Status')}
              value={status}
              valueStyle={{
                color:
                  anomalies.length === 0
                    ? '#52c41a'
                    : SEVERITY_CONFIG[max_severity as keyof typeof SEVERITY_CONFIG]?.color,
                textTransform: 'capitalize',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('reports.ai.totalAnomalies', 'Total Anomalies')}
              value={anomalies.length}
              valueStyle={{
                color: anomalies.length > 0 ? '#faad14' : '#52c41a',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('reports.ai.severityScore', 'Severity Score')}
              value={total_severity_score}
              valueStyle={{
                color:
                  total_severity_score > 10
                    ? '#ff4d4f'
                    : total_severity_score > 5
                    ? '#faad14'
                    : '#52c41a',
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* No Anomalies State */}
      {anomalies.length === 0 && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message={t('reports.ai.allClear', 'All Clear')}
          description={t(
            'reports.ai.noAnomaliesDescription',
            'No anomalies have been detected in the past {days} days. All metrics are within expected ranges.',
            { days: lookbackDays }
          )}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Anomaly Groups */}
      {sortedGroups.length > 0 && (
        <Collapse
          defaultActiveKey={sortedGroups.slice(0, 2)}
          style={{ backgroundColor: 'transparent' }}
        >
          {sortedGroups.map((severity) => {
            const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];
            const severityAnomalies = groupedAnomalies[severity];

            return (
              <Panel
                key={severity}
                header={
                  <Space>
                    <span style={{ color: config.color }}>{config.icon}</span>
                    <Text strong style={{ textTransform: 'capitalize' }}>
                      {severity}
                    </Text>
                    <Badge count={severityAnomalies.length} style={{ backgroundColor: config.color }} />
                  </Space>
                }
                style={{
                  marginBottom: 8,
                  backgroundColor: config.bgColor,
                  borderColor: config.borderColor,
                  borderRadius: 8,
                }}
              >
                <List
                  dataSource={severityAnomalies}
                  renderItem={(anomaly) => (
                    <List.Item
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        borderRadius: 8,
                        marginBottom: 8,
                        border: `1px solid ${config.borderColor}`,
                      }}
                    >
                      <div style={{ width: '100%' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 8,
                          }}
                        >
                          <Space>
                            <Tag color={config.tagColor}>{anomaly.type}</Tag>
                            <Text strong>{anomaly.description}</Text>
                          </Space>
                        </div>

                        <Row gutter={16}>
                          <Col span={12}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {t('reports.ai.currentValue', 'Current Value')}:
                            </Text>
                            <Text
                              strong
                              style={{
                                marginLeft: 8,
                                color: config.color,
                              }}
                            >
                              {typeof anomaly.value === 'number'
                                ? anomaly.value.toFixed(2)
                                : anomaly.value}
                            </Text>
                          </Col>
                          {anomaly.baseline !== undefined && (
                            <Col span={12}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {t('reports.ai.baseline', 'Baseline')}:
                              </Text>
                              <Text style={{ marginLeft: 8 }}>
                                {typeof anomaly.baseline === 'number'
                                  ? anomaly.baseline.toFixed(2)
                                  : anomaly.baseline}
                              </Text>
                            </Col>
                          )}
                        </Row>

                        {/* Additional Metadata */}
                        {Object.keys(anomaly.metadata).length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <Space wrap>
                              {Object.entries(anomaly.metadata).map(([key, value]) => (
                                <Tag key={key} style={{ fontSize: 11 }}>
                                  {key}: {String(value)}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              </Panel>
            );
          })}
        </Collapse>
      )}
    </Card>
  );
}

export default AnomalyAlertsPanel;
