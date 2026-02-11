import { Card, Typography, Space, Spin, Empty, Tooltip, Progress, Tag } from 'antd';
import { BarChartOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export interface AgingBucket {
  label: string;
  key: string;
  min_days: number;
  max_days: number | null;
  count: number;
  color: string;
}

interface AgingBucketsProps {
  onBucketClick?: (bucket: AgingBucket) => void;
  selectedBucket?: string;
  buckets?: AgingBucket[];
  isLoading?: boolean;
}

const DEFAULT_BUCKETS: AgingBucket[] = [
  { label: '1-7 days', key: '1-7', min_days: 1, max_days: 7, count: 0, color: '#52c41a' },
  { label: '8-14 days', key: '8-14', min_days: 8, max_days: 14, count: 0, color: '#fadb14' },
  { label: '15-30 days', key: '15-30', min_days: 15, max_days: 30, count: 0, color: '#faad14' },
  { label: '31-60 days', key: '31-60', min_days: 31, max_days: 60, count: 0, color: '#fa8c16' },
  { label: '60+ days', key: '60+', min_days: 60, max_days: null, count: 0, color: '#ff4d4f' },
];

export function AgingBuckets({
  onBucketClick,
  selectedBucket,
  buckets,
  isLoading = false,
}: AgingBucketsProps) {
  const { t } = useTranslation();

  // Use provided buckets or fetch from API
  const { data: bucketsData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'aging-buckets'],
    queryFn: async () => {
      // This would call the overdue API endpoint
      // For now, return mock data structure
      return DEFAULT_BUCKETS.map((bucket, index) => ({
        ...bucket,
        count: [8, 5, 4, 2, 1][index] || 0,
      }));
    },
    enabled: !buckets,
  });

  const loading = isLoading || dataLoading;
  const data = buckets || bucketsData || DEFAULT_BUCKETS;

  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);

  if (loading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <BarChartOutlined />
            {t('overdue.aging_distribution', 'Aging Distribution')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <BarChartOutlined />
            {t('overdue.aging_distribution', 'Aging Distribution')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('overdue.no_overdue_items', 'No overdue items')}
        />
      </Card>
    );
  }

  // Horizontal bar chart visualization
  const renderBarChart = () => {
    const maxCount = Math.max(...data.map((b) => b.count));

    return (
      <div style={{ padding: '8px 0' }}>
        {data.map((bucket) => {
          const percent = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          const totalPercent = total > 0 ? (bucket.count / total) * 100 : 0;
          const isSelected = selectedBucket === bucket.key;

          return (
            <Tooltip
              key={bucket.key}
              title={`${bucket.count} ${t('overdue.items', 'items')} (${totalPercent.toFixed(1)}% ${t('overdue.of_total', 'of total')})`}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 0',
                  cursor: onBucketClick ? 'pointer' : 'default',
                  backgroundColor: isSelected ? `${bucket.color}10` : 'transparent',
                  borderRadius: 4,
                  transition: 'background-color 0.2s',
                }}
                onClick={() => onBucketClick?.(bucket)}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {/* Label */}
                <div style={{ width: 100, flexShrink: 0, paddingLeft: 8 }}>
                  <Space size={4}>
                    <ClockCircleOutlined style={{ color: bucket.color, fontSize: 12 }} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {bucket.label}
                    </Text>
                  </Space>
                </div>

                {/* Bar */}
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div
                    style={{
                      height: 24,
                      backgroundColor: '#f0f0f0',
                      borderRadius: 4,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percent}%`,
                        backgroundColor: bucket.color,
                        borderRadius: 4,
                        transition: 'width 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        paddingRight: 8,
                        minWidth: bucket.count > 0 ? 24 : 0,
                      }}
                    >
                      {bucket.count > 0 && percent >= 20 && (
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                          {bucket.count}
                        </Text>
                      )}
                    </div>
                    {bucket.count > 0 && percent < 20 && (
                      <Text
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#595959',
                        }}
                      >
                        {bucket.count}
                      </Text>
                    )}
                  </div>
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <Tag color={bucket.color} style={{ marginRight: 8 }}>
                    {t('overdue.selected', 'Selected')}
                  </Tag>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  // Pie/donut chart visualization
  const renderDonutChart = () => {
    let cumulativePercent = 0;
    const segments = data.map((bucket) => {
      const percent = total > 0 ? (bucket.count / total) * 100 : 0;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;

      return {
        ...bucket,
        percent,
        startPercent,
      };
    });

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Donut */}
        <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
          <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
            {segments.map((segment, index) => {
              if (segment.count === 0) return null;
              const strokeDasharray = `${segment.percent} ${100 - segment.percent}`;
              const strokeDashoffset = -segment.startPercent;

              return (
                <circle
                  key={index}
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="3"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    cursor: onBucketClick ? 'pointer' : 'default',
                    opacity: selectedBucket && selectedBucket !== segment.key ? 0.3 : 1,
                  }}
                  onClick={() => onBucketClick?.(segment)}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <Text strong style={{ fontSize: 20 }}>{total}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {t('overdue.total', 'Total')}
              </Text>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ flex: 1 }}>
          {segments.map((bucket) => {
            if (bucket.count === 0) return null;
            const isSelected = selectedBucket === bucket.key;

            return (
              <Tooltip
                key={bucket.key}
                title={`${bucket.count} ${t('overdue.items', 'items')}`}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 0',
                    cursor: onBucketClick ? 'pointer' : 'default',
                    opacity: selectedBucket && !isSelected ? 0.5 : 1,
                  }}
                  onClick={() => onBucketClick?.(bucket)}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      backgroundColor: bucket.color,
                      marginRight: 8,
                      flexShrink: 0,
                    }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {bucket.label}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                    {bucket.count}
                  </Text>
                  <Progress
                    percent={bucket.percent}
                    size="small"
                    showInfo={false}
                    strokeColor={bucket.color}
                    style={{ width: 40 }}
                  />
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <BarChartOutlined style={{ color: '#1890ff' }} />
          {t('overdue.aging_distribution', 'Aging Distribution')}
        </Space>
      }
      extra={
        selectedBucket && (
          <Tag
            closable
            onClose={() => onBucketClick?.(null as any)}
            color="blue"
          >
            {data.find((b) => b.key === selectedBucket)?.label}
          </Tag>
        )
      }
    >
      {/* Horizontal Bar Chart */}
      {renderBarChart()}

      {/* Summary */}
      <div
        style={{
          marginTop: 16,
          padding: '12px',
          backgroundColor: '#fafafa',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 16, color: '#52c41a' }}>
            {data.filter((b) => b.min_days <= 14).reduce((sum, b) => sum + b.count, 0)}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.less_than_2_weeks', '< 2 Weeks')}
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 16, color: '#fa8c16' }}>
            {data.filter((b) => b.min_days >= 15 && (b.max_days || 999) <= 60).reduce((sum, b) => sum + b.count, 0)}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.2_to_8_weeks', '2-8 Weeks')}
            </Text>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Text strong style={{ fontSize: 16, color: '#ff4d4f' }}>
            {data.filter((b) => b.min_days >= 60).reduce((sum, b) => sum + b.count, 0)}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('overdue.more_than_2_months', '> 2 Months')}
            </Text>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default AgingBuckets;
