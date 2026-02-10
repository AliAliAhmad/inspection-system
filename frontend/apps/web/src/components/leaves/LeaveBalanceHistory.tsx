import { useState } from 'react';
import {
  Card,
  Timeline,
  Select,
  DatePicker,
  Space,
  Typography,
  Tag,
  Empty,
  Spin,
  Row,
  Col,
  Tooltip,
  Avatar,
  Button,
} from 'antd';
import {
  PlusCircleOutlined,
  MinusCircleOutlined,
  SwapOutlined,
  ExclamationCircleOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  leavesApi,
  LeaveBalanceHistory as BalanceHistoryType,
  BalanceHistoryParams,
} from '@inspection/shared';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

interface LeaveBalanceHistoryProps {
  userId: number;
}

type ChangeType = 'accrual' | 'used' | 'adjustment' | 'carry_over' | 'expired' | 'encashment';

const CHANGE_TYPE_CONFIG: Record<
  ChangeType,
  { icon: React.ReactNode; color: string; label: string; badgeColor: string }
> = {
  accrual: {
    icon: <PlusCircleOutlined />,
    color: '#52c41a',
    label: 'Accrual',
    badgeColor: 'success',
  },
  used: {
    icon: <MinusCircleOutlined />,
    color: '#ff4d4f',
    label: 'Used',
    badgeColor: 'error',
  },
  adjustment: {
    icon: <SwapOutlined />,
    color: '#1890ff',
    label: 'Adjustment',
    badgeColor: 'processing',
  },
  carry_over: {
    icon: <ClockCircleOutlined />,
    color: '#722ed1',
    label: 'Carry Over',
    badgeColor: 'purple',
  },
  expired: {
    icon: <ExclamationCircleOutlined />,
    color: '#faad14',
    label: 'Expired',
    badgeColor: 'warning',
  },
  encashment: {
    icon: <DollarOutlined />,
    color: '#13c2c2',
    label: 'Encashment',
    badgeColor: 'cyan',
  },
};

