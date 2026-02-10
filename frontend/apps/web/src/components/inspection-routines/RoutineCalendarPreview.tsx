import React, { useMemo, useState } from 'react';
import {
  Card,
  Badge,
  Typography,
  Button,
  Space,
  Tooltip,
  Row,
  Col,
  Tag,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  SunOutlined,
  CloudOutlined,
  MoonOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import type { RoutineShiftType, RoutineDayOfWeek, RoutineFrequencyType } from '@inspection/shared';

const { Text, Title } = Typography;

interface RoutineCalendarPreviewProps {
  frequency: RoutineFrequencyType;
  shift: RoutineShiftType | null;
  daysOfWeek: RoutineDayOfWeek[];
  routineName?: string;
}

const DAYS_MAP: Record<RoutineDayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const getShiftIcon = (shift: RoutineShiftType | null) => {
  switch (shift) {
    case 'morning':
      return <SunOutlined style={{ color: '#faad14' }} />;
    case 'afternoon':
      return <CloudOutlined style={{ color: '#1890ff' }} />;
    case 'night':
      return <MoonOutlined style={{ color: '#722ed1' }} />;
    default:
      return null;
  }
};

const getShiftColor = (shift: RoutineShiftType | null) => {
  switch (shift) {
    case 'morning':
      return '#faad14';
    case 'afternoon':
      return '#1890ff';
    case 'night':
      return '#722ed1';
    default:
      return '#52c41a';
  }
};

export const RoutineCalendarPreview: React.FC<RoutineCalendarPreviewProps> = ({
  frequency,
  shift,
  daysOfWeek,
  routineName = 'Inspection',
}) => {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());

  // Generate calendar days for the current month view
  const calendarDays = useMemo(() => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startOfWeek = startOfMonth.startOf('week');
    const endOfWeek = endOfMonth.endOf('week');

    const days: Dayjs[] = [];
    let current = startOfWeek;

    while (current.isBefore(endOfWeek) || current.isSame(endOfWeek, 'day')) {
      days.push(current);
      current = current.add(1, 'day');
    }

    return days;
  }, [currentMonth]);

  // Determine if a day should be marked as scheduled
  const isScheduledDay = (date: Dayjs): boolean => {
    const dayOfWeek = date.day(); // 0 = Sunday, 1 = Monday, etc.

    switch (frequency) {
      case 'daily':
        return true;
      case 'weekly':
        // Check if this day of week is selected
        return daysOfWeek.some((d) => DAYS_MAP[d] === dayOfWeek);
      case 'monthly':
        // First day of the month, or first occurrence of selected days
        if (daysOfWeek.length > 0) {
          // First occurrence of any selected day in the month
          const startOfMonth = date.startOf('month');
          for (const dow of daysOfWeek) {
            const targetDay = DAYS_MAP[dow];
            let firstOccurrence = startOfMonth;
            while (firstOccurrence.day() !== targetDay) {
              firstOccurrence = firstOccurrence.add(1, 'day');
            }
            if (date.isSame(firstOccurrence, 'day')) {
              return true;
            }
          }
          return false;
        }
        // Default: first day of month
        return date.date() === 1;
      default:
        return false;
    }
  };

  // Count scheduled days in current month
  const scheduledCount = useMemo(() => {
    return calendarDays.filter(
      (d) => d.month() === currentMonth.month() && isScheduledDay(d)
    ).length;
  }, [calendarDays, currentMonth, frequency, daysOfWeek]);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) =>
      direction === 'prev' ? prev.subtract(1, 'month') : prev.add(1, 'month')
    );
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card
      size="small"
      title={
        <Space>
          <CalendarOutlined />
          <span>{t('routines.calendarPreview', 'Schedule Preview')}</span>
        </Space>
      }
      extra={
        <Tag color={getShiftColor(shift)}>
          {scheduledCount} {t('routines.scheduledDays', 'days/month')}
        </Tag>
      }
    >
      {/* Month Navigation */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={() => handleMonthChange('prev')}
            size="small"
          />
        </Col>
        <Col>
          <Title level={5} style={{ margin: 0 }}>
            {currentMonth.format('MMMM YYYY')}
          </Title>
        </Col>
        <Col>
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={() => handleMonthChange('next')}
            size="small"
          />
        </Col>
      </Row>

      {/* Week day headers */}
      <Row gutter={[4, 4]} style={{ marginBottom: 4 }}>
        {weekDays.map((day) => (
          <Col key={day} span={24 / 7}>
            <div
              style={{
                textAlign: 'center',
                fontSize: 11,
                fontWeight: 600,
                color: '#8c8c8c',
                padding: '4px 0',
              }}
            >
              {day}
            </div>
          </Col>
        ))}
      </Row>

      {/* Calendar grid */}
      <Row gutter={[4, 4]}>
        {calendarDays.map((date, index) => {
          const isCurrentMonth = date.month() === currentMonth.month();
          const isToday = date.isSame(dayjs(), 'day');
          const isScheduled = isScheduledDay(date);
          const isPast = date.isBefore(dayjs(), 'day');

          return (
            <Col key={index} span={24 / 7}>
              <Tooltip
                title={
                  isScheduled
                    ? `${routineName}${shift ? ` (${t(`routines.${shift}`, shift)})` : ''}`
                    : null
                }
              >
                <div
                  style={{
                    textAlign: 'center',
                    padding: '6px 2px',
                    borderRadius: 4,
                    backgroundColor: isScheduled && isCurrentMonth
                      ? isPast
                        ? '#f0f0f0'
                        : `${getShiftColor(shift)}15`
                      : isToday
                      ? '#e6f7ff'
                      : undefined,
                    border: isToday
                      ? '1px solid #1890ff'
                      : isScheduled && isCurrentMonth && !isPast
                      ? `1px solid ${getShiftColor(shift)}40`
                      : '1px solid transparent',
                    opacity: isCurrentMonth ? 1 : 0.3,
                    cursor: isScheduled ? 'pointer' : 'default',
                    minHeight: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    strong={isToday || (isScheduled && isCurrentMonth)}
                    style={{
                      fontSize: 12,
                      color: isToday
                        ? '#1890ff'
                        : isScheduled && isCurrentMonth && !isPast
                        ? getShiftColor(shift)
                        : isPast
                        ? '#bfbfbf'
                        : undefined,
                    }}
                  >
                    {date.date()}
                  </Text>
                  {isScheduled && isCurrentMonth && (
                    <div style={{ marginTop: 2 }}>
                      {shift ? (
                        getShiftIcon(shift)
                      ) : (
                        <Badge
                          status="success"
                          style={{ transform: 'scale(0.8)' }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </Tooltip>
            </Col>
          );
        })}
      </Row>

      {/* Legend */}
      <div
        style={{
          marginTop: 12,
          padding: '8px',
          backgroundColor: '#fafafa',
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        <Space wrap size={[12, 4]}>
          <Space size={4}>
            <Badge status="success" />
            <Text type="secondary">{t('routines.scheduled', 'Scheduled')}</Text>
          </Space>
          <Space size={4}>
            <SunOutlined style={{ color: '#faad14', fontSize: 12 }} />
            <Text type="secondary">{t('routines.morning', 'Morning')}</Text>
          </Space>
          <Space size={4}>
            <CloudOutlined style={{ color: '#1890ff', fontSize: 12 }} />
            <Text type="secondary">{t('routines.afternoon', 'Afternoon')}</Text>
          </Space>
          <Space size={4}>
            <MoonOutlined style={{ color: '#722ed1', fontSize: 12 }} />
            <Text type="secondary">{t('routines.night', 'Night')}</Text>
          </Space>
        </Space>
      </div>
    </Card>
  );
};

export default RoutineCalendarPreview;
