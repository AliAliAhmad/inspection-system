import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Space,
  Tag,
  Button,
  Divider,
  List,
  Alert,
  Skeleton,
  Tooltip,
  Timeline,
  Collapse,
  Badge,
  message,
} from 'antd';
import {
  RobotOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  BulbOutlined,
  LinkOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiApi, defectsApi } from '@inspection/shared';
import type { Defect, SLAStatus } from '@inspection/shared';

import RiskScoreGauge from './RiskScoreGauge';
import SLAStatusBadge from './SLAStatusBadge';
import SimilarDefectsPanel from './SimilarDefectsPanel';

const { Text, Title, Paragraph } = Typography;

export interface DefectAIPanelProps {
  defect: Defect;
  onDefectClick?: (defectId: number) => void;
  onEscalate?: (defectId: number, level: number) => void;
  className?: string;
}

interface RootCauseAnalysis {
  probable_causes: string[];
  contributing_factors: string[];
  evidence: string[];
  confidence: number;
}

interface PreventionRecommendation {
  action: string;
  priority: 'high' | 'medium' | 'low';
  impact: string;
  estimated_effort: string;
}

interface EscalationInfo {
  current_level: number;
  should_escalate: boolean;
  escalate_to: string[];
  reason: string;
  last_escalated_at?: string;
}

const ESCALATION_LEVELS = [
  { level: 1, label: 'Supervisor', color: '#faad14' },
  { level: 2, label: 'Manager', color: '#fa8c16' },
  { level: 3, label: 'Director', color: '#ff4d4f' },
  { level: 4, label: 'Emergency', color: '#cf1322' },
];

