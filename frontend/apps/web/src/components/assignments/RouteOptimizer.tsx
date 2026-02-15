import React, { useState, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Tag,
  Avatar,
  Space,
  Typography,
  Statistic,
  Alert,
  Empty,
  Spin,
  Select,
  Divider,
  Tooltip,
  Badge,
  Collapse,
  Timeline,
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleAIApi } from './api';
import type { RouteOptimization, OptimizedRoute, RouteStop } from './types';
import {
  EnvironmentOutlined,
  CarOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  SwapOutlined,
  AimOutlined,
  RocketOutlined,
  WarningOutlined,
  UserOutlined,
  FlagOutlined,
} from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

interface RouteOptimizerProps {
  onApplyRoute?: (route: OptimizedRoute) => void;
}

export const RouteOptimizer: React.FC<RouteOptimizerProps> = ({ onApplyRoute }) => {
  const queryClient = useQueryClient();
  const [selectedInspector, setSelectedInspector] = useState<number | null>(null);
  const [optimizationGoal, setOptimizationGoal] = useState<'time' | 'distance' | 'balanced'>('balanced');

  const { data: optimization, isLoading, error, refetch } = useQuery({
    queryKey: ['schedule-ai', 'route-optimization', selectedInspector, optimizationGoal],
    queryFn: () => scheduleAIApi.getRouteOptimization({
      inspector_id: selectedInspector || undefined,
      optimization_goal: optimizationGoal,
    }),
    enabled: true,
  });

  const { data: inspectors } = useQuery({
    queryKey: ['inspectors'],
    queryFn: () => scheduleAIApi.getInspectorsList(),
  });

  const applyRouteMutation = useMutation({
    mutationFn: (routeId: number) => scheduleAIApi.applyOptimizedRoute(routeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-ai', 'route-optimization'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  const getSavingsColor = (percentage: number): string => {
    if (percentage >= 20) return '#52c41a';
    if (percentage >= 10) return '#1890ff';
    if (percentage >= 5) return '#faad14';
    return '#8c8c8c';
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDistance = (km: number): string => {
    if (km >= 1) {
      return `${km.toFixed(1)} km`;
    }
    return `${Math.round(km * 1000)} m`;
  };

  const handleApplyRoute = useCallback((route: OptimizedRoute) => {
    applyRouteMutation.mutate(route.id);
    if (onApplyRoute) {
      onApplyRoute(route);
    }
  }, [applyRouteMutation, onApplyRoute]);

  const renderRouteStop = (stop: RouteStop, index: number, total: number) => (
    <Timeline.Item
      key={stop.id}
      color={stop.is_completed ? 'green' : stop.is_current ? 'blue' : 'gray'}
      dot={
        stop.is_current ? (
          <AimOutlined style={{ fontSize: 16 }} />
        ) : stop.is_completed ? (
          <CheckCircleOutlined style={{ fontSize: 16 }} />
        ) : (
          <EnvironmentOutlined style={{ fontSize: 16 }} />
        )
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text strong>{stop.location_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {stop.address}
          </Text>
          <br />
          <Space size="small" style={{ marginTop: 4 }}>
            <Tag color="blue">
              <ClockCircleOutlined /> {stop.estimated_arrival}
            </Tag>
            <Tag>
              ~{formatDuration(stop.duration_minutes)}
            </Tag>
            {stop.priority === 'high' && (
              <Tag color="red">High Priority</Tag>
            )}
          </Space>
        </div>
        <div style={{ textAlign: 'right' }}>
          {index < total - 1 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              <CarOutlined /> {formatDistance(stop.distance_to_next_km)}
            </Text>
          )}
        </div>
      </div>
    </Timeline.Item>
  );

  const renderOptimizedRoute = (route: OptimizedRoute) => (
    <Card
      key={route.id}
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <Text strong>{route.inspector_name}</Text>
          {route.has_improvements && (
            <Badge
              count={
                <span style={{ color: '#52c41a', fontSize: 12 }}>
                  <ThunderboltOutlined /> Optimized
                </span>
              }
            />
          )}
        </Space>
      }
      extra={
        route.has_improvements && (
          <Button
            type="primary"
            size="small"
            icon={<RocketOutlined />}
            loading={applyRouteMutation.isPending}
            onClick={() => handleApplyRoute(route)}
          >
            Apply Route
          </Button>
        )
      }
    >
      {/* Savings Summary */}
      {route.has_improvements && (
        <Alert
          type="success"
          showIcon
          icon={<ThunderboltOutlined />}
          message={
            <Space split={<Divider type="vertical" />}>
              <span>
                <Text type="success" strong>
                  {route.time_savings_minutes}min
                </Text>{' '}
                time saved
              </span>
              <span>
                <Text type="success" strong>
                  {route.distance_savings_km.toFixed(1)}km
                </Text>{' '}
                shorter
              </span>
              <span>
                <Tag color={getSavingsColor(route.improvement_percentage)}>
                  {route.improvement_percentage.toFixed(1)}% better
                </Tag>
              </span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Route Statistics */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Statistic
            title="Total Stops"
            value={route.stops.length}
            prefix={<EnvironmentOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Distance"
            value={route.total_distance_km.toFixed(1)}
            suffix="km"
            prefix={<CarOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="Total Time"
            value={formatDuration(route.total_duration_minutes)}
            prefix={<ClockCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="End Time"
            value={route.estimated_end_time}
            prefix={<FlagOutlined />}
          />
        </Col>
      </Row>

      {/* Route Visualization */}
      <Collapse ghost>
        <Panel header="View Route Details" key="1">
          <div style={{ display: 'flex', gap: 24 }}>
            {/* Map placeholder - can be replaced with actual map component */}
            <div
              style={{
                flex: 1,
                minHeight: 300,
                background: '#f0f2f5',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed #d9d9d9',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <EnvironmentOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />
                <br />
                <Text type="secondary">Map View</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Integration with Google Maps / Leaflet
                </Text>
              </div>
            </div>

            {/* Route Timeline */}
            <div style={{ width: 350 }}>
              <Title level={5}>Route Sequence</Title>
              <Timeline>
                {route.stops.map((stop, index) =>
                  renderRouteStop(stop, index, route.stops.length)
                )}
              </Timeline>
            </div>
          </div>
        </Panel>
      </Collapse>

      {/* Route Warnings */}
      {route.warnings && route.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Route Warnings"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {route.warnings.map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          }
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );

  if (error) {
    return (
      <Card title="Route Optimizer">
        <Alert
          message="Failed to load route optimization"
          description="Please try refreshing the page."
          type="error"
          showIcon
          action={
            <Button size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <CarOutlined style={{ color: '#1890ff' }} />
          <span>Route Optimizer</span>
        </Space>
      }
      extra={
        <Space>
          <Select
            placeholder="Filter by Inspector"
            allowClear
            style={{ width: 200 }}
            value={selectedInspector}
            onChange={setSelectedInspector}
            loading={!inspectors}
          >
            {inspectors?.map((inspector) => (
              <Option key={inspector.id} value={inspector.id}>
                {inspector.name}
              </Option>
            ))}
          </Select>
          <Select
            value={optimizationGoal}
            onChange={setOptimizationGoal}
            style={{ width: 140 }}
          >
            <Option value="balanced">
              <SwapOutlined /> Balanced
            </Option>
            <Option value="time">
              <ClockCircleOutlined /> Minimize Time
            </Option>
            <Option value="distance">
              <CarOutlined /> Minimize Distance
            </Option>
          </Select>
          <Button
            icon={<SyncOutlined spin={isLoading} />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            Optimize
          </Button>
        </Space>
      }
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <br />
          <Text type="secondary" style={{ marginTop: 16 }}>
            Calculating optimal routes...
          </Text>
        </div>
      ) : optimization && optimization.routes && optimization.routes.length > 0 ? (
        <>
          {/* Overall Summary */}
          <Alert
            type="info"
            showIcon
            icon={<ThunderboltOutlined />}
            message={
              <Space split={<Divider type="vertical" />}>
                <span>
                  <Text strong>{optimization.routes.length}</Text> routes optimized
                </span>
                <span>
                  <Text type="success" strong>
                    {optimization.total_time_savings_minutes}min
                  </Text>{' '}
                  total time saved
                </span>
                <span>
                  <Text type="success" strong>
                    {optimization.total_distance_savings_km.toFixed(1)}km
                  </Text>{' '}
                  total distance saved
                </span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          />

          {/* Route Cards */}
          {optimization.routes.map(renderOptimizedRoute)}
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              Routes are already optimized or no assignments found
            </span>
          }
        >
          <Paragraph type="secondary">
            Try assigning more inspections or changing the optimization goal.
          </Paragraph>
        </Empty>
      )}
    </Card>
  );
};
