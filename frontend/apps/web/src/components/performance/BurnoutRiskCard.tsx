import { useState } from 'react';
import { Card, Typography, Space, Tag, List, Alert, Progress, Spin, Empty, Button, Tooltip, Modal, InputNumber, message } from 'antd';
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
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  showInterventionButtons?: boolean;
}

const performanceApi = {
  getBurnoutRisk: (userId?: number) =>
    apiClient.get('/api/performance/burnout-risk', { params: { user_id: userId } }),
  suggestLeave: (data: { user_id: number; days: number; reason?: string }) =>
    apiClient.post('/api/performance/interventions/leave', data),
  reduceWorkload: (data: { user_id: number; reduction_percentage: number }) =>
    apiClient.post('/api/performance/interventions/workload', data),
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
  showInterventionButtons = false,
}: BurnoutRiskCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [workloadModalOpen, setWorkloadModalOpen] = useState(false);
  const [leaveDays, setLeaveDays] = useState(3);
  const [reductionPercent, setReductionPercent] = useState(30);

  const { data: fetchedData, isLoading } = useQuery({
    queryKey: ['performance', 'burnout-risk', userId],
    queryFn: () => performanceApi.getBurnoutRisk(userId).then((r) => r.data),
    enabled: !dataProp && !!userId,
  });

  const riskData: BurnoutRiskData | null = dataProp || fetchedData?.data || null;

  // Mutation for suggesting leave
  const suggestLeaveMutation = useMutation({
    mutationFn: (data: { user_id: number; days: number; reason?: string }) =>
      performanceApi.suggestLeave(data),
    onSuccess: (response) => {
      message.success(t('performance.leave_created', 'Leave request created successfully'));
      setLeaveModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['performance', 'burnout-risk'] });
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || t('performance.leave_failed', 'Failed to create leave request'));
    },
  });

  // Mutation for reducing workload
  const reduceWorkloadMutation = useMutation({
    mutationFn: (data: { user_id: number; reduction_percentage: number }) =>
      performanceApi.reduceWorkload(data),
    onSuccess: (response) => {
      const data = (response.data as any)?.data;
      const count = data?.jobs_reassigned?.length || 0;
      message.success(t('performance.workload_reduced', `Workload reduced - ${count} jobs reassigned`));
      setWorkloadModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['performance', 'burnout-risk'] });
      queryClient.invalidateQueries({ queryKey: ['work-plan'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || t('performance.workload_failed', 'Failed to reduce workload'));
    },
  });

  const handleSuggestLeave = () => {
    if (!riskData?.user_id) return;
    suggestLeaveMutation.mutate({
      user_id: riskData.user_id,
      days: leaveDays,
      reason: t('performance.burnout_leave_reason', 'Recommended rest period due to high workload'),
    });
  };

  const handleReduceWorkload = () => {
    if (!riskData?.user_id) return;
    reduceWorkloadMutation.mutate({
      user_id: riskData.user_id,
      reduction_percentage: reductionPercent,
    });
  };

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

      {/* Intervention Buttons for Admin/Engineer */}
      {showInterventionButtons && riskData.risk_level !== 'low' && (
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => setLeaveModalOpen(true)}
            style={{
              flex: 1,
              backgroundColor: '#1890ff',
              borderColor: '#1890ff',
            }}
          >
            {t('performance.suggest_leave', 'Suggest Leave')}
          </Button>
          <Button
            icon={<TeamOutlined />}
            onClick={() => setWorkloadModalOpen(true)}
            style={{ flex: 1 }}
          >
            {t('performance.reduce_workload', 'Reduce Workload')}
          </Button>
        </div>
      )}

      {/* Leave Intervention Modal */}
      <Modal
        title={
          <Space>
            <CalendarOutlined style={{ color: '#1890ff' }} />
            {t('performance.suggest_leave_title', 'Suggest Leave for Recovery')}
          </Space>
        }
        open={leaveModalOpen}
        onCancel={() => setLeaveModalOpen(false)}
        onOk={handleSuggestLeave}
        okText={t('performance.create_leave_request', 'Create Leave Request')}
        okButtonProps={{ loading: suggestLeaveMutation.isPending }}
        cancelText={t('common.cancel', 'Cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            type="info"
            showIcon
            message={t('performance.leave_intervention_info', 'This will create a pending leave request for the employee. They will need to approve it.')}
            style={{ marginBottom: 16 }}
          />
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('performance.leave_days_label', 'Number of leave days:')}
          </Text>
          <InputNumber
            min={1}
            max={14}
            value={leaveDays}
            onChange={(value) => setLeaveDays(value || 3)}
            style={{ width: '100%' }}
            addonAfter={t('common.days', 'days')}
          />
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {t('performance.leave_recommendation', 'Recommended: 3-5 days for medium risk, 5-7 days for high risk, 7+ days for critical risk.')}
          </Text>
        </div>
        {riskData && (
          <div style={{ padding: 12, backgroundColor: config.bgColor, borderRadius: 8, border: `1px solid ${config.borderColor}` }}>
            <Text>
              {t('performance.creating_leave_for', 'Creating leave for:')} <Text strong>{riskData.user_name}</Text>
            </Text>
            <br />
            <Text type="secondary">
              {t('performance.current_risk_level', 'Current Risk Level:')} <Tag color={config.color}>{config.label}</Tag>
            </Text>
          </div>
        )}
      </Modal>

      {/* Workload Reduction Modal */}
      <Modal
        title={
          <Space>
            <TeamOutlined style={{ color: '#52c41a' }} />
            {t('performance.reduce_workload_title', 'Reduce Workload')}
          </Space>
        }
        open={workloadModalOpen}
        onCancel={() => setWorkloadModalOpen(false)}
        onOk={handleReduceWorkload}
        okText={t('performance.reassign_jobs', 'Reassign Jobs')}
        okButtonProps={{ loading: reduceWorkloadMutation.isPending }}
        cancelText={t('common.cancel', 'Cancel')}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            type="warning"
            showIcon
            message={t('performance.workload_intervention_info', 'This will reassign some pending jobs to other available team members.')}
            style={{ marginBottom: 16 }}
          />
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('performance.reduction_percentage_label', 'Workload reduction percentage:')}
          </Text>
          <InputNumber
            min={10}
            max={70}
            value={reductionPercent}
            onChange={(value) => setReductionPercent(value || 30)}
            style={{ width: '100%' }}
            addonAfter="%"
            step={10}
          />
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {t('performance.reduction_recommendation', 'Recommended: 20-30% for medium risk, 30-50% for high risk, 50%+ for critical risk.')}
          </Text>
        </div>
        {riskData && (
          <div style={{ padding: 12, backgroundColor: config.bgColor, borderRadius: 8, border: `1px solid ${config.borderColor}` }}>
            <Text>
              {t('performance.reducing_workload_for', 'Reducing workload for:')} <Text strong>{riskData.user_name}</Text>
            </Text>
            <br />
            <Text type="secondary">
              {t('performance.jobs_will_be_reassigned', 'Pending jobs will be reassigned to available team members.')}
            </Text>
          </div>
        )}
      </Modal>
    </Card>
  );
}

export default BurnoutRiskCard;
