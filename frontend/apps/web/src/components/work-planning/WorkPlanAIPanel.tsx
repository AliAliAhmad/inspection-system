import React, { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Progress,
  List,
  Tag,
  Tooltip,
  Spin,
  Alert,
  Statistic,
  Row,
  Col,
  Modal,
  Form,
  Slider,
  Switch,
  message,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workPlansApi } from '@inspection/shared';

interface WorkPlanAIPanelProps {
  planId: number;
  compact?: boolean;
  onRefresh?: () => void;
}

export const WorkPlanAIPanel: React.FC<WorkPlanAIPanelProps> = ({
  planId,
  compact = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [autoScheduleModalOpen, setAutoScheduleModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: liveStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['plan-live-status', planId],
    queryFn: () => workPlansApi.getLiveStatus(planId),
    refetchInterval: 30000,
  });

  const { data: bottlenecks, isLoading: bottlenecksLoading } = useQuery({
    queryKey: ['plan-bottlenecks', planId],
    queryFn: () => workPlansApi.analyzeBottlenecks(planId),
  });

  const { data: completion, isLoading: completionLoading } = useQuery({
    queryKey: ['plan-completion', planId],
    queryFn: () => workPlansApi.predictCompletion(planId),
  });

  const autoScheduleMutation = useMutation({
    mutationFn: (options: any) => workPlansApi.autoScheduleEnhanced(planId, options),
    onSuccess: (result) => {
      message.success(t('workPlan.autoScheduleComplete', { count: result?.data?.scheduled?.length || 0 }));
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
      onRefresh?.();
      setAutoScheduleModalOpen(false);
    },
  });

  const balanceWorkloadMutation = useMutation({
    mutationFn: () => workPlansApi.balanceWorkload(planId),
    onSuccess: () => {
      message.success(t('workPlan.workloadBalanced'));
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
      onRefresh?.();
    },
  });

  const status = liveStatus?.data;
  const bottleneckList = bottlenecks?.data || [];
  const completionData = completion?.data;

  const handleAutoSchedule = async () => {
    const values = await form.validateFields();
    autoScheduleMutation.mutate(values);
  };

  if (compact) {
    return (
      <Card size="small" title={<><RobotOutlined /> AI</>}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('workPlan.completion')}</span>
            <span>{status?.completion_rate || 0}%</span>
          </div>
          <Progress percent={status?.completion_rate || 0} size="small" />

          {bottleneckList.length > 0 && (
            <Alert
              type="warning"
              message={t('workPlan.bottlenecksFound', { count: bottleneckList.length })}
              showIcon
              style={{ padding: '4px 8px' }}
            />
          )}

          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => setAutoScheduleModalOpen(true)}
            block
          >
            {t('workPlan.autoSchedule')}
          </Button>
        </Space>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined />
          {t('workPlan.aiAssistant')}
        </Space>
      }
      loading={statusLoading}
    >
      {/* Live Status */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Statistic
            title={t('workPlan.completionRate')}
            value={status?.completion_rate || 0}
            suffix="%"
            valueStyle={{ color: (status?.completion_rate || 0) >= 80 ? '#3f8600' : '#cf1322' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('workPlan.onTrack')}
            value={status?.on_track_jobs || 0}
            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('workPlan.delayed')}
            value={status?.delayed_jobs || 0}
            prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('workPlan.atRisk')}
            value={status?.at_risk_jobs || 0}
            prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
          />
        </Col>
      </Row>

      {/* Prediction */}
      {completionData && (
        <Alert
          type={completionData.predicted_rate >= 90 ? 'success' : completionData.predicted_rate >= 70 ? 'warning' : 'error'}
          message={
            <span>
              {t('workPlan.predictedCompletion')}: <strong>{completionData.predicted_rate}%</strong>
              {completionData.confidence && ` (${t('workPlan.confidence')}: ${completionData.confidence}%)`}
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Bottlenecks */}
      {bottleneckList.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
            {t('workPlan.bottlenecks')}
          </div>
          <List
            size="small"
            dataSource={bottleneckList.slice(0, 3)}
            renderItem={(item: any) => (
              <List.Item>
                <Tag color={item.type === 'skill' ? 'orange' : item.type === 'capacity' ? 'red' : 'blue'}>
                  {item.type}
                </Tag>
                {item.description}
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Recommendations */}
      {status?.recommendations && status.recommendations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            {t('workPlan.recommendations')}
          </div>
          <List
            size="small"
            dataSource={status.recommendations.slice(0, 3)}
            renderItem={(rec: string) => (
              <List.Item>
                <CheckCircleOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                {rec}
              </List.Item>
            )}
          />
        </div>
      )}

      {/* Action Buttons */}
      <Space wrap>
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={() => setAutoScheduleModalOpen(true)}
          loading={autoScheduleMutation.isPending}
        >
          {t('workPlan.autoSchedule')}
        </Button>
        <Button
          icon={<TeamOutlined />}
          onClick={() => balanceWorkloadMutation.mutate()}
          loading={balanceWorkloadMutation.isPending}
        >
          {t('workPlan.balanceWorkload')}
        </Button>
        <Button icon={<BarChartOutlined />}>
          {t('workPlan.viewAnalytics')}
        </Button>
      </Space>

      {/* Auto Schedule Modal */}
      <Modal
        title={t('workPlan.autoScheduleOptions')}
        open={autoScheduleModalOpen}
        onCancel={() => setAutoScheduleModalOpen(false)}
        onOk={handleAutoSchedule}
        confirmLoading={autoScheduleMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{
          priority_weight: 50,
          balance_berths: true,
          consider_skills: true,
          minimize_travel: false,
        }}>
          <Form.Item name="priority_weight" label={t('workPlan.priorityWeight')}>
            <Slider marks={{ 0: t('common.low'), 50: t('common.medium'), 100: t('common.high') }} />
          </Form.Item>
          <Form.Item name="balance_berths" label={t('workPlan.balanceBerths')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="consider_skills" label={t('workPlan.considerSkills')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="minimize_travel" label={t('workPlan.minimizeTravel')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default WorkPlanAIPanel;
