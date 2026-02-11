import { Card, Typography, Space, Tag, Segmented, Empty, Spin, Tooltip } from 'antd';
import {
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  MinusOutlined,
  InfoCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

export interface PerformancePoint {
  date: string;
  score: number;
  is_prediction?: boolean;
}

export interface TrajectoryData {
  historical: PerformancePoint[];
  predictions: PerformancePoint[];
  trend: 'improving' | 'declining' | 'stable';
  trend_confidence: number;
  current_score: number;
  predicted_score_30d: number;
  predicted_score_90d: number;
  insights: string[];
}

export interface TrajectoryChartProps {
  userId?: number;
  compact?: boolean;
}

type Period = '30d' | '90d' | '180d';

const performanceApi = {
  getTrajectory: (userId?: number, period?: string) =>
    apiClient.get('/api/performance/trajectory', { params: { user_id: userId, period } }),
};

const TREND_CONFIG = {
  improving: { color: '#52c41a', icon: <RiseOutlined />, label: 'Improving' },
  declining: { color: '#ff4d4f', icon: <FallOutlined />, label: 'Declining' },
  stable: { color: '#1677ff', icon: <MinusOutlined />, label: 'Stable' },
};

export function TrajectoryChart({ userId, compact = false }: TrajectoryChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('90d');

  const { data, isLoading } = useQuery({
    queryKey: ['performance', 'trajectory', userId, period],
    queryFn: () => performanceApi.getTrajectory(userId, period).then((r) => r.data),
  });

  const trajectoryData: TrajectoryData | null = data?.data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!trajectoryData || trajectoryData.historical.length === 0) {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#1677ff' }} />
            {t('performance.trajectory', 'Performance Trajectory')}
          </Space>
        }
      >
        <Empty description={t('performance.no_trajectory_data', 'No trajectory data available')} />
      </Card>
    );
  }

  const trendConfig = TREND_CONFIG[trajectoryData.trend];
  const allPoints = [...trajectoryData.historical, ...trajectoryData.predictions];

  // Calculate chart dimensions and scales
  const chartHeight = compact ? 120 : 200;
  const chartPadding = { top: 20, right: 60, bottom: 30, left: 40 };

  const scores = allPoints.map((p) => p.score);
  const minScore = Math.min(...scores) - 5;
  const maxScore = Math.max(...scores) + 5;
  const scoreRange = maxScore - minScore || 1;

  // Generate SVG path for historical data
  const generatePath = (points: PerformancePoint[], isPrediction: boolean = false) => {
    if (points.length < 2) return '';

    const startIndex = isPrediction ? trajectoryData.historical.length - 1 : 0;
    const pathPoints = isPrediction
      ? [trajectoryData.historical[trajectoryData.historical.length - 1], ...points]
      : points;

    return pathPoints
      .map((p, i) => {
        const x = ((startIndex + i) / (allPoints.length - 1)) * 100;
        const y = ((maxScore - p.score) / scoreRange) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const historicalPath = generatePath(trajectoryData.historical);
  const predictionPath = generatePath(trajectoryData.predictions, true);

  // Prediction area fill
  const predictionAreaPath = predictionPath
    ? `${predictionPath} L 100 100 L ${((trajectoryData.historical.length - 1) / (allPoints.length - 1)) * 100} 100 Z`
    : '';

  const scoreChange = trajectoryData.predicted_score_90d - trajectoryData.current_score;

  if (compact) {
    return (
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Trend Icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: `${trendConfig.color}15`,
              color: trendConfig.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            {trendConfig.icon}
          </div>

          {/* Stats */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Text strong style={{ fontSize: 18 }}>
                {trajectoryData.current_score}
              </Text>
              <Text
                style={{
                  color: trendConfig.color,
                  fontSize: 12,
                }}
              >
                {scoreChange >= 0 ? '+' : ''}
                {scoreChange.toFixed(1)} {t('performance.in_90d', 'in 90d')}
              </Text>
            </div>
            <Tag color={trendConfig.color} style={{ fontSize: 10 }}>
              {trendConfig.icon} {trendConfig.label}
            </Tag>
          </div>

          {/* Mini chart */}
          <div style={{ width: 100, height: 40 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d={historicalPath} fill="none" stroke="#1677ff" strokeWidth="3" />
              <path d={predictionPath} fill="none" stroke="#1677ff" strokeWidth="3" strokeDasharray="5,5" opacity="0.5" />
            </svg>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <LineChartOutlined style={{ color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>
            {t('performance.trajectory', 'Performance Trajectory')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          <Tag color={trendConfig.color} icon={trendConfig.icon}>
            {trendConfig.label}
          </Tag>
          <Segmented
            value={period}
            onChange={(val) => setPeriod(val as Period)}
            options={[
              { label: '30d', value: '30d' },
              { label: '90d', value: '90d' },
              { label: '180d', value: '180d' },
            ]}
            size="small"
          />
        </Space>
      }
    >
      {/* Score Summary */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          padding: 16,
          backgroundColor: '#fafafa',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ textAlign: 'center', flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('performance.current_score', 'Current Score')}
          </Text>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff' }}>
            {trajectoryData.current_score}
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('performance.predicted_30d', 'Predicted (30d)')}
          </Text>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: trajectoryData.predicted_score_30d >= trajectoryData.current_score ? '#52c41a' : '#ff4d4f',
            }}
          >
            {trajectoryData.predicted_score_30d}
            <Text style={{ fontSize: 14, marginLeft: 4 }}>
              ({trajectoryData.predicted_score_30d >= trajectoryData.current_score ? '+' : ''}
              {(trajectoryData.predicted_score_30d - trajectoryData.current_score).toFixed(1)})
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('performance.predicted_90d', 'Predicted (90d)')}
          </Text>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: trajectoryData.predicted_score_90d >= trajectoryData.current_score ? '#52c41a' : '#ff4d4f',
            }}
          >
            {trajectoryData.predicted_score_90d}
            <Text style={{ fontSize: 14, marginLeft: 4 }}>
              ({trajectoryData.predicted_score_90d >= trajectoryData.current_score ? '+' : ''}
              {(trajectoryData.predicted_score_90d - trajectoryData.current_score).toFixed(1)})
            </Text>
          </div>
        </div>
        <Tooltip title={`${t('performance.confidence', 'Confidence')}: ${trajectoryData.trend_confidence}%`}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('performance.confidence', 'Confidence')}
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#8c8c8c' }}>
              {trajectoryData.trend_confidence}%
            </div>
          </div>
        </Tooltip>
      </div>

      {/* Chart */}
      <div style={{ height: chartHeight, position: 'relative' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f0f0f0" strokeWidth="0.5" />
          ))}

          {/* Prediction area fill */}
          <path d={predictionAreaPath} fill="rgba(22, 119, 255, 0.08)" />

          {/* Historical line */}
          <path
            d={historicalPath}
            fill="none"
            stroke="#1677ff"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Prediction line (dashed) */}
          <path
            d={predictionPath}
            fill="none"
            stroke="#1677ff"
            strokeWidth="2.5"
            strokeDasharray="5,5"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />

          {/* Data points - historical */}
          {trajectoryData.historical.map((point, i) => {
            const x = (i / (allPoints.length - 1)) * 100;
            const y = ((maxScore - point.score) / scoreRange) * 100;
            return (
              <circle key={i} cx={x} cy={y} r="1.5" fill="#1677ff" />
            );
          })}

          {/* Data points - predictions */}
          {trajectoryData.predictions.map((point, i) => {
            const x = ((trajectoryData.historical.length + i) / (allPoints.length - 1)) * 100;
            const y = ((maxScore - point.score) / scoreRange) * 100;
            return (
              <circle key={`pred-${i}`} cx={x} cy={y} r="1.5" fill="#1677ff" opacity="0.6" />
            );
          })}
        </svg>

        {/* Y-axis labels */}
        <div
          style={{
            position: 'absolute',
            left: -35,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>{maxScore.toFixed(0)}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>{((maxScore + minScore) / 2).toFixed(0)}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>{minScore.toFixed(0)}</Text>
        </div>

        {/* X-axis labels */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -24,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>
            {dayjs(allPoints[0].date).format('MMM D')}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {dayjs(allPoints[Math.floor(allPoints.length / 2)].date).format('MMM D')}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {dayjs(allPoints[allPoints.length - 1].date).format('MMM D')}
          </Text>
        </div>

        {/* Prediction divider label */}
        {trajectoryData.predictions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: `${((trajectoryData.historical.length - 1) / (allPoints.length - 1)) * 100}%`,
              top: -10,
              transform: 'translateX(-50%)',
            }}
          >
            <Tag color="blue" style={{ fontSize: 9 }}>
              {t('performance.prediction', 'Prediction')}
            </Tag>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 32 }}>
        <Space size={4}>
          <div style={{ width: 24, height: 3, backgroundColor: '#1677ff' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('performance.historical', 'Historical')}
          </Text>
        </Space>
        <Space size={4}>
          <div
            style={{
              width: 24,
              height: 3,
              backgroundColor: '#1677ff',
              opacity: 0.6,
              backgroundImage: 'linear-gradient(90deg, #1677ff 50%, transparent 50%)',
              backgroundSize: '6px 3px',
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('performance.predicted', 'Predicted')}
          </Text>
        </Space>
      </div>

      {/* Insights */}
      {trajectoryData.insights.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#f6ffed',
            borderRadius: 8,
            border: '1px solid #b7eb8f',
          }}
        >
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            <InfoCircleOutlined style={{ marginRight: 4, color: '#52c41a' }} />
            {t('performance.insights', 'Insights')}
          </Text>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {trajectoryData.insights.map((insight, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <Text style={{ fontSize: 12 }}>{insight}</Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default TrajectoryChart;
