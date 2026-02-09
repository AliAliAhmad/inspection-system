import { Progress, Typography, Space, Tooltip } from 'antd';
import { WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface StockLevelGaugeProps {
  currentStock: number;
  minStock: number;
  maxStock?: number;
  reorderPoint?: number;
  unit?: string;
  showLabels?: boolean;
  size?: 'small' | 'default' | 'large';
}

export function StockLevelGauge({
  currentStock,
  minStock,
  maxStock,
  reorderPoint,
  unit = '',
  showLabels = true,
  size = 'default',
}: StockLevelGaugeProps) {
  const { t } = useTranslation();

  // Calculate max for gauge (use maxStock if provided, otherwise calculate)
  const effectiveMax = maxStock || Math.max(minStock * 3, currentStock * 1.5, 100);
  const percentage = Math.min(Math.round((currentStock / effectiveMax) * 100), 100);
  const minStockPercentage = Math.round((minStock / effectiveMax) * 100);
  const reorderPercentage = reorderPoint ? Math.round((reorderPoint / effectiveMax) * 100) : undefined;

  // Determine status
  const isLowStock = currentStock < minStock;
  const isWarning = reorderPoint ? currentStock < reorderPoint : currentStock < minStock * 1.5;
  const isCritical = currentStock < minStock * 0.5;

  // Get color based on status
  const getColor = () => {
    if (isCritical) return '#ff4d4f';
    if (isLowStock) return '#ff7a45';
    if (isWarning) return '#faad14';
    return '#52c41a';
  };

  // Get status text
  const getStatusText = () => {
    if (isCritical) return t('materials.critical', 'Critical');
    if (isLowStock) return t('materials.low_stock', 'Low Stock');
    if (isWarning) return t('materials.reorder_soon', 'Reorder Soon');
    return t('materials.adequate', 'Adequate');
  };

  const gaugeWidth = size === 'small' ? 80 : size === 'large' ? 140 : 100;

  return (
    <div style={{ textAlign: 'center' }}>
      <Tooltip
        title={
          <div>
            <div>{t('materials.current', 'Current')}: {currentStock} {unit}</div>
            <div>{t('materials.minimum', 'Minimum')}: {minStock} {unit}</div>
            {reorderPoint && <div>{t('materials.reorder_point', 'Reorder Point')}: {reorderPoint} {unit}</div>}
            {maxStock && <div>{t('materials.maximum', 'Maximum')}: {maxStock} {unit}</div>}
          </div>
        }
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Progress
            type="dashboard"
            percent={percentage}
            width={gaugeWidth}
            strokeColor={getColor()}
            format={() => (
              <div>
                <div style={{ fontSize: size === 'small' ? 14 : size === 'large' ? 24 : 18, fontWeight: 600 }}>
                  {currentStock}
                </div>
                {showLabels && (
                  <div style={{ fontSize: size === 'small' ? 10 : 12, color: '#8c8c8c' }}>
                    {unit}
                  </div>
                )}
              </div>
            )}
            gapDegree={75}
            gapPosition="bottom"
          />

          {/* Min stock marker */}
          <div
            style={{
              position: 'absolute',
              left: `${20 + (minStockPercentage * 0.6)}%`,
              bottom: 10,
              width: 2,
              height: 10,
              background: '#ff4d4f',
              borderRadius: 1,
            }}
          />

          {/* Reorder point marker */}
          {reorderPercentage && (
            <div
              style={{
                position: 'absolute',
                left: `${20 + (reorderPercentage * 0.6)}%`,
                bottom: 10,
                width: 2,
                height: 10,
                background: '#faad14',
                borderRadius: 1,
              }}
            />
          )}
        </div>
      </Tooltip>

      {showLabels && (
        <Space direction="vertical" size={0} style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: size === 'small' ? 11 : 12,
              color: getColor(),
              fontWeight: 500,
            }}
          >
            {isLowStock || isCritical ? (
              <><WarningOutlined /> {getStatusText()}</>
            ) : (
              <><CheckCircleOutlined /> {getStatusText()}</>
            )}
          </Text>
          <Text type="secondary" style={{ fontSize: size === 'small' ? 10 : 11 }}>
            Min: {minStock} {unit}
          </Text>
        </Space>
      )}
    </div>
  );
}

export default StockLevelGauge;
