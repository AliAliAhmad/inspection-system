import { Tag, Tooltip, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface HealthScoreBadgeProps {
  score: number; // 0-100
  trend?: 'improving' | 'stable' | 'declining';
  size?: 'small' | 'default' | 'large';
  showTrend?: boolean;
  showLabel?: boolean;
}

export function HealthScoreBadge({
  score,
  trend = 'stable',
  size = 'default',
  showTrend = true,
  showLabel = false,
}: HealthScoreBadgeProps) {
  const { t } = useTranslation();

  // Determine color based on score
  const getColor = () => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'lime';
    if (score >= 40) return 'orange';
    if (score >= 20) return 'volcano';
    return 'red';
  };

  // Get trend icon
  const getTrendIcon = () => {
    switch (trend) {
      case 'improving':
        return <ArrowUpOutlined style={{ color: '#52c41a', fontSize: size === 'small' ? 10 : 12 }} />;
      case 'declining':
        return <ArrowDownOutlined style={{ color: '#ff4d4f', fontSize: size === 'small' ? 10 : 12 }} />;
      default:
        return <MinusOutlined style={{ color: '#8c8c8c', fontSize: size === 'small' ? 10 : 12 }} />;
    }
  };

  const getTrendLabel = () => {
    switch (trend) {
      case 'improving':
        return t('equipmentAI.improving', 'Improving');
      case 'declining':
        return t('equipmentAI.declining', 'Declining');
      default:
        return t('equipmentAI.stable', 'Stable');
    }
  };

  const fontSize = size === 'small' ? 11 : size === 'large' ? 16 : 13;

  return (
    <Tooltip title={`${t('equipmentAI.healthScore', 'Health Score')}: ${score}% - ${getTrendLabel()}`}>
      <Space size={4}>
        <Tag
          color={getColor()}
          style={{
            fontSize,
            fontWeight: 600,
            margin: 0,
            padding: size === 'small' ? '0 4px' : '2px 8px',
          }}
        >
          {showLabel && `${t('equipmentAI.healthScore', 'Health')}: `}
          {score}%
        </Tag>
        {showTrend && getTrendIcon()}
      </Space>
    </Tooltip>
  );
}
