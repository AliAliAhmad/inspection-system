import { useState } from 'react';
import {
  Card,
  Progress,
  Space,
  Typography,
  Tag,
  Tooltip,
  Button,
  Row,
  Col,
  Spin,
  Empty,
  Divider,
} from 'antd';
import {
  CalendarOutlined,
  MedicineBoxOutlined,
  ThunderboltOutlined,
  BookOutlined,
  HistoryOutlined,
  WarningOutlined,
  SwapOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { leavesApi, LeaveBalance, LeaveBalanceDetail } from '@inspection/shared';

const { Text, Title } = Typography;

interface LeaveBalanceCardProps {
  userId: number;
  compact?: boolean;
  onViewHistory?: () => void;
}

const LEAVE_TYPE_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  annual: { icon: <CalendarOutlined />, color: '#1890ff', label: 'Annual' },
  sick: { icon: <MedicineBoxOutlined />, color: '#52c41a', label: 'Sick' },
  emergency: { icon: <ThunderboltOutlined />, color: '#faad14', label: 'Emergency' },
  training: { icon: <BookOutlined />, color: '#722ed1', label: 'Training' },
  comp_off: { icon: <SwapOutlined />, color: '#13c2c2', label: 'Comp Off' },
};

function BalanceProgressItem({
  type,
  balance,
  compact,
  onHistoryClick,
  t,
}: {
  type: string;
  balance: LeaveBalanceDetail;
  compact?: boolean;
  onHistoryClick?: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  const config = LEAVE_TYPE_CONFIG[type] || {
    icon: <CalendarOutlined />,
    color: '#8c8c8c',
    label: type,
  };

  const used = balance.used + balance.pending;
  const total = balance.total;
  const remaining = balance.remaining;
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  const isLow = remaining <= 2 && total > 0;
  const hasCarryOver = (balance.carry_over || 0) > 0;

  return (
    <div
      style={{
        padding: compact ? '8px 12px' : '12px 16px',
        borderRadius: 8,
        backgroundColor: '#fafafa',
        marginBottom: 8,
        cursor: onHistoryClick ? 'pointer' : 'default',
      }}
      onClick={onHistoryClick}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <Space size={8}>
          <span style={{ color: config.color, fontSize: compact ? 14 : 16 }}>
            {config.icon}
          </span>
          <Text strong style={{ fontSize: compact ? 12 : 14 }}>
            {t(`leaves.type.${type}`, config.label)}
          </Text>
          {hasCarryOver && (
            <Tooltip
              title={t(
                'leaves.carryOverTooltip',
                `Includes ${balance.carry_over} days carried over from last year`
              )}
            >
              <Tag color="blue" style={{ fontSize: 10 }}>
                <SwapOutlined /> {balance.carry_over}
              </Tag>
            </Tooltip>
          )}
          {isLow && (
            <Tooltip title={t('leaves.lowBalanceWarning', 'Low balance remaining')}>
              <WarningOutlined style={{ color: '#ff4d4f' }} />
            </Tooltip>
          )}
        </Space>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: compact ? 11 : 12 }}>
            {remaining} / {total}
          </Text>
          {balance.pending > 0 && (
            <Tooltip title={t('leaves.pendingDays', `${balance.pending} days pending approval`)}>
              <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
                {balance.pending} {t('leaves.pending', 'pending')}
              </Tag>
            </Tooltip>
          )}
        </Space>
      </div>

      <Progress
        percent={percent}
        showInfo={false}
        strokeColor={isLow ? '#ff4d4f' : config.color}
        trailColor="#e8e8e8"
        size="small"
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontSize: compact ? 10 : 11,
        }}
      >
        <Text type="secondary">
          {t('leaves.used', 'Used')}: {balance.used}
        </Text>
        <Text type="secondary">
          {t('leaves.remaining', 'Remaining')}: {remaining}
        </Text>
      </div>
    </div>
  );
}

