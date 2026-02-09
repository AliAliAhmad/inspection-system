import { Card, Typography, Space, Spin, Empty, Tooltip, Progress } from 'antd';
import { PieChartOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi } from '@inspection/shared';

const { Text } = Typography;

interface CategoryBreakdownChartProps {
  type?: 'stock' | 'consumption';
  onCategoryClick?: (category: string) => void;
}

const categoryColors: Record<string, string> = {
  filter: '#1890ff',
  lubricant: '#faad14',
  hydraulic: '#13c2c2',
  electrical: '#722ed1',
  mechanical: '#fa8c16',
  safety: '#f5222d',
  consumable: '#52c41a',
  spare_part: '#2f54eb',
  other: '#8c8c8c',
};

export function CategoryBreakdownChart({
  type = 'stock',
  onCategoryClick,
}: CategoryBreakdownChartProps) {
  const { t } = useTranslation();

  const { data: materialsData, isLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list(),
  });

  const materials = materialsData?.data?.materials || [];

  // Calculate category breakdown
  const categoryBreakdown = materials.reduce((acc, material) => {
    const category = material.category || 'other';
    if (!acc[category]) {
      acc[category] = { count: 0, stock: 0 };
    }
    acc[category].count += 1;
    acc[category].stock += material.current_stock;
    return acc;
  }, {} as Record<string, { count: number; stock: number }>);

  const categories = Object.entries(categoryBreakdown).map(([category, data]) => ({
    category,
    value: type === 'stock' ? data.stock : data.count,
    color: categoryColors[category] || '#8c8c8c',
  }));

  const total = categories.reduce((sum, cat) => sum + cat.value, 0);

  // Sort by value descending
  categories.sort((a, b) => b.value - a.value);

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <PieChartOutlined />
            {t('materials.category_breakdown', 'Category Breakdown')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (categories.length === 0) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <PieChartOutlined />
            {t('materials.category_breakdown', 'Category Breakdown')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('common.noData', 'No data available')}
        />
      </Card>
    );
  }

  // Simple donut chart visualization
  const renderDonutChart = () => {
    let cumulativePercent = 0;
    const segments = categories.map((cat) => {
      const percent = total > 0 ? (cat.value / total) * 100 : 0;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;

      return {
        ...cat,
        percent,
        startPercent,
      };
    });

    return (
      <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto' }}>
        <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
          {segments.map((segment, index) => {
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
                style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
                onClick={() => onCategoryClick?.(segment.category)}
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
            <Text type="secondary" style={{ fontSize: 11 }}>
              {type === 'stock'
                ? t('materials.total_units', 'Total Units')
                : t('materials.total_items', 'Total Items')}
            </Text>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <PieChartOutlined />
          {type === 'stock'
            ? t('materials.stock_by_category', 'Stock by Category')
            : t('materials.items_by_category', 'Items by Category')}
        </Space>
      }
    >
      {/* Donut Chart */}
      {renderDonutChart()}

      {/* Legend */}
      <div style={{ marginTop: 16 }}>
        {categories.map((cat) => {
          const percent = total > 0 ? (cat.value / total) * 100 : 0;
          return (
            <Tooltip
              key={cat.category}
              title={`${cat.value} ${type === 'stock' ? 'units' : 'items'} (${percent.toFixed(1)}%)`}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 0',
                  cursor: onCategoryClick ? 'pointer' : 'default',
                }}
                onClick={() => onCategoryClick?.(cat.category)}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: cat.color,
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    textTransform: 'capitalize',
                  }}
                >
                  {cat.category.replace('_', ' ')}
                </Text>
                <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
                  {cat.value}
                </Text>
                <Progress
                  percent={percent}
                  size="small"
                  showInfo={false}
                  strokeColor={cat.color}
                  style={{ width: 60 }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Card>
  );
}

export default CategoryBreakdownChart;
