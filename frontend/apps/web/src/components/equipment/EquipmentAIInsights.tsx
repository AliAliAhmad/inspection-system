import { useState, useEffect } from 'react';
import {
  Card,
  Space,
  Typography,
  Progress,
  Tag,
  Tooltip,
  Skeleton,
  Collapse,
  Alert,
  List,
  Badge,
  Descriptions,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  AlertOutlined,
  LineChartOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { equipmentApi } from '@inspection/shared';
import type {
  AIRiskScore,
  AIFailurePrediction,
  AIAnomalyResult,
  AIRecommendation,
  AIEquipmentSummary,
} from '@inspection/shared/src/api/equipment.api';

const { Text, Title, Paragraph } = Typography;
const { Panel } = Collapse;

interface EquipmentAIInsightsProps {
  equipmentId: number;
  compact?: boolean;
}

export default function EquipmentAIInsights({ equipmentId, compact = false }: EquipmentAIInsightsProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [riskScore, setRiskScore] = useState<AIRiskScore | null>(null);
  const [prediction, setPrediction] = useState<AIFailurePrediction | null>(null);
  const [anomalies, setAnomalies] = useState<AIAnomalyResult | null>(null);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [summary, setSummary] = useState<AIEquipmentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAIInsights();
  }, [equipmentId]);

  const loadAIInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const [riskRes, predRes, anomalyRes, recsRes, summaryRes] = await Promise.all([
        equipmentApi.getAIRiskScore(equipmentId).catch(() => null),
        equipmentApi.getAIFailurePrediction(equipmentId).catch(() => null),
        equipmentApi.getAIAnomalies(equipmentId).catch(() => null),
        equipmentApi.getAIRecommendations(equipmentId).catch(() => null),
        equipmentApi.getAISummary(equipmentId).catch(() => null),
      ]);

      if (riskRes?.data?.data) setRiskScore(riskRes.data.data);
      if (predRes?.data?.data) setPrediction(predRes.data.data);
      if (anomalyRes?.data?.data) setAnomalies(anomalyRes.data.data);
      if (recsRes?.data?.data) setRecommendations(recsRes.data.data);
      if (summaryRes?.data?.data) setSummary(summaryRes.data.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return '#ff4d4f';
      case 'high': return '#ff7a45';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#1677ff';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'gold';
      case 'low': return 'green';
      case 'info': return 'blue';
      default: return 'default';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'medium':
        return <AlertOutlined style={{ color: '#faad14' }} />;
      default:
        return <InfoCircleOutlined style={{ color: '#1677ff' }} />;
    }
  };

  if (loading) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        message="AI Insights Unavailable"
        description={error}
        type="warning"
        showIcon
        icon={<RobotOutlined />}
      />
    );
  }

  // Compact mode - just show key metrics
  if (compact) {
    return (
      <Card size="small" title={<><RobotOutlined /> AI Insights</>}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {riskScore && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Risk Score:</Text>
              <Tag color={getRiskColor(riskScore.risk_level)}>
                {riskScore.risk_score}/100 ({riskScore.risk_level})
              </Tag>
            </div>
          )}
          {summary && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text>Health Score:</Text>
              <Progress
                percent={summary.health_score}
                size="small"
                status={summary.health_score < 50 ? 'exception' : summary.health_score < 75 ? 'normal' : 'success'}
                style={{ width: 100 }}
              />
            </div>
          )}
          {anomalies && anomalies.anomaly_count > 0 && (
            <Alert
              message={`${anomalies.anomaly_count} anomaly detected`}
              type={anomalies.max_severity === 'critical' || anomalies.max_severity === 'high' ? 'error' : 'warning'}
              showIcon
              style={{ padding: '4px 8px' }}
            />
          )}
          {recommendations.length > 0 && (
            <div>
              <Text type="secondary">Top recommendation:</Text>
              <br />
              <Tag color={getPriorityColor(recommendations[0].priority)}>
                {recommendations[0].message}
              </Tag>
            </div>
          )}
        </Space>
      </Card>
    );
  }

  // Full mode - show all details
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header with overall health */}
      <Card>
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="Health Score"
              value={summary?.health_score || 0}
              suffix="/100"
              valueStyle={{
                color: (summary?.health_score || 0) >= 75 ? '#52c41a' :
                       (summary?.health_score || 0) >= 50 ? '#faad14' : '#ff4d4f'
              }}
              prefix={<LineChartOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            {riskScore && (
              <Statistic
                title="Risk Score"
                value={riskScore.risk_score}
                suffix="/100"
                valueStyle={{ color: getRiskColor(riskScore.risk_level) }}
                prefix={<AlertOutlined />}
              />
            )}
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Statistic
              title="Uptime (90 days)"
              value={summary?.uptime_percentage_90_days || 0}
              suffix="%"
              valueStyle={{
                color: (summary?.uptime_percentage_90_days || 0) >= 90 ? '#52c41a' :
                       (summary?.uptime_percentage_90_days || 0) >= 70 ? '#faad14' : '#ff4d4f'
              }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            {prediction && (
              <Statistic
                title="30-Day Failure Risk"
                value={prediction.failure_probability['30_days']}
                suffix="%"
                valueStyle={{
                  color: prediction.failure_probability['30_days'] >= 50 ? '#ff4d4f' :
                         prediction.failure_probability['30_days'] >= 25 ? '#faad14' : '#52c41a'
                }}
                prefix={<ThunderboltOutlined />}
              />
            )}
          </Col>
        </Row>
      </Card>

      {/* Anomalies Alert */}
      {anomalies && anomalies.anomaly_count > 0 && (
        <Alert
          message={`${anomalies.anomaly_count} Anomaly Detected`}
          description={
            <List
              size="small"
              dataSource={anomalies.anomalies}
              renderItem={(anomaly) => (
                <List.Item>
                  <Space>
                    {getSeverityIcon(anomaly.severity)}
                    <Text>{anomaly.description}</Text>
                    <Tag color={getPriorityColor(anomaly.severity)}>{anomaly.severity}</Tag>
                  </Space>
                </List.Item>
              )}
            />
          }
          type={anomalies.max_severity === 'critical' ? 'error' :
                anomalies.max_severity === 'high' ? 'warning' : 'info'}
          showIcon
          icon={<WarningOutlined />}
        />
      )}

      <Collapse defaultActiveKey={['recommendations', 'risk']}>
        {/* Recommendations */}
        <Panel
          header={
            <Space>
              <ToolOutlined />
              <span>AI Recommendations ({recommendations.length})</span>
            </Space>
          }
          key="recommendations"
        >
          {recommendations.length > 0 ? (
            <List
              dataSource={recommendations}
              renderItem={(rec, index) => (
                <List.Item>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <Badge count={index + 1} style={{ backgroundColor: getPriorityColor(rec.priority) === 'red' ? '#ff4d4f' :
                                                                          getPriorityColor(rec.priority) === 'orange' ? '#ff7a45' :
                                                                          getPriorityColor(rec.priority) === 'gold' ? '#faad14' : '#52c41a' }} />
                      <Tag color={getPriorityColor(rec.priority)}>{rec.priority.toUpperCase()}</Tag>
                      <Tag>{rec.type}</Tag>
                    </Space>
                    <Text>{rec.message}</Text>
                    {rec.action && (
                      <Text type="secondary">Suggested action: {rec.action.replace(/_/g, ' ')}</Text>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Text type="secondary">No recommendations at this time.</Text>
          )}
        </Panel>

        {/* Risk Breakdown */}
        {riskScore && (
          <Panel
            header={
              <Space>
                <AlertOutlined />
                <span>Risk Score Breakdown</span>
                <Tag color={getRiskColor(riskScore.risk_level)}>
                  {riskScore.risk_score}/100
                </Tag>
              </Space>
            }
            key="risk"
          >
            <Descriptions column={1} size="small">
              {Object.entries(riskScore.factors).map(([key, factor]) => (
                <Descriptions.Item
                  key={key}
                  label={
                    <Space>
                      <Text>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
                      <Text type="secondary">({Math.round(factor.weight * 100)}%)</Text>
                    </Space>
                  }
                >
                  <Space>
                    <Progress
                      percent={factor.score}
                      size="small"
                      status={factor.score >= 75 ? 'exception' : factor.score >= 50 ? 'normal' : 'success'}
                      style={{ width: 100 }}
                    />
                    <Text type="secondary">
                      {typeof factor.value === 'number' ? factor.value.toFixed(1) : factor.value}
                    </Text>
                  </Space>
                </Descriptions.Item>
              ))}
            </Descriptions>
            {riskScore.recommendations.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Risk-based recommendations:</Text>
                <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                  {riskScore.recommendations.map((rec, i) => (
                    <li key={i}><Text>{rec}</Text></li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}

        {/* Failure Prediction */}
        {prediction && (
          <Panel
            header={
              <Space>
                <ThunderboltOutlined />
                <span>Failure Prediction</span>
                <Tag color={prediction.failure_probability['30_days'] >= 50 ? 'red' :
                           prediction.failure_probability['30_days'] >= 25 ? 'orange' : 'green'}>
                  {prediction.maintenance_urgency.toUpperCase()}
                </Tag>
              </Space>
            }
            key="prediction"
          >
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="30-Day Probability"
                    value={prediction.failure_probability['30_days']}
                    suffix="%"
                    valueStyle={{ color: prediction.failure_probability['30_days'] >= 50 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="60-Day Probability"
                    value={prediction.failure_probability['60_days']}
                    suffix="%"
                    valueStyle={{ color: prediction.failure_probability['60_days'] >= 50 ? '#ff4d4f' : '#faad14' }}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title="90-Day Probability"
                    value={prediction.failure_probability['90_days']}
                    suffix="%"
                    valueStyle={{ color: prediction.failure_probability['90_days'] >= 50 ? '#ff4d4f' : '#faad14' }}
                  />
                </Card>
              </Col>
            </Row>
            <Descriptions column={2} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="MTBF (Days)">{prediction.mtbf_days}</Descriptions.Item>
              <Descriptions.Item label="Days Since Last Failure">{prediction.days_since_last_failure}</Descriptions.Item>
              <Descriptions.Item label="Historical Failures">{prediction.historical_failures}</Descriptions.Item>
              <Descriptions.Item label="Recommended Maintenance">{prediction.recommended_maintenance_date}</Descriptions.Item>
              <Descriptions.Item label="Equipment Age">{prediction.age_years} years</Descriptions.Item>
              <Descriptions.Item label="Estimated Remaining Life">{prediction.estimated_remaining_life_years} years</Descriptions.Item>
            </Descriptions>
          </Panel>
        )}

        {/* Summary */}
        {summary && (
          <Panel
            header={
              <Space>
                <InfoCircleOutlined />
                <span>Equipment Summary</span>
              </Space>
            }
            key="summary"
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Current Status">
                <Tag color={summary.current_status === 'active' ? 'green' :
                           summary.current_status === 'under_maintenance' ? 'orange' : 'red'}>
                  {summary.current_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Criticality">{summary.criticality_level}</Descriptions.Item>
              <Descriptions.Item label="Total Inspections (90 days)">{summary.inspection_summary.total}</Descriptions.Item>
              <Descriptions.Item label="Passed / Failed">
                {summary.inspection_summary.passed} / {summary.inspection_summary.failed}
              </Descriptions.Item>
              <Descriptions.Item label="Open Defects">{summary.defect_summary.open_count}</Descriptions.Item>
              <Descriptions.Item label="Total Defects (90 days)">{summary.defect_summary.total}</Descriptions.Item>
            </Descriptions>
            {summary.status_history.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong>Recent Status Changes:</Text>
                <List
                  size="small"
                  dataSource={summary.status_history.slice(0, 3)}
                  renderItem={(change) => (
                    <List.Item>
                      <Space>
                        <Tag>{change.old_status}</Tag>
                        <span>{'→'}</span>
                        <Tag color="blue">{change.new_status}</Tag>
                        <Text type="secondary">{change.reason}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Panel>
        )}
      </Collapse>
    </Space>
  );
}