export function LeaveBalanceHistory({ userId }: LeaveBalanceHistoryProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<BalanceHistoryParams>({});
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['leaves', 'balance-history', userId, filters],
    queryFn: () =>
      leavesApi.getBalanceHistory(userId, {
        ...filters,
        date_from: dateRange[0]?.format('YYYY-MM-DD'),
        date_to: dateRange[1]?.format('YYYY-MM-DD'),
      }).then((r) => r.data),
  });

  const historyItems: BalanceHistoryType[] = data?.data?.history || [];

  // Fetch leave types for filter
  const { data: leaveTypesData } = useQuery({
    queryKey: ['leave-types', 'active'],
    queryFn: () => leavesApi.listLeaveTypes({ is_active: true }).then((r) => r.data),
  });

  const leaveTypes = leaveTypesData?.data?.types || [];

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates) {
      setDateRange(dates);
      setFilters((prev) => ({
        ...prev,
        date_from: dates[0]?.format('YYYY-MM-DD'),
        date_to: dates[1]?.format('YYYY-MM-DD'),
      }));
    } else {
      setDateRange([null, null]);
      setFilters((prev) => {
        const { date_from, date_to, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleTypeChange = (value: number | undefined) => {
    setFilters((prev) => ({
      ...prev,
      leave_type_id: value,
    }));
  };

  const handleChangeTypeFilter = (value: ChangeType | undefined) => {
    setFilters((prev) => ({
      ...prev,
      change_type: value,
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setDateRange([null, null]);
  };

  const formatAmount = (amount: number) => {
    if (amount > 0) {
      return <Text style={{ color: '#52c41a' }}>+{amount} days</Text>;
    }
    return <Text style={{ color: '#ff4d4f' }}>{amount} days</Text>;
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('common.loading', 'Loading...')}</Text>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          {t('leaves.balanceHistory', 'Balance History')}
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
          {t('common.refresh', 'Refresh')}
        </Button>
      }
    >
      {/* Filters */}
      <div
        style={{
          padding: 16,
          backgroundColor: '#fafafa',
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <Row gutter={16} align="middle">
          <Col>
            <Space>
              <FilterOutlined />
              <Text strong>{t('common.filters', 'Filters')}:</Text>
            </Space>
          </Col>
          <Col>
            <Select
              placeholder={t('leaves.leaveType', 'Leave Type')}
              allowClear
              style={{ width: 160 }}
              value={filters.leave_type_id}
              onChange={handleTypeChange}
              options={leaveTypes.map((lt) => ({
                value: lt.id,
                label: lt.name,
              }))}
            />
          </Col>
          <Col>
            <Select
              placeholder={t('leaves.changeType', 'Change Type')}
              allowClear
              style={{ width: 160 }}
              value={filters.change_type}
              onChange={handleChangeTypeFilter}
              options={Object.entries(CHANGE_TYPE_CONFIG).map(([key, config]) => ({
                value: key,
                label: t(`leaves.changeType.${key}`, config.label),
              }))}
            />
          </Col>
          <Col>
            <RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              style={{ width: 280 }}
            />
          </Col>
          <Col>
            <Button type="link" onClick={clearFilters}>
              {t('common.clearFilters', 'Clear')}
            </Button>
          </Col>
        </Row>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          padding: '8px 16px',
          backgroundColor: '#f5f5f5',
          borderRadius: 4,
        }}
      >
        {Object.entries(CHANGE_TYPE_CONFIG).map(([key, config]) => (
          <Space key={key} size={4}>
            <span style={{ color: config.color }}>{config.icon}</span>
            <Text style={{ fontSize: 12 }}>
              {t(`leaves.changeType.${key}`, config.label)}
            </Text>
          </Space>
        ))}
      </div>

      {/* Timeline */}
      {historyItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('leaves.noHistoryFound', 'No history records found')}
        />
      ) : (
        <Timeline mode="left">
          {historyItems.map((item) => {
            const config = CHANGE_TYPE_CONFIG[item.change_type] || CHANGE_TYPE_CONFIG.adjustment;

            return (
              <Timeline.Item
                key={item.id}
                color={config.color}
                dot={
                  <span
                    style={{
                      fontSize: 16,
                      color: config.color,
                    }}
                  >
                    {config.icon}
                  </span>
                }
                label={
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(item.created_at).format('MMM D, YYYY')}
                    <br />
                    {dayjs(item.created_at).format('h:mm A')}
                  </Text>
                }
              >
                <div
                  style={{
                    padding: 16,
                    backgroundColor: '#fff',
                    borderRadius: 8,
                    border: `1px solid ${config.color}20`,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 8,
                    }}
                  >
                    <Space>
                      <Tag color={config.badgeColor as any}>
                        {t(`leaves.changeType.${item.change_type}`, config.label)}
                      </Tag>
                      {item.leave_type && (
                        <Tag color={item.leave_type.color || 'default'}>
                          {item.leave_type.name}
                        </Tag>
                      )}
                    </Space>
                    <Title level={5} style={{ margin: 0, color: config.color }}>
                      {formatAmount(item.amount)}
                    </Title>
                  </div>

                  {/* Before/After Amounts */}
                  {item.balance_before !== undefined && item.balance_after !== undefined && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('leaves.balanceBefore', 'Before')}: {item.balance_before}{' '}
                        <SwapOutlined />{' '}
                        {t('leaves.balanceAfter', 'After')}: {item.balance_after}
                      </Text>
                    </div>
                  )}

                  {/* Reason */}
                  {item.reason && (
                    <div style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 13 }}>{item.reason}</Text>
                    </div>
                  )}

                  {/* Adjusted by (for manual adjustments) */}
                  {item.adjusted_by && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid #f0f0f0',
                      }}
                    >
                      <Space size={4}>
                        <Avatar size="small" icon={<UserOutlined />} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('leaves.adjustedBy', 'Adjusted by')}: {item.adjusted_by.full_name}
                        </Text>
                      </Space>
                    </div>
                  )}
                </div>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </Card>
  );
}

export default LeaveBalanceHistory;
