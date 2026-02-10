import { Card, Typography, Spin, Empty, Tag, Space, List, Progress, Alert, Row, Col, Divider } from 'antd';
import {
  BulbOutlined,
  WarningOutlined,
  RocketOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qualityReviewsApi, type AIAnalysisResult } from '@inspection/shared';
import { AIInsightsPanel, AIInsight } from '../shared/AIInsightsPanel';

const { Title, Text, Paragraph } = Typography;

interface QCAIAnalysisPanelProps {
  compact?: boolean;
  showInsights?: boolean;
  maxPatterns?: number;
}

/**
 * QCAIAnalysisPanel - AI Analysis Display Panel for Quality Reviews
 *
 * Displays:
 * - Defect patterns and clusters
 * - Recurring issues
 * - Predictions for rejection rates
 * - AI-generated recommendations
 */
export function QCAIAnalysisPanel({
  compact = false,
  showInsights = true,
  maxPatterns = 5,
}: QCAIAnalysisPanelProps) {
  const { t } = useTranslation();

  const { data: aiAnalysis, isLoading, error, refetch } = useQuery({
    queryKey: ['qc-ai-analysis'],
    queryFn: () => qualityReviewsApi.getAIAnalysis?.().then((r) => r.data?.data),
    enabled: !!qualityReviewsApi.getAIAnalysis,
    staleTime: 300000, // 5 minutes cache
  });

  // Mock data if API not available
  const mockAnalysis: AIAnalysisResult = {
    patterns: [
      { pattern: 'Incomplete photo documentation', frequency: 23, severity: 'high' },
      { pattern: 'Missing safety checklist items', frequency: 18, severity: 'high' },
      { pattern: 'Parts not matching specifications', frequency: 12, severity: 'medium' },
      { pattern: 'Delayed submission timing', frequency: 8, severity: 'low' },
      { pattern: 'Unclear work descriptions', frequency: 6, severity: 'low' },
    ],
    recommendations: [
      'Implement mandatory photo upload validation before job completion',
      'Add safety checklist completion requirement to workflow',
      'Create parts verification step with barcode scanning',
      'Send automated reminders for pending submissions',
      'Provide template descriptions for common job types',
    ],
    predicted_rejection_rate: 12.5,
    high_risk_areas: [
      'Electrical installations',
      'Plumbing repairs',
      'HVAC maintenance',
    ],
  };

  const data = aiAnalysis || mockAnalysis;

  // Transform AI analysis into insights format
  const generateInsights = (): AIInsight[] => {
    const insights: AIInsight[] = [];

    // Prediction insight
    insights.push({
      id: 'prediction',
      type: 'trend',
      title: t('qc.ai.predicted_rejection', 'Predicted Rejection Rate'),
      description: t('qc.ai.predicted_rejection_desc', 'Based on current trends, the predicted rejection rate for the next period is {{rate}}%', {
        rate: data.predicted_rejection_rate.toFixed(1),
      }),
      priority: data.predicted_rejection_rate > 15 ? 'high' : data.predicted_rejection_rate > 10 ? 'medium' : 'low',
      metadata: {
        percentage: 100 - data.predicted_rejection_rate,
        trend: data.predicted_rejection_rate > 15 ? 'down' : 'up',
      },
    });

    // High-severity patterns as warnings
    data.patterns
      .filter((p) => p.severity === 'high')
      .slice(0, 2)
      .forEach((pattern, index) => {
        insights.push({
          id: `pattern-${index}`,
          type: 'warning',
          title: pattern.pattern,
          description: t('qc.ai.pattern_frequency', 'This issue has occurred {{count}} times recently. Consider implementing preventive measures.', {
            count: pattern.frequency,
          }),
          priority: 'high',
          metadata: {
            score: pattern.frequency / 30, // Normalize to 0-1
            category: pattern.severity,
          },
        });
      });

    // Recommendations as tips
    data.recommendations.slice(0, 2).forEach((rec, index) => {
      insights.push({
        id: `rec-${index}`,
        type: 'suggestion',
        title: t('qc.ai.recommendation', 'Recommendation'),
        description: rec,
        priority: index === 0 ? 'high' : 'medium',
      });
    });

    // High-risk areas as opportunities
    if (data.high_risk_areas.length > 0) {
      insights.push({
        id: 'high-risk',
        type: 'opportunity',
        title: t('qc.ai.high_risk_areas', 'Focus Areas'),
        description: t('qc.ai.high_risk_areas_desc', 'These areas show higher rejection rates and would benefit from additional attention: {{areas}}', {
          areas: data.high_risk_areas.join(', '),
        }),
        priority: 'medium',
      });
    }

    return insights;
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: compact ? 24 : 48 }}>
          <Spin tip={t('qc.ai.analyzing', 'AI is analyzing patterns...')} />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert
          type="warning"
          message={t('qc.ai.unavailable', 'AI Analysis Unavailable')}
          description={t('qc.ai.unavailable_desc', 'Unable to load AI analysis. Please try again later.')}
          showIcon
        />
      </Card>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return '#f5222d';
      case 'medium':
        return '#faad14';
      case 'low':
        return '#52c41a';
      default:
        return '#1890ff';
    }
  };

  const getSeverityTag = (severity: string) => {
    const colors: Record<string, string> = {
      high: 'red',
      medium: 'orange',
      low: 'green',
    };
    return (
      <Tag color={colors[severity] || 'blue'}>
        {severity.toUpperCase()}
      </Tag>
    );
  };

  // If showing insights panel format
  if (showInsights && !compact) {
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <AIInsightsPanel
            title={t('qc.ai.insights', 'AI Insights')}
            insights={generateInsights()}
            onRefresh={() => refetch()}
            loading={isLoading}
          />
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: '#722ed1' }} />
                {t('qc.ai.patterns', 'Defect Patterns')}
              </Space>
            }
          >
            <List
              dataSource={data.patterns.slice(0, maxPatterns)}
              renderItem={(pattern) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text>{pattern.pattern}</Text>
                      {getSeverityTag(pattern.severity)}
                    </div>
                    <Progress
                      percent={(pattern.frequency / Math.max(...data.patterns.map((p) => p.frequency))) * 100}
                      showInfo={false}
                      strokeColor={getSeverityColor(pattern.severity)}
                      size="small"
                    />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {t('qc.ai.occurrences', '{{count}} occurrences', { count: pattern.frequency })}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* Recommendations Card */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <BulbOutlined style={{ color: '#faad14' }} />
                {t('qc.ai.recommendations', 'AI Recommendations')}
              </Space>
            }
          >
            <List
              grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
              dataSource={data.recommendations}
              renderItem={(rec, index) => (
                <List.Item>
                  <Card
                    size="small"
                    style={{
                      backgroundColor: index === 0 ? '#fffbe6' : '#f6ffed',
                      borderColor: index === 0 ? '#ffe58f' : '#b7eb8f',
                    }}
                  >
                    <Space direction="vertical" size={4}>
                      <Tag color={index === 0 ? 'gold' : 'green'}>
                        {index === 0 ? t('qc.ai.priority_high', 'High Priority') : t('qc.ai.suggested', 'Suggested')}
                      </Tag>
                      <Text>{rec}</Text>
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* High Risk Areas */}
        {data.high_risk_areas.length > 0 && (
          <Col xs={24}>
            <Alert
              type="warning"
              icon={<ExclamationCircleOutlined />}
              message={t('qc.ai.high_risk_alert', 'High Risk Areas Identified')}
              description={
                <Space wrap style={{ marginTop: 8 }}>
                  {data.high_risk_areas.map((area) => (
                    <Tag key={area} color="red">
                      {area}
                    </Tag>
                  ))}
                </Space>
              }
              showIcon
            />
          </Col>
        )}
      </Row>
    );
  }

  // Compact view
  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#722ed1' }} />
          {t('qc.ai.analysis', 'AI Analysis')}
        </Space>
      }
      size={compact ? 'small' : 'default'}
    >
      {/* Prediction Summary */}
      <div
        style={{
          padding: 12,
          backgroundColor: data.predicted_rejection_rate > 15 ? '#fff2f0' : '#f6ffed',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <Space>
          {data.predicted_rejection_rate > 15 ? (
            <WarningOutlined style={{ color: '#f5222d', fontSize: 20 }} />
          ) : (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
          )}
          <div>
            <Text strong>{t('qc.ai.predicted_rejection', 'Predicted Rejection Rate')}</Text>
            <br />
            <Text
              style={{
                fontSize: 20,
                color: data.predicted_rejection_rate > 15 ? '#f5222d' : '#52c41a',
              }}
            >
              {data.predicted_rejection_rate.toFixed(1)}%
            </Text>
          </div>
        </Space>
      </div>

      {/* Top Patterns */}
      <Title level={5} style={{ marginBottom: 8 }}>
        {t('qc.ai.top_patterns', 'Top Patterns')}
      </Title>
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        {data.patterns.slice(0, 3).map((pattern, index) => (
          <div key={pattern.pattern} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text ellipsis style={{ flex: 1 }}>
              {index + 1}. {pattern.pattern}
            </Text>
            <Tag color={pattern.severity === 'high' ? 'red' : pattern.severity === 'medium' ? 'orange' : 'green'}>
              {pattern.frequency}
            </Tag>
          </div>
        ))}
      </Space>

      {/* Quick Recommendation */}
      {data.recommendations.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ backgroundColor: '#e6f7ff', padding: 8, borderRadius: 4 }}>
            <Space>
              <BulbOutlined style={{ color: '#1890ff' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {data.recommendations[0]}
              </Text>
            </Space>
          </div>
        </>
      )}
    </Card>
  );
}

export default QCAIAnalysisPanel;
