import React, { useMemo } from 'react';
import {
  Card,
  Tag,
  Typography,
  Space,
  Badge,
  Tooltip,
  Button,
  Dropdown,
  Row,
  Col,
  Divider,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
  CalendarOutlined,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type {
  InspectionRoutine,
  RoutineShiftType,
  RoutineDayOfWeek,
  RoutineFrequencyType,
} from '@inspection/shared';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface RoutineCardProps {
  routine: InspectionRoutine;
  onEdit?: (routine: InspectionRoutine) => void;
  onDelete?: (routine: InspectionRoutine) => void;
  compact?: boolean;
}

const DAYS_SHORT: Record<RoutineDayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const DAYS_ORDER: RoutineDayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const getShiftConfig = (shift: RoutineShiftType | null) => {
  switch (shift) {
    case 'morning':
      return {
        icon: <SunOutlined />,
        color: '#faad14',
        label: 'Morning',
        time: '6:00-14:00',
      };
    case 'afternoon':
      return {
        icon: <CloudOutlined />,
        color: '#1890ff',
        label: 'Afternoon',
        time: '14:00-22:00',
      };
    case 'night':
      return {
        icon: <MoonOutlined />,
        color: '#722ed1',
        label: 'Night',
        time: '22:00-6:00',
      };
    default:
      return {
        icon: <ClockCircleOutlined />,
        color: '#8c8c8c',
        label: 'Any Shift',
        time: 'All day',
      };
  }
};

const getFrequencyConfig = (frequency: RoutineFrequencyType) => {
  switch (frequency) {
    case 'daily':
      return { color: 'green', label: 'Daily' };
    case 'weekly':
      return { color: 'blue', label: 'Weekly' };
    case 'monthly':
      return { color: 'purple', label: 'Monthly' };
    default:
      return { color: 'default', label: 'Unknown' };
  }
};

export const RoutineCard: React.FC<RoutineCardProps> = ({
  routine,
  onEdit,
  onDelete,
  compact = false,
}) => {
  const { t } = useTranslation();

  const shiftConfig = getShiftConfig(routine.shift);
  const frequencyConfig = getFrequencyConfig(routine.frequency || 'weekly');

  // Sort days of week in order
  const sortedDays = useMemo(() => {
    if (!routine.days_of_week) return [];
    return [...routine.days_of_week].sort(
      (a, b) => DAYS_ORDER.indexOf(a as RoutineDayOfWeek) - DAYS_ORDER.indexOf(b as RoutineDayOfWeek)
    );
  }, [routine.days_of_week]);

  // Calculate next scheduled date
  const nextScheduledDate = useMemo(() => {
    const today = dayjs();
    const frequency = routine.frequency || 'weekly';

    if (frequency === 'daily') {
      return today.format('ddd, MMM D');
    }

    if (frequency === 'weekly' && sortedDays.length > 0) {
      const todayDow = today.day();
      const dayNumbers = sortedDays.map((d) => {
        const idx = DAYS_ORDER.indexOf(d as RoutineDayOfWeek);
        return idx === 6 ? 0 : idx + 1; // Convert to JS day (0=Sun)
      });

      // Find next occurrence
      for (let i = 0; i < 7; i++) {
        const checkDay = (todayDow + i) % 7;
        if (dayNumbers.includes(checkDay)) {
          return today.add(i, 'day').format('ddd, MMM D');
        }
      }
    }

    if (frequency === 'monthly') {
      const startOfNextMonth = today.add(1, 'month').startOf('month');
      return startOfNextMonth.format('ddd, MMM D');
    }

    return '-';
  }, [routine.frequency, sortedDays]);

  const menuItems: MenuProps['items'] = [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: t('common.edit', 'Edit'),
      onClick: () => onEdit?.(routine),
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: t('common.delete', 'Delete'),
      danger: true,
      onClick: () => onDelete?.(routine),
    },
  ];

  if (compact) {
    return (
      <Card
        size="small"
        hoverable
        style={{
          borderLeft: `3px solid ${shiftConfig.color}`,
          opacity: routine.is_active ? 1 : 0.6,
        }}
        bodyStyle={{ padding: '8px 12px' }}
      >
        <Row justify="space-between" align="middle">
          <Col flex="auto">
            <Space size={4}>
              <span style={{ color: shiftConfig.color }}>{shiftConfig.icon}</span>
              <Text strong>{routine.name}</Text>
              {!routine.is_active && (
                <Tag color="default" style={{ marginLeft: 4 }}>
                  {t('routines.inactive', 'Inactive')}
                </Tag>
              )}
            </Space>
            <div style={{ marginTop: 4 }}>
              <Space size={4} wrap>
                <Tag color={frequencyConfig.color} style={{ margin: 0 }}>
                  {t(`routines.${routine.frequency}`, frequencyConfig.label)}
                </Tag>
                {sortedDays.slice(0, 3).map((day) => (
                  <Tag key={day} style={{ margin: 0 }}>
                    {DAYS_SHORT[day as RoutineDayOfWeek]}
                  </Tag>
                ))}
                {sortedDays.length > 3 && (
                  <Tag style={{ margin: 0 }}>+{sortedDays.length - 3}</Tag>
                )}
              </Space>
            </div>
          </Col>
          <Col>
            <Dropdown menu={{ items: menuItems }} trigger={['click']}>
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          </Col>
        </Row>
      </Card>
    );
  }

  return (
    <Card
      hoverable
      style={{
        borderLeft: `4px solid ${shiftConfig.color}`,
        opacity: routine.is_active ? 1 : 0.6,
      }}
      actions={[
        <Button
          key="edit"
          type="text"
          icon={<EditOutlined />}
          onClick={() => onEdit?.(routine)}
        >
          {t('common.edit', 'Edit')}
        </Button>,
        <Button
          key="delete"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete?.(routine)}
        >
          {t('common.delete', 'Delete')}
        </Button>,
      ]}
    >
      {/* Header */}
      <Row justify="space-between" align="top">
        <Col>
          <Space direction="vertical" size={0}>
            <Space>
              <Title level={5} style={{ margin: 0 }}>
                {routine.name}
              </Title>
              {routine.is_active ? (
                <Tooltip title={t('routines.active', 'Active')}>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                </Tooltip>
              ) : (
                <Tooltip title={t('routines.inactive', 'Inactive')}>
                  <PauseCircleOutlined style={{ color: '#8c8c8c' }} />
                </Tooltip>
              )}
            </Space>
            {routine.name_ar && (
              <Text type="secondary" style={{ direction: 'rtl' }}>
                {routine.name_ar}
              </Text>
            )}
          </Space>
        </Col>
        <Col>
          <Tag color={frequencyConfig.color}>
            {t(`routines.${routine.frequency}`, frequencyConfig.label)}
          </Tag>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* Schedule Info */}
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Space size={8}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: `${shiftConfig.color}15`,
                color: shiftConfig.color,
                fontSize: 16,
              }}
            >
              {shiftConfig.icon}
            </span>
            <div>
              <Text strong style={{ display: 'block' }}>
                {t(`routines.${routine.shift}`, shiftConfig.label)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {shiftConfig.time}
              </Text>
            </div>
          </Space>
        </Col>
        <Col xs={24} sm={12}>
          <Space size={8}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#1890ff15',
                color: '#1890ff',
                fontSize: 16,
              }}
            >
              <CalendarOutlined />
            </span>
            <div>
              <Text strong style={{ display: 'block' }}>
                {t('routines.nextScheduled', 'Next')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {nextScheduledDate}
              </Text>
            </div>
          </Space>
        </Col>
      </Row>

      {/* Days of Week - for weekly routines */}
      {routine.frequency === 'weekly' && sortedDays.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
              {t('routines.scheduledDaysLabel', 'Scheduled Days')}
            </Text>
            <Space size={4} wrap>
              {DAYS_ORDER.map((day) => {
                const isSelected = sortedDays.includes(day);
                return (
                  <Tag
                    key={day}
                    color={isSelected ? 'blue' : undefined}
                    style={{
                      opacity: isSelected ? 1 : 0.3,
                      margin: 0,
                    }}
                  >
                    {DAYS_SHORT[day]}
                  </Tag>
                );
              })}
            </Space>
          </div>
        </>
      )}

      {/* Asset Types */}
      <Divider style={{ margin: '12px 0' }} />
      <div>
        <Space size={4} style={{ marginBottom: 4 }}>
          <ToolOutlined style={{ color: '#8c8c8c' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('routines.assetTypes', 'Asset Types')}
          </Text>
        </Space>
        <div>
          <Space size={4} wrap>
            {routine.asset_types.map((type) => (
              <Tag key={type}>{type}</Tag>
            ))}
          </Space>
        </div>
      </div>

      {/* Created At */}
      <div style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {t('routines.createdAt', 'Created')}: {dayjs(routine.created_at).format('MMM D, YYYY')}
        </Text>
      </div>
    </Card>
  );
};

export default RoutineCard;
