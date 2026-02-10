import { useState } from 'react';
import {
  Card,
  Select,
  DatePicker,
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
  CalendarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import type { ApprovalType, ApprovalStatus } from './ApprovalCard';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export interface ApprovalFilter {
  types?: ApprovalType[];
  status?: ApprovalStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface ApprovalFiltersProps {
  filters: ApprovalFilter;
  onFiltersChange: (filters: ApprovalFilter) => void;
  onClear: () => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const APPROVAL_TYPES: { value: ApprovalType; label: string; color: string }[] = [
  { value: 'leave', label: 'Leave', color: 'blue' },
  { value: 'pause', label: 'Pause', color: 'orange' },
  { value: 'bonus', label: 'Bonus', color: 'gold' },
  { value: 'takeover', label: 'Takeover', color: 'purple' },
];

const STATUS_OPTIONS: { value: ApprovalStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'processing' },
  { value: 'approved', label: 'Approved', color: 'success' },
  { value: 'rejected', label: 'Rejected', color: 'error' },
];

interface QuickFilter {
  key: string;
  label: string;
  icon: React.ReactNode;
  getFilter: () => Partial<ApprovalFilter>;
}

export function ApprovalFilters({
  filters,
  onFiltersChange,
  onClear,
  collapsible = false,
  defaultCollapsed = false,
}: ApprovalFiltersProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const quickFilters: QuickFilter[] = [
    {
      key: 'today',
      label: t('approvals.filterToday', 'Today'),
      icon: <CalendarOutlined />,
      getFilter: () => ({
        dateFrom: dayjs().startOf('day').toISOString(),
        dateTo: dayjs().endOf('day').toISOString(),
      }),
    },
    {
      key: 'thisWeek',
      label: t('approvals.filterThisWeek', 'This Week'),
      icon: <CalendarOutlined />,
      getFilter: () => ({
        dateFrom: dayjs().startOf('week').toISOString(),
        dateTo: dayjs().endOf('week').toISOString(),
      }),
    },
    {
      key: 'pending',
      label: t('approvals.filterPending', 'Pending Only'),
      icon: <ClockCircleOutlined />,
      getFilter: () => ({
        status: 'pending' as ApprovalStatus,
      }),
    },
  ];

  const handleTypeChange = (types: ApprovalType[]) => {
    onFiltersChange({ ...filters, types: types.length > 0 ? types : undefined });
  };

  const handleStatusChange = (status: ApprovalStatus | undefined) => {
    onFiltersChange({ ...filters, status });
  };

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      onFiltersChange({
        ...filters,
        dateFrom: dates[0].startOf('day').toISOString(),
        dateTo: dates[1].endOf('day').toISOString(),
      });
    } else {
      onFiltersChange({
        ...filters,
        dateFrom: undefined,
        dateTo: undefined,
      });
    }
  };

  const handleQuickFilter = (quickFilter: QuickFilter) => {
    onFiltersChange({ ...filters, ...quickFilter.getFilter() });
  };

  const hasActiveFilters =
    (filters.types && filters.types.length > 0) ||
    filters.status ||
    filters.dateFrom ||
    filters.dateTo;

  const activeFilterCount: number = [
    filters.types?.length ?? 0,
    filters.status ? 1 : 0,
    filters.dateFrom ? 1 : 0,
  ].reduce((sum: number, val: number) => sum + val, 0);

  if (collapsible && isCollapsed) {
    return (
      <Button
        icon={<FilterOutlined />}
        onClick={() => setIsCollapsed(false)}
        style={{ marginBottom: 16 }}
      >
        {t('approvals.showFilters', 'Show Filters')}
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
          {t('approvals.filters', 'Filters')}
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
              {t('approvals.clearAll', 'Clear All')}
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
          {t('approvals.quickFilters', 'Quick filters:')}
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
        <Col xs={24} md={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('approvals.filterByType', 'Type')}
          </Text>
          <Select
            mode="multiple"
            placeholder={t('approvals.selectTypes', 'Select types...')}
            value={filters.types || []}
            onChange={handleTypeChange}
            style={{ width: '100%' }}
            maxTagCount={2}
            allowClear
          >
            {APPROVAL_TYPES.map((type) => (
              <Select.Option key={type.value} value={type.value}>
                <Tag color={type.color} style={{ marginRight: 0 }}>
                  {type.label}
                </Tag>
              </Select.Option>
            ))}
          </Select>
        </Col>

        <Col xs={24} md={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('approvals.filterByStatus', 'Status')}
          </Text>
          <Select
            placeholder={t('approvals.selectStatus', 'Select status...')}
            value={filters.status}
            onChange={handleStatusChange}
            style={{ width: '100%' }}
            allowClear
          >
            {STATUS_OPTIONS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                <Tag color={option.color} style={{ marginRight: 0 }}>
                  {option.label}
                </Tag>
              </Select.Option>
            ))}
          </Select>
        </Col>

        <Col xs={24} md={8}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
            {t('approvals.filterByDate', 'Date Range')}
          </Text>
          <RangePicker
            value={
              filters.dateFrom && filters.dateTo
                ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)]
                : null
            }
            onChange={handleDateRangeChange}
            style={{ width: '100%' }}
            allowClear
          />
        </Col>
      </Row>
    </Card>
  );
}

export default ApprovalFilters;
