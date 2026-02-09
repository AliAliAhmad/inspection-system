import { useState } from 'react';
import { Timeline, Card, Tag, Typography, Space, Select, Empty, Spin, Pagination } from 'antd';
import {
  MinusCircleOutlined,
  PlusCircleOutlined,
  EditOutlined,
  SwapOutlined,
  RollbackOutlined,
  DeleteOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { materialsApi, StockHistoryEntry } from '@inspection/shared';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface StockHistoryTimelineProps {
  materialId: number;
  defaultLimit?: number;
}

const changeTypeConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  consume: { color: 'red', icon: <MinusCircleOutlined />, label: 'Consumed' },
  restock: { color: 'green', icon: <PlusCircleOutlined />, label: 'Restocked' },
  adjust: { color: 'blue', icon: <EditOutlined />, label: 'Adjusted' },
  transfer: { color: 'purple', icon: <SwapOutlined />, label: 'Transferred' },
  return: { color: 'cyan', icon: <RollbackOutlined />, label: 'Returned' },
  waste: { color: 'orange', icon: <DeleteOutlined />, label: 'Waste' },
};

export function StockHistoryTimeline({
  materialId,
  defaultLimit = 10,
}: StockHistoryTimelineProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['material-history', materialId, page],
    queryFn: () => materialsApi.getStockHistory(materialId, { page, limit: defaultLimit }),
    enabled: !!materialId,
  });

  const history = data?.data?.history || [];
  const total = data?.data?.total || 0;
  const pages = data?.data?.pages || 1;

  const filteredHistory = filterType
    ? history.filter((entry) => entry.change_type === filterType)
    : history;

  const formatQuantityChange = (entry: StockHistoryEntry) => {
    const isPositive = entry.quantity_change > 0;
    return (
      <Text strong style={{ color: isPositive ? '#52c41a' : '#ff4d4f' }}>
        {isPositive ? '+' : ''}{entry.quantity_change}
      </Text>
    );
  };

  if (isLoading) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <HistoryOutlined />
            {t('materials.stock_history', 'Stock History')}
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  return (
    <Card
      size="small"
      title={
        <Space>
          <HistoryOutlined />
          {t('materials.stock_history', 'Stock History')}
        </Space>
      }
      extra={
        <Select
          placeholder={t('materials.filter_by_type', 'Filter by type')}
          allowClear
          style={{ width: 150 }}
          value={filterType}
          onChange={setFilterType}
          options={Object.entries(changeTypeConfig).map(([key, config]) => ({
            value: key,
            label: (
              <Space>
                {config.icon}
                {t(`materials.${key}`, config.label)}
              </Space>
            ),
          }))}
        />
      }
    >
      {filteredHistory.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('materials.no_history', 'No history available')}
        />
      ) : (
        <>
          <Timeline
            items={filteredHistory.map((entry) => {
              const config = changeTypeConfig[entry.change_type] || {
                color: 'gray',
                icon: <EditOutlined />,
                label: entry.change_type,
              };

              return {
                color: config.color,
                dot: config.icon,
                children: (
                  <div style={{ paddingBottom: 8 }}>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={config.color}>
                          {t(`materials.${entry.change_type}`, config.label)}
                        </Tag>
                        {formatQuantityChange(entry)}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          ({entry.quantity_before} → {entry.quantity_after})
                        </Text>
                      </Space>

                      {entry.reason && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {entry.reason}
                        </Text>
                      )}

                      <Space split={<Text type="secondary">|</Text>} size={4}>
                        {entry.user_name && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {t('materials.by', 'By')}: {entry.user_name}
                          </Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {dayjs(entry.created_at).fromNow()}
                        </Text>
                      </Space>
                    </Space>
                  </div>
                ),
              };
            })}
          />

          {pages > 1 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Pagination
                current={page}
                total={total}
                pageSize={defaultLimit}
                onChange={setPage}
                size="small"
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export default StockHistoryTimeline;
