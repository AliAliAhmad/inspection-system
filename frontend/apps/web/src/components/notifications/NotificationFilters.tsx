import { useState } from 'react';
import {
  Card,
  Select,
  DatePicker,
  Input,
  Button,
  Space,
  Tag,
  Divider,
  Typography,
  Row,
  Col,
} from 'antd';
import {
  FilterOutlined,
  ClearOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { NotificationPriority, NotificationFilter } from '@inspection/shared';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export interface NotificationFiltersProps {
  filters: NotificationFilter;
  onFiltersChange: (filters: NotificationFilter) => void;
  onClear: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const NOTIFICATION_TYPES = [
  { value: 'equipment_alert', label: 'Equipment Alert' },
  { value: 'inspection_submitted', label: 'Inspection Submitted' },
  { value: 'inspection_assigned', label: 'Inspection Assigned' },
  { value: 'leave_requested', label: 'Leave Requested' },
  { value: 'leave_approved', label: 'Leave Approved' },
  { value: 'leave_rejected', label: 'Leave Rejected' },
  { value: 'defect_created', label: 'Defect Created' },
  { value: 'defect_assigned', label: 'Defect Assigned' },
  { value: 'specialist_job_assigned', label: 'Specialist Job Assigned' },
  { value: 'specialist_job_completed', label: 'Specialist Job Completed' },
  { value: 'engineer_job_created', label: 'Engineer Job Created' },
  { value: 'engineer_job_completed', label: 'Engineer Job Completed' },
  { value: 'quality_review_pending', label: 'Quality Review Pending' },
  { value: 'assessment_submitted', label: 'Assessment Submitted' },
  { value: 'bonus_star_requested', label: 'Bonus Star Requested' },
  { value: 'work_plan_published', label: 'Work Plan Published' },
  { value: 'mention', label: 'Mention' },
  { value: 'system', label: 'System' },
];

const PRIORITY_OPTIONS: { value: NotificationPriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: '#eb2f96' },
  { value: 'urgent', label: 'Urgent', color: '#f5222d' },
  { value: 'warning', label: 'Warning', color: '#fa8c16' },
  { value: 'info', label: 'Info', color: '#1677ff' },
];

interface QuickFilter {
  key: string;
  label: string;
  icon: React.ReactNode;
  getFilter: () => Partial<NotificationFilter>;
}

export function NotificationFilters({
  filters,
  onFiltersChange,
  onClear,
  collapsible = false,
  defaultCollapsed = false,
}: NotificationFiltersProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const quickFilters: QuickFilter[] = [
    {
      key: 'today',
      label: t('notifications.filterToday', 'Today'),
      icon: <CalendarOutlined />,
      getFilter: () => ({
        date_from: dayjs().startOf('day').toISOString(),
        date_to: dayjs().endOf('day').toISOString(),
      }),
    },
    {
      key: 'thisWeek',
      label: t('notifications.filterThisWeek', 'This Week'),
      icon: <CalendarOutlined />,
      getFilter: () => ({
        date_from: dayjs().startOf('week').toISOString(),
        date_to: dayjs().endOf('week').toISOString(),
      }),
    },
    {
      key: 'critical',
      label: t('notifications.filterCriticalOnly', 'Critical Only'),
      icon: <ExclamationCircleOutlined />,
      getFilter: () => ({
        priorities: ['critical'],
      }),
    },
    {
      key: 'unread',
      label: t('notifications.filterUnread', 'Unread'),
      icon: <ClockCircleOutlined />,
      getFilter: () => ({
        is_read: false,
      }),
    },
  ];

  const handleTypeChange = (types: string[]) => {
    onFiltersChange({ ...filters, types: types.length > 0 ? types : undefined });
  };

  const handlePriorityChange = (priorities: NotificationPriority[]) => {
    onFiltersChange({ ...filters, priorities: priorities.length > 0 ? priorities : undefined });
  };

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      onFiltersChange({
        ...filters,
        date_from: dates[0].startOf('day').toISOString(),
        date_to: dates[1].endOf('day').toISOString(),
      });
    } else {
      onFiltersChange({
        ...filters,
        date_from: undefined,
        date_to: undefined,
      });
    }
  };

  const handleSearchChange = (search: string) => {
    onFiltersChange({ ...filters, search: search || undefined });
  };

  const handleQuickFilter = (quickFilter: QuickFilter) => {
    onFiltersChange({ ...filters, ...quickFilter.getFilter() });
  };

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    (filters.priorities && filters.priorities.length > 0) ||
    filters.date_from ||
    filters.date_to ||
    filters.search ||
    filters.is_read !== undefined;

  const activeFilterCount: number = [
    filters.types?.length ?? 0,
    filters.priorities?.length ?? 0,
    filters.date_from ? 1 : 0,
    filters.search ? 1 : 0,
    filters.is_read !== undefined ? 1 : 0,
  ].reduce((sum: number, val: number) => sum + val, 0);

  if (collapsible && isCollapsed) {
    return (
      <Button
        icon={<FilterOutlined />}
        onClick={() => setIsCollapsed(false)}
        style={{ marginBottom: 16 }}
      >
        {t('notifications.showFilters', 'Show Filters')}
        {activeFilterCount > 0 && (
          <Tag color="blue" style={{ marginLeft: 8 }}>
            {activeFilterCount}
          </Tag>
        )}
      </Button>
    );
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <FilterOutlined />
          {t('notifications.filters', 'Filters')}
          {activeFilterCount > 0 && (
            <Tag color="blue">{activeFilterCount} active</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {hasActiveFilters && (
            <Button
              type="link"
              size="small"
              icon={<ClearOutlined />}
              onClick={onClear}
              danger
            >
              {t('notifications.clearAll', 'Clear All')}
            </Button>
          )}
          {collapsible && (
            <Button type="text" size="small" onClick={() => setIsCollapsed(true)}>
              {t('common.hide', 'Hide')}
            </Button>
          )}
        </Space>
      }
    >
      {/* Quick Filters */}
      <Space wrap style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ marginRight: 8 }}>
          {t('notifications.quickFilters', 'Quick filters:')}
        </Text>
        {quickFilters.map((qf) => (
          <Tag
            key={qf.key}
            icon={qf.icon}
            style={{ cursor: 'pointer', padding: '4px 12px' }}
            onClick={() => handleQuickFilter(qf)}
          >
            {qf.label}
          </Tag>
        ))}
      </Space>

      <Divider style={{ margin: '12px 0' }} />

      {/* Advanced Filters */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} lg={6}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('notifications.filterByType', 'Type')}
          </Text>
          <Select
            mode="multiple"
            placeholder={t('notifications.selectTypes', 'Select types...')}
            value={filters.types || []}
            onChange={handleTypeChange}
            options={NOTIFICATION_TYPES}
            style={{ width: '100%' }}
            maxTagCount={2}
            allowClear
          />
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('notifications.filterByPriority', 'Priority')}
          </Text>
          <Select
            mode="multiple"
            placeholder={t('notifications.selectPriorities', 'Select priorities...')}
            value={filters.priorities || []}
            onChange={handlePriorityChange}
            style={{ width: '100%' }}
            maxTagCount={2}
            allowClear
          >
            {PRIORITY_OPTIONS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                <Tag color={option.color} style={{ marginRight: 0 }}>
                  {option.label}
                </Tag>
              </Select.Option>
            ))}
          </Select>
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('notifications.filterByDate', 'Date Range')}
          </Text>
          <RangePicker
            value={
              filters.date_from && filters.date_to
                ? [dayjs(filters.date_from), dayjs(filters.date_to)]
                : null
            }
            onChange={handleDateRangeChange}
            style={{ width: '100%' }}
            allowClear
          />
        </Col>

        <Col xs={24} md={12} lg={6}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('notifications.filterBySearch', 'Search')}
          </Text>
          <Input
            placeholder={t('notifications.searchPlaceholder', 'Search notifications...')}
            prefix={<SearchOutlined />}
            value={filters.search || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            allowClear
          />
        </Col>
      </Row>
    </Card>
  );
}

export default NotificationFilters;