export function LeaveBalanceCard({
  userId,
  compact = false,
  onViewHistory,
}: LeaveBalanceCardProps) {
  const { t } = useTranslation();

  const { data: balanceData, isLoading } = useQuery({
    queryKey: ['leaves', 'balance', userId],
    queryFn: () => leavesApi.getLeaveBalance(userId).then((r) => r.data),
  });

  const balance: LeaveBalance | null = balanceData?.data?.balance || null;

  if (isLoading) {
    return (
      <Card size={compact ? 'small' : 'default'}>
        <div style={{ textAlign: 'center', padding: compact ? 20 : 40 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  if (!balance) {
    return (
      <Card size={compact ? 'small' : 'default'}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('leaves.noBalanceData', 'No balance data available')}
        />
      </Card>
    );
  }

  // Calculate totals
  const totalAllowed = Object.values(balance).reduce((sum, b) => sum + b.total, 0);
  const totalUsed = Object.values(balance).reduce((sum, b) => sum + b.used, 0);
  const totalRemaining = Object.values(balance).reduce((sum, b) => sum + b.remaining, 0);
  const totalCarryOver = Object.values(balance).reduce((sum, b) => sum + (b.carry_over || 0), 0);

  if (compact) {
    return (
      <Card
        size="small"
        title={
          <Space>
            <CalendarOutlined />
            {t('leaves.balance', 'Leave Balance')}
          </Space>
        }
        extra={
          onViewHistory && (
            <Button
              type="link"
              size="small"
              icon={<HistoryOutlined />}
              onClick={onViewHistory}
            >
              {t('leaves.history', 'History')}
            </Button>
          )
        }
      >
        {Object.entries(balance).map(([type, typeBalance]) => (
          <BalanceProgressItem
            key={type}
            type={type}
            balance={typeBalance}
            compact
            t={t}
          />
        ))}
      </Card>
    );
  }

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          {t('leaves.leaveBalance', 'Leave Balance')}
        </Space>
      }
      extra={
        onViewHistory && (
          <Button
            type="primary"
            ghost
            icon={<HistoryOutlined />}
            onClick={onViewHistory}
          >
            {t('leaves.viewHistory', 'View History')}
          </Button>
        )
      }
    >
      {/* Summary Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
              {totalAllowed}
            </Title>
            <Text type="secondary">{t('leaves.totalAllowed', 'Total Allowed')}</Text>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0, color: '#faad14' }}>
              {totalUsed}
            </Title>
            <Text type="secondary">{t('leaves.totalUsed', 'Used')}</Text>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ textAlign: 'center' }}>
            <Title
              level={3}
              style={{
                margin: 0,
                color: totalRemaining > 0 ? '#52c41a' : '#ff4d4f',
              }}
            >
              {totalRemaining}
            </Title>
            <Text type="secondary">{t('leaves.totalRemaining', 'Remaining')}</Text>
          </div>
        </Col>
        <Col span={6}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0, color: '#722ed1' }}>
              {totalCarryOver}
            </Title>
            <Text type="secondary">
              {t('leaves.carryOver', 'Carry Over')}
              <Tooltip title={t('leaves.carryOverInfo', 'Days carried over from previous year')}>
                <InfoCircleOutlined style={{ marginLeft: 4 }} />
              </Tooltip>
            </Text>
          </div>
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      {/* Balance by Type */}
      <Row gutter={16}>
        {Object.entries(balance).map(([type, typeBalance]) => (
          <Col span={12} key={type}>
            <BalanceProgressItem
              type={type}
              balance={typeBalance}
              onHistoryClick={onViewHistory}
              t={t}
            />
          </Col>
        ))}
      </Row>

      {/* Low Balance Warning */}
      {totalRemaining <= 3 && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            backgroundColor: '#fff2e8',
            borderRadius: 8,
            border: '1px solid #ffbb96',
          }}
        >
          <Space>
            <WarningOutlined style={{ color: '#fa8c16' }} />
            <Text style={{ color: '#d46b08' }}>
              {t(
                'leaves.lowBalanceAlert',
                'Your leave balance is running low. Consider planning your remaining leaves carefully.'
              )}
            </Text>
          </Space>
        </div>
      )}
    </Card>
  );
}

export default LeaveBalanceCard;
