import { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Button,
  Radio,
  Tag,
  Space,
  Spin,
  Alert,
  Descriptions,
  Result,
  message,
  Steps,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  LockOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import {
  assessmentsApi,
  FinalAssessment,
  Verdict,
} from '@inspection/shared';
import VoiceTextArea from '../../components/VoiceTextArea';

const VERDICT_COLORS: Record<string, string> = {
  operational: 'success',
  monitor: 'warning',
  stop: 'error',
  urgent: 'error',
};

const VERDICT_ICONS: Record<string, JSX.Element> = {
  operational: <CheckCircleOutlined />,
  monitor: <ExclamationCircleOutlined />,
  stop: <StopOutlined />,
  urgent: <WarningOutlined />,
};

export default function AssessmentPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const assignmentId = Number(id);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [monitorReason, setMonitorReason] = useState('');
  const [stopReason, setStopReason] = useState('');

  const {
    data: assessment,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['assessment', assignmentId],
    queryFn: async () => {
      try {
        const res = await assessmentsApi.get(assignmentId);
        return res.data.data as FinalAssessment;
      } catch (err: any) {
        if (err?.response?.status === 404) {
          try {
            const createRes = await assessmentsApi.create(assignmentId);
            return createRes.data.data as FinalAssessment;
          } catch (createErr: any) {
            const msg = createErr?.response?.data?.message || createErr?.response?.data?.error || '';
            if (msg.includes('Both inspectors') || msg.includes('complete')) {
              return null;
            }
            throw createErr;
          }
        }
        throw err;
      }
    },
  });

  // Pre-select system verdict
  useEffect(() => {
    if (assessment?.system_verdict && !verdict) {
      const isMech = user?.id === assessment.mechanical_inspector_id;
      const isElec = user?.id === assessment.electrical_inspector_id;
      const userVerdictAlready = isMech ? assessment.mech_verdict : isElec ? assessment.elec_verdict : null;
      if (!userVerdictAlready) {
        setVerdict(assessment.system_verdict);
      }
    }
  }, [assessment, user?.id, verdict]);

  const verdictMutation = useMutation({
    mutationFn: (payload: { verdict: Verdict; monitor_reason?: string; stop_reason?: string }) => {
      if (!assessment) throw new Error('No assessment');
      return assessmentsApi.submitVerdict(assessment.id, payload);
    },
    onSuccess: () => {
      message.success('Verdict submitted successfully');
      queryClient.invalidateQueries({ queryKey: ['assessment', assignmentId] });
      refetch();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Error submitting verdict');
    },
  });

  const handleSubmitVerdict = () => {
    if (!verdict) return;
    if (verdict === 'monitor' && monitorReason.trim().length < 30) {
      message.error('Monitor reason must be at least 30 characters');
      return;
    }
    if (verdict === 'stop' && stopReason.trim().length < 50) {
      message.error('Stop reason must be at least 50 characters');
      return;
    }
    verdictMutation.mutate({
      verdict,
      monitor_reason: verdict === 'monitor' ? monitorReason.trim() : undefined,
      stop_reason: verdict === 'stop' ? stopReason.trim() : undefined,
    });
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inspector/assignments')}>
            {t('common.back')}
          </Button>
        </Space>
        <Alert type="error" message={t('common.error')} showIcon />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div>
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inspector/assignments')}>
            {t('common.back')}
          </Button>
        </Space>
        <Result
          status="info"
          title="Assessment Not Ready"
          subTitle="Both the mechanical and electrical inspectors must complete their checklists before the final assessment can begin."
          extra={
            <Button type="primary" onClick={() => navigate('/inspector/assignments')}>
              Back to Assignments
            </Button>
          }
        />
      </div>
    );
  }

  const isMechInspector = user?.id === assessment.mechanical_inspector_id;
  const isElecInspector = user?.id === assessment.electrical_inspector_id;
  const userHasSubmitted =
    (isMechInspector && assessment.mech_verdict !== null) ||
    (isElecInspector && assessment.elec_verdict !== null);
  const isFinalized = assessment.finalized_at !== null;

  const getVerdictTag = (v: Verdict | string | null) => {
    if (!v) return <Tag>{t('status.pending')}</Tag>;
    return (
      <Tag color={VERDICT_COLORS[v] || 'default'} icon={VERDICT_ICONS[v]}>
        {t(`status.${v}`, v)}
      </Tag>
    );
  };

  const getResolutionLabel = (method: string | null) => {
    switch (method) {
      case 'agreement': return 'All parties agreed';
      case 'engineer': return 'Resolved by Engineer';
      case 'admin': return 'Resolved by Admin';
      default: return 'Pending Resolution';
    }
  };

  const getResolutionIcon = (method: string | null) => {
    switch (method) {
      case 'agreement': return <TeamOutlined />;
      case 'engineer': return <SafetyCertificateOutlined />;
      case 'admin': return <LockOutlined />;
      default: return null;
    }
  };

  // Build verdict trail steps
  const verdictSteps = [
    {
      title: 'System',
      description: assessment.system_verdict ? t(`status.${assessment.system_verdict}`, assessment.system_verdict) : 'Pending',
      status: assessment.system_verdict ? 'finish' as const : 'wait' as const,
      icon: <RobotOutlined />,
    },
    {
      title: 'Mechanical',
      description: assessment.mech_verdict ? t(`status.${assessment.mech_verdict}`, assessment.mech_verdict) : 'Pending',
      status: assessment.mech_verdict ? 'finish' as const : 'wait' as const,
    },
    {
      title: 'Electrical',
      description: assessment.elec_verdict ? t(`status.${assessment.elec_verdict}`, assessment.elec_verdict) : 'Pending',
      status: assessment.elec_verdict ? 'finish' as const : 'wait' as const,
    },
  ];

  if (assessment.escalation_level === 'engineer' || assessment.escalation_level === 'admin' || assessment.engineer_verdict) {
    verdictSteps.push({
      title: 'Engineer',
      description: assessment.engineer_verdict ? t(`status.${assessment.engineer_verdict}`, assessment.engineer_verdict) : 'Pending',
      status: assessment.engineer_verdict ? 'finish' as const : 'wait' as const,
      icon: undefined as any,
    });
  }

  if (assessment.escalation_level === 'admin' || assessment.resolved_by === 'admin') {
    verdictSteps.push({
      title: 'Admin',
      description: assessment.resolved_by === 'admin' ? t(`status.${assessment.final_status}`, assessment.final_status || '') : 'Pending',
      status: assessment.resolved_by === 'admin' ? 'finish' as const : 'wait' as const,
      icon: undefined as any,
    });
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inspector/assignments')}>
          {t('common.back')}
        </Button>
      </Space>

      <Typography.Title level={4}>{t('nav.assessments', 'Assessment')}</Typography.Title>

      {/* System Recommendation */}
      {assessment.system_verdict && (
        <Alert
          type={assessment.system_verdict === 'operational' ? 'success' : assessment.system_verdict === 'monitor' ? 'warning' : 'error'}
          icon={<RobotOutlined />}
          message={`System Recommendation: ${t(`status.${assessment.system_verdict}`, assessment.system_verdict)}`}
          description={`Urgency Score: ${assessment.system_urgency_score ?? 0}${assessment.system_has_critical ? ' | CRITICAL flags detected' : ''}`}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Final Status Result */}
      {isFinalized && (
        <Result
          status={assessment.final_status === 'operational' ? 'success' : 'warning'}
          title={t(`status.${assessment.final_status}`, assessment.final_status || '')}
          subTitle={
            assessment.stop_reason ? `Stop Reason: ${assessment.stop_reason}` :
            assessment.monitor_reason ? `Monitor Reason: ${assessment.monitor_reason}` :
            assessment.urgent_reason ? `Reason: ${assessment.urgent_reason}` : undefined
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Verdict Trail */}
      <Card title="Verdict Trail" style={{ marginBottom: 16 }}>
        <Steps items={verdictSteps} size="small" />

        {assessment.escalation_level === 'engineer' && !assessment.engineer_verdict && (
          <Alert
            type="warning"
            message="Awaiting Engineer Review"
            description="Inspector verdicts disagree. An engineer must review and decide."
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
        {assessment.escalation_level === 'admin' && !assessment.finalized_at && (
          <Alert
            type="error"
            message="Awaiting Admin Decision"
            description="Escalated to admin for final decision."
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Card>

      {/* Verdicts Overview */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions title="Verdicts" column={{ xs: 1, sm: 2 }} bordered>
          <Descriptions.Item label="System">{getVerdictTag(assessment.system_verdict)}</Descriptions.Item>
          <Descriptions.Item label="Mechanical">{getVerdictTag(assessment.mech_verdict)}</Descriptions.Item>
          <Descriptions.Item label="Electrical">{getVerdictTag(assessment.elec_verdict)}</Descriptions.Item>
          <Descriptions.Item label={t('common.status')}>
            {isFinalized ? getVerdictTag(assessment.final_status) : <Tag color="processing">{t('status.pending')}</Tag>}
          </Descriptions.Item>
          {assessment.engineer_verdict && (
            <Descriptions.Item label="Engineer">{getVerdictTag(assessment.engineer_verdict)}</Descriptions.Item>
          )}
          {assessment.resolved_by && (
            <Descriptions.Item label="Resolution">
              <Space>
                {getResolutionIcon(assessment.resolved_by)}
                <Typography.Text>{getResolutionLabel(assessment.resolved_by)}</Typography.Text>
              </Space>
            </Descriptions.Item>
          )}
          {assessment.admin_decision_notes && (
            <Descriptions.Item label="Admin Notes" span={2}>{assessment.admin_decision_notes}</Descriptions.Item>
          )}
          {assessment.engineer_notes && (
            <Descriptions.Item label="Engineer Notes" span={2}>{assessment.engineer_notes}</Descriptions.Item>
          )}
          {assessment.monitor_reason && (
            <Descriptions.Item label="Monitor Reason" span={2}>{assessment.monitor_reason}</Descriptions.Item>
          )}
          {(assessment.stop_reason || assessment.urgent_reason) && (
            <Descriptions.Item label="Stop Reason" span={2}>{assessment.stop_reason || assessment.urgent_reason}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Submit Verdict Form */}
      {(isMechInspector || isElecInspector) && !userHasSubmitted && !isFinalized && (
        <Card title="Submit Your Verdict" style={{ marginBottom: 16 }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                Verdict {assessment.system_verdict && (
                  <Tag color="blue" icon={<RobotOutlined />}>System recommends: {assessment.system_verdict}</Tag>
                )}
              </Typography.Text>
              <Radio.Group value={verdict} onChange={(e) => setVerdict(e.target.value)} size="large">
                <Radio.Button value="operational">
                  <Space><CheckCircleOutlined /> {t('status.operational', 'Operational')}</Space>
                </Radio.Button>
                <Radio.Button value="monitor">
                  <Space><ExclamationCircleOutlined /> {t('status.monitor', 'Monitor')}</Space>
                </Radio.Button>
                <Radio.Button value="stop">
                  <Space><StopOutlined /> {t('status.stop', 'Stop')}</Space>
                </Radio.Button>
              </Radio.Group>
            </div>

            {verdict === 'monitor' && (
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Monitor Reason * (min 30 characters)
                </Typography.Text>
                <VoiceTextArea
                  value={monitorReason}
                  onChange={(e) => setMonitorReason(e.target.value)}
                  rows={3}
                  placeholder="Describe why this equipment needs monitoring..."
                />
              </div>
            )}

            {verdict === 'stop' && (
              <div>
                <Typography.Text strong type="danger" style={{ display: 'block', marginBottom: 8 }}>
                  Stop Reason * (min 50 characters)
                </Typography.Text>
                <VoiceTextArea
                  value={stopReason}
                  onChange={(e) => setStopReason(e.target.value)}
                  rows={3}
                  placeholder="Describe why this equipment must be stopped..."
                />
              </div>
            )}

            <Button
              type="primary"
              size="large"
              danger={verdict === 'stop'}
              onClick={handleSubmitVerdict}
              loading={verdictMutation.isPending}
              disabled={
                !verdict ||
                (verdict === 'monitor' && monitorReason.trim().length < 30) ||
                (verdict === 'stop' && stopReason.trim().length < 50)
              }
            >
              {t('common.submit')}
            </Button>
          </Space>
        </Card>
      )}

      {/* Already submitted */}
      {(isMechInspector || isElecInspector) && userHasSubmitted && !isFinalized && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status="info"
            title="Verdict Submitted"
            subTitle="Waiting for the other inspector to submit their verdict."
          />
        </Card>
      )}
    </div>
  );
}
