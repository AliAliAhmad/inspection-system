import { useState } from 'react';
import { Card, Segmented, Typography, Space, Spin, Empty, Statistic, Row, Col, Tooltip } from 'antd';
import {
  LineChartOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, ConsumptionReport } from '@inspection/shared';

const { Text } = Typography;

interface ConsumptionChartProps {
  materialId?: number;
  defaultPeriod?: 'week' | 'month' | 'quarter';
  showTrends?: boolean;
}

export function ConsumptionChart({
  materialId,
  defaultPeriod = 'month',
  showTrends = true,
}: ConsumptionChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>(defaultPeriod);

  const { data, isLoading } = useQuery({
    queryKey: ['material-consumption', materialId, period],
    queryFn: () => materialsApi.getConsumptionReport(period),
  });

  const report = data?.data?.data;

  const getTrendIcon = (direction?: string) => {
    if (!direction) return <MinusOutlined style={{ color: '#8c8c8c' }} />;
    if (direction === 'up' || direction === 'increasing') {
      return <ArrowUpOutlined style={{ color: '#ff4d4f' }} />;
    }
    if (direction === 'down' || direction === 'decreasing') {
      return <ArrowDownOutlined style={{ color: '#52c41a' }} />;
    }
    return <MinusOutlined style={{ color: '#8c8c8c' }} />;
  };

  const getTrendColor = (direction?: string) => {
    if (direction === 'up' || direction === 'increasing') return '#ff4d4f';
    if (direction === 'down' || direction === 'decreasing') return '#52c41a';
    return '#8c8c8c';
  };

  // Generate mock chart bars (in real app, would use chart library)
  const generateChartBars = () => {
    if (!report) return [];

    const categories = Object.entries(report.by_category || {});
    if (categories.length === 0) return [];

    const maxValue = Math.max(...categories.map(([, value]) => value as number));

    return categories.map(([category, value]) => ({
      category,
      value: value as number,
      percentage: maxValue > 0 ? ((value as number) / maxValue) * 100 : 0,
    }));
  };

  const chartBars = generateChartBars();

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <LineChartOutlined />
            {t('materials.consumption_chart', 'Consumption')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <LineChartOutlined />
            {t('materials.consumption_chart', 'Consumption')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_consumption_data', 'No consumption data available')}
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <LineChartOutlined />
          {t('materials.consumption_chart', 'Consumption')}
        </Space>
      }
      extra={
        <Segmented
          size="small"
          value={period}
          onChange={(val) => setPeriod(val as typeof period)}
          options={[
            { label: t('materials.week', 'Week'), value: 'week' },
            { label: t('materials.month', 'Month'), value: 'month' },
            { label: t('materials.quarter', 'Quarter'), value: 'quarter' },
          ]}
        />
      }
    >
      {/* Summary Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic
            title={t('materials.total_consumed', 'Total Consumed')}
            value={report.total_consumed}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title={t('materials.total_value', 'Total Value')}
            value={report.total_value}
            prefix="$"
            precision={2}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        {showTrends && report.trends && (
          <Col span={8}>
            <Statistic
              title={t('materials.trend', 'Trend')}
              value={Math.abs(report.trends.change_percent || 0)}
              suffix="%"
              prefix={getTrendIcon(report.trends.direction)}
              valueStyle={{
                fontSize: 20,
                color: getTrendColor(report.trends.direction),
              }}
            />
          </Col>
        )}
      </Row>

      {/* Category Breakdown Chart */}
      {chartBars.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
            {t('materials.by_category', 'By Category')}
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chartBars.map((bar) => (
              <div key={bar.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 80, fontSize: 12, textTransform: 'capitalize' }}>
                  {bar.category}
                </Text>
                <div
                  style={{
                    flex: 1,
                    height: 20,
                    background: '#f0f0f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <Tooltip title={`${bar.value} units`}>
                    <div
                      style={{
                        width: `${bar.percentage}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #1890ff, #096dd9)',
                        borderRadius: 4,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </Tooltip>
                </div>
                <Text style={{ width: 50, textAlign: 'right', fontSize: 12 }}>
                  {bar.value}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Items */}
      {report.top_items && report.top_items.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
            {t('materials.top_consumed', 'Top Consumed Items')}
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {report.top_items.slice(0, 5).map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                }}
              >
                <Text style={{ fontSize: 12 }}>
                  {index + 1}. {item.material.name}
                </Text>
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.quantity} units
                  </Text>
                  <Text style={{ fontSize: 12, color: '#1890ff' }}>
                    ${item.value.toFixed(2)}
                  </Text>
                </Space>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default ConsumptionChart;
