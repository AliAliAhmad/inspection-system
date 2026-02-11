import { useState } from 'react';
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

const { Text } = Typography;

export type OverdueItemType = 'inspection' | 'defect' | 'review';

export interface OverdueItem {
  id: number;
  type: OverdueItemType;
  title: string;
  due_date: string;
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

  // Use provided items or fetch from API
  const { data: overdueData, isLoading: dataLoading } = useQuery({
    queryKey: ['overdue', 'items', typeFilter, bucketFilter],
    queryFn: async () => {
      // This would call the overdue API endpoint
      // For now, return mock data
      const mockItems: OverdueItem[] = [
        {
          id: 1,
          type: 'inspection',
          title: 'Monthly Safety Inspection - Crane A',
          due_date: '2024-01-15',
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
          due_date: '2024-01-10',
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
          due_date: '2024-01-20',
          days_overdue: 5,
          priority: 'medium',
          assigned_to: { id: 3, name: 'Bob Wilson' },
          equipment: { id: 103, name: 'Excavator C', code: 'EX-003' },
          status: 'pending_review',
        },
      ];

      // Apply filters
      let filtered = mockItems;
      if (typeFilter) {
        filtered = filtered.filter((item) => item.type === typeFilter);
      }
      if (bucketFilter) {
        filtered = filtered.filter((item) => {
          if (bucketFilter.max_days === null) {
            return item.days_overdue >= bucketFilter.min_days;
          }
          return (
            item.days_overdue >= bucketFilter.min_days &&
            item.days_overdue <= bucketFilter.max_days
          );
        });
      }

      return filtered;
    },
    enabled: !items,
  });

  const loading = isLoading || dataLoading;
  const data = items || overdueData || [];

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
      render: (date: string) => (
        <Text type="secondary">
          {new Date(date).toLocaleDateString()}
        </Text>
      ),
      sorter: (a, b) =>
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
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
        const config = PRIORITY_CONFIG[priority];
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
