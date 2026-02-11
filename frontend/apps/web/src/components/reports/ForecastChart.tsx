import { useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Spin,
  Empty,
  Tag,
  Select,
  Alert,
  Row,
  Col,
  Statistic,
  Tooltip,
} from 'antd';
import {
  LineChartOutlined,
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsAIApi, type ForecastResult, type ForecastPrediction } from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface ForecastChartProps {
  compact?: boolean;
}

const METRIC_OPTIONS = [
  { value: 'inspections', label: 'Inspections' },
  { value: 'defects', label: 'Defects' },
  { value: 'pass_rate', label: 'Pass Rate' },
  { value: 'jobs_completed', label: 'Jobs Completed' },
  { value: 'sla_breaches', label: 'SLA Breaches' },
  { value: 'utilization', label: 'Workforce Utilization' },
];

export function ForecastChart({ compact = false }: ForecastChartProps) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState('inspections');
  const [periods, setPeriods] = useState(4);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports-ai', 'forecast', metric, periods],
    queryFn: () => reportsAIApi.forecastMetric(metric, periods),
  });

  const forecastResult: ForecastResult | null = data || null;

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        type="error"
        message={t('reports.ai.error', 'Failed to load forecast data')}
        showIcon
      />
    );
  }

  if (!forecastResult || forecastResult.predictions.length === 0) {
    return (
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#1677ff' }} />
            {t('reports.ai.forecast', 'Metric Forecast')}
          </Space>
        }
      >
        <Empty description={t('reports.ai.noForecast', 'No forecast data available')} />
      </Card>
    );
  }

  const { predictions } = forecastResult;
  const latestPrediction = predictions[predictions.length - 1];
  const firstPrediction = predictions[0];
  const trendDirection = latestPrediction.predicted_value >= firstPrediction.predicted_value ? 'up' : 'down';
  const trendPercentage = firstPrediction.predicted_value > 0
    ? ((latestPrediction.predicted_value - firstPrediction.predicted_value) / firstPrediction.predicted_value * 100)
    : 0;

  // Calculate chart dimensions
  const chartHeight = compact ? 100 : 200;
  const values = predictions.map((p) => p.predicted_value);
  const minValue = Math.min(...values) * 0.9;
  const maxValue = Math.max(...values) * 1.1;
  const valueRange = maxValue - minValue || 1;

  // Generate SVG path
  const generatePath = () => {
    return predictions
      .map((prediction, i) => {
        const x = (i / (predictions.length - 1)) * 100;
        const y = ((maxValue - prediction.predicted_value) / valueRange) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // Generate confidence band path
  const generateConfidenceBand = () => {
    const upperPath = predictions
      .map((prediction, i) => {
        const x = (i / (predictions.length - 1)) * 100;
        const confidenceMargin = prediction.predicted_value * (1 - prediction.confidence / 100) * 0.5;
        const upperValue = prediction.predicted_value + confidenceMargin;
        const y = ((maxValue - upperValue) / valueRange) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    const lowerPath = predictions
      .slice()
      .reverse()
      .map((prediction, i) => {
        const reverseIndex = predictions.length - 1 - i;
        const x = (reverseIndex / (predictions.length - 1)) * 100;
        const confidenceMargin = prediction.predicted_value * (1 - prediction.confidence / 100) * 0.5;
        const lowerValue = prediction.predicted_value - confidenceMargin;
        const y = ((maxValue - lowerValue) / valueRange) * 100;
        return `L ${x} ${y}`;
      })
      .join(' ');

    return `${upperPath} ${lowerPath} Z`;
  };

  const mainPath = generatePath();
  const confidenceBandPath = generateConfidenceBand();

  if (compact) {
    return (
      <Card size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: trendDirection === 'up' ? '#f6ffed' : '#fff2f0',
              color: trendDirection === 'up' ? '#52c41a' : '#ff4d4f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            {trendDirection === 'up' ? <RiseOutlined /> : <FallOutlined />}
          </div>

          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {METRIC_OPTIONS.find((m) => m.value === metric)?.label} Forecast
            </Text>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Text strong style={{ fontSize: 18 }}>
                {latestPrediction.predicted_value.toFixed(1)}
              </Text>
              <Text
                style={{
                  color: trendDirection === 'up' ? '#52c41a' : '#ff4d4f',
                  fontSize: 12,
                }}
              >
                {trendPercentage >= 0 ? '+' : ''}
                {trendPercentage.toFixed(1)}%
              </Text>
            </div>
          </div>

          <div style={{ width: 80, height: 40 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d={mainPath} fill="none" stroke="#1677ff" strokeWidth="3" />
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
            {t('reports.ai.forecast', 'Metric Forecast')}
          </Title>
        </Space>
      }
      extra={
        <Space>
          <Select
            value={metric}
            onChange={setMetric}
            options={METRIC_OPTIONS}
            style={{ width: 180 }}
            size="small"
          />
          <Select
            value={periods}
            onChange={setPeriods}
            options={[
              { value: 2, label: '2 Periods' },
              { value: 4, label: '4 Periods' },
              { value: 6, label: '6 Periods' },
              { value: 8, label: '8 Periods' },
            ]}
            style={{ width: 120 }}
            size="small"
          />
        </Space>
      }
    >
      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}
          >
            <Statistic
              title={t('reports.ai.nearTermForecast', 'Near-term Forecast')}
              value={firstPrediction.predicted_value}
              precision={1}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({firstPrediction.horizon_days}d)
                </Text>
              }
            />
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {firstPrediction.confidence}% confidence
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{ backgroundColor: '#e6f7ff', borderColor: '#91d5ff' }}
          >
            <Statistic
              title={t('reports.ai.longTermForecast', 'Long-term Forecast')}
              value={latestPrediction.predicted_value}
              precision={1}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ({latestPrediction.horizon_days}d)
                </Text>
              }
            />
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {latestPrediction.confidence}% confidence
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            size="small"
            style={{
              backgroundColor: trendDirection === 'up' ? '#f6ffed' : '#fff2f0',
              borderColor: trendDirection === 'up' ? '#b7eb8f' : '#ffccc7',
            }}
          >
            <Statistic
              title={t('reports.ai.projectedChange', 'Projected Change')}
              value={trendPercentage}
              precision={1}
              prefix={trendDirection === 'up' ? <RiseOutlined /> : <FallOutlined />}
              suffix="%"
              valueStyle={{
                color: trendDirection === 'up' ? '#52c41a' : '#ff4d4f',
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      <div style={{ height: chartHeight, position: 'relative', marginBottom: 40 }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f0f0f0" strokeWidth="0.5" />
          ))}

          {/* Confidence band */}
          <path d={confidenceBandPath} fill="rgba(22, 119, 255, 0.15)" />

          {/* Main prediction line */}
          <path
            d={mainPath}
            fill="none"
            stroke="#1677ff"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {predictions.map((prediction, i) => {
            const x = (i / (predictions.length - 1)) * 100;
            const y = ((maxValue - prediction.predicted_value) / valueRange) * 100;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="2"
                fill="#1677ff"
                stroke="#fff"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        {/* Y-axis labels */}
        <div
          style={{
            position: 'absolute',
            left: -45,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>
            {maxValue.toFixed(0)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {((maxValue + minValue) / 2).toFixed(0)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {minValue.toFixed(0)}
          </Text>
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
          {predictions.map((prediction, i) => (
            <Text key={i} type="secondary" style={{ fontSize: 10 }}>
              +{prediction.horizon_days}d
            </Text>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
        <Space size={4}>
          <div style={{ width: 24, height: 3, backgroundColor: '#1677ff' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('reports.ai.predictedValue', 'Predicted Value')}
          </Text>
        </Space>
        <Space size={4}>
          <div
            style={{
              width: 24,
              height: 12,
              backgroundColor: 'rgba(22, 119, 255, 0.15)',
              borderRadius: 2,
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('reports.ai.confidenceBand', 'Confidence Band')}
          </Text>
        </Space>
      </div>

      {/* Prediction Details */}
      <Card
        size="small"
        style={{ marginTop: 16, backgroundColor: '#fafafa' }}
        title={
          <Space>
            <InfoCircleOutlined style={{ color: '#1677ff' }} />
            <Text strong>{t('reports.ai.predictionDetails', 'Prediction Details')}</Text>
          </Space>
        }
      >
        <Row gutter={[16, 8]}>
          {predictions.map((prediction, i) => (
            <Col key={i} xs={24} sm={12} md={6}>
              <div
                style={{
                  padding: 8,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                }}
              >
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  +{prediction.horizon_days} {t('reports.ai.days', 'days')}
                </Text>
                <Text strong style={{ fontSize: 16 }}>
                  {prediction.predicted_value.toFixed(1)}
                </Text>
                <Tag
                  color={prediction.confidence >= 80 ? 'success' : prediction.confidence >= 60 ? 'warning' : 'default'}
                  style={{ marginLeft: 8, fontSize: 10 }}
                >
                  {prediction.confidence}%
                </Tag>
                {prediction.reasoning && (
                  <Tooltip title={prediction.reasoning}>
                    <InfoCircleOutlined style={{ marginLeft: 4, color: '#8c8c8c', fontSize: 12 }} />
                  </Tooltip>
                )}
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </Card>
  );
}

export default ForecastChart;
