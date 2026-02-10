import { useState } from 'react';
import {
  Card,
  List,
  Tag,
  Space,
  Typography,
  Badge,
  Button,
  Empty,
  Collapse,
  Statistic,
  Row,
  Col,
  Spin,
  Alert,
  Tooltip,
} from 'antd';
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  AlertOutlined,
  RobotOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi } from '@inspection/shared';
import type { AIAllAnomaliesResult, AIAnomaly } from '@inspection/shared/src/api/equipment.api';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface EquipmentAnomaliesProps {
  onViewEquipment?: (equipmentId: number) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export default function EquipmentAnomaliesPanel({
  onViewEquipment,
  collapsible = true,
  defaultCollapsed = false,
}: EquipmentAnomaliesProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const {
    data: anomaliesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['equipment', 'ai', 'all-anomalies'],
    queryFn: async () => {
      const res = await equipmentApi.getAIAllAnomalies();
      return res.data?.data as AIAllAnomaliesResult;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'gold';
      case 'low': return 'green';
      default: return 'blue';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
      case 'high':
        return <WarningOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
      case 'medium':
        return <AlertOutlined style={{ color: '#faad14', fontSize: 18 }} />;
      case 'low':
        return <InfoCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
      default:
        return <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />;
    }
  };

  const getSeverityPriority = (severity: string) => {
    switch (severity) {
      case 'critical': return 0;
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      default: return 4;
    }
  };

  // Sort anomalies by severity
  const sortedAnomalies = anomaliesData?.anomalies
    ?.slice()
    .sort((a, b) => getSeverityPriority(a.severity) - getSeverityPriority(b.severity)) ?? [];

  // Group by severity for summary
  const bySeverity = anomaliesData?.by_severity ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const totalAnomalies = anomaliesData?.count ?? 0;

  const cardTitle = (
    <Space>
      <RobotOutlined />
      <span>{t('equipment.anomalyDetection', 'AI Anomaly Detection')}</span>
      {totalAnomalies > 0 && (
        <Badge
          count={totalAnomalies}
          style={{ backgroundColor: bySeverity.critical > 0 ? '#ff4d4f' : bySeverity.high > 0 ? '#fa8c16' : '#faad14' }}
        />
      )}
    </Space>
  );

  const cardExtra = (
    <Space>
      <Tooltip title={t('common.refresh', 'Refresh')}>
        <Button
          type="text"
          icon={<ReloadOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            refetch();
          }}
          loading={isLoading}
          size="small"
        />
      </Tooltip>
      {collapsible && (
        <Button
          type="text"
          icon={<RightOutlined style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }} />}
          onClick={() => setCollapsed(!collapsed)}
          size="small"
        />
      )}
    </Space>
  );

  const content = (
    <>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">{t('equipment.analyzingFleet', 'Analyzing fleet for anomalies...')}</Text>
          </div>
        </div>
      ) : isError ? (
        <Alert
          type="error"
          message={t('equipment.anomalyLoadError', 'Failed to load anomaly data')}
          description={(error as any)?.message}
          showIcon
        />
      ) : totalAnomalies === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={4}>
              <Text strong style={{ color: '#52c41a' }}>
                {t('equipment.noAnomalies', 'No Anomalies Detected')}
              </Text>
              <Text type="secondary">
                {t('equipment.allEquipmentNormal', 'All equipment is operating within normal parameters')}
              </Text>
            </Space>
          }
        />
      ) : (
        <>
          {/* Summary Statistics */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card size="small" style={{ background: '#fff2f0', borderColor: '#ffccc7' }}>
                <Statistic
                  title={<Text type="danger">{t('equipment.critical', 'Critical')}</Text>}
                  value={bySeverity.critical}
                  valueStyle={{ color: '#ff4d4f', fontSize: 24 }}
                  prefix={<ExclamationCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ background: '#fff7e6', borderColor: '#ffd591' }}>
                <Statistic
                  title={<Text style={{ color: '#fa8c16' }}>{t('equipment.high', 'High')}</Text>}
                  value={bySeverity.high}
                  valueStyle={{ color: '#fa8c16', fontSize: 24 }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
                <Statistic
                  title={<Text style={{ color: '#faad14' }}>{t('equipment.medium', 'Medium')}</Text>}
                  value={bySeverity.medium}
                  valueStyle={{ color: '#faad14', fontSize: 24 }}
                  prefix={<AlertOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Statistic
                  title={<Text style={{ color: '#52c41a' }}>{t('equipment.low', 'Low')}</Text>}
                  value={bySeverity.low}
                  valueStyle={{ color: '#52c41a', fontSize: 24 }}
                  prefix={<InfoCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* Anomalies List */}
          <List
            size="small"
            dataSource={sortedAnomalies}
            renderItem={(anomaly: AIAnomaly & { equipment_id: number; equipment_name: string }) => (
              <List.Item
                style={{
                  cursor: onViewEquipment ? 'pointer' : 'default',
                  background: anomaly.severity === 'critical' ? '#fff1f0' :
                              anomaly.severity === 'high' ? '#fff7e6' : undefined,
                  borderRadius: 4,
                  marginBottom: 4,
                  padding: '8px 12px',
                }}
                onClick={() => onViewEquipment?.(anomaly.equipment_id)}
              >
                <List.Item.Meta
                  avatar={getSeverityIcon(anomaly.severity)}
                  title={
                    <Space>
                      <Text strong>{anomaly.equipment_name}</Text>
                      <Tag color={getSeverityColor(anomaly.severity)}>
                        {anomaly.severity.toUpperCase()}
                      </Tag>
                      <Tag>{anomaly.type.replace(/_/g, ' ')}</Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary">{anomaly.description}</Text>
                  }
                />
                {onViewEquipment && (
                  <Button type="link" size="small">
                    {t('common.view', 'View')} →
                  </Button>
                )}
              </List.Item>
            )}
            pagination={sortedAnomalies.length > 10 ? { pageSize: 10, size: 'small' } : false}
          />
        </>
      )}
    </>
  );

  if (!collapsible || !collapsed) {
    return (
      <Card
        title={cardTitle}
        extra={cardExtra}
        size="small"
        style={{ marginBottom: 16 }}
      >
        {content}
      </Card>
    );
  }

  return (
    <Card
      title={cardTitle}
      extra={cardExtra}
      size="small"
      style={{ marginBottom: 16 }}
      bodyStyle={{ display: collapsed ? 'none' : undefined }}
    >
      {!collapsed && content}
    </Card>
  );
}
