import { useState } from 'react';
import {
  Card,
  Space,
  Typography,
  Tag,
  List,
  Progress,
  Row,
  Col,
  Spin,
  Empty,
  Button,
  Tooltip,
  Avatar,
  Divider,
  Collapse,
} from 'antd';
import {
  RobotOutlined,
  HeartOutlined,
  BulbOutlined,
  WarningOutlined,
  TeamOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  UserOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leavesApi,
  LeaveBurnoutRisk,
  LeavePatternAnalysis,
  LeaveWellnessScore,
} from '@inspection/shared';

const { Text, Title, Paragraph } = Typography;

interface LeaveAIInsightsPanelProps {
  userId?: number;
  teamId?: number;
  compact?: boolean;
}

const RISK_LEVEL_CONFIG = {
  low: { color: '#52c41a', label: 'Low Risk', icon: <HeartOutlined /> },
  medium: { color: '#faad14', label: 'Medium Risk', icon: <WarningOutlined /> },
  high: { color: '#ff4d4f', label: 'High Risk', icon: <ThunderboltOutlined /> },
};

const WELLNESS_GRADE_CONFIG: Record<string, { color: string; description: string }> = {
  A: { color: '#52c41a', description: 'Excellent work-life balance' },
  B: { color: '#73d13d', description: 'Good balance with minor concerns' },
  C: { color: '#faad14', description: 'Average - some improvements needed' },
  D: { color: '#ff7a45', description: 'Below average - action recommended' },
  F: { color: '#ff4d4f', description: 'Critical - immediate attention required' },
};

