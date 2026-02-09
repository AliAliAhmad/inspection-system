import { Card, Typography, Segmented, Empty, Spin } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HistoricalData } from '@inspection/shared';

const { Text, Title } = Typography;

export interface PerformanceChartProps {
  data: HistoricalData[];
  loading?: boolean;
  onPeriodChange?: (period: '7d' | '30d' | '90d') => void;
  title?: string;
}

type ChartType = 'points' | 'rank';
type Period = '7d' | '30d' | '90d';

export function PerformanceChart({
  data,
  loading = false,
  onPeriodChange,
  title,
}: PerformanceChartProps) {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState<ChartType>('points');
  const [period, setPeriod] = useState<Period>('30d');

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    onPeriodChange?.(newPeriod);
  };

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card title={title || t('leaderboard.performance', 'Performance')}>
        <Empty description={t('leaderboard.no_data', 'No data available')} />
      </Card>
    );
  }

  // Calculate chart dimensions
  const chartHeight = 200;
  const chartWidth = '100%';
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };

  // Get min/max values
  const values = data.map((d) => (chartType === 'points' ? d.points : d.rank));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  // For rank, lower is better so we invert the scale
  const isRank = chartType === 'rank';

  // Generate SVG path
  const generatePath = () => {
    if (data.length < 2) return '';

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const value = chartType === 'points' ? d.points : d.rank;
      const normalizedY = (value - minValue) / valueRange;
      // For rank, invert Y (lower rank = higher on chart)
      const y = isRank ? normalizedY * 100 : (1 - normalizedY) * 100;
      return { x, y };
    });

    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  };

  const generateAreaPath = () => {
    const linePath = generatePath();
    if (!linePath) return '';
    return `${linePath} L 100 100 L 0 100 Z`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Current and previous values
  const currentValue = data[data.length - 1];
  const previousValue = data[0];
  const change = chartType === 'points'
    ? currentValue.points - previousValue.points
    : previousValue.rank - currentValue.rank;
  const changePercent = chartType === 'points'
    ? ((change / previousValue.points) * 100).toFixed(1)
    : change;
  const isPositive = change > 0;

  return (
    <Card
      title={title || t('leaderboard.performance', 'Performance')}
      extra={
        <Segmented
          value={period}
          onChange={(val) => handlePeriodChange(val as Period)}
          options={[
            { label: '7d', value: '7d' },
            { label: '30d', value: '30d' },
            { label: '90d', value: '90d' },
          ]}
          size="small"
        />
      }
    >
      {/* Chart type toggle */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={chartType}
          onChange={(val) => setChartType(val as ChartType)}
          options={[
            { label: t('leaderboard.points', 'Points'), value: 'points' },
            { label: t('leaderboard.rank', 'Rank'), value: 'rank' },
          ]}
          size="small"
        />
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Text type="secondary">{t('leaderboard.current', 'Current')}</Text>
          <Title level={3} style={{ margin: 0 }}>
            {chartType === 'points'
              ? currentValue.points.toLocaleString()
              : `#${currentValue.rank}`}
          </Title>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text type="secondary">{t('leaderboard.change', 'Change')}</Text>
          <Title
            level={4}
            style={{
              margin: 0,
              color: isPositive ? '#52c41a' : '#f5222d',
            }}
          >
            {isPositive ? '+' : ''}
            {chartType === 'points' ? `${changePercent}%` : change}
            {chartType === 'rank' && ' positions'}
          </Title>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: chartHeight, width: chartWidth, position: 'relative' }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="#f0f0f0"
              strokeWidth="0.5"
            />
          ))}

          {/* Area fill */}
          <path
            d={generateAreaPath()}
            fill={chartType === 'points' ? 'rgba(22, 119, 255, 0.1)' : 'rgba(82, 196, 26, 0.1)'}
          />

          {/* Line */}
          <path
            d={generatePath()}
            fill="none"
            stroke={chartType === 'points' ? '#1677ff' : '#52c41a'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const value = chartType === 'points' ? d.points : d.rank;
            const normalizedY = (value - minValue) / valueRange;
            const y = isRank ? normalizedY * 100 : (1 - normalizedY) * 100;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1.5"
                fill={chartType === 'points' ? '#1677ff' : '#52c41a'}
              />
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            position: 'absolute',
            bottom: -24,
            left: 0,
            right: 0,
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>
            {formatDate(data[0].date)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {formatDate(data[data.length - 1].date)}
          </Text>
        </div>
      </div>
    </Card>
  );
}

export default PerformanceChart;
