import { Card, Typography, Space, Tag, Progress, Button, Spin, Empty, Tooltip, Descriptions } from 'antd';
import {
  RobotOutlined,
  CalendarOutlined,
  ShoppingCartOutlined,
  InfoCircleOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, ReorderPrediction } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface AIReorderCardProps {
  materialId: number;
  materialName?: string;
  onApplySettings?: (prediction: ReorderPrediction) => void;
}

export function AIReorderCard({
  materialId,
  materialName,
  onApplySettings,
}: AIReorderCardProps) {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['material-reorder-prediction', materialId],
    queryFn: () => materialsApi.predictReorder(materialId),
    enabled: !!materialId,
  });

  const prediction = data?.data?.data;

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return '#52c41a';
    if (score >= 0.6) return '#faad14';
    return '#ff4d4f';
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 0.8) return t('materials.high_confidence', 'High Confidence');
    if (score >= 0.6) return t('materials.medium_confidence', 'Medium Confidence');
    return t('materials.low_confidence', 'Low Confidence');
  };

  const getDaysUntilReorder = () => {
    if (!prediction?.predicted_reorder_date) return null;
    const days = dayjs(prediction.predicted_reorder_date).diff(dayjs(), 'day');
    return days;
  };

  const daysUntilReorder = getDaysUntilReorder();

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('materials.ai_reorder_prediction', 'AI Reorder Prediction')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 30 }}>
          <Spin />
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">{t('materials.analyzing', 'Analyzing consumption patterns...')}</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error || !prediction) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <RobotOutlined style={{ color: '#722ed1' }} />
            {t('materials.ai_reorder_prediction', 'AI Reorder Prediction')}
          </Space>
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_prediction_available', 'Insufficient data for prediction')}
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <RobotOutlined style={{ color: '#722ed1' }} />
          {t('materials.ai_reorder_prediction', 'AI Reorder Prediction')}
        </Space>
      }
      extra={
        <Tooltip title={t('materials.ai_powered', 'AI-powered prediction based on historical data')}>
          <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
        </Tooltip>
      }
      style={{ borderLeft: '4px solid #722ed1' }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Material Info */}
        {materialName && (
          <div>
            <Text type="secondary">{t('materials.material', 'Material')}</Text>
            <div>
              <Text strong>{materialName || prediction.material_name}</Text>
            </div>
          </div>
        )}

        {/* Predicted Reorder Date */}
        <div
          style={{
            background: '#f9f0ff',
            borderRadius: 8,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <CalendarOutlined style={{ fontSize: 24, color: '#722ed1', marginBottom: 8 }} />
          <Title level={4} style={{ margin: 0, color: '#722ed1' }}>
            {dayjs(prediction.predicted_reorder_date).format('MMM DD, YYYY')}
          </Title>
          <Text type="secondary">
            {daysUntilReorder !== null && daysUntilReorder >= 0
              ? `${daysUntilReorder} ${t('materials.days_away', 'days away')}`
              : t('materials.reorder_now', 'Reorder now!')}
          </Text>
        </div>

        {/* Confidence Score */}
        <div>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary">{t('materials.confidence', 'Confidence')}</Text>
            <Tag color={getConfidenceColor(prediction.confidence_score)}>
              {getConfidenceLabel(prediction.confidence_score)}
            </Tag>
          </Space>
          <Progress
            percent={Math.round(prediction.confidence_score * 100)}
            strokeColor={getConfidenceColor(prediction.confidence_score)}
            showInfo={false}
            size="small"
          />
        </div>

        {/* Details */}
        <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
          <Descriptions.Item label={t('materials.recommended_qty', 'Recommended Qty')}>
            <Text strong style={{ color: '#722ed1' }}>
              {prediction.recommended_quantity}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('materials.current_stock', 'Current Stock')}>
            {prediction.current_stock}
          </Descriptions.Item>
          <Descriptions.Item label={t('materials.avg_consumption', 'Avg. Consumption')}>
            {prediction.average_consumption.toFixed(1)} / {t('materials.day', 'day')}
          </Descriptions.Item>
          {prediction.lead_time_days && (
            <Descriptions.Item label={t('materials.lead_time', 'Lead Time')}>
              {prediction.lead_time_days} {t('materials.days', 'days')}
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* Apply Button */}
        {onApplySettings && (
          <Button
            type="primary"
            icon={<ShoppingCartOutlined />}
            onClick={() => onApplySettings(prediction)}
            block
            style={{ background: '#722ed1', borderColor: '#722ed1' }}
          >
            {t('materials.create_reorder', 'Create Reorder Request')}
          </Button>
        )}
      </Space>
    </Card>
  );
}

export default AIReorderCard;
