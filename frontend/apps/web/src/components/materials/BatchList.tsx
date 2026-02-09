import { Table, Tag, Space, Typography, Tooltip, Badge, Empty, Card, Button } from 'antd';
import {
  CalendarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, MaterialBatch } from '@inspection/shared';
import dayjs from 'dayjs';

const { Text } = Typography;

interface BatchListProps {
  materialId: number;
  showLocation?: boolean;
  compact?: boolean;
  onSelectBatch?: (batch: MaterialBatch) => void;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  available: { color: 'success', icon: <CheckCircleOutlined /> },
  reserved: { color: 'processing', icon: <ClockCircleOutlined /> },
  expired: { color: 'error', icon: <WarningOutlined /> },
  depleted: { color: 'default', icon: <InboxOutlined /> },
};

export function BatchList({
  materialId,
  showLocation = true,
  compact = false,
  onSelectBatch,
}: BatchListProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['material-batches', materialId],
    queryFn: () => materialsApi.getBatches(materialId),
    enabled: !!materialId,
  });

  const batches = data?.data?.batches || [];

  const getExpiryStatus = (batch: MaterialBatch) => {
    if (batch.is_expired) {
      return { color: '#ff4d4f', text: t('materials.expired', 'Expired'), urgent: true };
    }
    if (batch.days_until_expiry !== undefined) {
      if (batch.days_until_expiry <= 7) {
        return { color: '#ff4d4f', text: `${batch.days_until_expiry} ${t('materials.days_left', 'days left')}`, urgent: true };
      }
      if (batch.days_until_expiry <= 30) {
        return { color: '#faad14', text: `${batch.days_until_expiry} ${t('materials.days_left', 'days left')}`, urgent: false };
      }
      return { color: '#52c41a', text: `${batch.days_until_expiry} ${t('materials.days_left', 'days left')}`, urgent: false };
    }
    return null;
  };

  const columns: ColumnsType<MaterialBatch> = [
    {
      title: t('materials.batch_number', 'Batch #'),
      dataIndex: 'batch_number',
      key: 'batch_number',
      render: (value: string, record: MaterialBatch) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          {record.lot_number && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Lot: {record.lot_number}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('materials.quantity', 'Quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (value: number) => <Text strong>{value}</Text>,
    },
    {
      title: t('materials.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const config = statusConfig[status] || { color: 'default', icon: null };
        return (
          <Tag color={config.color} icon={config.icon}>
            {t(`materials.batch_${status}`, status.toUpperCase())}
          </Tag>
        );
      },
    },
    {
      title: t('materials.expiry_date', 'Expiry'),
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      width: 140,
      render: (date: string | undefined, record: MaterialBatch) => {
        if (!date) return <Text type="secondary">-</Text>;

        const expiryStatus = getExpiryStatus(record);
        return (
          <Tooltip title={dayjs(date).format('YYYY-MM-DD')}>
            <Space direction="vertical" size={0}>
              <Space>
                <CalendarOutlined />
                {dayjs(date).format('MMM DD, YYYY')}
              </Space>
              {expiryStatus && (
                <Badge
                  status={expiryStatus.urgent ? 'error' : 'warning'}
                  text={
                    <Text style={{ fontSize: 11, color: expiryStatus.color }}>
                      {expiryStatus.text}
                    </Text>
                  }
                />
              )}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: t('materials.vendor', 'Vendor'),
      dataIndex: 'vendor_name',
      key: 'vendor_name',
      width: 120,
      render: (value: string | undefined) => value || <Text type="secondary">-</Text>,
      hidden: compact,
    },
    {
      title: t('materials.received', 'Received'),
      dataIndex: 'received_date',
      key: 'received_date',
      width: 110,
      render: (date: string | undefined) =>
        date ? dayjs(date).format('MMM DD, YYYY') : <Text type="secondary">-</Text>,
      hidden: compact,
    },
  ].filter((col) => !col.hidden);

  if (batches.length === 0 && !isLoading) {
    return (
      <Card size="small" title={t('materials.batches', 'Batches')}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_batches', 'No batches available')}
        />
      </Card>
    );
  }

  return (
    <Card size="small" title={t('materials.batches', 'Batches')}>
      <Table
        dataSource={batches}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={false}
        size="small"
        rowClassName={(record) =>
          record.is_expired ? 'expired-row' : record.days_until_expiry && record.days_until_expiry <= 7 ? 'expiring-row' : ''
        }
        onRow={
          onSelectBatch
            ? (record) => ({
                onClick: () => onSelectBatch(record),
                style: { cursor: 'pointer' },
              })
            : undefined
        }
      />
      <style>{`
        .expired-row {
          background-color: #fff2f0;
        }
        .expiring-row {
          background-color: #fffbe6;
        }
      `}</style>
    </Card>
  );
}

export default BatchList;
