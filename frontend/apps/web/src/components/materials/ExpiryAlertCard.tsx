import { Card, List, Tag, Typography, Space, Button, Empty, Spin, Badge, Avatar } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  RightOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, MaterialBatch } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface ExpiryAlertCardProps {
  days?: number;
  maxItems?: number;
  onViewAll?: () => void;
  onItemClick?: (batch: MaterialBatch) => void;
}

export function ExpiryAlertCard({
  days = 30,
  maxItems = 5,
  onViewAll,
  onItemClick,
}: ExpiryAlertCardProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['materials', 'expiring-batches', days],
    queryFn: () => materialsApi.getExpiringBatches(days),
  });

  const batches = data?.data?.batches || [];
  const displayBatches = batches.slice(0, maxItems);
  const totalCount = batches.length;

  const getUrgencyColor = (daysUntilExpiry?: number) => {
    if (!daysUntilExpiry || daysUntilExpiry <= 7) return '#ff4d4f';
    if (daysUntilExpiry <= 14) return '#ff7a45';
    if (daysUntilExpiry <= 30) return '#faad14';
    return '#52c41a';
  };

  const getUrgencyLabel = (daysUntilExpiry?: number) => {
    if (!daysUntilExpiry || daysUntilExpiry <= 7) return t('materials.critical', 'Critical');
    if (daysUntilExpiry <= 14) return t('materials.urgent', 'Urgent');
    if (daysUntilExpiry <= 30) return t('materials.warning', 'Warning');
    return t('materials.ok', 'OK');
  };

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <ClockCircleOutlined />
            {t('materials.expiring_soon', 'Expiring Soon')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 20 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <ClockCircleOutlined />
            {t('materials.expiring_soon', 'Expiring Soon')}
          </Space>
        }
        style={{ borderLeft: '4px solid #52c41a' }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={0}>
              <Text type="success">{t('materials.no_expiring', 'No materials expiring soon')}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('materials.next_n_days', 'Next {{days}} days', { days })}
              </Text>
            </Space>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          {t('materials.expiring_soon', 'Expiring Soon')}
          <Badge count={totalCount} style={{ backgroundColor: '#faad14' }} />
        </Space>
      }
      extra={
        onViewAll && totalCount > maxItems ? (
          <Button type="link" size="small" onClick={onViewAll}>
            {t('common.view_all', 'View All')} <RightOutlined />
          </Button>
        ) : null
      }
      style={{ borderLeft: '4px solid #faad14' }}
    >
      <List
        dataSource={displayBatches}
        renderItem={(batch) => {
          const urgencyColor = getUrgencyColor(batch.days_until_expiry);
          const urgencyLabel = getUrgencyLabel(batch.days_until_expiry);

          return (
            <List.Item
              style={{ cursor: onItemClick ? 'pointer' : 'default', padding: '8px 0' }}
              onClick={() => onItemClick?.(batch)}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    style={{ backgroundColor: urgencyColor }}
                    icon={<ClockCircleOutlined />}
                  />
                }
                title={
                  <Space>
                    <Text strong>{batch.batch_number}</Text>
                    <Tag color={urgencyColor} style={{ marginLeft: 4 }}>
                      {urgencyLabel}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {batch.vendor_name || t('materials.unknown_vendor', 'Unknown vendor')}
                    </Text>
                    <Space>
                      <CalendarOutlined style={{ fontSize: 11 }} />
                      <Text
                        style={{ fontSize: 12, color: urgencyColor }}
                      >
                        {batch.is_expired
                          ? t('materials.expired', 'Expired')
                          : `${batch.days_until_expiry} ${t('materials.days_left', 'days left')}`}
                      </Text>
                    </Space>
                  </Space>
                }
              />
              <div style={{ textAlign: 'right' }}>
                <div>
                  <Text strong style={{ fontSize: 16 }}>{batch.quantity}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t('materials.at_risk', 'at risk')}
                </Text>
              </div>
            </List.Item>
          );
        }}
        size="small"
      />
    </Card>
  );
}

export default ExpiryAlertCard;
