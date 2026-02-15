import React from 'react';
import { Card, Progress, Typography, Space, Spin, Empty, Tooltip, Row, Col, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { scheduleAIApi } from '@inspection/shared';
import type { CapacityForecast } from '@inspection/shared';
import {
  TeamOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface CapacityGaugeProps {
  showWeeklyBreakdown?: boolean;
  days?: number;
  height?: number;
}

const getUtilizationColor = (percentage: number): string => {
  if (percentage >= 95) return '#cf1322'; // Over capacity
  if (percentage >= 80) return '#faad14'; // Near capacity
  if (percentage >= 50) return '#52c41a'; // Good utilization
  return '#1890ff'; // Under-utilized
};

const getUtilizationStatus = (percentage: number): string => {
  if (percentage >= 95) return 'Over Capacity';
  if (percentage >= 80) return 'Near Capacity';
  if (percentage >= 50) return 'Optimal';
  return 'Under-utilized';
};

export const CapacityGauge: React.FC<CapacityGaugeProps> = ({
  showWeeklyBreakdown = true,
  days = 7,
  height = 200,
}) => {
  const {
    data: capacityData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['schedule-ai', 'capacity-forecast', days],
    queryFn: () => scheduleAIApi.getCapacityForecast(days),
  });

  if (isLoading) {
    return (
      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>Capacity Overview</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Calculating capacity...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>Capacity Overview</span>
          </Space>
        }
      >
        <Empty
          description="Failed to load capacity data"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const forecasts: CapacityForecast[] = capacityData || [];
  
  // Calculate overall utilization from forecasts
  const totalRequired = forecasts.reduce((sum, f) => sum + f.required_inspections, 0);
  const totalCapacity = forecasts.reduce((sum, f) => sum + f.available_capacity, 0);
  const overallUtilization = totalCapacity > 0 ? (totalRequired / totalCapacity) * 100 : 0;
  const overloadedDays = forecasts.filter(f => f.is_overloaded).length;
  const todayForecast = forecasts[0];

  const utilizationColor = getUtilizationColor(overallUtilization);
  const utilizationStatus = getUtilizationStatus(overallUtilization);

  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <span>Capacity Overview</span>
        </Space>
      }
      extra={
        <Tooltip title={utilizationStatus}>
          {overloadedDays > 0 ? (
            <Tag color="red">{overloadedDays} Overloaded Days</Tag>
          ) : (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          )}
        </Tooltip>
      }
    >
      <Row gutter={[24, 24]}>
        <Col xs={24} md={showWeeklyBreakdown ? 8 : 24}>
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="dashboard"
              percent={Math.min(Math.round(overallUtilization), 100)}
              strokeColor={utilizationColor}
              format={(percent) => (
                <Space direction="vertical" size={0}>
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 'bold',
                      color: utilizationColor,
                    }}
                  >
                    {percent}%
                  </span>
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    Utilization
                  </span>
                </Space>
              )}
              width={height}
            />
            <div style={{ marginTop: 16 }}>
              <Text
                strong
                style={{ color: utilizationColor, fontSize: 16 }}
              >
                {utilizationStatus}
              </Text>
            </div>
          </div>

          <Row gutter={16} style={{ marginTop: 24 }}>
            <Col span={12}>
              <div style={{ textAlign: 'center' }}>
                <CalendarOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                <div>
                  <Text strong style={{ fontSize: 18 }}>
                    {todayForecast?.required_inspections || 0}
                  </Text>
                </div>
                <Text type="secondary">Required Today</Text>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ textAlign: 'center' }}>
                <TeamOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                <div>
                  <Text strong style={{ fontSize: 18 }}>
                    {todayForecast?.available_capacity || 0}
                  </Text>
                </div>
                <Text type="secondary">Available Today</Text>
              </div>
            </Col>
          </Row>
        </Col>

        {showWeeklyBreakdown && forecasts.length > 0 && (
          <Col xs={24} md={16}>
            <Title level={5}>Weekly Forecast</Title>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {forecasts.map((forecast) => {
                const dayName = new Date(forecast.date).toLocaleDateString('en-US', { weekday: 'short' });
                const utilization = forecast.utilization_rate;
                return (
                  <div key={forecast.date}>
                    <Space
                      style={{ width: '100%', justifyContent: 'space-between' }}
                    >
                      <Text style={{ width: 60 }}>{dayName}</Text>
                      <div style={{ flex: 1 }}>
                        <Progress
                          percent={Math.min(Math.round(utilization), 100)}
                          strokeColor={getUtilizationColor(utilization)}
                          showInfo={false}
                          size="small"
                        />
                      </div>
                      <Space>
                        <Text
                          style={{
                            width: 80,
                            textAlign: 'right',
                            color: getUtilizationColor(utilization),
                          }}
                        >
                          {forecast.required_inspections}/{forecast.available_capacity}
                        </Text>
                        {forecast.is_overloaded && (
                          <WarningOutlined style={{ color: '#cf1322' }} />
                        )}
                      </Space>
                    </Space>
                  </div>
                );
              })}
            </Space>
            {forecasts.some(f => f.recommendations.length > 0) && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary" strong>Recommendations:</Text>
                <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                  {forecasts
                    .flatMap(f => f.recommendations)
                    .slice(0, 3)
                    .map((rec, idx) => (
                      <li key={idx}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{rec}</Text>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Col>
        )}
      </Row>
    </Card>
  );
};

// Compact version for sidebar or smaller spaces
export const CapacityMini: React.FC = () => {
  const { data: capacityData, isLoading } = useQuery({
    queryKey: ['schedule-ai', 'capacity-forecast', 1],
    queryFn: () => scheduleAIApi.getCapacityForecast(1),
  });

  if (isLoading) {
    return <Spin size="small" />;
  }

  const todayForecast = capacityData?.[0];
  const utilization = todayForecast?.utilization_rate || 0;

  return (
    <Tooltip title={`${Math.round(utilization)}% capacity utilized`}>
      <Progress
        type="circle"
        percent={Math.min(Math.round(utilization), 100)}
        width={40}
        strokeColor={getUtilizationColor(utilization)}
        format={(percent) => (
          <span style={{ fontSize: 10, fontWeight: 'bold' }}>{percent}%</span>
        )}
      />
    </Tooltip>
  );
};
