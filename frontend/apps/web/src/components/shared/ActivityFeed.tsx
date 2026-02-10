import { Timeline, Tag, Typography, Space, Empty, Spin, Button } from 'antd';
import {
  CheckCircleOutlined,
  EditOutlined,
  FileAddOutlined,
  DeleteOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  UserOutlined,
  WarningOutlined,
  StarOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text, Link } = Typography;

export interface ActivityItem {
  id: string | number;
  type: 'create' | 'update' | 'delete' | 'complete' | 'approve' | 'reject' | 'assign' | 'inspect' | 'star' | 'system';
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  entity?: string;
  entityId?: number;
  metadata?: Record<string, any>;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
  maxItems?: number;
  showLoadMore?: boolean;
  onLoadMore?: () => void;
  onItemClick?: (item: ActivityItem) => void;
  emptyText?: string;
  compact?: boolean;
}

const activityIcons: Record<string, { icon: React.ReactNode; color: string }> = {
  create: { icon: <FileAddOutlined />, color: '#52c41a' },
  update: { icon: <EditOutlined />, color: '#1890ff' },
  delete: { icon: <DeleteOutlined />, color: '#ff4d4f' },
  complete: { icon: <CheckCircleOutlined />, color: '#52c41a' },
  approve: { icon: <SafetyCertificateOutlined />, color: '#52c41a' },
  reject: { icon: <WarningOutlined />, color: '#ff4d4f' },
  assign: { icon: <UserOutlined />, color: '#722ed1' },
  inspect: { icon: <ToolOutlined />, color: '#faad14' },
  star: { icon: <StarOutlined />, color: '#faad14' },
  system: { icon: <SyncOutlined />, color: '#8c8c8c' },
};

const entityColors: Record<string, string> = {
  inspection: 'blue',
  defect: 'red',
  job: 'green',
  template: 'purple',
  equipment: 'orange',
  user: 'cyan',
  leave: 'magenta',
};

export function ActivityFeed({
  items,
  loading = false,
  maxItems,
  showLoadMore = false,
  onLoadMore,
  onItemClick,
  emptyText,
  compact = false,
}: ActivityFeedProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: compact ? 20 : 40 }}>
        <Spin />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={emptyText || t('common.noActivity', 'No activity yet')}
      />
    );
  }

  const displayItems = maxItems ? items.slice(0, maxItems) : items;

  return (
    <div>
      <Timeline
        mode={compact ? 'left' : 'alternate'}
        items={displayItems.map((item) => {
          const iconConfig = activityIcons[item.type] || activityIcons.system;
          const timeAgo = dayjs(item.timestamp).fromNow();

          return {
            key: item.id,
            dot: (
              <div
                style={{
                  width: compact ? 24 : 32,
                  height: compact ? 24 : 32,
                  borderRadius: '50%',
                  backgroundColor: `${iconConfig.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: iconConfig.color,
                  fontSize: compact ? 12 : 14,
                }}
              >
                {iconConfig.icon}
              </div>
            ),
            children: (
              <div
                style={{
                  cursor: onItemClick ? 'pointer' : 'default',
                  padding: compact ? '4px 8px' : '8px 12px',
                  borderRadius: 8,
                  backgroundColor: '#fafafa',
                  transition: 'all 0.2s',
                }}
                onClick={() => onItemClick?.(item)}
              >
                <div style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: compact ? 12 : 14 }}>
                    {item.title}
                  </Text>
                  {item.entity && (
                    <Tag
                      color={entityColors[item.entity] || 'default'}
                      style={{ marginLeft: 8, fontSize: 10 }}
                    >
                      {item.entity}
                    </Tag>
                  )}
                </div>

                {item.description && !compact && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {item.description}
                  </Text>
                )}

                <Space size={8} style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {timeAgo}
                  </Text>
                  {item.user && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      <UserOutlined style={{ marginRight: 4 }} />
                      {item.user}
                    </Text>
                  )}
                </Space>
              </div>
            ),
          };
        })}
      />

      {showLoadMore && onLoadMore && items.length > (maxItems || 0) && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" onClick={onLoadMore}>
            {t('common.loadMore', 'Load More')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ActivityFeed;
