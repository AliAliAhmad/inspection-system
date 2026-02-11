import { useState } from 'react';
import { Card, Badge, Typography, Empty, Spin, Space, Tag, Tooltip, Modal, List, Button } from 'antd';
import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
  FileSearchOutlined,
  BugOutlined,
  AuditOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { OverdueItem, OverdueItemType } from './OverdueTable';

const { Text, Title } = Typography;

interface OverdueCalendarProps {
  items?: OverdueItem[];
  isLoading?: boolean;
  onItemClick?: (item: OverdueItem) => void;
  onDateClick?: (date: string, items: OverdueItem[]) => void;
}

const TYPE_CONFIG = {
  inspection: {
    icon: <FileSearchOutlined />,
    color: '#1890ff',
    label: 'Inspection',
  },
  defect: {
    icon: <BugOutlined />,
    color: '#fa8c16',
    label: 'Defect',
  },
  review: {
    icon: <AuditOutlined />,
    color: '#722ed1',
    label: 'Review',
  },
};

const getSeverityColor = (daysOverdue: number) => {
  if (daysOverdue >= 30) return '#ff4d4f';
  if (daysOverdue >= 14) return '#fa8c16';
  if (daysOverdue >= 7) return '#faad14';
  return '#52c41a';
};

export function OverdueCalendar({
  items,
  isLoading = false,
  onItemClick,
  onDateClick,
}: OverdueCalendarProps) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Use provided items or fetch from API
  const { data: overdueData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'calendar-items'],
    queryFn: async () => {
      // This would call the overdue API endpoint
      // For now, return mock data
      const mockItems: OverdueItem[] = [
        {
          id: 1,
          type: 'inspection',
          title: 'Monthly Safety Inspection - Crane A',
          due_date: dayjs().subtract(10, 'days').format('YYYY-MM-DD'),
          days_overdue: 10,
          priority: 'high',
          assigned_to: { id: 1, name: 'John Doe' },
          equipment: { id: 101, name: 'Crane A', code: 'CR-001' },
          status: 'pending',
        },
        {
          id: 2,
          type: 'defect',
          title: 'Hydraulic leak on Loader B',
          due_date: dayjs().subtract(15, 'days').format('YYYY-MM-DD'),
          days_overdue: 15,
          priority: 'critical',
          assigned_to: { id: 2, name: 'Jane Smith' },
          equipment: { id: 102, name: 'Loader B', code: 'LD-002' },
          status: 'in_progress',
        },
        {
          id: 3,
          type: 'review',
          title: 'Quality Review - Inspection #456',
          due_date: dayjs().subtract(5, 'days').format('YYYY-MM-DD'),
          days_overdue: 5,
          priority: 'medium',
          assigned_to: { id: 3, name: 'Bob Wilson' },
          equipment: { id: 103, name: 'Excavator C', code: 'EX-003' },
          status: 'pending_review',
        },
        {
          id: 4,
          type: 'inspection',
          title: 'Weekly Equipment Check',
          due_date: dayjs().subtract(10, 'days').format('YYYY-MM-DD'),
          days_overdue: 10,
          priority: 'medium',
          assigned_to: { id: 1, name: 'John Doe' },
          equipment: { id: 104, name: 'Forklift D', code: 'FL-004' },
          status: 'pending',
        },
      ];

      return mockItems;
    },
    enabled: !items,
  });

  const loading = isLoading || dataLoading;
  const data = items || overdueData || [];

  // Group items by due date
  const itemsByDate = data.reduce((acc, item) => {
    const date = item.due_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(item);
    return acc;
  }, {} as Record<string, OverdueItem[]>);

  // Generate calendar days
  const generateCalendarDays = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startDay = startOfMonth.day(); // 0 = Sunday
    const daysInMonth = currentMonth.daysInMonth();

    const days: Array<{ date: dayjs.Dayjs; isCurrentMonth: boolean }> = [];

    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: startOfMonth.subtract(i + 1, 'day'),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 0; i < daysInMonth; i++) {
      days.push({
        date: startOfMonth.add(i, 'day'),
        isCurrentMonth: true,
      });
    }

    // Next month days to complete the grid
    const remainingDays = 42 - days.length;
    for (let i = 0; i < remainingDays; i++) {
      days.push({
        date: endOfMonth.add(i + 1, 'day'),
        isCurrentMonth: false,
      });
    }

    return days;
  };

  const calendarDays = generateCalendarDays();
  const today = dayjs().format('YYYY-MM-DD');

  const handlePrevMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'));
  };

  const handleDateClick = (date: string, dateItems: OverdueItem[]) => {
    if (dateItems.length === 0) return;
    setSelectedDate(date);
    setModalOpen(true);
    onDateClick?.(date, dateItems);
  };

  const selectedDateItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: '#1890ff' }} />
            {t('overdue.calendar_view', 'Calendar View')}
          </Space>
        }
        extra={
          <Space>
            <Button
              type="text"
              icon={<LeftOutlined />}
              onClick={handlePrevMonth}
            />
            <Text strong style={{ minWidth: 120, textAlign: 'center', display: 'inline-block' }}>
              {currentMonth.format('MMMM YYYY')}
            </Text>
            <Button
              type="text"
              icon={<RightOutlined />}
              onClick={handleNextMonth}
            />
          </Space>
        }
      >
        {/* Legend */}
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            fontSize: 12,
            color: '#595959',
            flexWrap: 'wrap',
          }}
        >
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#1890ff' }} />
            <Text type="secondary">{t('overdue.type_inspection', 'Inspection')}</Text>
          </Space>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#fa8c16' }} />
            <Text type="secondary">{t('overdue.type_defect', 'Defect')}</Text>
          </Space>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#722ed1' }} />
            <Text type="secondary">{t('overdue.type_review', 'Review')}</Text>
          </Space>
          <div style={{ marginLeft: 16, borderLeft: '1px solid #d9d9d9', paddingLeft: 16 }}>
            <Space size={16}>
              <Space size={4}>
                <Badge status="success" />
                <Text type="secondary">{t('overdue.less_than_week', '<7 days')}</Text>
              </Space>
              <Space size={4}>
                <Badge status="warning" />
                <Text type="secondary">{t('overdue.week_to_month', '7-30 days')}</Text>
              </Space>
              <Space size={4}>
                <Badge status="error" />
                <Text type="secondary">{t('overdue.more_than_month', '>30 days')}</Text>
              </Space>
            </Space>
          </div>
        </div>

        {/* Calendar Grid */}
        <div>
          {/* Weekday headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
              marginBottom: 8,
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                style={{
                  textAlign: 'center',
                  padding: '8px 0',
                  fontWeight: 600,
                  color: '#8c8c8c',
                  fontSize: 12,
                }}
              >
                {t(`overdue.weekday_${day.toLowerCase()}`, day)}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 4,
            }}
          >
            {calendarDays.map((day, index) => {
              const dateStr = day.date.format('YYYY-MM-DD');
              const dateItems = itemsByDate[dateStr] || [];
              const isToday = dateStr === today;
              const hasItems = dateItems.length > 0;
              const maxOverdue = hasItems
                ? Math.max(...dateItems.map((item) => item.days_overdue))
                : 0;

              return (
                <div
                  key={index}
                  style={{
                    minHeight: 80,
                    padding: 4,
                    backgroundColor: isToday
                      ? '#e6f7ff'
                      : day.isCurrentMonth
                      ? '#fff'
                      : '#fafafa',
                    borderRadius: 4,
                    border: isToday
                      ? '2px solid #1890ff'
                      : hasItems
                      ? `1px solid ${getSeverityColor(maxOverdue)}`
                      : '1px solid #f0f0f0',
                    cursor: hasItems ? 'pointer' : 'default',
                    transition: 'box-shadow 0.2s',
                  }}
                  onClick={() => handleDateClick(dateStr, dateItems)}
                  onMouseEnter={(e) => {
                    if (hasItems) {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Date number */}
                  <div
                    style={{
                      textAlign: 'right',
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 400,
                        color: day.isCurrentMonth
                          ? isToday
                            ? '#1890ff'
                            : '#262626'
                          : '#bfbfbf',
                      }}
                    >
                      {day.date.date()}
                    </Text>
                  </div>

                  {/* Items indicators */}
                  {hasItems && (
                    <div>
                      {dateItems.slice(0, 3).map((item, itemIndex) => {
                        const config = TYPE_CONFIG[item.type];
                        return (
                          <Tooltip
                            key={item.id}
                            title={`${item.title} (${item.days_overdue}d overdue)`}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                marginBottom: 2,
                                padding: '2px 4px',
                                backgroundColor: `${config.color}10`,
                                borderRadius: 2,
                                borderLeft: `2px solid ${getSeverityColor(item.days_overdue)}`,
                              }}
                            >
                              <span style={{ fontSize: 10, color: config.color }}>
                                {config.icon}
                              </span>
                              <Text
                                ellipsis
                                style={{ fontSize: 10, flex: 1, lineHeight: 1.2 }}
                              >
                                {item.title}
                              </Text>
                            </div>
                          </Tooltip>
                        );
                      })}
                      {dateItems.length > 3 && (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          +{dateItems.length - 3} {t('overdue.more', 'more')}
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Date Detail Modal */}
      <Modal
        title={
          <Space>
            <CalendarOutlined />
            {selectedDate && dayjs(selectedDate).format('MMMM D, YYYY')}
            <Badge count={selectedDateItems.length} style={{ marginLeft: 8 }} />
          </Space>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <List
          dataSource={selectedDateItems}
          renderItem={(item) => {
            const config = TYPE_CONFIG[item.type];
            return (
              <List.Item
                style={{
                  padding: '12px 0',
                  cursor: onItemClick ? 'pointer' : 'default',
                }}
                onClick={() => onItemClick?.(item)}
              >
                <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: `${config.color}10`,
                      color: config.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {config.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong>{item.title}</Text>
                    <div style={{ marginTop: 4 }}>
                      <Space size={8}>
                        <Tag color={config.color}>
                          {t(`overdue.type_${item.type}`, config.label)}
                        </Tag>
                        <Tag color={getSeverityColor(item.days_overdue)}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {item.days_overdue}d {t('overdue.overdue', 'overdue')}
                        </Tag>
                      </Space>
                    </div>
                    {item.equipment && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.equipment.name} ({item.equipment.code})
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      </Modal>
    </>
  );
}

export default OverdueCalendar;