export function DefectAIPanel({
  defect,
  onDefectClick,
  onEscalate,
  className,
}: DefectAIPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Countdown timer state
  const [countdown, setCountdown] = useState<{ hours: number; minutes: number; seconds: number }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Fetch AI insights for the defect
  const { data: aiData, isLoading } = useQuery({
    queryKey: ['defect-ai-insights', defect.id],
    queryFn: async () => {
      // In production, these would be real API calls
      // Simulating AI analysis data
      await new Promise(resolve => setTimeout(resolve, 500));

      const baseHours = defect.severity === 'critical' ? 4 :
                       defect.severity === 'high' ? 24 :
                       defect.severity === 'medium' ? 72 : 168;

      const createdAt = new Date(defect.created_at);
      const deadline = new Date(createdAt.getTime() + baseHours * 60 * 60 * 1000);
      const now = new Date();
      const hoursRemaining = Math.max(0, (deadline.getTime() - now.getTime()) / (1000 * 60 * 60));
      const percentageElapsed = Math.min(100, ((baseHours - hoursRemaining) / baseHours) * 100);

      let slaStatus: SLAStatus = 'on_track';
      if (percentageElapsed >= 100) slaStatus = 'breached';
      else if (percentageElapsed >= 90) slaStatus = 'critical';
      else if (percentageElapsed >= 75) slaStatus = 'at_risk';
      else if (percentageElapsed >= 50) slaStatus = 'warning';

      // Calculate risk score
      const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      const severityScore = defect.severity === 'critical' ? 40 :
                           defect.severity === 'high' ? 30 :
                           defect.severity === 'medium' ? 20 : 10;
      const ageScore = Math.min(30, ageHours / 24 * 5);
      const recurrenceScore = (defect.occurrence_count || 1) * 10;
      const riskScore = Math.min(100, severityScore + ageScore + recurrenceScore);

      return {
        riskScore: {
          score: riskScore,
          factors: [
            { name: 'Severity', value: severityScore * 2.5, weight: 0.4, description: `${defect.severity} severity level` },
            { name: 'Age', value: Math.min(100, ageScore * 3), weight: 0.3, description: `Open for ${Math.round(ageHours)} hours` },
            { name: 'Recurrence', value: Math.min(100, recurrenceScore * 2), weight: 0.2, description: `Occurred ${defect.occurrence_count || 1} times` },
            { name: 'Equipment', value: 50, weight: 0.1, description: 'Equipment criticality factor' },
          ],
        },
        sla: {
          status: slaStatus,
          deadline: deadline.toISOString(),
          hoursRemaining,
          hoursElapsed: baseHours - hoursRemaining,
          percentage: percentageElapsed,
        },
        rootCause: {
          probable_causes: [
            'Component wear due to extended operation hours',
            'Insufficient lubrication during maintenance cycle',
            'Environmental factors (humidity, dust)',
          ],
          contributing_factors: [
            'Delayed preventive maintenance schedule',
            'High operational load in recent period',
          ],
          evidence: [
            'Similar pattern observed in previous defects',
            'Inspection history shows gradual degradation',
          ],
          confidence: 0.78,
        } as RootCauseAnalysis,
        prevention: [
          {
            action: 'Implement weekly lubrication checks',
            priority: 'high',
            impact: 'Reduce similar defects by ~40%',
            estimated_effort: '2 hours/week',
          },
          {
            action: 'Install vibration monitoring sensors',
            priority: 'medium',
            impact: 'Early detection of wear patterns',
            estimated_effort: '1-2 days installation',
          },
          {
            action: 'Update PM schedule for this equipment type',
            priority: 'medium',
            impact: 'Prevent recurrence',
            estimated_effort: '4 hours planning',
          },
        ] as PreventionRecommendation[],
        escalation: {
          current_level: slaStatus === 'breached' || slaStatus === 'critical' ? 2 :
                        slaStatus === 'at_risk' ? 1 : 0,
          should_escalate: slaStatus === 'critical' || slaStatus === 'breached',
          escalate_to: slaStatus === 'breached' ? ['Manager', 'Director'] :
                      slaStatus === 'critical' ? ['Supervisor'] : [],
          reason: slaStatus === 'breached' ? 'SLA deadline has been exceeded' :
                 slaStatus === 'critical' ? 'SLA deadline approaching' :
                 'Normal processing',
        } as EscalationInfo,
      };
    },
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // SLA countdown timer
  useEffect(() => {
    if (!aiData?.sla?.deadline) return;

    const updateCountdown = () => {
      const now = new Date();
      const deadline = new Date(aiData.sla.deadline);
      const diff = deadline.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [aiData?.sla?.deadline]);

  // Escalation mutation
  const escalateMutation = useMutation({
    mutationFn: async (level: number) => {
      // In production, this would call the API
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, level };
    },
    onSuccess: (data) => {
      message.success(t('defects.escalated', 'Defect escalated to level {{level}}', { level: data.level }));
      queryClient.invalidateQueries({ queryKey: ['defect-ai-insights', defect.id] });
      onEscalate?.(defect.id, data.level);
    },
    onError: () => {
      message.error(t('defects.escalateError', 'Failed to escalate defect'));
    },
  });

  const handleEscalate = (level: number) => {
    escalateMutation.mutate(level);
  };

  const getSLACountdownColor = () => {
    if (!aiData?.sla) return '#52c41a';
    const { status } = aiData.sla;
    if (status === 'breached' || status === 'critical') return '#ff4d4f';
    if (status === 'at_risk') return '#fa8c16';
    if (status === 'warning') return '#faad14';
    return '#52c41a';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      default: return 'blue';
    }
  };

  if (isLoading) {
    return (
      <div className={className}>
        <Card>
          <Skeleton active avatar paragraph={{ rows: 4 }} />
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Header */}
      <Card size="small" style={{ backgroundColor: '#f0f5ff', borderColor: '#d6e4ff' }}>
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {t('defects.aiPanel.title', 'AI Analysis')}
            </Title>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('defects.aiPanel.subtitle', 'Defect #{{id}}', { id: defect.id })}
            </Text>
          </div>
        </Space>
      </Card>

      {/* Risk Score */}
      <Card
        size="small"
        title={
          <Space>
            <AlertOutlined style={{ color: '#ff4d4f' }} />
            {t('defects.aiPanel.riskScore', 'Risk Score')}
          </Space>
        }
      >
        {aiData?.riskScore && (
          <RiskScoreGauge
            score={aiData.riskScore.score}
            factors={aiData.riskScore.factors}
            size="default"
          />
        )}
      </Card>

      {/* SLA Countdown */}
      <Card
        size="small"
        title={
          <Space>
            <ClockCircleOutlined style={{ color: getSLACountdownColor() }} />
            {t('defects.aiPanel.slaStatus', 'SLA Status')}
          </Space>
        }
      >
        {aiData?.sla && (
          <div className="text-center">
            <SLAStatusBadge
              status={aiData.sla.status}
              hoursRemaining={aiData.sla.hoursRemaining}
              deadline={aiData.sla.deadline}
              size="large"
            />

            {/* Countdown Timer */}
            {aiData.sla.hoursRemaining > 0 && (
              <div
                className="mt-4 p-3 rounded-lg"
                style={{
                  backgroundColor: getSLACountdownColor() + '10',
                  border: `1px solid ${getSLACountdownColor()}40`,
                }}
              >
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  {t('defects.aiPanel.timeRemaining', 'Time Remaining')}
                </Text>
                <div className="flex justify-center gap-2">
                  <div className="text-center">
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: getSLACountdownColor(),
                        lineHeight: 1,
                      }}
                    >
                      {countdown.hours.toString().padStart(2, '0')}
                    </div>
                    <Text type="secondary" style={{ fontSize: 10 }}>HRS</Text>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: getSLACountdownColor() }}>:</div>
                  <div className="text-center">
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: getSLACountdownColor(),
                        lineHeight: 1,
                      }}
                    >
                      {countdown.minutes.toString().padStart(2, '0')}
                    </div>
                    <Text type="secondary" style={{ fontSize: 10 }}>MIN</Text>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: getSLACountdownColor() }}>:</div>
                  <div className="text-center">
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: getSLACountdownColor(),
                        lineHeight: 1,
                      }}
                    >
                      {countdown.seconds.toString().padStart(2, '0')}
                    </div>
                    <Text type="secondary" style={{ fontSize: 10 }}>SEC</Text>
                  </div>
                </div>
              </div>
            )}

            {/* Deadline */}
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
              {t('defects.aiPanel.deadline', 'Deadline')}: {new Date(aiData.sla.deadline).toLocaleString()}
            </Text>
          </div>
        )}
      </Card>

      {/* Escalation */}
      <Card
        size="small"
        title={
          <Space>
            <ArrowUpOutlined style={{ color: '#fa8c16' }} />
            {t('defects.aiPanel.escalation', 'Escalation')}
          </Space>
        }
      >
        {aiData?.escalation && (
          <div>
            {/* Current Level */}
            <div className="mb-3">
              <Text type="secondary" style={{ fontSize: 11 }}>
                {t('defects.aiPanel.currentLevel', 'Current Level')}
              </Text>
              <div className="flex items-center gap-2 mt-1">
                {ESCALATION_LEVELS.map((level) => (
                  <Tag
                    key={level.level}
                    color={aiData.escalation.current_level >= level.level ? level.color : 'default'}
                    style={{ margin: 0 }}
                  >
                    {level.level}
                  </Tag>
                ))}
              </div>
            </div>

            {/* Escalation Alert */}
            {aiData.escalation.should_escalate && (
              <Alert
                type="warning"
                message={t('defects.aiPanel.escalationNeeded', 'Escalation Recommended')}
                description={aiData.escalation.reason}
                showIcon
                icon={<ExclamationCircleOutlined />}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* Escalation Buttons */}
            <Space wrap>
              {ESCALATION_LEVELS
                .filter(level => level.level > aiData.escalation.current_level)
                .slice(0, 2)
                .map((level) => (
                  <Button
                    key={level.level}
                    size="small"
                    type={aiData.escalation.should_escalate ? 'primary' : 'default'}
                    danger={level.level >= 3}
                    onClick={() => handleEscalate(level.level)}
                    loading={escalateMutation.isPending}
                    icon={<ArrowUpOutlined />}
                  >
                    {t('defects.aiPanel.escalateTo', 'Escalate to {{level}}', { level: level.label })}
                  </Button>
                ))}
            </Space>
          </div>
        )}
      </Card>

      {/* Similar Defects */}
      <SimilarDefectsPanel
        defectId={defect.id}
        defectDescription={defect.description}
        onDefectClick={onDefectClick}
        maxItems={3}
      />

      {/* Root Cause Analysis */}
      <Card
        size="small"
        title={
          <Space>
            <ThunderboltOutlined style={{ color: '#722ed1' }} />
            {t('defects.aiPanel.rootCause', 'Root Cause Analysis')}
            {aiData?.rootCause?.confidence && (
              <Tag color="purple" style={{ margin: 0 }}>
                {Math.round(aiData.rootCause.confidence * 100)}% {t('common.confidence', 'confidence')}
              </Tag>
            )}
          </Space>
        }
      >
        {aiData?.rootCause && (
          <Collapse
            ghost
            defaultActiveKey={['causes']}
            items={[
              {
                key: 'causes',
                label: (
                  <Text strong style={{ fontSize: 12 }}>
                    {t('defects.aiPanel.probableCauses', 'Probable Causes')}
                  </Text>
                ),
                children: (
                  <List
                    size="small"
                    dataSource={aiData.rootCause.probable_causes}
                    renderItem={(cause, idx) => (
                      <List.Item style={{ padding: '4px 0', border: 'none' }}>
                        <Space>
                          <Badge count={idx + 1} style={{ backgroundColor: '#722ed1' }} />
                          <Text style={{ fontSize: 12 }}>{cause}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'factors',
                label: (
                  <Text strong style={{ fontSize: 12 }}>
                    {t('defects.aiPanel.contributingFactors', 'Contributing Factors')}
                  </Text>
                ),
                children: (
                  <List
                    size="small"
                    dataSource={aiData.rootCause.contributing_factors}
                    renderItem={(factor) => (
                      <List.Item style={{ padding: '4px 0', border: 'none' }}>
                        <Text style={{ fontSize: 12 }}>{factor}</Text>
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'evidence',
                label: (
                  <Text strong style={{ fontSize: 12 }}>
                    {t('defects.aiPanel.evidence', 'Supporting Evidence')}
                  </Text>
                ),
                children: (
                  <List
                    size="small"
                    dataSource={aiData.rootCause.evidence}
                    renderItem={(item) => (
                      <List.Item style={{ padding: '4px 0', border: 'none' }}>
                        <Space>
                          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                          <Text style={{ fontSize: 12 }}>{item}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Prevention Recommendations */}
      <Card
        size="small"
        title={
          <Space>
            <SafetyOutlined style={{ color: '#52c41a' }} />
            {t('defects.aiPanel.prevention', 'Prevention Recommendations')}
          </Space>
        }
      >
        {aiData?.prevention && (
          <Timeline
            items={aiData.prevention.map((rec, idx) => ({
              dot: (
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: getPriorityColor(rec.priority) === 'red' ? '#ff4d4f' :
                                    getPriorityColor(rec.priority) === 'orange' ? '#fa8c16' : '#1677ff',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {idx + 1}
                </div>
              ),
              children: (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Text strong style={{ fontSize: 12 }}>{rec.action}</Text>
                    <Tag color={getPriorityColor(rec.priority)} style={{ margin: 0, fontSize: 10 }}>
                      {rec.priority.toUpperCase()}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {t('defects.aiPanel.impact', 'Impact')}: {rec.impact}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t('defects.aiPanel.effort', 'Effort')}: {rec.estimated_effort}
                  </Text>
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  );
}

export default DefectAIPanel;
