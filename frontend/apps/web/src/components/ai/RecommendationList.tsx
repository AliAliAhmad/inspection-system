/**
 * RecommendationList - Reusable AI recommendations display component
 */

import { List, Space, Typography, Tag, Badge, Empty, Button } from 'antd';
import {
  BulbOutlined,
  ToolOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Recommendation, Priority } from '@inspection/shared/src/types/ai-base.types';
import { PriorityBadge } from './PriorityBadge';

const { Text } = Typography;

interface RecommendationListProps {
  recommendations: Recommendation[];
  loading?: boolean;
  compact?: boolean;
  maxItems?: number;
  showActions?: boolean;
  onActionClick?: (recommendation: Recommendation) => void;
  emptyText?: string;
  style?: React.CSSProperties;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  maintenance: <ToolOutlined />,
  risk: <WarningOutlined />,
  lifecycle: <CheckCircleOutlined />,
  status: <CheckCircleOutlined />,
  prediction: <BulbOutlined />,
  anomaly: <WarningOutlined />,
  warning: <WarningOutlined />,
};

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function RecommendationList({
  recommendations,
  loading = false,
  compact = false,
  maxItems,
  showActions = false,
  onActionClick,
  emptyText,
  style,
}: RecommendationListProps) {
  const { t } = useTranslation();

  // Sort by priority
  const sortedRecs = [...recommendations].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] || 4) - (PRIORITY_ORDER[b.priority] || 4)
  );

  const displayRecs = maxItems ? sortedRecs.slice(0, maxItems) : sortedRecs;

  if (recommendations.length === 0 && !loading) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={emptyText || t('ai.no_recommendations', 'No recommendations at this time')}
        style={style}
      />
    );
  }

  return (
    <List
      loading={loading}
      dataSource={displayRecs}
      size={compact ? 'small' : 'default'}
      style={style}
      renderItem={(rec, index) => (
        <List.Item
          actions={
            showActions && rec.action && onActionClick
              ? [
                  <Button
                    key="action"
                    type="link"
                    size="small"
                    icon={<RightOutlined />}
                    onClick={() => onActionClick(rec)}
                  >
                    {rec.action.replace(/_/g, ' ')}
                  </Button>,
                ]
              : undefined
          }
        >
          <List.Item.Meta
            avatar={
              <Badge
                count={index + 1}
                style={{
                  backgroundColor:
                    rec.priority === 'critical' ? '#ff4d4f' :
                    rec.priority === 'high' ? '#ff7a45' :
                    rec.priority === 'medium' ? '#faad14' : '#52c41a',
                }}
              />
            }
            title={
              <Space wrap={!compact}>
                <PriorityBadge priority={rec.priority} size="small" />
                <Tag>{rec.type}</Tag>
              </Space>
            }
            description={
              <div>
                <Text>{rec.message}</Text>
                {!compact && rec.action && !showActions && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Suggested action: {rec.action.replace(/_/g, ' ')}
                    </Text>
                  </div>
                )}
              </div>
            }
          />
        </List.Item>
      )}
      footer={
        maxItems && sortedRecs.length > maxItems ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            +{sortedRecs.length - maxItems} more recommendations
          </Text>
        ) : undefined
      }
    />
  );
}

export default RecommendationList;
