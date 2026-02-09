import { Card, Typography, Space, Spin, Empty, Table, Tag, Progress, Row, Col, Statistic } from 'antd';
import { BarChartOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, ABCCategory, Material } from '@inspection/shared';

const { Text, Title } = Typography;

interface ABCAnalysisChartProps {
  onCategoryClick?: (category: 'A' | 'B' | 'C') => void;
  showDetails?: boolean;
}

const categoryConfig: Record<string, { color: string; bgColor: string; description: string }> = {
  A: {
    color: '#f5222d',
    bgColor: '#fff1f0',
    description: 'High value - requires tight control',
  },
  B: {
    color: '#faad14',
    bgColor: '#fffbe6',
    description: 'Medium value - normal control',
  },
  C: {
    color: '#52c41a',
    bgColor: '#f6ffed',
    description: 'Low value - simple control',
  },
};

export function ABCAnalysisChart({
  onCategoryClick,
  showDetails = true,
}: ABCAnalysisChartProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['material-abc-analysis'],
    queryFn: () => materialsApi.getABCAnalysis(),
  });

  const categories = data?.data?.categories || [];
  const totalValue = data?.data?.total_value || 0;

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <BarChartOutlined style={{ color: '#1890ff' }} />
            {t('materials.abc_analysis', 'ABC Analysis')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 30 }}>
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
            <BarChartOutlined style={{ color: '#1890ff' }} />
            {t('materials.abc_analysis', 'ABC Analysis')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_abc_data', 'Insufficient data for ABC analysis')}
        />
      </Card>
    );
  }

  // Sort categories A, B, C
  const sortedCategories = [...categories].sort((a, b) => {
    const order = { A: 1, B: 2, C: 3 };
    return order[a.category] - order[b.category];
  });

  // Pareto chart data
  let cumulative = 0;
  const paretoData = sortedCategories.map((cat) => {
    cumulative += cat.percentage;
    return {
      ...cat,
      cumulative,
    };
  });

  return (
    <Card
      size="small"
      title={
        <Space>
          <BarChartOutlined style={{ color: '#1890ff' }} />
          {t('materials.abc_analysis', 'ABC Analysis')}
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 11 }}>
          <InfoCircleOutlined /> {t('materials.pareto_principle', 'Pareto Principle (80/20)')}
        </Text>
      }
    >
      {/* Total Value */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Text type="secondary">{t('materials.total_inventory_value', 'Total Inventory Value')}</Text>
        <Title level={3} style={{ margin: '4px 0' }}>
          ${totalValue.toLocaleString()}
        </Title>
      </div>

      {/* Pareto Chart Visualization */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            height: 120,
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid #f0f0f0',
          }}
        >
          {paretoData.map((cat) => {
            const config = categoryConfig[cat.category];
            return (
              <div
                key={cat.category}
                style={{
                  width: `${cat.percentage}%`,
                  background: config.bgColor,
                  borderRight: '1px solid #fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: onCategoryClick ? 'pointer' : 'default',
                  transition: 'transform 0.2s',
                }}
                onClick={() => onCategoryClick?.(cat.category)}
                onMouseEnter={(e) => {
                  if (onCategoryClick) e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <Tag
                  color={config.color}
                  style={{ fontSize: 18, fontWeight: 600, padding: '4px 12px' }}
                >
                  {cat.category}
                </Tag>
                <Text style={{ fontSize: 12, marginTop: 4 }}>
                  {cat.percentage.toFixed(1)}%
                </Text>
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {cat.materials.length} items
                </Text>
              </div>
            );
          })}
        </div>

        {/* Cumulative Line Indicator */}
        <div style={{ marginTop: 8, height: 24, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: '#f0f0f0',
            }}
          />
          {paretoData.map((cat, index) => (
            <div
              key={cat.category}
              style={{
                position: 'absolute',
                left: `${cat.cumulative}%`,
                top: -4,
                transform: 'translateX(-50%)',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: categoryConfig[cat.category].color,
                  border: '2px solid #fff',
                }}
              />
              <Text style={{ fontSize: 10, display: 'block', textAlign: 'center' }}>
                {cat.cumulative.toFixed(0)}%
              </Text>
            </div>
          ))}
        </div>
      </div>

      {/* Category Details */}
      <Row gutter={8}>
        {sortedCategories.map((cat) => {
          const config = categoryConfig[cat.category];
          return (
            <Col span={8} key={cat.category}>
              <Card
                size="small"
                style={{
                  background: config.bgColor,
                  borderColor: config.color,
                  cursor: onCategoryClick ? 'pointer' : 'default',
                }}
                onClick={() => onCategoryClick?.(cat.category)}
              >
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Tag color={config.color} style={{ fontWeight: 600 }}>
                      {t(`materials.category_${cat.category}`, `Category ${cat.category}`)}
                    </Tag>
                    <Text strong>{cat.materials.length}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {config.description}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 12 }}>
                      ${cat.total_value.toLocaleString()}
                    </Text>
                  </div>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Top Items in Category A */}
      {showDetails && sortedCategories.find((c) => c.category === 'A')?.materials && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('materials.category_a_items', 'Category A Items (High Value)')}
          </Text>
          <div style={{ marginTop: 8 }}>
            {sortedCategories
              .find((c) => c.category === 'A')
              ?.materials.slice(0, 5)
              .map((material, index) => (
                <div
                  key={material.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Text style={{ fontSize: 12 }}>
                    {index + 1}. {material.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {material.current_stock} {material.unit}
                  </Text>
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default ABCAnalysisChart;
