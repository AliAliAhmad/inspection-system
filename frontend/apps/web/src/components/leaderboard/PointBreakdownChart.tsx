import { Card, Typography, Empty, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import type { PointBreakdown } from '@inspection/shared';

const { Text, Title } = Typography;

export interface PointBreakdownChartProps {
  data: PointBreakdown[];
  loading?: boolean;
  title?: string;
}

const SOURCE_COLORS: Record<string, string> = {
  inspections: '#1677ff',
  jobs: '#52c41a',
  achievements: '#ffd700',
  challenges: '#722ed1',
  streaks: '#fa541c',
  bonuses: '#eb2f96',
  other: '#8c8c8c',
};

const SOURCE_LABELS: Record<string, string> = {
  inspections: 'Inspections',
  jobs: 'Jobs',
  achievements: 'Achievements',
  challenges: 'Challenges',
  streaks: 'Streaks',
  bonuses: 'Bonuses',
  other: 'Other',
};

export function PointBreakdownChart({
  data,
  loading = false,
  title,
}: PointBreakdownChartProps) {
  const { t } = useTranslation();

  const totalPoints = data.reduce((sum, item) => sum + item.points, 0);

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
      <Card title={title || t('leaderboard.point_breakdown', 'Point Breakdown')}>
        <Empty description={t('leaderboard.no_data', 'No data available')} />
      </Card>
    );
  }

  return (
    <Card title={title || t('leaderboard.point_breakdown', 'Point Breakdown')}>
      {/* Donut chart visualization using CSS */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        {/* Donut chart */}
        <div
          style={{
            width: 160,
            height: 160,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            {(() => {
              let cumulativePercent = 0;
              return data.map((item, index) => {
                const percent = item.percentage / 100;
                const startAngle = cumulativePercent * 360;
                const endAngle = (cumulativePercent + percent) * 360;
                cumulativePercent += percent;

                const largeArcFlag = percent > 0.5 ? 1 : 0;
                const startX = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                const startY = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                const endX = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                const endY = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);

                const color = SOURCE_COLORS[item.source] || SOURCE_COLORS.other;

                return (
                  <path
                    key={index}
                    d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY} Z`}
                    fill={color}
                    stroke="#fff"
                    strokeWidth="1"
                  />
                );
              });
            })()}
            {/* Inner circle for donut effect */}
            <circle cx="50" cy="50" r="25" fill="#fff" />
          </svg>
          {/* Center text */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <Title level={4} style={{ margin: 0, lineHeight: 1 }}>
              {totalPoints.toLocaleString()}
            </Title>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('leaderboard.total', 'Total')}
            </Text>
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {data.map((item) => {
            const color = SOURCE_COLORS[item.source] || SOURCE_COLORS.other;
            const label = SOURCE_LABELS[item.source] || item.source;
            return (
              <div
                key={item.source}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: color,
                    }}
                  />
                  <Text>{t(`leaderboard.sources.${item.source}`, label)}</Text>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text strong>{item.points.toLocaleString()}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    ({item.percentage.toFixed(1)}%)
                  </Text>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default PointBreakdownChart;
