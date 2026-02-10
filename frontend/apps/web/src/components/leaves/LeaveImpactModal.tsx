import { useMemo } from 'react';
import {
  Modal,
  Space,
  Typography,
  Tag,
  List,
  Progress,
  Row,
  Col,
  Alert,
  Spin,
  Empty,
  Tooltip,
  Avatar,
  Divider,
  Card,
} from 'antd';
import {
  WarningOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  BulbOutlined,
  CalendarOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { leavesApi, LeaveImpactAnalysis } from '@inspection/shared';

const { Text, Title, Paragraph } = Typography;

interface LeaveImpactModalProps {
  open: boolean;
  onClose: () => void;
  leaveId?: number;
  dateFrom?: string;
  dateTo?: string;
  userId?: number;
}

const RISK_CONFIG = {
  low: { color: '#52c41a', label: 'Low', icon: <CheckCircleOutlined /> },
  medium: { color: '#faad14', label: 'Medium', icon: <ClockCircleOutlined /> },
  high: { color: '#ff4d4f', label: 'High', icon: <ExclamationCircleOutlined /> },
  critical: { color: '#cf1322', label: 'Critical', icon: <WarningOutlined /> },
};

export function LeaveImpactModal({
  open,
  onClose,
  leaveId,
  dateFrom,
  dateTo,
  userId,
}: LeaveImpactModalProps) {
  const { t } = useTranslation();

  // Fetch impact analysis
  const { data, isLoading } = useQuery({
    queryKey: ['leaves', 'impact', leaveId, dateFrom, dateTo, userId],
    queryFn: async () => {
      if (leaveId) {
        const response = await leavesApi.analyzeLeaveImpact(leaveId);
        return response.data;
      }
      // For new leave request preview
      const response = await leavesApi.previewLeaveImpact({
        user_id: userId!,
        date_from: dateFrom!,
        date_to: dateTo!,
      });
      return response.data;
    },
    enabled: open && (!!leaveId || (!!dateFrom && !!dateTo && !!userId)),
  });

  const impact: LeaveImpactAnalysis | null = data?.data || null;

  const totalAffectedJobs = impact?.affected_jobs.length || 0;
  const highRiskJobs = impact?.affected_jobs.filter((j) => j.risk === 'high' || j.risk === 'critical').length || 0;
  const coverageGapPercent = Math.round((impact?.team_coverage_gap || 0) * 100);

  const overallRisk = useMemo(() => {
    if (!impact) return 'low';
    if (highRiskJobs > 0 || coverageGapPercent > 50) return 'high';
    if (totalAffectedJobs > 3 || coverageGapPercent > 25) return 'medium';
    return 'low';
  }, [impact, highRiskJobs, totalAffectedJobs, coverageGapPercent]);

  const overallRiskConfig = RISK_CONFIG[overallRisk as keyof typeof RISK_CONFIG];

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          {t('leaves.impactAnalysis', 'Leave Impact Analysis')}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('leaves.analyzingImpact', 'Analyzing impact...')}</Text>
          </div>
        </div>
      ) : !impact ? (
        <Empty
          description={t('leaves.noImpactData', 'Unable to analyze impact')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <>
          {/* Overall Risk Summary */}
          <Alert
            type={overallRisk === 'low' ? 'success' : overallRisk === 'medium' ? 'warning' : 'error'}
            message={
              <Space>
                {overallRiskConfig.icon}
                <Text strong>
                  {t('leaves.overallRisk', 'Overall Risk')}: {t(`leaves.risk.${overallRisk}`, overallRiskConfig.label)}
                </Text>
              </Space>
            }
            description={
              overallRisk === 'low'
                ? t('leaves.lowRiskDescription', 'This leave has minimal impact on current operations.')
                : overallRisk === 'medium'
                ? t('leaves.mediumRiskDescription', 'Some jobs may be affected. Consider arranging coverage.')
                : t('leaves.highRiskDescription', 'Significant impact on critical jobs. Coverage is strongly recommended.')
            }
            style={{ marginBottom: 24 }}
          />

          {/* Summary Stats */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <ToolOutlined style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
                <Title level={3} style={{ margin: 0 }}>
                  {totalAffectedJobs}
                </Title>
                <Text type="secondary">{t('leaves.affectedJobs', 'Affected Jobs')}</Text>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <ExclamationCircleOutlined
                  style={{
                    fontSize: 24,
                    color: highRiskJobs > 0 ? '#ff4d4f' : '#52c41a',
                    marginBottom: 8,
                  }}
                />
                <Title level={3} style={{ margin: 0, color: highRiskJobs > 0 ? '#ff4d4f' : '#52c41a' }}>
                  {highRiskJobs}
                </Title>
                <Text type="secondary">{t('leaves.highRiskJobs', 'High Risk')}</Text>
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ textAlign: 'center' }}>
                <TeamOutlined
                  style={{
                    fontSize: 24,
                    color: coverageGapPercent > 25 ? '#faad14' : '#52c41a',
                    marginBottom: 8,
                  }}
                />
                <Title
                  level={3}
                  style={{
                    margin: 0,
                    color: coverageGapPercent > 25 ? '#faad14' : '#52c41a',
                  }}
                >
                  {coverageGapPercent}%
                </Title>
                <Text type="secondary">{t('leaves.coverageGap', 'Coverage Gap')}</Text>
              </Card>
            </Col>
          </Row>

          {/* Team Coverage */}
          <div style={{ marginBottom: 24 }}>
            <Title level={5}>
              <TeamOutlined style={{ marginRight: 8 }} />
              {t('leaves.teamCoverage', 'Team Coverage')}
            </Title>
            <Progress
              percent={100 - coverageGapPercent}
              status={coverageGapPercent > 50 ? 'exception' : coverageGapPercent > 25 ? 'active' : 'success'}
              strokeColor={
                coverageGapPercent > 50
                  ? '#ff4d4f'
                  : coverageGapPercent > 25
                  ? '#faad14'
                  : '#52c41a'
              }
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('leaves.coverageExplanation', 'Team capacity during your leave period')}
            </Text>
          </div>

          {/* Affected Jobs List */}
          {impact.affected_jobs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>
                <ToolOutlined style={{ marginRight: 8 }} />
                {t('leaves.affectedJobsList', 'Affected Jobs')}
              </Title>
              <List
                dataSource={impact.affected_jobs}
                renderItem={(job) => {
                  const riskConfig = RISK_CONFIG[job.risk as keyof typeof RISK_CONFIG] || RISK_CONFIG.low;
                  return (
                    <List.Item
                      style={{
                        padding: '12px',
                        marginBottom: 8,
                        backgroundColor: '#fafafa',
                        borderRadius: 8,
                        border: `1px solid ${riskConfig.color}20`,
                      }}
                    >
                      <Row style={{ width: '100%' }} align="middle">
                        <Col flex={1}>
                          <Space direction="vertical" size={2}>
                            <Space>
                              <Text strong>#{job.job_id}</Text>
                              <Tag>{job.job_type}</Tag>
                              <Tag color={riskConfig.color} icon={riskConfig.icon}>
                                {t(`leaves.risk.${job.risk}`, riskConfig.label)}
                              </Tag>
                            </Space>
                            {job.deadline && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                <CalendarOutlined style={{ marginRight: 4 }} />
                                {t('leaves.deadline', 'Deadline')}: {dayjs(job.deadline).format('MMM D, YYYY')}
                              </Text>
                            )}
                          </Space>
                        </Col>
                      </Row>
                    </List.Item>
                  );
                }}
                size="small"
              />
            </div>
          )}

          <Divider />

          {/* Recommendations */}
          {impact.recommendations.length > 0 && (
            <div>
              <Title level={5}>
                <BulbOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                {t('leaves.recommendations', 'Recommendations')}
              </Title>
              <List
                dataSource={impact.recommendations}
                renderItem={(rec, index) => (
                  <List.Item style={{ padding: '8px 0', border: 'none' }}>
                    <Space align="start">
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: '#52c41a',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </div>
                      <Text>{rec}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          )}

          {/* No Impact Message */}
          {impact.affected_jobs.length === 0 && coverageGapPercent === 0 && (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
              <Title level={4} style={{ color: '#52c41a' }}>
                {t('leaves.noSignificantImpact', 'No Significant Impact')}
              </Title>
              <Paragraph type="secondary">
                {t(
                  'leaves.noImpactDescription',
                  'Your leave request has no significant impact on current operations. You can proceed with your request.'
                )}
              </Paragraph>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default LeaveImpactModal;
