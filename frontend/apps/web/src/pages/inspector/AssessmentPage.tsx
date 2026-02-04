import { useState } from 'react';
import {
  Card,
  Typography,
  Button,
  Radio,
  Input,
  Tag,
  Space,
  Spin,
  Alert,
  Descriptions,
  Result,
  Divider,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  LockOutlined,
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

export default function AssessmentPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const assignmentId = Number(id);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [urgentReason, setUrgentReason] = useState('');

  // First try to fetch existing assessment, if 404 we try to create one
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
        // If not found, try to create one
        if (err?.response?.status === 404) {
          try {
            const createRes = await assessmentsApi.create(assignmentId);
            return createRes.data.data as FinalAssessment;
          } catch (createErr: any) {
            // If creation fails (e.g. both inspectors not done yet), return null
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

  // Submit verdict mutation
  const verdictMutation = useMutation({
    mutationFn: (payload: { verdict: Verdict; urgent_reason?: string }) => {
      if (!assessment) throw new Error('No assessment');
      return assessmentsApi.submitVerdict(assessment.id, payload);
    },
    onSuccess: () => {
      message.success(t('common.submit'));
      queryClient.invalidateQueries({ queryKey: ['assessment', assignmentId] });
      refetch();
    },
    onError: () => {
      message.error(t('common.error'));
    },
  });

  const handleSubmitVerdict = () => {
    if (!verdict) return;
    const payload: { verdict: Verdict; urgent_reason?: string } = { verdict };
    if (verdict === 'urgent' && urgentReason.trim()) {
      payload.urgent_reason = urgentReason.trim();
    }
    verdictMutation.mutate(payload);
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

  // Determine if the current user is mech or elec inspector
  const isMechInspector = user?.id === assessment.mechanical_inspector_id;
  const isElecInspector = user?.id === assessment.electrical_inspector_id;

  // Check if current user has already submitted
  const userHasSubmitted =
    (isMechInspector && assessment.mech_verdict !== null) ||
    (isElecInspector && assessment.elec_verdict !== null);

  const isFinalized = assessment.finalized_at !== null;

  const getVerdictTag = (v: Verdict | null) => {
    if (!v) return <Tag>{t('status.pending')}</Tag>;
    if (v === 'operational') {
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          {t('status.operational', 'Operational')}
        </Tag>
      );
    }
    return (
      <Tag color="error" icon={<WarningOutlined />}>
        {t('status.urgent', 'Urgent')}
      </Tag>
    );
  };

  const getResolutionIcon = (method: string | null) => {
    switch (method) {
      case 'agreement':
        return <TeamOutlined />;
      case 'safety_rule':
        return <SafetyCertificateOutlined />;
      case 'admin':
        return <LockOutlined />;
      default:
        return null;
    }
  };

  const getResolutionLabel = (method: string | null) => {
    switch (method) {
      case 'agreement':
        return 'Resolved by Agreement';
      case 'safety_rule':
        return 'Resolved by Safety Rule';
      case 'admin':
        return 'Resolved by Admin';
      default:
        return 'Pending Resolution';
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/inspector/assignments')}
        >
          {t('common.back')}
        </Button>
      </Space>

      <Typography.Title level={4}>
        {t('nav.assessments', 'Assessment')}
      </Typography.Title>

      {/* Final Status Result (if finalized) */}
      {isFinalized && (
        <Result
          status={assessment.final_status === 'operational' ? 'success' : 'warning'}
          title={
            assessment.final_status === 'operational'
              ? t('status.operational', 'Operational')
              : t('status.urgent', 'Urgent')
          }
          subTitle={
            assessment.urgent_reason
              ? `${t('status.urgent', 'Urgent')}: ${assessment.urgent_reason}`
              : undefined
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Verdicts Overview */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          title="Inspector Verdicts"
          column={{ xs: 1, sm: 2 }}
          bordered
        >
          <Descriptions.Item label="Mechanical Inspector Verdict">
            {getVerdictTag(assessment.mech_verdict)}
          </Descriptions.Item>
          <Descriptions.Item label="Electrical Inspector Verdict">
            {getVerdictTag(assessment.elec_verdict)}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.status')}>
            {isFinalized ? (
              getVerdictTag(assessment.final_status)
            ) : (
              <Tag color="processing">{t('status.pending')}</Tag>
            )}
          </Descriptions.Item>
          {assessment.resolved_by && (
            <Descriptions.Item label="Resolution">
              <Space>
                {getResolutionIcon(assessment.resolved_by)}
                <Typography.Text>
                  {getResolutionLabel(assessment.resolved_by)}
                </Typography.Text>
              </Space>
            </Descriptions.Item>
          )}
          {assessment.admin_decision_notes && (
            <Descriptions.Item label="Admin Notes" span={2}>
              {assessment.admin_decision_notes}
            </Descriptions.Item>
          )}
          {assessment.urgent_reason && (
            <Descriptions.Item label="Urgent Reason" span={2}>
              {assessment.urgent_reason}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Submit Verdict Form (only if user hasn't submitted yet and assessment isn't finalized) */}
      {(isMechInspector || isElecInspector) &&
        !userHasSubmitted &&
        !isFinalized && (
          <Card
            title="Submit Your Verdict"
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Verdict
                </Typography.Text>
                <Radio.Group
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value)}
                  size="large"
                >
                  <Radio.Button value="operational">
                    <Space>
                      <CheckCircleOutlined />
                      {t('status.operational', 'Operational')}
                    </Space>
                  </Radio.Button>
                  <Radio.Button value="urgent">
                    <Space>
                      <WarningOutlined />
                      {t('status.urgent', 'Urgent')}
                    </Space>
                  </Radio.Button>
                </Radio.Group>
              </div>

              {verdict === 'urgent' && (
                <div>
                  <Typography.Text
                    strong
                    style={{ display: 'block', marginBottom: 8 }}
                  >
                    Urgent Reason *
                  </Typography.Text>
                  <VoiceTextArea
                    value={urgentReason}
                    onChange={(e) => setUrgentReason(e.target.value)}
                    rows={3}
                    placeholder="Describe the reason for marking as urgent..."
                  />
                </div>
              )}

              <Button
                type="primary"
                size="large"
                onClick={handleSubmitVerdict}
                loading={verdictMutation.isPending}
                disabled={
                  !verdict ||
                  (verdict === 'urgent' && !urgentReason.trim())
                }
              >
                {t('common.submit')}
              </Button>
            </Space>
          </Card>
        )}

      {/* Already submitted message */}
      {(isMechInspector || isElecInspector) &&
        userHasSubmitted &&
        !isFinalized && (
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
