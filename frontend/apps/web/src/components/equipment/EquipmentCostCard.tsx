import React from 'react';
import { Card, Statistic, Row, Col, Spin, Alert, Typography, Progress, Tooltip } from 'antd';
import {
  DollarOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { equipmentApi } from '@inspection/shared';
import type { EquipmentCosts } from '@inspection/shared';

const { Text } = Typography;

interface EquipmentCostCardProps {
  equipmentId: number;
}

export const EquipmentCostCard: React.FC<EquipmentCostCardProps> = ({ equipmentId }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['equipment-costs', equipmentId],
    queryFn: async () => {
      const response = await equipmentApi.getCosts(equipmentId);
      return response.data?.data as EquipmentCosts;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card title="Cost Analysis" style={{ height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card title="Cost Analysis" style={{ height: '100%' }}>
        <Alert type="warning" message="Unable to load cost data" showIcon />
      </Card>
    );
  }

  const maxCost = Math.max(...data.cost_trend.map(t => t.downtime_cost), 1);

  return (
    <Card
      title={
        <span>
          <DollarOutlined style={{ marginRight: 8 }} />
          Cost Analysis
        </span>
      }
      style={{ height: '100%' }}
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Statistic
            title="Total Downtime"
            value={data.total_downtime_hours}
            suffix="hrs"
            prefix={<ClockCircleOutlined />}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Downtime Cost"
            value={data.total_downtime_cost}
            prefix="$"
            precision={2}
            valueStyle={{ color: data.total_downtime_cost > 10000 ? '#ff4d4f' : '#52c41a', fontSize: 20 }}
          />
        </Col>
        <Col xs={12} sm={8}>
          <Statistic
            title="Cost per Defect"
            value={data.cost_per_defect}
            prefix="$"
            precision={2}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
      </Row>

      {data.hourly_cost === 0 && (
        <Alert
          type="info"
          message="Hourly cost not configured"
          description="Set an hourly cost to calculate downtime costs."
          showIcon
          icon={<WarningOutlined />}
          style={{ marginTop: 16 }}
        />
      )}

      {data.cost_trend.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <Text strong>
            <LineChartOutlined style={{ marginRight: 8 }} />
            Monthly Cost Trend
          </Text>
          <div style={{ marginTop: 12 }}>
            {data.cost_trend.map((item, idx) => (
              <div key={item.month} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.month_label}</Text>
                  <Tooltip title={`${item.downtime_hours} hours`}>
                    <Text strong style={{ fontSize: 12 }}>${item.downtime_cost.toFixed(2)}</Text>
                  </Tooltip>
                </div>
                <Progress
                  percent={(item.downtime_cost / maxCost) * 100}
                  showInfo={false}
                  size="small"
                  strokeColor={item.downtime_cost > 5000 ? '#ff4d4f' : item.downtime_cost > 2000 ? '#faad14' : '#52c41a'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Hourly Rate</Text>
            <div>
              <Text strong>${data.hourly_cost.toFixed(2)}/hr</Text>
            </div>
          </Col>
          <Col span={12}>
            <Text type="secondary" style={{ fontSize: 12 }}>Total Defects</Text>
            <div>
              <Text strong>{data.defect_count}</Text>
            </div>
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default EquipmentCostCard;
