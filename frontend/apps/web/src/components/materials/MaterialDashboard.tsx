import { Row, Col, Card, Statistic, Progress, Button, Space, Spin, Tooltip } from 'antd';
import {
  DatabaseOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  PlusOutlined,
  MinusOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi } from '@inspection/shared';

interface DashboardProps {
  onQuickConsume?: () => void;
  onQuickRestock?: () => void;
  onViewLowStock?: () => void;
  onViewExpiring?: () => void;
}

export function MaterialDashboard({
  onQuickConsume,
  onQuickRestock,
  onViewLowStock,
  onViewExpiring,
}: DashboardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: materialsData, isLoading: materialsLoading } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list(),
  });

  const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
    queryKey: ['materials', 'low-stock'],
    queryFn: () => materialsApi.checkLowStock(),
  });

  const { data: expiringData, isLoading: expiringLoading } = useQuery({
    queryKey: ['materials', 'expiring-batches'],
    queryFn: () => materialsApi.getExpiringBatches(30),
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['materials', 'alerts'],
    queryFn: () => materialsApi.getAlerts(),
  });

  const isLoading = materialsLoading || lowStockLoading || expiringLoading || alertsLoading;
  const materials = materialsData?.data?.materials || [];
  const lowStockCount = lowStockData?.data?.low_stock_count || 0;
  const expiringCount = expiringData?.data?.count || 0;
  const alertsCount = alertsData?.data?.count || 0;
  const totalMaterials = materials.length;
  const activeMaterials = materials.filter((m) => m.is_active).length;

  // Calculate stock health (percentage of items not in low stock)
  const stockHealth = totalMaterials > 0 ? Math.round(((totalMaterials - lowStockCount) / totalMaterials) * 100) : 100;

  // Calculate total value (simplified - in real app this would come from backend)
  const totalStock = materials.reduce((sum, m) => sum + m.current_stock, 0);

  const getHealthColor = (health: number) => {
    if (health >= 80) return '#52c41a';
    if (health >= 60) return '#faad14';
    return '#ff4d4f';
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <Row gutter={[16, 16]}>
        {/* Total Materials */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title={
                <span style={{ color: '#1890ff' }}>
                  <DatabaseOutlined /> {t('materials.total_materials', 'Total Materials')}
                </span>
              }
              value={totalMaterials}
              suffix={
                <span style={{ fontSize: 14, color: '#8c8c8c' }}>
                  / {activeMaterials} {t('materials.active', 'active')}
                </span>
              }
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        {/* Low Stock */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            onClick={onViewLowStock}
            style={{
              background: lowStockCount > 0 ? '#fff2f0' : '#f6ffed',
              borderLeft: `4px solid ${lowStockCount > 0 ? '#ff4d4f' : '#52c41a'}`,
              cursor: onViewLowStock ? 'pointer' : 'default',
            }}
          >
            <Statistic
              title={
                <span style={{ color: lowStockCount > 0 ? '#ff4d4f' : '#52c41a' }}>
                  <WarningOutlined /> {t('materials.low_stock', 'Low Stock')}
                </span>
              }
              value={lowStockCount}
              valueStyle={{ color: lowStockCount > 0 ? '#ff4d4f' : '#52c41a' }}
              suffix={lowStockCount === 0 ? <CheckCircleOutlined /> : null}
            />
          </Card>
        </Col>

        {/* Expiring Soon */}
        <Col xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable
            onClick={onViewExpiring}
            style={{
              background: expiringCount > 0 ? '#fffbe6' : '#f6ffed',
              borderLeft: `4px solid ${expiringCount > 0 ? '#faad14' : '#52c41a'}`,
              cursor: onViewExpiring ? 'pointer' : 'default',
            }}
          >
            <Statistic
              title={
                <span style={{ color: expiringCount > 0 ? '#faad14' : '#52c41a' }}>
                  <ClockCircleOutlined /> {t('materials.expiring_soon', 'Expiring Soon')}
                </span>
              }
              value={expiringCount}
              suffix={t('materials.batches', 'batches')}
              valueStyle={{ color: expiringCount > 0 ? '#faad14' : '#52c41a' }}
            />
          </Card>
        </Col>

        {/* Total Stock Value */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" hoverable>
            <Statistic
              title={
                <span style={{ color: '#722ed1' }}>
                  <DollarOutlined /> {t('materials.total_stock', 'Total Stock')}
                </span>
              }
              value={totalStock}
              suffix={t('materials.units', 'units')}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Stock Health Gauge & Quick Actions */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card
            size="small"
            title={t('materials.stock_health', 'Stock Health')}
            extra={
              <Tooltip title={t('materials.refresh', 'Refresh')}>
                <Button type="text" icon={<ReloadOutlined />} onClick={handleRefresh} />
              </Tooltip>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <Progress
                type="dashboard"
                percent={stockHealth}
                strokeColor={getHealthColor(stockHealth)}
                format={(percent) => (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 600, color: getHealthColor(stockHealth) }}>
                      {percent}%
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {t('materials.healthy', 'Healthy')}
                    </div>
                  </div>
                )}
              />
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#52c41a' }}>{totalMaterials - lowStockCount}</span>
                  <span style={{ color: '#8c8c8c' }}> {t('materials.adequate_stock', 'items with adequate stock')}</span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#ff4d4f' }}>{lowStockCount}</span>
                  <span style={{ color: '#8c8c8c' }}> {t('materials.need_attention', 'items need attention')}</span>
                </div>
                <div>
                  <span style={{ color: '#faad14' }}>{alertsCount}</span>
                  <span style={{ color: '#8c8c8c' }}> {t('materials.active_alerts', 'active alerts')}</span>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title={t('materials.quick_actions', 'Quick Actions')}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Row gutter={16}>
                <Col span={12}>
                  <Button
                    type="primary"
                    danger
                    icon={<MinusOutlined />}
                    onClick={onQuickConsume}
                    block
                    size="large"
                  >
                    {t('materials.consume', 'Consume')}
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={onQuickRestock}
                    block
                    size="large"
                    style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  >
                    {t('materials.restock', 'Restock')}
                  </Button>
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default MaterialDashboard;
