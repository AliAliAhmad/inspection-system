/**
 * RatingBiasAlert.tsx
 * Alert for rating bias detection - shows when an engineer's ratings deviate from peers.
 */
import React, { useMemo } from 'react';
import {
  Alert,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  Progress,
  List,
  Statistic,
  Tooltip,
  Button,
  Divider,
} from 'antd';
import {
  ExclamationCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  UserOutlined,
  StarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  BarChartOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface BiasPattern {
  type: 'lenient' | 'strict' | 'inconsistent' | 'favorites' | 'recency';
  description: string;
  severity: 'low' | 'medium' | 'high';
  affectedWorkers?: string[];
}

interface RatingBiasAlertProps {
  engineerId: number;
  engineerName: string;
  averageRating: number;
  peerAverageRating: number;
  totalRatingsGiven: number;
  biasDetected: boolean;
  biasPatterns: BiasPattern[];
  suggestedCalibration?: string;
  ratingDistribution?: {
    rating: number;
    count: number;
    peerPercent: number;
  }[];
  onViewDetails?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

// Calculate bias from rating data
export const detectRatingBias = (
  ratings: Array<{
    qc_rating: number | null;
    rated_by_id: number;
    user_id: number;
    user?: { full_name: string };
  }>,
  engineerId: number,
  allRatings: Array<{
    qc_rating: number | null;
    rated_by_id: number;
  }>
): Omit<RatingBiasAlertProps, 'engineerId' | 'engineerName' | 'onViewDetails' | 'onDismiss' | 'compact'> => {
  // Filter ratings by this engineer
  const engineerRatings = ratings.filter(r => r.rated_by_id === engineerId && r.qc_rating != null);
  const peerRatings = allRatings.filter(r => r.rated_by_id !== engineerId && r.qc_rating != null);

  if (engineerRatings.length < 5) {
    return {
      averageRating: 0,
      peerAverageRating: 0,
      totalRatingsGiven: engineerRatings.length,
      biasDetected: false,
      biasPatterns: [],
    };
  }

  const avgRating = engineerRatings.reduce((sum, r) => sum + (r.qc_rating || 0), 0) / engineerRatings.length;
  const peerAvg = peerRatings.length > 0
    ? peerRatings.reduce((sum, r) => sum + (r.qc_rating || 0), 0) / peerRatings.length
    : 3.5;

  const patterns: BiasPattern[] = [];
  let biasDetected = false;

  // Check for leniency/strictness bias
  const deviation = avgRating - peerAvg;
  if (Math.abs(deviation) > 0.5) {
    biasDetected = true;
    if (deviation > 0.5) {
      patterns.push({
        type: 'lenient',
        description: `Ratings are ${(deviation).toFixed(1)} points higher than peer average`,
        severity: deviation > 1 ? 'high' : 'medium',
      });
    } else {
      patterns.push({
        type: 'strict',
        description: `Ratings are ${Math.abs(deviation).toFixed(1)} points lower than peer average`,
        severity: Math.abs(deviation) > 1 ? 'high' : 'medium',
      });
    }
  }

  // Check for rating distribution (e.g., always gives 5s or always gives 3s)
  const ratingCounts = new Map<number, number>();
  engineerRatings.forEach(r => {
    const rating = Math.round(r.qc_rating || 0);
    ratingCounts.set(rating, (ratingCounts.get(rating) || 0) + 1);
  });

  const mostCommon = Array.from(ratingCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (mostCommon && mostCommon[1] > engineerRatings.length * 0.6) {
    biasDetected = true;
    patterns.push({
      type: 'inconsistent',
      description: `${Math.round((mostCommon[1] / engineerRatings.length) * 100)}% of ratings are ${mostCommon[0]} stars`,
      severity: mostCommon[1] > engineerRatings.length * 0.8 ? 'high' : 'medium',
    });
  }

  // Check for favorites (same workers always rated higher)
  const workerRatings = new Map<number, number[]>();
  engineerRatings.forEach(r => {
    const existing = workerRatings.get(r.user_id) || [];
    existing.push(r.qc_rating || 0);
    workerRatings.set(r.user_id, existing);
  });

  const workerAvgs = Array.from(workerRatings.entries()).map(([id, ratings]) => ({
    id,
    avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
    name: engineerRatings.find(r => r.user_id === id)?.user?.full_name,
  }));

  const highRated = workerAvgs.filter(w => w.avg > avgRating + 0.8);
  if (highRated.length > 0 && workerAvgs.length > 3) {
    patterns.push({
      type: 'favorites',
      description: `Consistently rates ${highRated.length} worker(s) higher than others`,
      severity: 'low',
      affectedWorkers: highRated.map(w => w.name || `Worker ${w.id}`),
    });
  }

  // Generate calibration suggestion
  let suggestedCalibration: string | undefined;
  if (biasDetected) {
    if (patterns.some(p => p.type === 'lenient')) {
      suggestedCalibration = 'Consider applying stricter criteria for 5-star ratings. Reserve top ratings for exceptional work only.';
    } else if (patterns.some(p => p.type === 'strict')) {
      suggestedCalibration = 'Consider whether ratings reflect actual work quality. Ensure 4-star is used for consistently good work.';
    } else if (patterns.some(p => p.type === 'inconsistent')) {
      suggestedCalibration = 'Use the full rating scale. Consider specific criteria for each rating level.';
    }
  }

  // Build distribution
  const distribution = [1, 2, 3, 4, 5].map(rating => {
    const count = ratingCounts.get(rating) || 0;
    // Simulate peer distribution
    const peerPercent = rating === 4 ? 40 : rating === 3 ? 30 : rating === 5 ? 20 : 10;
    return { rating, count, peerPercent };
  });

  return {
    averageRating: Math.round(avgRating * 10) / 10,
    peerAverageRating: Math.round(peerAvg * 10) / 10,
    totalRatingsGiven: engineerRatings.length,
    biasDetected,
    biasPatterns: patterns,
    suggestedCalibration,
    ratingDistribution: distribution,
  };
};

const getSeverityColor = (severity: BiasPattern['severity']) => {
  switch (severity) {
    case 'high': return '#ff4d4f';
    case 'medium': return '#faad14';
    case 'low': return '#1890ff';
    default: return '#8c8c8c';
  }
};

const getBiasTypeIcon = (type: BiasPattern['type']) => {
  switch (type) {
    case 'lenient': return <ArrowUpOutlined />;
    case 'strict': return <ArrowDownOutlined />;
    case 'inconsistent': return <BarChartOutlined />;
    case 'favorites': return <UserOutlined />;
    default: return <InfoCircleOutlined />;
  }
};

export const RatingBiasAlert: React.FC<RatingBiasAlertProps> = ({
  engineerId,
  engineerName,
  averageRating,
  peerAverageRating,
  totalRatingsGiven,
  biasDetected,
  biasPatterns,
  suggestedCalibration,
  ratingDistribution,
  onViewDetails,
  onDismiss,
  compact = false,
}) => {
  const deviation = averageRating - peerAverageRating;
  const deviationPercent = peerAverageRating > 0 ? Math.round((deviation / peerAverageRating) * 100) : 0;

  // Don't show if no bias detected
  if (!biasDetected && compact) {
    return null;
  }

  // Compact alert version
  if (compact && biasDetected) {
    return (
      <Alert
        type={biasPatterns.some(p => p.severity === 'high') ? 'error' : 'warning'}
        message={
          <Space>
            <ExclamationCircleOutlined />
            <Text strong>Rating Bias Detected</Text>
            <Tag color={deviation > 0 ? 'orange' : 'blue'}>
              {deviation > 0 ? '+' : ''}{deviation.toFixed(1)} vs peers
            </Tag>
          </Space>
        }
        description={
          <Space direction="vertical" size={4}>
            <Text>
              {engineerName}'s average rating ({averageRating}) differs from peer average ({peerAverageRating}).
            </Text>
            {suggestedCalibration && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {suggestedCalibration}
              </Text>
            )}
          </Space>
        }
        showIcon
        closable={!!onDismiss}
        onClose={onDismiss}
        action={
          onViewDetails && (
            <Button size="small" onClick={onViewDetails}>
              View Details
            </Button>
          )
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  // Full card version
  return (
    <Card
      title={
        <Space>
          {biasDetected ? (
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
          ) : (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          )}
          <span>Rating Analysis: {engineerName}</span>
          {biasDetected && (
            <Tag color="warning">Bias Detected</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary">{totalRatingsGiven} ratings analyzed</Text>
          {onDismiss && (
            <Button size="small" onClick={onDismiss}>Dismiss</Button>
          )}
        </Space>
      }
    >
      <Row gutter={24}>
        {/* Rating Comparison */}
        <Col span={8}>
          <div style={{ textAlign: 'center' }}>
            <Statistic
              title="Your Average Rating"
              value={averageRating}
              suffix="/ 5"
              prefix={<StarOutlined />}
              valueStyle={{
                color: Math.abs(deviation) > 0.5 ? (deviation > 0 ? '#faad14' : '#1890ff') : '#52c41a'
              }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">Peer Average: </Text>
              <Text strong>{peerAverageRating}</Text>
            </div>
            <div style={{ marginTop: 4 }}>
              <Tag
                color={Math.abs(deviation) <= 0.3 ? 'green' : deviation > 0 ? 'orange' : 'blue'}
              >
                {deviation > 0 ? '+' : ''}{deviation.toFixed(1)} ({deviationPercent > 0 ? '+' : ''}{deviationPercent}%)
              </Tag>
            </div>
          </div>
        </Col>

        {/* Rating Distribution */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Text strong>Rating Distribution</Text>
          </div>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            {ratingDistribution?.reverse().map(({ rating, count, peerPercent }) => {
              const percent = totalRatingsGiven > 0 ? Math.round((count / totalRatingsGiven) * 100) : 0;
              const isDeviant = Math.abs(percent - peerPercent) > 15;
              return (
                <div key={rating} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ width: 30 }}>{rating} <StarOutlined style={{ fontSize: 10 }} /></Text>
                  <Tooltip title={`You: ${percent}% | Peers: ${peerPercent}%`}>
                    <Progress
                      percent={percent}
                      size="small"
                      style={{ flex: 1 }}
                      strokeColor={isDeviant ? '#faad14' : '#1890ff'}
                      format={(p) => `${p}%`}
                    />
                  </Tooltip>
                </div>
              );
            })}
          </Space>
        </Col>

        {/* Bias Patterns */}
        <Col span={8}>
          <div style={{ marginBottom: 8 }}>
            <Text strong>Detected Patterns</Text>
          </div>
          {biasPatterns.length > 0 ? (
            <List
              size="small"
              dataSource={biasPatterns}
              renderItem={(pattern) => (
                <List.Item style={{ padding: '6px 0', borderBottom: 'none' }}>
                  <Space direction="vertical" size={0}>
                    <Space>
                      {getBiasTypeIcon(pattern.type)}
                      <Tag color={pattern.severity === 'high' ? 'error' : pattern.severity === 'medium' ? 'warning' : 'default'}>
                        {pattern.type}
                      </Tag>
                    </Space>
                    <Text style={{ fontSize: 12 }}>{pattern.description}</Text>
                    {pattern.affectedWorkers && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Workers: {pattern.affectedWorkers.join(', ')}
                      </Text>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          ) : (
            <Space direction="vertical">
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 24 }} />
              <Text>No significant bias patterns detected</Text>
            </Space>
          )}
        </Col>
      </Row>

      {/* Calibration Suggestion */}
      {suggestedCalibration && (
        <>
          <Divider style={{ margin: '16px 0' }} />
          <Alert
            type="info"
            message="Suggested Calibration"
            description={suggestedCalibration}
            showIcon
            icon={<InfoCircleOutlined />}
          />
        </>
      )}

      {/* Actions */}
      {onViewDetails && (
        <>
          <Divider style={{ margin: '16px 0 12px' }} />
          <Row justify="end">
            <Button type="primary" onClick={onViewDetails}>
              View Detailed Analysis
            </Button>
          </Row>
        </>
      )}
    </Card>
  );
};

export default RatingBiasAlert;
