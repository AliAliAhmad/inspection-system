import { Table, Tag, Button, Space, Typography, Popconfirm, message, Card, Empty, Input } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { materialsApi, StockReservation } from '@inspection/shared';
import dayjs from 'dayjs';
import { useState } from 'react';

const { Text } = Typography;

interface ReservationListProps {
  materialId?: number;
  showActions?: boolean;
  compact?: boolean;
  maxItems?: number;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'processing', label: 'Active' },
  fulfilled: { color: 'success', label: 'Fulfilled' },
  cancelled: { color: 'default', label: 'Cancelled' },
};

export function ReservationList({
  materialId,
  showActions = true,
  compact = false,
  maxItems,
}: ReservationListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['material-reservations', materialId],
    queryFn: () => materialsApi.getReservations(materialId),
  });

  const fulfillMutation = useMutation({
    mutationFn: (reservationId: number) => materialsApi.fulfillReservation(reservationId),
    onSuccess: () => {
      message.success(t('materials.reservation_fulfilled', 'Reservation fulfilled'));
      queryClient.invalidateQueries({ queryKey: ['material-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reservationId: number) => materialsApi.cancelReservation(reservationId),
    onSuccess: () => {
      message.success(t('materials.reservation_cancelled', 'Reservation cancelled'));
      queryClient.invalidateQueries({ queryKey: ['material-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || t('common.error', 'An error occurred'));
    },
  });

  let reservations = data?.data?.reservations || [];

  // Filter by search
  if (search) {
    const searchLower = search.toLowerCase();
    reservations = reservations.filter(
      (r) =>
        r.material_name.toLowerCase().includes(searchLower) ||
        r.reserved_by.toLowerCase().includes(searchLower)
    );
  }

  // Limit items if maxItems is set
  if (maxItems) {
    reservations = reservations.slice(0, maxItems);
  }

  const isNeededSoon = (date?: string) => {
    if (!date) return false;
    const diff = dayjs(date).diff(dayjs(), 'day');
    return diff <= 3;
  };

  const columns: ColumnsType<StockReservation> = [
    {
      title: t('materials.material', 'Material'),
      dataIndex: 'material_name',
      key: 'material_name',
      render: (name: string) => <Text strong>{name}</Text>,
      hidden: !!materialId, // Hide if showing for specific material
    },
    {
      title: t('materials.quantity', 'Quantity'),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center' as const,
      render: (qty: number) => <Text strong>{qty}</Text>,
    },
    {
      title: t('materials.type', 'Type'),
      dataIndex: 'reservation_type',
      key: 'reservation_type',
      width: 100,
      render: (type: string) => (
        <Tag>{type.replace('_', ' ').toUpperCase()}</Tag>
      ),
      hidden: compact,
    },
    {
      title: t('materials.needed_by', 'Needed By'),
      dataIndex: 'needed_by_date',
      key: 'needed_by_date',
      width: 130,
      render: (date: string | undefined) => {
        if (!date) return <Text type="secondary">-</Text>;
        const isSoon = isNeededSoon(date);
        return (
          <Space>
            <CalendarOutlined style={{ color: isSoon ? '#ff4d4f' : '#8c8c8c' }} />
            <Text style={{ color: isSoon ? '#ff4d4f' : undefined }}>
              {dayjs(date).format('MMM DD')}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('materials.reserved_by', 'Reserved By'),
      dataIndex: 'reserved_by',
      key: 'reserved_by',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          {name}
        </Space>
      ),
      hidden: compact,
    },
    {
      title: t('common.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const config = statusConfig[status] || { color: 'default', label: status };
        return (
          <Tag color={config.color}>
            {t(`materials.reservation_${status}`, config.label)}
          </Tag>
        );
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 150,
      render: (_: any, record: StockReservation) => {
        if (record.status !== 'active') return null;

        return (
          <Space>
            <Popconfirm
              title={t('materials.confirm_fulfill', 'Fulfill this reservation?')}
              description={t('materials.fulfill_description', 'Stock will be deducted from inventory')}
              onConfirm={() => fulfillMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={fulfillMutation.isPending}
                style={{ color: '#52c41a' }}
              >
                {!compact && t('materials.fulfill', 'Fulfill')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('materials.confirm_cancel_reservation', 'Cancel this reservation?')}
              onConfirm={() => cancelMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
            >
              <Button
                type="link"
                size="small"
                icon={<CloseCircleOutlined />}
                loading={cancelMutation.isPending}
                danger
              >
                {!compact && t('common.cancel', 'Cancel')}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
      hidden: !showActions,
    },
  ].filter((col) => !col.hidden);

  if (reservations.length === 0 && !isLoading) {
    return (
      <Card
        size="small"
        title={t('materials.reservations', 'Reservations')}
        extra={
          !compact && (
            <Input
              placeholder={t('common.search', 'Search...')}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
          )
        }
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_reservations', 'No reservations')}
        />
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={t('materials.reservations', 'Reservations')}
      extra={
        !compact && (
          <Input
            placeholder={t('common.search', 'Search...')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
        )
      }
    >
      <Table
        dataSource={reservations}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={compact ? false : { pageSize: 10, showSizeChanger: false }}
        size="small"
        rowClassName={(record) =>
          record.status === 'active' && isNeededSoon(record.needed_by_date)
            ? 'urgent-row'
            : ''
        }
      />
      <style>{`
        .urgent-row {
          background-color: #fff2f0;
        }
      `}</style>
    </Card>
  );
}

export default ReservationList;
