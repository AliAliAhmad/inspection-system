import { useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Typography,
  Avatar,
  Tooltip,
  Badge,
  Dropdown,
  Checkbox,
  message,
} from 'antd';
import {
  FileSearchOutlined,
  BugOutlined,
  AuditOutlined,
  EyeOutlined,
  CalendarOutlined,
  MoreOutlined,
  UserOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import { overdueApi } from '@inspection/shared';
import type {
  OverdueInspectionRow,
  OverdueDefectRow,
  OverdueReviewRow,
} from '@inspection/shared';

const { Text } = Typography;

export type OverdueItemType = 'inspection' | 'defect' | 'review';

export interface OverdueItem {
  id: number;
  type: OverdueItemType;
  title: string;
  due_date: string | null;
  days_overdue: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to: {
    id: number;
    name: string;
    avatar?: string;
  } | null;
  equipment: {
    id: number;
    name: string;
    code: string;
  } | null;
  status: string;
}

interface OverdueTableProps {
  typeFilter?: OverdueItemType;
  bucketFilter?: { min_days: number; max_days: number | null };
  items?: OverdueItem[];
  isLoading?: boolean;
  onView?: (item: OverdueItem) => void;
  onReschedule?: (item: OverdueItem) => void;
  onBulkReschedule?: (items: OverdueItem[]) => void;
  selectedItems?: OverdueItem[];
  onSelectionChange?: (items: OverdueItem[]) => void;
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

const PRIORITY_CONFIG = {
  low: { color: 'default', label: 'Low' },
  medium: { color: 'blue', label: 'Medium' },
  high: { color: 'orange', label: 'High' },
  critical: { color: 'red', label: 'Critical' },
};

type Priority = OverdueItem['priority'];

const toPriority = (value: string | null | undefined): Priority => {
  switch (value) {
    case 'critical':
    case 'urgent':
      return 'critical';
    case 'high':
      return 'high';
    case 'low':
    case 'minimal':
      return 'low';
    default:
      return 'medium';
  }
};

const person = (id: number | null, name: string | null) =>
  id != null && name ? { id, name } : null;

const fromInspection = (r: OverdueInspectionRow): OverdueItem => ({
  id: r.id,
  type: 'inspection',
  title: r.equipment_name || `#${r.id}`,
  due_date: r.deadline,
  days_overdue: r.days_overdue,
  priority: toPriority(r.risk_level),
  assigned_to:
    person(r.mechanical_inspector_id, r.mechanical_inspector) ||
    person(r.electrical_inspector_id, r.electrical_inspector),
  equipment:
    r.equipment_id != null
      ? { id: r.equipment_id, name: r.equipment_name || '', code: '' }
      : null,
  status: r.status,
});

const fromDefect = (r: OverdueDefectRow): OverdueItem => ({
  id: r.id,
  type: 'defect',
  title: r.description,
  due_date: r.due_date,
  days_overdue: r.days_overdue,
  priority: toPriority(r.severity),
  assigned_to: person(r.assigned_to_id, r.assigned_to),
  equipment: null,
  status: r.status,
});

const fromReview = (r: OverdueReviewRow): OverdueItem => ({
  id: r.id,
  type: 'review',
  title: `${r.job_type} #${r.job_id}`,
  due_date: r.sla_deadline,
  days_overdue: r.days_overdue,
  priority: 'medium',
  assigned_to: person(r.qe_id, r.quality_engineer),
  equipment: null,
  status: r.status,
});

/**
 * Real overdue rows for a tab. Each list is fetched independently and a
 * refused one (e.g. /reviews is not open to engineers) contributes nothing
 * instead of failing the whole "All" tab. Throws only if every list failed.
 */
async function fetchOverdueItems(type?: OverdueItemType): Promise<OverdueItem[]> {
  const sources: Array<Promise<OverdueItem[]>> = [];
  if (!type || type === 'inspection') {
    sources.push(overdueApi.getInspections().then((r) => (r.data?.data ?? []).map(fromInspection)));
  }
  if (!type || type === 'defect') {
    sources.push(overdueApi.getDefects().then((r) => (r.data?.data ?? []).map(fromDefect)));
  }
  if (!type || type === 'review') {
    sources.push(overdueApi.getReviews().then((r) => (r.data?.data ?? []).map(fromReview)));
  }
  const results = await Promise.allSettled(sources);
  const ok = results.filter(
    (r): r is PromiseFulfilledResult<OverdueItem[]> => r.status === 'fulfilled'
  );
  if (ok.length === 0) {
    throw (results[0] as PromiseRejectedResult).reason;
  }
  return ok
    .flatMap((r) => r.value)
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

export function OverdueTable({
  typeFilter,
  bucketFilter,
  items,
  isLoading = false,
  onView,
  onReschedule,
  onBulkReschedule,
  selectedItems = [],
  onSelectionChange,
}: OverdueTableProps) {
  const { t } = useTranslation();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>(
    selectedItems.map((item) => `${item.type}-${item.id}`)
  );

  // Fetch only the list(s) the active tab needs; the bucket is applied locally
  // so clicking a bucket does not refetch.
  const { data: overdueData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'items', typeFilter ?? 'all'],
    queryFn: () => fetchOverdueItems(typeFilter),
    enabled: !items,
  });

  const data = useMemo(() => {
    const rows = items || overdueData || [];
    if (!bucketFilter) return rows;
    return rows.filter(
      (item) =>
        item.days_overdue >= bucketFilter.min_days &&
        (bucketFilter.max_days === null || item.days_overdue <= bucketFilter.max_days)
    );
  }, [items, overdueData, bucketFilter]);

  const loading = isLoading || dataLoading;

  const getDaysOverdueColor = (days: number) => {
    if (days >= 30) return '#ff4d4f';
    if (days >= 14) return '#fa8c16';
    if (days >= 7) return '#faad14';
    return '#52c41a';
  };

  const handleRowSelectionChange = (
    newSelectedRowKeys: React.Key[],
    selectedRows: OverdueItem[]
  ) => {
    setSelectedRowKeys(newSelectedRowKeys);
    onSelectionChange?.(selectedRows);
  };

  const columns: ColumnsType<OverdueItem> = [
    {
      title: t('overdue.type', 'Type'),
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: OverdueItemType) => {
        const config = TYPE_CONFIG[type];
        return (
          <Tooltip title={t(`overdue.type_${type}`, config.label)}>
            <Tag color={config.color} icon={config.icon}>
              {t(`overdue.type_${type}`, config.label)}
            </Tag>
          </Tooltip>
        );
      },
      filters: [
        { text: t('overdue.type_inspection', 'Inspection'), value: 'inspection' },
        { text: t('overdue.type_defect', 'Defect'), value: 'defect' },
        { text: t('overdue.type_review', 'Review'), value: 'review' },
      ],
      onFilter: (value, record) => record.type === value,
    },
    {
      title: t('overdue.title', 'Title'),
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string, record: OverdueItem) => (
        <a onClick={() => onView?.(record)}>
          <Text strong>{title}</Text>
        </a>
      ),
    },
    {
      title: t('overdue.due_date', 'Due Date'),
      dataIndex: 'due_date',
      key: 'due_date',
      width: 120,
      render: (date: string | null) => (
        <Text type="secondary">
          {date ? new Date(date).toLocaleDateString() : '-'}
        </Text>
      ),
      sorter: (a, b) =>
        (a.due_date ? new Date(a.due_date).getTime() : 0) -
        (b.due_date ? new Date(b.due_date).getTime() : 0),
    },
    {
      title: t('overdue.days_overdue', 'Days Overdue'),
      dataIndex: 'days_overdue',
      key: 'days_overdue',
      width: 130,
      render: (days: number) => (
        <Badge
          status={days >= 30 ? 'error' : days >= 14 ? 'warning' : 'processing'}
          text={
            <Space size={4}>
              <ClockCircleOutlined style={{ color: getDaysOverdueColor(days) }} />
              <Text style={{ color: getDaysOverdueColor(days), fontWeight: 600 }}>
                {days} {t('overdue.days', 'days')}
              </Text>
            </Space>
          }
        />
      ),
      sorter: (a, b) => a.days_overdue - b.days_overdue,
      defaultSortOrder: 'descend',
    },
    {
      title: t('overdue.priority', 'Priority'),
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (priority: keyof typeof PRIORITY_CONFIG) => {
        const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
        return (
          <Tag color={config.color}>
            {priority === 'critical' && (
              <ExclamationCircleOutlined style={{ marginRight: 4 }} />
            )}
            {t(`overdue.priority_${priority}`, config.label)}
          </Tag>
        );
      },
      filters: [
        { text: t('overdue.priority_low', 'Low'), value: 'low' },
        { text: t('overdue.priority_medium', 'Medium'), value: 'medium' },
        { text: t('overdue.priority_high', 'High'), value: 'high' },
        { text: t('overdue.priority_critical', 'Critical'), value: 'critical' },
      ],
      onFilter: (value, record) => record.priority === value,
    },
    {
      title: t('overdue.assigned_to', 'Assigned To'),
      dataIndex: 'assigned_to',
      key: 'assigned_to',
      width: 150,
      render: (assignee: OverdueItem['assigned_to']) => {
        if (!assignee) {
          return <Text type="secondary">{t('overdue.unassigned', 'Unassigned')}</Text>;
        }
        return (
          <Space size={8}>
            <Avatar size="small" icon={<UserOutlined />} src={assignee.avatar} />
            <Text>{assignee.name}</Text>
          </Space>
        );
      },
    },
    {
      title: t('overdue.equipment', 'Equipment'),
      dataIndex: 'equipment',
      key: 'equipment',
      width: 180,
      render: (equipment: OverdueItem['equipment']) => {
        if (!equipment) {
          return <Text type="secondary">-</Text>;
        }
        return (
          <Space size={4}>
            <ToolOutlined style={{ color: '#8c8c8c' }} />
            <div>
              <Text>{equipment.name}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {equipment.code}
                </Text>
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_: any, record: OverdueItem) => (
        <Space size={0}>
          <Tooltip title={t('common.view', 'View')}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => onView?.(record)}
            />
          </Tooltip>
          <Tooltip title={t('overdue.reschedule', 'Reschedule')}>
            <Button
              type="text"
              icon={<CalendarOutlined />}
              onClick={() => onReschedule?.(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'view',
                  icon: <EyeOutlined />,
                  label: t('common.view_details', 'View Details'),
                  onClick: () => onView?.(record),
                },
                {
                  key: 'reschedule',
                  icon: <CalendarOutlined />,
                  label: t('overdue.reschedule', 'Reschedule'),
                  onClick: () => onReschedule?.(record),
                },
              ],
            }}
            trigger={['click']}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const rowSelection = onSelectionChange
    ? {
        selectedRowKeys,
        onChange: handleRowSelectionChange,
        getCheckboxProps: (record: OverdueItem) => ({
          name: record.title,
        }),
      }
    : undefined;

  return (
    <div>
      {/* Bulk action bar */}
      {selectedRowKeys.length > 0 && onBulkReschedule && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            backgroundColor: '#e6f7ff',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Space>
            <Checkbox
              checked={selectedRowKeys.length === data.length}
              indeterminate={
                selectedRowKeys.length > 0 && selectedRowKeys.length < data.length
              }
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedRowKeys(data.map((item) => `${item.type}-${item.id}`));
                  onSelectionChange?.(data);
                } else {
                  setSelectedRowKeys([]);
                  onSelectionChange?.([]);
                }
              }}
            />
            <Text>
              {selectedRowKeys.length} {t('overdue.items_selected', 'items selected')}
            </Text>
          </Space>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => {
              const selectedData = data.filter((item) =>
                selectedRowKeys.includes(`${item.type}-${item.id}`)
              );
              onBulkReschedule(selectedData);
            }}
          >
            {t('overdue.bulk_reschedule', 'Bulk Reschedule')}
          </Button>
        </div>
      )}

      <Table
        rowKey={(record) => `${record.type}-${record.id}`}
        columns={columns}
        dataSource={data}
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `${total} ${t('overdue.overdue_items', 'overdue items')}`,
        }}
        scroll={{ x: 1200 }}
        locale={{
          emptyText: t('overdue.no_overdue_items', 'No overdue items'),
        }}
      />
    </div>
  );
}

export default OverdueTable;
