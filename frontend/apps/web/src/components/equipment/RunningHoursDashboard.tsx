import React, { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Input,
  Select,
  Button,
  Row,
  Col,
  Statistic,
  Progress,
  Typography,
  Tooltip,
  Badge,
  Modal,
  Drawer,
  message,
} from 'antd';
import {
  DashboardOutlined,
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  ExportOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  EnvironmentOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { runningHoursApi } from '@inspection/shared';
import type { RunningHoursData, ServiceStatus, RunningHoursSummary } from '@inspection/shared';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import ServiceIntervalSettings from './ServiceIntervalSettings';
import RunningHoursInput from './RunningHoursInput';

const { Text, Title } = Typography;
const { Option } = Select;

interface RunningHoursDashboardProps {
  onEquipmentClick?: (equipmentId: number) => void;
}

const statusConfig: Record<ServiceStatus, {
  color: string;
  icon: React.ReactNode;
  label: string;
  tagColor: string;
}> = {
  ok: {
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
    label: 'OK',
    tagColor: 'success',
  },
  approaching: {
    color: '#faad14',
    icon: <WarningOutlined />,
    label: 'Approaching',
    tagColor: 'warning',
  },
  overdue: {
    color: '#ff4d4f',
    icon: <ExclamationCircleOutlined />,
    label: 'Overdue',
    tagColor: 'error',
  },
};

export const RunningHoursDashboard: React.FC<RunningHoursDashboardProps> = ({
  onEquipmentClick,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [locationFilter, setLocationFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [sortField, setSortField] = useState<string>('urgency');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedEquipment, setSelectedEquipment] = useState<RunningHoursData | null>(null);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [inputModalOpen, setInputModalOpen] = useState(false);

  // Summary query
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['running-hours-summary'],
    queryFn: async () => {
      const response = await runningHoursApi.getRunningHoursSummary();
      return response.data?.data as RunningHoursSummary;
    },
    staleTime: 2 * 60 * 1000,
  });

  // List query
  const { data: listData, isLoading: listLoading, refetch: refetchList } = useQuery({
    queryKey: ['running-hours-list', pagination, search, statusFilter, locationFilter, typeFilter, sortField, sortOrder],
    queryFn: async () => {
      const response = await runningHoursApi.listRunningHours({
        page: pagination.current,
        per_page: pagination.pageSize,
        search: search || undefined,
        status: statusFilter as any,
        location: locationFilter,
        equipment_type: typeFilter,
        sort_by: sortField as any,
        sort_order: sortOrder,
      });
      return response.data;
    },
    staleTime: 1 * 60 * 1000,
  });

  const handleTableChange = (
    paginationConfig: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<RunningHoursData> | SorterResult<RunningHoursData>[]
  ) => {
    setPagination({
      current: paginationConfig.current || 1,
      pageSize: paginationConfig.pageSize || 20,
    });

    if (!Array.isArray(sorter) && sorter.field) {
      setSortField(sorter.field as string);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
  };

  const handleRefresh = () => {
    refetchSummary();
    refetchList();
    message.success('Data refreshed');
  };

  const handleExport = async () => {
    try {
      const response = await runningHoursApi.exportReport({
        format: 'xlsx',
        status: statusFilter,
      });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `running-hours-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      message.success('Report exported successfully');
    } catch (error) {
      message.error('Failed to export report');
    }
  };

  const columns: ColumnsType<RunningHoursData> = [
    {
      title: 'Equipment',
      key: 'equipment',
      fixed: 'left',
      width: 250,
      render: (_, record) => (
        <div>
          <a
            onClick={() => onEquipmentClick?.(record.equipment_id)}
            style={{ fontWeight: 500 }}
          >
            {record.equipment_name}
          </a>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.equipment_type}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Running Hours',
      dataIndex: 'current_hours',
      key: 'hours',
      sorter: true,
      width: 140,
      render: (hours: number) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#1890ff' }} />
          <Text strong>{hours.toLocaleString()}</Text>
          <Text type="secondary">hrs</Text>
        </Space>
      ),
    },
    {
      title: 'Service Due',
      key: 'service_due',
      width: 160,
      render: (_, record) => {
        if (!record.service_interval) {
          return <Text type="secondary">Not configured</Text>;
        }

        const status = statusConfig[record.service_status];

        if (record.service_status === 'overdue') {
          return (
            <Tooltip title={`Overdue by ${record.hours_overdue?.toLocaleString()} hours`}>
              <Text style={{ color: status.color }}>
                {status.icon} {record.hours_overdue?.toLocaleString()} hrs overdue
              </Text>
            </Tooltip>
          );
        }

        return (
          <Tooltip title={`${record.hours_until_service?.toLocaleString()} hours until service`}>
            <Text style={{ color: status.color }}>
              {status.icon} {record.hours_until_service?.toLocaleString()} hrs left
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 150,
      render: (_, record) => {
        if (!record.service_interval) {
          return <Text type="secondary">-</Text>;
        }

        const status = statusConfig[record.service_status];
        return (
          <Progress
            percent={Math.min(100, record.progress_percent)}
            size="small"
            strokeColor={status.color}
            format={(percent) => `${percent?.toFixed(0)}%`}
          />
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'service_status',
      key: 'status',
      width: 120,
      filters: [
        { text: 'OK', value: 'ok' },
        { text: 'Approaching', value: 'approaching' },
        { text: 'Overdue', value: 'overdue' },
      ],
      render: (status: ServiceStatus) => {
        const config = statusConfig[status];
        return (
          <Tag color={config.tagColor} icon={config.icon}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: 'Location',
      key: 'location',
      width: 150,
      render: (_, record) => (
        <Space>
          <EnvironmentOutlined style={{ color: '#8c8c8c' }} />
          <Text>{record.location}</Text>
          {record.berth && (
            <Tag>{record.berth}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Assigned Engineer',
      key: 'engineer',
      width: 180,
      render: (_, record) => {
        if (!record.assigned_engineer) {
          return <Text type="secondary">Unassigned</Text>;
        }
        return (
          <Space>
            <UserOutlined />
            <Text>{record.assigned_engineer.full_name}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Enter Reading">
            <Button
              type="text"
              icon={<ClockCircleOutlined />}
              size="small"
              onClick={() => {
                setSelectedEquipment(record);
                setInputModalOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Service Settings">
            <Button
              type="text"
              icon={<SettingOutlined />}
              size="small"
              onClick={() => {
                setSelectedEquipment(record);
                setSettingsDrawerOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card loading={summaryLoading}>
            <Statistic
              title="Total Equipment"
              value={summary?.total_equipment ?? 0}
              prefix={<DashboardOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={summaryLoading} style={{ borderLeft: '4px solid #52c41a' }}>
            <Statistic
              title="OK"
              value={summary?.ok_count ?? 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={summaryLoading} style={{ borderLeft: '4px solid #faad14' }}>
            <Statistic
              title="Approaching Service"
              value={summary?.approaching_count ?? 0}
              valueStyle={{ color: '#faad14' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card loading={summaryLoading} style={{ borderLeft: '4px solid #ff4d4f' }}>
            <Statistic
              title="Service Overdue"
              value={summary?.overdue_count ?? 0}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters and Actions */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Search equipment..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select
              placeholder="Status"
              style={{ width: '100%' }}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
            >
              <Option value="ok">
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  OK
                </Space>
              </Option>
              <Option value="approaching">
                <Space>
                  <WarningOutlined style={{ color: '#faad14' }} />
                  Approaching
                </Space>
              </Option>
              <Option value="overdue">
                <Space>
                  <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                  Overdue
                </Space>
              </Option>
            </Select>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Input
              placeholder="Location"
              prefix={<EnvironmentOutlined />}
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Input
              placeholder="Type"
              prefix={<ToolOutlined />}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={6}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Refresh
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleExport}>
                Export
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Equipment Table */}
      <Card
        title={
          <Space>
            <DashboardOutlined />
            <span>Equipment Running Hours</span>
            <Badge
              count={summary?.overdue_count ?? 0}
              style={{ backgroundColor: '#ff4d4f' }}
            />
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={listData?.data || []}
          rowKey="equipment_id"
          loading={listLoading}
          onChange={handleTableChange}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: listData?.pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} equipment`,
          }}
          scroll={{ x: 1300 }}
          size="middle"
          rowClassName={(record) => {
            if (record.service_status === 'overdue') return 'row-overdue';
            if (record.service_status === 'approaching') return 'row-approaching';
            return '';
          }}
        />
      </Card>

      {/* Service Settings Drawer */}
      <Drawer
        title={
          <Space>
            <SettingOutlined />
            <span>Service Interval Settings</span>
          </Space>
        }
        open={settingsDrawerOpen}
        onClose={() => {
          setSettingsDrawerOpen(false);
          setSelectedEquipment(null);
        }}
        width={500}
        destroyOnClose
      >
        {selectedEquipment && (
          <ServiceIntervalSettings
            equipmentId={selectedEquipment.equipment_id}
            equipmentName={selectedEquipment.equipment_name}
            isModal
            onClose={() => {
              setSettingsDrawerOpen(false);
              setSelectedEquipment(null);
              refetchList();
            }}
          />
        )}
      </Drawer>

      {/* Running Hours Input Modal */}
      <Modal
        title={
          <Space>
            <ClockCircleOutlined />
            <span>Enter Running Hours</span>
          </Space>
        }
        open={inputModalOpen}
        onCancel={() => {
          setInputModalOpen(false);
          setSelectedEquipment(null);
        }}
        footer={null}
        destroyOnClose
      >
        {selectedEquipment && (
          <RunningHoursInput
            equipmentId={selectedEquipment.equipment_id}
            equipmentName={selectedEquipment.equipment_name}
            currentHours={selectedEquipment.current_hours}
            onSuccess={() => {
              setInputModalOpen(false);
              setSelectedEquipment(null);
              refetchList();
              refetchSummary();
            }}
            onCancel={() => {
              setInputModalOpen(false);
              setSelectedEquipment(null);
            }}
          />
        )}
      </Modal>

      <style>{`
        .row-overdue {
          background-color: #fff2f0;
        }
        .row-approaching {
          background-color: #fffbe6;
        }
      `}</style>
    </div>
  );
};

export default RunningHoursDashboard;
