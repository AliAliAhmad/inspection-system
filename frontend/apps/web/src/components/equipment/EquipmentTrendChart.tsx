import { useState } from 'react';
import { Card, Segmented, Tooltip, Spin, Empty, Space, Typography } from 'antd';
import {
  CaretUpOutlined,
  CaretDownOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { equipmentApi, DailyTrend } from '@inspection/shared';

const { Text } = Typography;

interface TrendChartProps {
  defaultPeriod?: '7d' | '30d';
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const statusColors = {
  active: '#52c41a',
  maintenance: '#faad14',
  stopped: '#ff4d4f',
};

export function EquipmentTrendChart({
  defaultPeriod = '7d',
  collapsible = true,
  defaultCollapsed = false,
}: TrendChartProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'7d' | '30d'>(defaultPeriod);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const { data: trendData, isLoading } = useQuery({
    queryKey: ['equipment-trends', period],
    queryFn: async () => {
      const res = await equipmentApi.getTrends(period);
      return res.data?.data;
    },
    enabled: !collapsed,
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDayLabel = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const maxValue = trendData?.data
    ? Math.max(...trendData.data.map((d: DailyTrend) => d.total))
    : 100;

  const renderBar = (value: number, color: string, total: number, label: string) => {
    const height = total > 0 ? Math.max((value / total) * 100, 2) : 0;
    return (
      <Tooltip title={`${label}: ${value}`}>
        <div
          style={{
            width: '100%',
            height: `${height}%`,
            background: color,
            borderRadius: 2,
            minHeight: value > 0 ? 4 : 0,
            transition: 'height 0.3s ease',
          }}
        />
      </Tooltip>
    );
  };

  const cardTitle = (
    <Space
      style={{ width: '100%', justifyContent: 'space-between', cursor: collapsible ? 'pointer' : 'default' }}
      onClick={() => collapsible && setCollapsed(!collapsed)}
    >
      <Space>
        <LineChartOutlined />
        <span>{t('equipment.statusTrends', 'Status Trends')}</span>
        {collapsible && (
          collapsed ? <CaretDownOutlined style={{ fontSize: 12 }} /> : <CaretUpOutlined style={{ fontSize: 12 }} />
        )}
      </Space>
      {!collapsed && (
        <Segmented
          size="small"
          value={period}
          onChange={(val) => setPeriod(val as '7d' | '30d')}
          onClick={(e) => e.stopPropagation()}
          options={[
            { label: t('equipment.7days', '7 Days'), value: '7d' },
            { label: t('equipment.30days', '30 Days'), value: '30d' },
          ]}
        />
      )}
    </Space>
  );

  return (
    <Card
      title={cardTitle}
      size="small"
      style={{ marginBottom: 16 }}
      styles={{ body: collapsed ? { display: 'none' } : {} }}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : !trendData?.data || trendData.data.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData', 'No data available')} />
      ) : (
        <div>
          {/* Chart */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              height: 180,
              gap: period === '7d' ? 16 : 6,
              padding: '0 8px',
              marginBottom: 8,
            }}
          >
            {trendData.data.map((day: DailyTrend, index: number) => (
              <Tooltip
                key={index}
                title={
                  <div>
                    <div><strong>{formatDate(day.date)}</strong></div>
                    <div style={{ color: statusColors.active }}>Active: {day.active}</div>
                    <div style={{ color: statusColors.maintenance }}>Maintenance: {day.maintenance}</div>
                    <div style={{ color: statusColors.stopped }}>Stopped: {day.stopped}</div>
                    <div>Total: {day.total}</div>
                  </div>
                }
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  {/* Stacked bar */}
                  <div
                    style={{
                      flex: 1,
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      gap: 1,
                      maxWidth: period === '7d' ? 40 : 20,
                    }}
                  >
                    {renderBar(day.active, statusColors.active, maxValue, 'Active')}
                    {renderBar(day.maintenance, statusColors.maintenance, maxValue, 'Maintenance')}
                    {renderBar(day.stopped, statusColors.stopped, maxValue, 'Stopped')}
                  </div>
                  {/* Date label */}
                  <Text
                    type="secondary"
                    style={{
                      fontSize: period === '7d' ? 11 : 9,
                      marginTop: 4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {period === '7d' ? formatDayLabel(day.date) : formatDate(day.date)}
                  </Text>
                </div>
              </Tooltip>
            ))}
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              padding: '8px 0',
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <Space size={4}>
              <div style={{ width: 12, height: 12, background: statusColors.active, borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('equipment.active', 'Active')}
              </Text>
            </Space>
            <Space size={4}>
              <div style={{ width: 12, height: 12, background: statusColors.maintenance, borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('equipment.maintenance', 'Maintenance')}
              </Text>
            </Space>
            <Space size={4}>
              <div style={{ width: 12, height: 12, background: statusColors.stopped, borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('equipment.stopped', 'Stopped')}
              </Text>
            </Space>
          </div>

          {/* Summary stats */}
          {trendData.summary && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                padding: '12px 0',
                borderTop: '1px solid #f0f0f0',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('equipment.avgActiveRate', 'Avg Active Rate')}
                </Text>
                <div style={{ color: statusColors.active, fontWeight: 600 }}>
                  {trendData.summary.avg_active_rate.toFixed(1)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('equipment.avgMaintenanceRate', 'Avg Maintenance Rate')}
                </Text>
                <div style={{ color: statusColors.maintenance, fontWeight: 600 }}>
                  {trendData.summary.avg_maintenance_rate.toFixed(1)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('equipment.avgStoppedRate', 'Avg Stopped Rate')}
                </Text>
                <div style={{ color: statusColors.stopped, fontWeight: 600 }}>
                  {trendData.summary.avg_stopped_rate.toFixed(1)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default EquipmentTrendChart;
