import { Card, List, Typography, Tag, Space, Button, Spin, Empty, Collapse, Badge, Statistic } from 'antd';
import {
  DollarOutlined,
  BulbOutlined,
  RightOutlined,
  TruckOutlined,
  DeleteOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, CostOptimizationSuggestion } from '@inspection/shared';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface CostOptimizationPanelProps {
  onSuggestionClick?: (suggestion: CostOptimizationSuggestion) => void;
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  bulk_order: {
    icon: <ShoppingCartOutlined />,
    color: 'blue',
    label: 'Bulk Order',
  },
  vendor_switch: {
    icon: <TruckOutlined />,
    color: 'purple',
    label: 'Vendor Switch',
  },
  dead_stock: {
    icon: <DeleteOutlined />,
    color: 'orange',
    label: 'Dead Stock',
  },
  reorder_timing: {
    icon: <CalendarOutlined />,
    color: 'cyan',
    label: 'Reorder Timing',
  },
};

export function CostOptimizationPanel({
  onSuggestionClick,
}: CostOptimizationPanelProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['material-cost-optimization'],
    queryFn: () => materialsApi.getCostOptimization(),
  });

  const suggestions = data?.data?.suggestions || [];
  const totalSavings = data?.data?.total_potential_savings || 0;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'default';
  };

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <BulbOutlined style={{ color: '#faad14' }} />
            {t('materials.cost_optimization', 'Cost Optimization')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 30 }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">{t('materials.analyzing_costs', 'Analyzing cost patterns...')}</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <BulbOutlined style={{ color: '#faad14' }} />
            {t('materials.cost_optimization', 'Cost Optimization')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_suggestions', 'No optimization suggestions at this time')}
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <BulbOutlined style={{ color: '#faad14' }} />
          {t('materials.cost_optimization', 'Cost Optimization')}
          <Badge count={suggestions.length} style={{ backgroundColor: '#faad14' }} />
        </Space>
      }
      style={{ borderLeft: '4px solid #faad14' }}
    >
      {/* Total Potential Savings */}
      <div
        style={{
          background: 'linear-gradient(135deg, #f6ffed 0%, #e6fffb 100%)',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        <Text type="secondary">{t('materials.total_potential_savings', 'Total Potential Savings')}</Text>
        <Statistic
          value={totalSavings}
          prefix={<DollarOutlined />}
          precision={2}
          valueStyle={{ color: '#52c41a', fontSize: 28 }}
        />
      </div>

      {/* Suggestions List */}
      <Collapse ghost expandIconPosition="end">
        {suggestions.map((suggestion, index) => {
          const config = typeConfig[suggestion.type] || {
            icon: <BulbOutlined />,
            color: 'default',
            label: suggestion.type,
          };

          return (
            <Panel
              key={index}
              header={
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ color: `var(--ant-color-${config.color})` }}>
                      {config.icon}
                    </span>
                    <Text strong style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {suggestion.material_name || t(`materials.${suggestion.type}`, config.label)}
                    </Text>
                  </Space>
                  <Space>
                    <Tag color="success">
                      +${suggestion.potential_savings.toFixed(2)}
                    </Tag>
                    <Tag color={getConfidenceColor(suggestion.confidence)}>
                      {Math.round(suggestion.confidence * 100)}%
                    </Tag>
                  </Space>
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <Text type="secondary">{suggestion.description}</Text>

                {suggestion.action_items && suggestion.action_items.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('materials.action_items', 'Action Items')}:
                    </Text>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {suggestion.action_items.map((item, i) => (
                        <li key={i} style={{ fontSize: 12 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {onSuggestionClick && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onSuggestionClick(suggestion)}
                    style={{ padding: 0 }}
                  >
                    {t('materials.take_action', 'Take Action')} <RightOutlined />
                  </Button>
                )}
              </Space>
            </Panel>
          );
        })}
      </Collapse>
    </Card>
  );
}

export default CostOptimizationPanel;
