import { Card, Tag, Button, Space, Typography, Avatar, Tooltip, Checkbox } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  UserOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  GiftOutlined,
  PauseCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

export type ApprovalType = 'leave' | 'pause' | 'bonus' | 'takeover';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalItem {
  id: number;
  type: ApprovalType;
  status: ApprovalStatus;
  requestedAt: string;
  requestedBy: {
    id: number;
    name: string;
    role?: string;
  };
  // Type-specific data
  details: {
    // Leave
    leaveType?: string;
    dateFrom?: string;
    dateTo?: string;
    totalDays?: number;
    reason?: string;
    // Pause
    pauseCategory?: string;
    pauseDetails?: string;
    jobType?: string;
    jobId?: number;
    // Bonus
    amount?: number;
    targetUser?: { id: number; name: string };
    // Takeover
    queuePosition?: number;
    takeoverReason?: string;
  };
}

export interface ApprovalCardProps {
  item: ApprovalItem;
  selected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  onApprove: (item: ApprovalItem) => void;
  onReject: (item: ApprovalItem) => void;
  approving?: boolean;
  rejecting?: boolean;
  showActions?: boolean;
}

const TYPE_ICONS: Record<ApprovalType, React.ReactNode> = {
  leave: <CalendarOutlined />,
  pause: <PauseCircleOutlined />,
  bonus: <GiftOutlined />,
  takeover: <SwapOutlined />,
};

const TYPE_COLORS: Record<ApprovalType, string> = {
  leave: 'blue',
  pause: 'orange',
  bonus: 'gold',
  takeover: 'purple',
};

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick: 'red',
  annual: 'blue',
  emergency: 'orange',
  training: 'purple',
  other: 'default',
};

const PAUSE_CATEGORY_COLORS: Record<string, string> = {
  parts: 'blue',
  duty_finish: 'purple',
  tools: 'cyan',
  manpower: 'geekblue',
  oem: 'magenta',
  error_record: 'volcano',
  other: 'default',
};

export function ApprovalCard({
  item,
  selected,
  onSelect,
  onApprove,
  onReject,
  approving,
  rejecting,
  showActions = true,
}: ApprovalCardProps) {
  const { t } = useTranslation();

  const renderTypeSpecificContent = () => {
    switch (item.type) {
      case 'leave':
        return (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color={LEAVE_TYPE_COLORS[item.details.leaveType || 'other']}>
                {(item.details.leaveType || 'other').toUpperCase()}
              </Tag>
              <Tag icon={<CalendarOutlined />}>
                {dayjs(item.details.dateFrom).format('MMM D')} - {dayjs(item.details.dateTo).format('MMM D, YYYY')}
              </Tag>
              <Tag>{item.details.totalDays} {t('approvals.days', 'days')}</Tag>
            </Space>
            {item.details.reason && (
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                {item.details.reason}
              </Paragraph>
            )}
          </>
        );
      case 'pause':
        return (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color={PAUSE_CATEGORY_COLORS[item.details.pauseCategory || 'other']}>
                {(item.details.pauseCategory || 'other').replace(/_/g, ' ').toUpperCase()}
              </Tag>
              <Tag>{item.details.jobType} #{item.details.jobId}</Tag>
            </Space>
            {item.details.pauseDetails && (
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                {item.details.pauseDetails}
              </Paragraph>
            )}
          </>
        );
      case 'bonus':
        return (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color="gold" icon={<GiftOutlined />}>
                +{item.details.amount} {t('approvals.stars', 'stars')}
              </Tag>
              {item.details.targetUser && (
                <Tag icon={<UserOutlined />}>
                  {t('approvals.for', 'For')}: {item.details.targetUser.name}
                </Tag>
              )}
            </Space>
            {item.details.reason && (
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                {item.details.reason}
              </Paragraph>
            )}
          </>
        );
      case 'takeover':
        return (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color="purple">
                {item.details.jobType} #{item.details.jobId}
              </Tag>
              <Tag icon={<ClockCircleOutlined />}>
                {t('approvals.queuePosition', 'Queue')}: #{item.details.queuePosition}
              </Tag>
            </Space>
            {item.details.takeoverReason && (
              <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
                {item.details.takeoverReason}
              </Paragraph>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      size="small"
      hoverable
      style={{
        marginBottom: 12,
        borderLeft: `3px solid ${selected ? '#1677ff' : 'transparent'}`,
        backgroundColor: selected ? '#e6f4ff' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {onSelect && (
          <Checkbox
            checked={selected}
            onChange={(e) => onSelect(item.id, e.target.checked)}
            style={{ marginTop: 4 }}
          />
        )}

        <div style={{ flex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <Space>
              <Avatar size="small" icon={<UserOutlined />} />
              <div>
                <Text strong>{item.requestedBy.name}</Text>
                {item.requestedBy.role && (
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    ({item.requestedBy.role})
                  </Text>
                )}
              </div>
            </Space>
            <Space>
              <Tag color={TYPE_COLORS[item.type]} icon={TYPE_ICONS[item.type]}>
                {t(`approvals.type.${item.type}`, item.type.toUpperCase())}
              </Tag>
              <Tag color={STATUS_COLORS[item.status]}>
                {item.status.toUpperCase()}
              </Tag>
            </Space>
          </div>

          {/* Type-specific content */}
          {renderTypeSpecificContent()}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <ClockCircleOutlined style={{ marginRight: 4 }} />
              {dayjs(item.requestedAt).format('MMM D, YYYY HH:mm')}
            </Text>

            {showActions && item.status === 'pending' && (
              <Space>
                <Tooltip title={t('approvals.approve', 'Approve')}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckOutlined />}
                    loading={approving}
                    onClick={() => onApprove(item)}
                  >
                    {t('approvals.approve', 'Approve')}
                  </Button>
                </Tooltip>
                <Tooltip title={t('approvals.reject', 'Reject')}>
                  <Button
                    danger
                    size="small"
                    icon={<CloseOutlined />}
                    loading={rejecting}
                    onClick={() => onReject(item)}
                  >
                    {t('approvals.reject', 'Reject')}
                  </Button>
                </Tooltip>
              </Space>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default ApprovalCard;
