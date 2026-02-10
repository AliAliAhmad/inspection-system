import { useState, useMemo } from 'react';
import {
  Card,
  Calendar,
  Badge,
  Select,
  Space,
  Typography,
  Popover,
  Tag,
  List,
  Button,
  Spin,
  Empty,
  Row,
  Col,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  TeamOutlined,
  CalendarOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  leavesApi,
  TeamCalendarEntry,
  LeaveCalendarDay,
} from '@inspection/shared';

const { Text, Title } = Typography;

interface LeaveCalendarViewProps {
  teamId?: number;
  onDayClick?: (date: string, leaves: TeamCalendarEntry['leaves']) => void;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'specialist', label: 'Specialist' },
];

const DEPARTMENT_OPTIONS = [
  { value: 'all', label: 'All Departments' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
];

export function LeaveCalendarView({ teamId, onDayClick }: LeaveCalendarViewProps) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Calculate date range for current month view
  const dateRange = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week');
    const end = currentMonth.endOf('month').endOf('week');
    return {
      date_from: start.format('YYYY-MM-DD'),
      date_to: end.format('YYYY-MM-DD'),
    };
  }, [currentMonth]);

  // Fetch team calendar data
  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['leaves', 'team-calendar', dateRange, teamId],
    queryFn: () =>
      leavesApi.getTeamCalendar({
        ...dateRange,
        team_id: teamId,
        include_holidays: true,
      }).then((r) => r.data),
  });

  const calendarEntries: TeamCalendarEntry[] = calendarData?.data || [];
  const entriesMap = useMemo(() => {
    const map = new Map<string, TeamCalendarEntry>();
    calendarEntries.forEach((entry) => {
      map.set(entry.date, entry);
    });
    return map;
  }, [calendarEntries]);

  // Filter leaves based on role and department
  const filterLeaves = (leaves: TeamCalendarEntry['leaves']) => {
    return leaves.filter((leave) => {
      if (roleFilter !== 'all' && !leave.user_name.toLowerCase().includes(roleFilter)) {
        // In real implementation, filter by actual role field
      }
      return true;
    });
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) =>
      direction === 'prev' ? prev.subtract(1, 'month') : prev.add(1, 'month')
    );
  };

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const entry = entriesMap.get(dateStr);

    if (!entry) return null;

    const { leaves, holidays } = entry;
    const filteredLeaves = filterLeaves(leaves);

    const hasHoliday = holidays.length > 0;
    const leaveCount = filteredLeaves.length;

    if (!hasHoliday && leaveCount === 0) return null;

    const content = (
      <div style={{ maxWidth: 280, maxHeight: 300, overflow: 'auto' }}>
        {holidays.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Text strong style={{ color: '#ff4d4f' }}>
              {t('leaves.holidays', 'Holidays')}
            </Text>
            {holidays.map((holiday) => (
              <div key={holiday.id}>
                <Badge
                  status="error"
                  text={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {holiday.name}
                    </Text>
                  }
                />
              </div>
            ))}
          </div>
        )}

        {filteredLeaves.length > 0 && (
          <div>
            <Text strong>
              {t('leaves.onLeave', 'On Leave')} ({filteredLeaves.length})
            </Text>
            <List
              size="small"
              dataSource={filteredLeaves}
              renderItem={(leave) => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Space size={4}>
                    <Badge
                      color={leave.leave_type_color || '#1890ff'}
                      text={
                        <Text style={{ fontSize: 12 }}>
                          {leave.user_name}
                        </Text>
                      }
                    />
                    <Tag
                      color={leave.leave_type_color || 'blue'}
                      style={{ fontSize: 10, margin: 0 }}
                    >
                      {leave.leave_type}
                    </Tag>
                    {leave.scope === 'major_only' && (
                      <Tag style={{ fontSize: 10, margin: 0 }}>
                        {t('leaves.majorOnly', 'Major')}
                      </Tag>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          </div>
        )}

        {onDayClick && filteredLeaves.length > 0 && (
          <Button
            type="link"
            size="small"
            onClick={() => onDayClick(dateStr, filteredLeaves)}
            style={{ padding: 0, marginTop: 4 }}
          >
            {t('leaves.viewDetails', 'View Details')}
          </Button>
        )}
      </div>
    );

    return (
      <Popover content={content} trigger="click" placement="right">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            cursor: 'pointer',
          }}
        >
          {hasHoliday && (
            <Badge
              status="error"
              text={
                <Text style={{ fontSize: 10 }} type="danger">
                  {holidays[0].name.substring(0, 10)}
                  {holidays[0].name.length > 10 ? '...' : ''}
                </Text>
              }
            />
          )}
          {leaveCount > 0 && (
            <Badge
              count={leaveCount}
              style={{ backgroundColor: '#1890ff' }}
              size="small"
            />
          )}
        </div>
      </Popover>
    );
  };

  const headerRender = () => (
    <div style={{ padding: '8px 16px' }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Space>
            <Button
              icon={<LeftOutlined />}
              onClick={() => handleMonthChange('prev')}
            />
            <Title level={4} style={{ margin: 0, minWidth: 180, textAlign: 'center' }}>
              {currentMonth.format('MMMM YYYY')}
            </Title>
            <Button
              icon={<RightOutlined />}
              onClick={() => handleMonthChange('next')}
            />
            <Button
              type="link"
              onClick={() => setCurrentMonth(dayjs())}
            >
              {t('leaves.today', 'Today')}
            </Button>
          </Space>
        </Col>
        <Col>
          <Space>
            <FilterOutlined />
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              options={ROLE_OPTIONS.map((opt) => ({
                ...opt,
                label: t(`roles.${opt.value}`, opt.label),
              }))}
              style={{ width: 140 }}
            />
            <Select
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={DEPARTMENT_OPTIONS.map((opt) => ({
                ...opt,
                label: t(`departments.${opt.value}`, opt.label),
              }))}
              style={{ width: 140 }}
            />
          </Space>
        </Col>
      </Row>
    </div>
  );

  // Legend
  const legend = (
    <div
      style={{
        display: 'flex',
        gap: 16,
        padding: '8px 16px',
        borderTop: '1px solid #f0f0f0',
        fontSize: 12,
      }}
    >
      <Space>
        <Badge status="error" />
        <Text type="secondary">{t('leaves.holiday', 'Holiday')}</Text>
      </Space>
      <Space>
        <Badge color="#1890ff" />
        <Text type="secondary">{t('leaves.annual', 'Annual')}</Text>
      </Space>
      <Space>
        <Badge color="#52c41a" />
        <Text type="secondary">{t('leaves.sick', 'Sick')}</Text>
      </Space>
      <Space>
        <Badge color="#faad14" />
        <Text type="secondary">{t('leaves.emergency', 'Emergency')}</Text>
      </Space>
      <Space>
        <Badge color="#722ed1" />
        <Text type="secondary">{t('leaves.training', 'Training')}</Text>
      </Space>
    </div>
  );

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
          <TeamOutlined />
          {t('leaves.teamCalendar', 'Team Leave Calendar')}
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      {headerRender()}
      <Calendar
        value={currentMonth}
        onSelect={(date) => {
          const dateStr = date.format('YYYY-MM-DD');
          const entry = entriesMap.get(dateStr);
          if (entry && onDayClick) {
            onDayClick(dateStr, entry.leaves);
          }
        }}
        onPanelChange={(date) => setCurrentMonth(date)}
        cellRender={(date) => dateCellRender(date)}
        headerRender={() => null}
        fullscreen={false}
        style={{ padding: '0 16px' }}
      />
      {legend}
    </Card>
  );
}

export default LeaveCalendarView;
