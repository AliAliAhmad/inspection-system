import { Card, Typography, Space, Tag, List, Alert, Progress, Spin, Empty, Button, Tooltip } from 'antd';
import {
  WarningOutlined,
  HeartOutlined,
  ThunderboltOutlined,
  BulbOutlined,
  MedicineBoxOutlined,
  CoffeeOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';

const { Text, Paragraph, Title } = Typography;

export interface BurnoutIndicator {
  name: string;
  value: number;
  threshold: number;
  status: 'normal' | 'warning' | 'critical';
  description: string;
}

export interface BurnoutIntervention {
  id: number;
  title: string;
  description: string;
  priority: 'urgent' | 'recommended' | 'optional';
  type: 'leave' | 'workload' | 'support' | 'recognition';
}

export interface BurnoutRiskData {
  user_id: number;
  user_name: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  indicators: BurnoutIndicator[];
  interventions: BurnoutIntervention[];
  days_since_last_leave: number;
  average_weekly_hours: number;
  overtime_hours_month: number;
  consecutive_work_days: number;
  last_assessment_date: string;
}

export interface BurnoutRiskCardProps {
  userId?: number;
  data?: BurnoutRiskData;
  compact?: boolean;
  onRequestLeave?: () => void;
}

const performanceApi = {
  getBurnoutRisk: (userId?: number) =>
    apiClient.get('/api/performance/burnout-risk', { params: { user_id: userId } }),
};

const RISK_LEVEL_CONFIG = {
  low: {
    color: '#52c41a',
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    label: 'Low Risk',
    icon: <HeartOutlined />,
    alertType: 'success' as const,
    description: 'Healthy work-life balance maintained',
  },
  medium: {
    color: '#faad14',
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    label: 'Medium Risk',
    icon: <WarningOutlined />,
    alertType: 'warning' as const,
    description: 'Some early warning signs detected',
  },
  high: {
    color: '#ff7a45',
    bgColor: '#fff2e8',
    borderColor: '#ffbb96',
    label: 'High Risk',
    icon: <ExclamationCircleOutlined />,
    alertType: 'warning' as const,
    description: 'Significant burnout indicators present',
  },
  critical: {
    color: '#ff4d4f',
    bgColor: '#fff2f0',
    borderColor: '#ffccc7',
    label: 'Critical Risk',
    icon: <ThunderboltOutlined />,
    alertType: 'error' as const,
    description: 'Immediate intervention recommended',
  },
};

const INTERVENTION_ICONS = {
  leave: <CalendarOutlined />,
  workload: <CoffeeOutlined />,
  support: <MedicineBoxOutlined />,
  recognition: <HeartOutlined />,
};

export function BurnoutRiskCard({
  userId,
  data: dataProp,
  compact = false,
  onRequestLeave,
}: BurnoutRiskCardProps) {
  const { t } = useTranslation();

  const { data: fetchedData, isLoading } = useQuery({
    queryKey: ['performance', 'burnout-risk', userId],
    queryFn: () => performanceApi.getBurnoutRisk(userId).then((r) => r.data),
    enabled: !dataProp && !!userId,
  });

  const riskData: BurnoutRiskData | null = dataProp || fetchedData?.data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!riskData) {
    return (
      <Card
        title={
          <Space>
            <HeartOutlined style={{ color: '#ff4d4f' }} />
            {t('performance.burnout_risk', 'Burnout Risk')}
          </Space>
        }
      >
        <Empty description={t('performance.no_burnout_data', 'No burnout risk data available')} />
      </Card>
    );
  }

  const config = RISK_LEVEL_CONFIG[riskData.risk_level];
  const criticalIndicators = riskData.indicators.filter((i) => i.status === 'critical');
  const warningIndicators = riskData.indicators.filter((i) => i.status === 'warning');
  const urgentInterventions = riskData.interventions.filter((i) => i.priority === 'urgent');

  if (compact) {
    return (
      <Alert
        type={config.alertType}
        showIcon
        icon={config.icon}
        message={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong style={{ color: config.color }}>
                {t(`performance.burnout.${riskData.risk_level}`, config.label)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({riskData.risk_score}% risk score)
              </Text>
            </Space>
            {riskData.risk_level !== 'low' && onRequestLeave && (
              <Button size="small" type="primary" onClick={onRequestLeave}>
                {t('performance.take_action', 'Take Action')}
              </Button>
            )}
          </div>
        }
        description={
          urgentInterventions.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {urgentInterventions[0].title}
            </Text>
          )
        }
        style={{ backgroundColor: config.bgColor, borderColor: config.borderColor }}
      />
    );
  }

  return (
    <Card
      title={
        <Space>
          <MedicineBoxOutlined style={{ color: config.color }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('performance.burnout_risk_assessment', 'Burnout Risk Assessment')}
          </Title>
        </Space>
      }
      extra={
        <Tag
          color={config.color}
          style={{ fontSize: 13, padding: '4px 12px' }}
          icon={config.icon}
        >
          {t(`performance.burnout.${riskData.risk_level}`, config.label)}
        </Tag>
      }
      style={{ borderColor: config.borderColor }}
    >
      {/* Risk Score & Overview */}
      <div
        style={{
          padding: 16,
          backgroundColor: config.bgColor,
          borderRadius: 12,
          marginBottom: 16,
          border: `1px solid ${config.borderColor}`,
        }}
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Risk Score Circle */}
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="circle"
              percent={riskData.risk_score}
              size={100}
              strokeColor={config.color}
              format={(percent) => (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: config.color }}>{percent}%</div>
                  <div style={{ fontSize: 10, color: '#8c8c8c' }}>Risk Score</div>
                </div>
              )}
            />
          </div>

          {/* Quick Stats */}
          <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Tooltip title={t('performance.days_since_leave', 'Days since last approved leave')}>
              <div
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  borderRadius: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: riskData.days_since_last_leave > 30 ? '#ff4d4f' : '#595959' }}>
                  {riskData.days_since_last_leave}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Days Since Leave
                </Text>
              </div>
            </Tooltip>

            <Tooltip title={t('performance.weekly_hours', 'Average hours worked per week')}>
              <div
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  borderRadius: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: riskData.average_weekly_hours > 45 ? '#faad14' : '#595959' }}>
                  {riskData.average_weekly_hours}h
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Avg Weekly Hours
                </Text>
              </div>
            </Tooltip>

            <Tooltip title={t('performance.consecutive_days', 'Consecutive working days')}>
              <div
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  borderRadius: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: riskData.consecutive_work_days > 10 ? '#ff4d4f' : '#595959' }}>
                  {riskData.consecutive_work_days}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Consecutive Days
                </Text>
              </div>
            </Tooltip>
          </div>
        </div>

        <Paragraph style={{ margin: '12px 0 0', fontSize: 13 }}>
          {config.icon} {config.description}
        </Paragraph>
      </div>

      {/* Warning Indicators */}
      {(criticalIndicators.length > 0 || warningIndicators.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            <WarningOutlined style={{ marginRight: 4, color: '#faad14' }} />
            {t('performance.warning_indicators', 'Warning Indicators')}
          </Text>
          <List
            size="small"
            dataSource={[...criticalIndicators, ...warningIndicators]}
            renderItem={(indicator) => (
              <List.Item
                style={{
                  padding: '8px 12px',
                  backgroundColor:
                    indicator.status === 'critical'
                      ? RISK_LEVEL_CONFIG.critical.bgColor
                      : RISK_LEVEL_CONFIG.medium.bgColor,
                  borderRadius: 8,
                  marginBottom: 4,
                  border: `1px solid ${
                    indicator.status === 'critical'
                      ? RISK_LEVEL_CONFIG.critical.borderColor
                      : RISK_LEVEL_CONFIG.medium.borderColor
                  }`,
                }}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      {indicator.status === 'critical' ? (
                        <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                      ) : (
                        <WarningOutlined style={{ color: '#faad14' }} />
                      )}
                      <Text strong>{indicator.name}</Text>
                    </Space>
                    <Tag color={indicator.status === 'critical' ? 'error' : 'warning'}>
                      {indicator.value} / {indicator.threshold}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 22 }}>
                    {indicator.description}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Recommended Interventions */}
      {riskData.interventions.length > 0 && (
        <div
          style={{
            padding: 12,
            backgroundColor: '#f6ffed',
            borderRadius: 8,
            border: '1px solid #b7eb8f',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            <BulbOutlined style={{ marginRight: 4, color: '#52c41a' }} />
            {t('performance.recommended_interventions', 'Recommended Interventions')}
          </Text>
          <List
            size="small"
            dataSource={riskData.interventions}
            renderItem={(intervention) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Space align="start" style={{ width: '100%' }}>
                  <span style={{ color: intervention.priority === 'urgent' ? '#ff4d4f' : '#52c41a', fontSize: 16 }}>
                    {INTERVENTION_ICONS[intervention.type]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 13 }}>{intervention.title}</Text>
                      <Tag
                        color={
                          intervention.priority === 'urgent'
                            ? 'error'
                            : intervention.priority === 'recommended'
                            ? 'processing'
                            : 'default'
                        }
                        style={{ fontSize: 10 }}
                      >
                        {intervention.priority.toUpperCase()}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {intervention.description}
                    </Text>
                  </div>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Action Button */}
      {riskData.risk_level !== 'low' && onRequestLeave && (
        <Button
          type="primary"
          size="large"
          icon={<CalendarOutlined />}
          onClick={onRequestLeave}
          style={{
            width: '100%',
            marginTop: 16,
            backgroundColor: config.color,
            borderColor: config.color,
          }}
        >
          {t('performance.request_leave', 'Request Leave Now')}
        </Button>
      )}

      {/* Success Message for Low Risk */}
      {riskData.risk_level === 'low' && (
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            marginTop: 8,
          }}
        >
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
            <Text style={{ color: '#52c41a' }}>
              {t('performance.healthy_balance', 'Great job maintaining a healthy work-life balance!')}
            </Text>
          </Space>
        </div>
      )}
    </Card>
  );
}

export default BurnoutRiskCard;