export function LeaveAIInsightsPanel({
  userId,
  teamId,
  compact = false,
}: LeaveAIInsightsPanelProps) {
  const { t } = useTranslation();

  // Fetch AI insights
  const { data: insightsData, isLoading, refetch } = useQuery({
    queryKey: ['leaves', 'ai-insights', userId, teamId],
    queryFn: () =>
      leavesApi.getAIInsights({
        user_id: userId,
        team_id: teamId,
      }).then((r) => r.data),
  });

  const burnoutRisks: LeaveBurnoutRisk[] = insightsData?.data?.burnout_risks || [];
  const patterns: LeavePatternAnalysis | null = insightsData?.data?.patterns || null;
  const wellnessScore: LeaveWellnessScore | null = insightsData?.data?.wellness_score || null;
  const recommendations: string[] = insightsData?.data?.recommendations || [];
  const coverageSuggestions: string[] = insightsData?.data?.coverage_suggestions || [];

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('leaves.analyzingData', 'Analyzing leave data...')}</Text>
          </div>
        </div>
      </Card>
    );
  }

  const noData =
    burnoutRisks.length === 0 &&
    !patterns &&
    !wellnessScore &&
    recommendations.length === 0;

  if (noData) {
    return (
      <Card
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('leaves.aiInsights', 'AI Insights')}
          </Space>
        }
      >
        <Empty
          description={t('leaves.noInsightsAvailable', 'No insights available yet')}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('leaves.aiInsights', 'AI Insights')}
          </Space>
        }
        style={{ borderLeft: '4px solid #722ed1' }}
      >
        {/* Quick Wellness Score */}
        {wellnessScore && (
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Progress
              type="circle"
              percent={wellnessScore.score}
              size={80}
              strokeColor={WELLNESS_GRADE_CONFIG[wellnessScore.grade]?.color || '#1890ff'}
              format={() => (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{wellnessScore.grade}</div>
                  <div style={{ fontSize: 10 }}>{wellnessScore.score}%</div>
                </div>
              )}
            />
          </div>
        )}

        {/* Top Recommendations */}
        {recommendations.slice(0, 3).map((rec, idx) => (
          <div
            key={idx}
            style={{
              padding: 8,
              backgroundColor: '#f0f5ff',
              borderRadius: 4,
              marginBottom: 4,
              fontSize: 12,
            }}
          >
            <BulbOutlined style={{ color: '#1890ff', marginRight: 8 }} />
            {rec}
          </div>
        ))}

        {/* High Risk Alert */}
        {burnoutRisks.filter((r) => r.risk_level === 'high').length > 0 && (
          <div
            style={{
              padding: 8,
              backgroundColor: '#fff2e8',
              borderRadius: 4,
              marginTop: 8,
              fontSize: 12,
            }}
          >
            <WarningOutlined style={{ color: '#fa8c16', marginRight: 8 }} />
            {t('leaves.highRiskEmployees', '{{count}} employees at high burnout risk', {
              count: burnoutRisks.filter((r) => r.risk_level === 'high').length,
            })}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <RobotOutlined style={{ color: '#722ed1' }} />
          {t('leaves.aiInsights', 'AI-Powered Leave Insights')}
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
          {t('common.refresh', 'Refresh')}
        </Button>
      }
      style={{
        background: 'linear-gradient(135deg, #f5f0ff 0%, #fff 100%)',
        borderColor: '#d3adf7',
      }}
    >
      {/* Team Wellness Score */}
      {wellnessScore && (
        <div
          style={{
            padding: 20,
            marginBottom: 24,
            background: 'linear-gradient(135deg, #722ed1 0%, #9254de 100%)',
            borderRadius: 12,
            color: '#fff',
          }}
        >
          <Row align="middle" gutter={24}>
            <Col>
              <Progress
                type="circle"
                percent={wellnessScore.score}
                size={100}
                strokeColor="#fff"
                trailColor="rgba(255,255,255,0.3)"
                format={() => (
                  <div style={{ color: '#fff' }}>
                    <div style={{ fontSize: 32, fontWeight: 700 }}>{wellnessScore.grade}</div>
                    <div style={{ fontSize: 12 }}>{wellnessScore.score}%</div>
                  </div>
                )}
              />
            </Col>
            <Col flex={1}>
              <Title level={4} style={{ color: '#fff', margin: 0 }}>
                <TrophyOutlined /> {t('leaves.teamWellnessScore', 'Team Wellness Score')}
              </Title>
              <Paragraph style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                {WELLNESS_GRADE_CONFIG[wellnessScore.grade]?.description ||
                  t('leaves.wellnessGrade', 'Wellness Grade')}
              </Paragraph>
              <Space wrap>
                {wellnessScore.factors.map((factor, idx) => (
                  <Tag
                    key={idx}
                    color={factor.impact === 'positive' ? 'green' : 'orange'}
                    style={{ border: 'none' }}
                  >
                    {factor.name}
                  </Tag>
                ))}
              </Space>
            </Col>
          </Row>
        </div>
      )}

      {/* Burnout Risk Indicators */}
      {burnoutRisks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Title level={5}>
            <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
            {t('leaves.burnoutRiskIndicators', 'Burnout Risk Indicators')}
          </Title>
          <Row gutter={[16, 16]}>
            {burnoutRisks.slice(0, 6).map((risk) => {
              const config = RISK_LEVEL_CONFIG[risk.risk_level];
              return (
                <Col key={risk.user_id} xs={24} sm={12} md={8}>
                  <div
                    style={{
                      padding: 12,
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      border: `1px solid ${config.color}40`,
                    }}
                  >
                    <Space align="start">
                      <Avatar
                        size="small"
                        icon={<UserOutlined />}
                        style={{ backgroundColor: config.color }}
                      />
                      <div>
                        <Text strong>{risk.user_name}</Text>
                        <div>
                          <Tag color={config.color} style={{ fontSize: 10 }}>
                            {config.icon} {config.label}
                          </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {risk.days_since_last_leave !== undefined &&
                            t('leaves.daysSinceLeave', '{{days}} days since last leave', {
                              days: risk.days_since_last_leave,
                            })}
                        </Text>
                      </div>
                    </Space>
                  </div>
                </Col>
              );
            })}
          </Row>
        </div>
      )}

      {/* Pattern Analysis */}
      {patterns && (
        <Collapse
          ghost
          defaultActiveKey={['patterns']}
          items={[
            {
              key: 'patterns',
              label: (
                <Space>
                  <LineChartOutlined style={{ color: '#1890ff' }} />
                  <Text strong>{t('leaves.patternAnalysis', 'Pattern Analysis')}</Text>
                </Space>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  {patterns.frequent_days.length > 0 && (
                    <Col xs={24} sm={12}>
                      <Card size="small" title={t('leaves.frequentDays', 'Most Common Leave Days')}>
                        <Space wrap>
                          {patterns.frequent_days.map((day) => (
                            <Tag key={day} color="blue">
                              {day}
                            </Tag>
                          ))}
                        </Space>
                      </Card>
                    </Col>
                  )}
                  {patterns.seasonal_peaks.length > 0 && (
                    <Col xs={24} sm={12}>
                      <Card size="small" title={t('leaves.seasonalPeaks', 'Peak Leave Periods')}>
                        <Space wrap>
                          {patterns.seasonal_peaks.map((peak) => (
                            <Tag key={peak} color="purple">
                              {peak}
                            </Tag>
                          ))}
                        </Space>
                      </Card>
                    </Col>
                  )}
                  <Col xs={24} sm={12}>
                    <Card size="small" title={t('leaves.avgDuration', 'Average Leave Duration')}>
                      <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                        {patterns.avg_duration} {t('leaves.days', 'days')}
                      </Title>
                    </Card>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Card size="small" title={t('leaves.shortNoticeRate', 'Short Notice Rate')}>
                      <Progress
                        percent={Math.round(patterns.short_notice_rate * 100)}
                        strokeColor={patterns.short_notice_rate > 0.3 ? '#ff4d4f' : '#52c41a'}
                      />
                    </Card>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      )}

      <Divider />

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Title level={5}>
            <BulbOutlined style={{ color: '#52c41a', marginRight: 8 }} />
            {t('leaves.recommendations', 'Recommendations')}
          </Title>
          <List
            dataSource={recommendations}
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

      {/* Coverage Suggestions */}
      {coverageSuggestions.length > 0 && (
        <div>
          <Title level={5}>
            <TeamOutlined style={{ color: '#1890ff', marginRight: 8 }} />
            {t('leaves.coverageSuggestions', 'Coverage Suggestions')}
          </Title>
          <List
            dataSource={coverageSuggestions}
            renderItem={(suggestion) => (
              <List.Item style={{ padding: '8px 0', border: 'none' }}>
                <Space align="start">
                  <TeamOutlined style={{ color: '#1890ff' }} />
                  <Text>{suggestion}</Text>
                </Space>
              </List.Item>
            )}
          />
        </div>
      )}
    </Card>
  );
}

export default LeaveAIInsightsPanel;
