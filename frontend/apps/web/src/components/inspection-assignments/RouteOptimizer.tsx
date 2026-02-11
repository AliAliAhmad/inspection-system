import { useState } from 'react';
import {
  Card,
  Select,
  Button,
  List,
  Steps,
  Typography,
  Space,
  Row,
  Col,
  Statistic,
  Alert,
  Spin,
  message,
} from 'antd';
import {
  EnvironmentOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { scheduleAIApi, equipmentApi } from '@inspection/shared';
import type { OptimizedRoute } from '@inspection/shared';

const { Text, Title } = Typography;

export function RouteOptimizer() {
  const { t } = useTranslation();
  const [selectedEquipment, setSelectedEquipment] = useState<number[]>([]);
  const [selectedInspector, setSelectedInspector] = useState<number | undefined>();
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizedRoute | null>(null);

  // Fetch equipment list
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment', 'list'],
    queryFn: async () => {
      const response = await equipmentApi.list({});
      return response.data?.data || [];
    },
  });

  const equipment = Array.isArray(equipmentData) ? equipmentData : [];

  // Optimize route mutation
  const optimizeMutation = useMutation({
    mutationFn: async () => {
      if (selectedEquipment.length === 0) {
        throw new Error('Please select at least one equipment');
      }

      const response = await scheduleAIApi.optimizeRoute({
        equipment_ids: selectedEquipment,
        inspector_id: selectedInspector,
      });
      return response;
    },
    onSuccess: (data) => {
      setOptimizedRoute(data);
      message.success(t('scheduleAI.routeOptimized', 'Route optimized successfully'));
    },
    onError: (error: any) => {
      message.error(
        error?.message || t('scheduleAI.routeOptimizationFailed', 'Route optimization failed')
      );
    },
  });

  const handleOptimize = () => {
    optimizeMutation.mutate();
  };

  const handleApplyToSchedule = () => {
    message.info(t('scheduleAI.applyToSchedulePlaceholder', 'Apply to schedule functionality coming soon'));
  };

  const savings = optimizedRoute?.optimization_savings;

  return (
    <Card
      title={
        <Space>
          <EnvironmentOutlined />
          <span>{t('scheduleAI.routeOptimizer', 'Route Optimizer')}</span>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        {/* Input Section */}
        <Col xs={24} md={12}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>{t('scheduleAI.selectEquipment', 'Select Equipment')}</Text>
              <Select
                mode="multiple"
                style={{ width: '100%', marginTop: 8 }}
                placeholder={t('scheduleAI.selectEquipmentPlaceholder', 'Select equipment to inspect')}
                value={selectedEquipment}
                onChange={setSelectedEquipment}
                maxTagCount="responsive"
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={equipment.map((eq: any) => ({
                  label: `${eq.name} (${eq.equipment_type || 'N/A'})`,
                  value: eq.id,
                }))}
              />
            </div>

            <div>
              <Text strong>{t('scheduleAI.selectInspector', 'Select Inspector (Optional)')}</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                placeholder={t('scheduleAI.selectInspectorPlaceholder', 'Select inspector')}
                value={selectedInspector}
                onChange={setSelectedInspector}
                allowClear
              >
                {/* Inspector list would come from a separate API */}
                <Select.Option value={1}>Inspector 1</Select.Option>
                <Select.Option value={2}>Inspector 2</Select.Option>
                <Select.Option value={3}>Inspector 3</Select.Option>
              </Select>
            </div>

            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleOptimize}
              loading={optimizeMutation.isPending}
              disabled={selectedEquipment.length === 0}
              block
              size="large"
            >
              {t('scheduleAI.optimizeRoute', 'Optimize Route')}
            </Button>
          </Space>
        </Col>

        {/* Results Section */}
        <Col xs={24} md={12}>
          {optimizeMutation.isPending && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">
                  {t('scheduleAI.optimizingRoute', 'Optimizing route...')}
                </Text>
              </div>
            </div>
          )}

          {optimizedRoute && savings && (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* Savings Card */}
              <Card size="small" style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title={t('scheduleAI.distanceSaved', 'Distance Saved')}
                      value={savings.distance_saved_km}
                      suffix="km"
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<CarOutlined />}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={t('scheduleAI.timeSaved', 'Time Saved')}
                      value={savings.time_saved_minutes}
                      suffix="min"
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<ClockCircleOutlined />}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={t('scheduleAI.efficiency', 'Efficiency')}
                      value={savings.efficiency_improvement_pct}
                      suffix="%"
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<ThunderboltOutlined />}
                    />
                  </Col>
                </Row>
              </Card>

              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleApplyToSchedule}
                block
              >
                {t('scheduleAI.applyToSchedule', 'Apply to Schedule')}
              </Button>
            </Space>
          )}
        </Col>

        {/* Optimized Route Display */}
        {optimizedRoute && (
          <Col xs={24}>
            <Card
              size="small"
              title={
                <Space>
                  <EnvironmentOutlined />
                  <Text strong>{t('scheduleAI.optimizedRoute', 'Optimized Route')}</Text>
                </Space>
              }
            >
              <Alert
                type="info"
                message={
                  <Space>
                    <Text>
                      {t('scheduleAI.totalDistance', 'Total Distance')}: {optimizedRoute.total_distance.toFixed(2)} km
                    </Text>
                    <Text>|</Text>
                    <Text>
                      {t('scheduleAI.totalTime', 'Total Time')}: {optimizedRoute.total_time_minutes} min
                    </Text>
                  </Space>
                }
                style={{ marginBottom: 16 }}
              />

              <Steps
                direction="vertical"
                current={-1}
                items={optimizedRoute.route_order.map((step) => ({
                  title: (
                    <Space>
                      <Text strong>
                        {t('scheduleAI.stop', 'Stop')} {step.sequence}
                      </Text>
                      <Text>{step.equipment_name}</Text>
                    </Space>
                  ),
                  description: (
                    <div>
                      <Text type="secondary">
                        <EnvironmentOutlined style={{ marginRight: 4 }} />
                        {step.location}
                      </Text>
                      <br />
                      <Text type="secondary">
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        {step.estimated_time_minutes} min
                      </Text>
                      {step.distance_from_previous > 0 && (
                        <>
                          <br />
                          <Text type="secondary">
                            <CarOutlined style={{ marginRight: 4 }} />
                            {step.distance_from_previous.toFixed(2)} km {t('scheduleAI.fromPrevious', 'from previous')}
                          </Text>
                        </>
                      )}
                    </div>
                  ),
                  icon: <EnvironmentOutlined />,
                }))}
              />
            </Card>
          </Col>
        )}
      </Row>
    </Card>
  );
}
