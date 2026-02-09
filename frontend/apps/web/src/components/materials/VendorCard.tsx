import { Card, Typography, Space, Tag, Rate, Avatar, Descriptions, Button, Tooltip } from 'antd';
import {
  ShopOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Vendor } from '@inspection/shared';

const { Text, Title } = Typography;

interface VendorCardProps {
  vendor: Vendor;
  compact?: boolean;
  showActions?: boolean;
  onEdit?: (vendor: Vendor) => void;
  onClick?: (vendor: Vendor) => void;
  selected?: boolean;
}

export function VendorCard({
  vendor,
  compact = false,
  showActions = false,
  onEdit,
  onClick,
  selected = false,
}: VendorCardProps) {
  const { t } = useTranslation();

  const getRatingColor = (rating?: number) => {
    if (!rating) return 'default';
    if (rating >= 4) return 'success';
    if (rating >= 3) return 'warning';
    return 'error';
  };

  if (compact) {
    return (
      <Card
        size="small"
        hoverable={!!onClick}
        onClick={() => onClick?.(vendor)}
        style={{
          border: selected ? '2px solid #1890ff' : undefined,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        <Space>
          <Avatar icon={<ShopOutlined />} style={{ backgroundColor: '#1890ff' }} />
          <div>
            <Text strong>{vendor.name}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{vendor.code}</Text>
              {vendor.rating && (
                <Rate disabled value={vendor.rating} style={{ fontSize: 10, marginLeft: 8 }} />
              )}
            </div>
          </div>
          {!vendor.is_active && (
            <Tag color="default">{t('common.inactive', 'Inactive')}</Tag>
          )}
        </Space>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      hoverable={!!onClick}
      onClick={() => onClick?.(vendor)}
      style={{
        border: selected ? '2px solid #1890ff' : undefined,
        cursor: onClick ? 'pointer' : 'default',
      }}
      extra={
        showActions && onEdit ? (
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(vendor);
            }}
          />
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        {/* Header */}
        <Space align="start">
          <Avatar
            size="large"
            icon={<ShopOutlined />}
            style={{ backgroundColor: vendor.is_active ? '#1890ff' : '#8c8c8c' }}
          />
          <div>
            <Space>
              <Title level={5} style={{ margin: 0 }}>{vendor.name}</Title>
              {vendor.is_active ? (
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  {t('common.active', 'Active')}
                </Tag>
              ) : (
                <Tag color="default" icon={<CloseCircleOutlined />}>
                  {t('common.inactive', 'Inactive')}
                </Tag>
              )}
            </Space>
            <div>
              <Text type="secondary">{vendor.code}</Text>
            </div>
          </div>
        </Space>

        {/* Rating */}
        {vendor.rating && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              {t('materials.vendor_rating', 'Rating')}:
            </Text>
            <Rate disabled value={vendor.rating} style={{ fontSize: 14 }} />
            <Tag color={getRatingColor(vendor.rating)} style={{ marginLeft: 8 }}>
              {vendor.rating.toFixed(1)}
            </Tag>
          </div>
        )}

        {/* Contact Info */}
        <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
          {vendor.contact_person && (
            <Descriptions.Item
              label={
                <Space>
                  <UserOutlined />
                  {t('materials.contact', 'Contact')}
                </Space>
              }
            >
              {vendor.contact_person}
            </Descriptions.Item>
          )}
          {vendor.email && (
            <Descriptions.Item
              label={
                <Space>
                  <MailOutlined />
                  {t('common.email', 'Email')}
                </Space>
              }
            >
              <a href={`mailto:${vendor.email}`}>{vendor.email}</a>
            </Descriptions.Item>
          )}
          {vendor.phone && (
            <Descriptions.Item
              label={
                <Space>
                  <PhoneOutlined />
                  {t('common.phone', 'Phone')}
                </Space>
              }
            >
              <a href={`tel:${vendor.phone}`}>{vendor.phone}</a>
            </Descriptions.Item>
          )}
          {vendor.lead_time_days !== undefined && vendor.lead_time_days !== null && (
            <Descriptions.Item
              label={
                <Space>
                  <ClockCircleOutlined />
                  {t('materials.lead_time', 'Lead Time')}
                </Space>
              }
            >
              <Tooltip title={t('materials.lead_time_hint', 'Average delivery time')}>
                <Tag color="blue">
                  {vendor.lead_time_days} {t('materials.days', 'days')}
                </Tag>
              </Tooltip>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Space>
    </Card>
  );
}

export default VendorCard;
