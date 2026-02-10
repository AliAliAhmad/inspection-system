import { Card, Row, Col, Statistic, Badge, Spin, Typography } from 'antd';
import {
  CalendarOutlined,
  PauseCircleOutlined,
  GiftOutlined,
  SwapOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ApprovalType } from './ApprovalCard';
import type { ApprovalCounts } from '@inspection/shared';

const { Title } = Typography;

// Re-export for convenience
export type { ApprovalCounts } from '@inspection/shared';

export interface ApprovalStatsProps {
  counts: ApprovalCounts;
  loading?: boolean;
  onTypeClick?: (type: ApprovalType | 'all') => void;
  activeType?: ApprovalType | 'all';
}

const TYPE_CONFIG: Record<ApprovalType, { icon: React.ReactNode; color: string; label: string }> = {
  leave: { icon: <CalendarOutlined />, color: '#1890ff', label: 'Leave' },
  pause: { icon: <PauseCircleOutlined />, color: '#fa8c16', label: 'Pause' },
  bonus: { icon: <GiftOutlined />, color: '#faad14', label: 'Bonus' },
  takeover: { icon: <SwapOutlined />, color: '#722ed1', label: 'Takeover' },
};

export function ApprovalStats({
  counts,
  loading,
  onTypeClick,
  activeType = 'all',
}: ApprovalStatsProps) {
  const { t } = useTranslation();

  const StatCard = ({
    type,
    count,
    icon,
    color,
    label,
  }: {
    type: ApprovalType | 'all';
    count: number;
    icon: React.ReactNode;
    color: string;
    label: string;
  }) => (
    <Card
      hoverable={!!onTypeClick}
      onClick={() => onTypeClick?.(type)}
      style={{
        cursor: onTypeClick ? 'pointer' : 'default',
        borderColor: activeType === type ? color : undefined,
        borderWidth: activeType === type ? 2 : 1,
        backgroundColor: activeType === type ? `${color}08` : undefined,
      }}
      bodyStyle={{ padding: '16px' }}
    >
      <Statistic
        title={
          <span style={{ color: activeType === type ? color : undefined }}>
            {icon}
            <span style={{ marginLeft: 8 }}>{label}</span>
          </span>
        }
        value={count}
        valueStyle={{ color: count > 0 ? color : undefined }}
        prefix={count > 0 ? <Badge status="processing" /> : null}
      />
    </Card>
  );

  if (loading) {
    return (
      <Card style={{ marginBottom: 16, textAlign: 'center' }}>
        <Spin />
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
      <Title level={5} style={{ marginBottom: 16 }}>
        <ClockCircleOutlined style={{ marginRight: 8 }} />
        {t('approvals.pendingStats', 'Pending Approvals')}
      </Title>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={4}>
          <StatCard
            type="all"
            count={counts.total}
            icon={<ClockCircleOutlined />}
            color="#1677ff"
            label={t('approvals.all', 'All')}
          />
        </Col>
        {(Object.keys(TYPE_CONFIG) as ApprovalType[]).map((type) => (
          <Col key={type} xs={12} sm={8} md={5}>
            <StatCard
              type={type}
              count={counts[type]}
              icon={TYPE_CONFIG[type].icon}
              color={TYPE_CONFIG[type].color}
              label={t(`approvals.type.${type}`, TYPE_CONFIG[type].label)}
            />
          </Col>
        ))}
      </Row>
    </Card>
  );
}

export default ApprovalStats;
