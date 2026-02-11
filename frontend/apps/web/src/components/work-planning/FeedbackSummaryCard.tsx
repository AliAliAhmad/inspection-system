/**
 * FeedbackSummaryCard.tsx
 * Shows a summary of worker feedback including ratings, strengths, and areas to improve.
 */
import React, { useMemo } from 'react';
import {
  Card,
  Space,
  Typography,
  Tag,
  Progress,
  Statistic,
  Row,
  Col,
  List,
  Divider,
  Tooltip,
  Empty,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  StarOutlined,
  TrophyOutlined,
  AimOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface FeedbackSummaryCardProps {
  worker: {
    id: number;
    fullName: string;
    role?: string;
  };
  period?: {
    start: string;
    end: string;
    label?: string;
  };
  performance?: {
    avgQcRating: number | null;
    avgCleaningRating: number | null;
    avgTimeRating: number | null;
    totalJobs: number;
    completedJobs: number;
    completionRate: number;
    totalPoints?: number;
  };
  strengths?: string[];
  areasToImprove?: string[];
  focusAreas?: string[];
  compact?: boolean;
}

// Default strengths/improvements based on ratings
const getDefaultStrengths = (performance: FeedbackSummaryCardProps['performance']): string[] => {
  const strengths: string[] = [];
  if (!performance) return strengths;

  if ((performance.avgQcRating ?? 0) >= 4) {
    strengths.push('Consistently high quality work');
  }
  if ((performance.avgCleaningRating ?? 0) >= 1.5) {
    strengths.push('Excellent workplace cleanliness');
  }
  if ((performance.avgTimeRating ?? 0) >= 4) {
    strengths.push('Efficient time management');
  }
  if (performance.completionRate >= 95) {
    strengths.push('Reliable job completion');
  }
  if (performance.totalJobs >= 20) {
    strengths.push('High volume capacity');
  }

  return strengths.length > 0 ? strengths : ['Developing performance baseline'];
};

const getDefaultAreasToImprove = (performance: FeedbackSummaryCardProps['performance']): string[] => {
  const areas: string[] = [];
  if (!performance) return areas;

  if ((performance.avgQcRating ?? 5) < 3) {
    areas.push('Quality control needs attention');
  }
  if ((performance.avgCleaningRating ?? 2) < 1) {
    areas.push('Improve cleanup after jobs');
  }
  if ((performance.avgTimeRating ?? 5) < 3) {
    areas.push('Work on time estimation accuracy');
  }
  if (performance.completionRate < 80) {
    areas.push('Focus on completing assigned jobs');
  }

  return areas;
};

const getDefaultFocusAreas = (
  performance: FeedbackSummaryCardProps['performance'],
  areasToImprove: string[]
): string[] => {
  if (!performance || areasToImprove.length === 0) {
    return ['Continue maintaining current performance standards'];
  }

  const focus: string[] = [];
  if ((performance.avgQcRating ?? 5) < 4) {
    focus.push('Review QC checklist before job completion');
  }
  if ((performance.avgTimeRating ?? 5) < 4) {
    focus.push('Plan job steps before starting work');
  }
  if (areasToImprove.length > 0) {
    focus.push('Schedule brief check-in with supervisor');
  }

  return focus.slice(0, 3);
};

export const FeedbackSummaryCard: React.FC<FeedbackSummaryCardProps> = ({
  worker,
  period,
  performance,
  strengths: providedStrengths,
  areasToImprove: providedAreas,
  focusAreas: providedFocus,
  compact = false,
}) => {
  // Calculate derived values
  const strengths = useMemo(
    () => providedStrengths || getDefaultStrengths(performance),
    [providedStrengths, performance]
  );

  const areasToImprove = useMemo(
    () => providedAreas || getDefaultAreasToImprove(performance),
    [providedAreas, performance]
  );

  const focusAreas = useMemo(
    () => providedFocus || getDefaultFocusAreas(performance, areasToImprove),
    [providedFocus, performance, areasToImprove]
  );

  // Overall performance score (0-100)
  const overallScore = useMemo(() => {
    if (!performance) return null;
    const qcWeight = 0.4;
    const timeWeight = 0.3;
    const completionWeight = 0.3;

    const qcScore = ((performance.avgQcRating ?? 3) / 5) * 100;
    const timeScore = ((performance.avgTimeRating ?? 3) / 5) * 100;
    const completionScore = performance.completionRate;

    return Math.round(qcScore * qcWeight + timeScore * timeWeight + completionScore * completionWeight);
  }, [performance]);

  const getScoreColor = (score: number | null) => {
    if (score === null) return '#8c8c8c';
    if (score >= 85) return '#52c41a';
    if (score >= 70) return '#1890ff';
    if (score >= 55) return '#faad14';
    return '#ff4d4f';
  };

  if (!performance) {
    return (
      <Card size="small">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No performance data available"
        />
      </Card>
    );
  }

  if (compact) {
    return (
      <Card
        size="small"
        style={{ marginBottom: 8 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Row align="middle" gutter={16}>
          <Col flex="none">
            <UserOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          </Col>
          <Col flex="auto">
            <Text strong>{worker.fullName}</Text>
            {worker.role && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {worker.role}
              </Text>
            )}
          </Col>
          <Col>
            <Space size="small">
              <Tooltip title="QC Rating">
                <Tag icon={<StarOutlined />}>
                  {performance.avgQcRating?.toFixed(1) ?? '-'}
                </Tag>
              </Tooltip>
              <Tooltip title="Jobs Completed">
                <Tag icon={<ToolOutlined />}>
                  {performance.completedJobs}/{performance.totalJobs}
                </Tag>
              </Tooltip>
              <Tooltip title="Overall Score">
                <Progress
                  type="circle"
                  percent={overallScore ?? 0}
                  width={36}
                  strokeColor={getScoreColor(overallScore)}
                  format={(p) => `${p}`}
                />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <UserOutlined />
          <span>{worker.fullName}</span>
          {worker.role && <Tag>{worker.role}</Tag>}
        </Space>
      }
      extra={
        period && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {period.label || `${period.start} - ${period.end}`}
          </Text>
        )
      }
      style={{ marginBottom: 16 }}
    >
      {/* Overall Score & Key Metrics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="circle"
              percent={overallScore ?? 0}
              width={80}
              strokeColor={getScoreColor(overallScore)}
              format={(p) => (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{p}</div>
                  <div style={{ fontSize: 10, color: '#8c8c8c' }}>Score</div>
                </div>
              )}
            />
          </div>
        </Col>
        <Col span={18}>
          <Row gutter={[16, 16]}>
            <Col span={6}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Avg QC</Text>}
                value={performance.avgQcRating ?? '-'}
                suffix="/ 5"
                valueStyle={{
                  fontSize: 18,
                  color: (performance.avgQcRating ?? 0) >= 4 ? '#52c41a' : undefined
                }}
                prefix={<StarOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Avg Cleaning</Text>}
                value={performance.avgCleaningRating ?? '-'}
                suffix="/ 2"
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Jobs Done</Text>}
                value={performance.completedJobs}
                suffix={`/ ${performance.totalJobs}`}
                valueStyle={{ fontSize: 18 }}
                prefix={<ToolOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 12 }}>Completion</Text>}
                value={performance.completionRate}
                suffix="%"
                valueStyle={{
                  fontSize: 18,
                  color: performance.completionRate >= 90 ? '#52c41a' : performance.completionRate >= 75 ? '#faad14' : '#ff4d4f'
                }}
              />
            </Col>
          </Row>
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      <Row gutter={24}>
        {/* Strengths */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text strong style={{ color: '#52c41a' }}>Strengths</Text>
            </Space>
          </div>
          <List
            size="small"
            dataSource={strengths}
            renderItem={(item) => (
              <List.Item style={{ padding: '4px 0', border: 'none' }}>
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                  <Text style={{ fontSize: 13 }}>{item}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Col>

        {/* Areas to Improve */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <Text strong style={{ color: '#faad14' }}>Areas to Improve</Text>
            </Space>
          </div>
          {areasToImprove.length > 0 ? (
            <List
              size="small"
              dataSource={areasToImprove}
              renderItem={(item) => (
                <List.Item style={{ padding: '4px 0', border: 'none' }}>
                  <Space>
                    <WarningOutlined style={{ color: '#faad14', fontSize: 12 }} />
                    <Text style={{ fontSize: 13 }}>{item}</Text>
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: 13 }}>
              No specific areas identified
            </Text>
          )}
        </Col>

        {/* Focus Areas */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Space>
              <AimOutlined style={{ color: '#1890ff' }} />
              <Text strong style={{ color: '#1890ff' }}>Focus Areas</Text>
            </Space>
          </div>
          <List
            size="small"
            dataSource={focusAreas}
            renderItem={(item, index) => (
              <List.Item style={{ padding: '4px 0', border: 'none' }}>
                <Space>
                  <Tag color="blue" style={{ minWidth: 20, textAlign: 'center' }}>
                    {index + 1}
                  </Tag>
                  <Text style={{ fontSize: 13 }}>{item}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Col>
      </Row>

      {/* Points Earned */}
      {performance.totalPoints !== undefined && (
        <>
          <Divider style={{ margin: '16px 0' }} />
          <Row justify="end">
            <Col>
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                <Text strong>Points Earned:</Text>
                <Tag color="gold" style={{ fontSize: 14 }}>
                  {performance.totalPoints} pts
                </Tag>
              </Space>
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
};

export default FeedbackSummaryCard;
