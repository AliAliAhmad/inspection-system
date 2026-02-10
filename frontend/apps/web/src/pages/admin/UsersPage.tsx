import { useState, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  message,
  Typography,
  Row,
  Col,
  Upload,
  Dropdown,
  Alert,
  Timeline,
  Descriptions,
  Statistic,
  Progress,
  Badge,
  Drawer,
  Tabs,
  List,
  Tooltip,
  Checkbox,
  Spin,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UploadOutlined,
  DownloadOutlined,
  HistoryOutlined,
  SwapOutlined,
  MoreOutlined,
  UserOutlined,
  TeamOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  ExportOutlined,
  SyncOutlined,
  TrophyOutlined,
  FireOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  usersApi,
  type User,
  type UserRole,
  type CreateUserPayload,
  type UpdateUserPayload,
  type ImportLog,
  type ImportResult,
  type RoleSwapLog,
  type UserDashboardStats,
  type UserWorkload,
} from '@inspection/shared';

const { Text, Title } = Typography;
const { TabPane } = Tabs;

const ROLES: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer', 'maintenance'];
const SHIFTS = ['day', 'night'];
const SPECIALIZATIONS = ['mechanical', 'electrical', 'hvac'];

const roleColorMap: Record<UserRole, string> = {
  admin: 'red',
  inspector: 'blue',
  specialist: 'green',
  engineer: 'orange',
  quality_engineer: 'purple',
  maintenance: 'cyan',
};

const workloadStatusColors: Record<string, string> = {
  available: '#52c41a',
  light: '#95de64',
  optimal: '#1890ff',
  overloaded: '#ff4d4f',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Table state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [shiftFilter, setShiftFilter] = useState<string | undefined>();
  const [specFilter, setSpecFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importHistoryModalOpen, setImportHistoryModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [swapHistoryModalOpen, setSwapHistoryModalOpen] = useState(false);
  const [swapHistoryUser, setSwapHistoryUser] = useState<User | null>(null);

  // New enhanced states
  const [showStats, setShowStats] = useState(true);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [workloadDrawerOpen, setWorkloadDrawerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkActionModalOpen, setBulkActionModalOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<string>('');

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [bulkForm] = Form.useForm();

  // Fetch users
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', page, perPage, search, roleFilter, shiftFilter, specFilter, statusFilter],
    queryFn: () =>
      usersApi.list({
        page,
        per_page: perPage,
        search: search || undefined,
        role: roleFilter,
        shift: shiftFilter,
        specialization: specFilter,
        is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
      }),
  });

  // Fetch stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['users', 'stats'],
    queryFn: () => usersApi.getStats().then((r) => r.data?.data),
    staleTime: 60000,
  });

  // Fetch workload
  const { data: workloadData, isLoading: workloadLoading } = useQuery({
    queryKey: ['users', 'workload'],
    queryFn: () => usersApi.getWorkloadAnalysis().then((r) => r.data?.data),
    enabled: workloadDrawerOpen,
  });

  // AI Search
  const aiSearchMutation = useMutation({
    mutationFn: (query: string) => usersApi.aiSearch(query),
    onSuccess: (res) => {
      message.success(t('users.aiSearchResults', `Found ${res.data?.count || 0} users`));
    },
    onError: () => {
      message.error(t('users.aiSearchError', 'AI search failed'));
    },
  });

  // User activity and stats
  const { data: userActivityData } = useQuery({
    queryKey: ['users', selectedUser?.id, 'activity'],
    queryFn: () => usersApi.getUserActivity(selectedUser!.id, 10).then((r) => r.data),
    enabled: profileDrawerOpen && !!selectedUser,
  });

  const { data: userStatsData } = useQuery({
    queryKey: ['users', selectedUser?.id, 'stats'],
    queryFn: () => usersApi.getUserStats(selectedUser!.id).then((r) => (r.data as any)?.stats),
    enabled: profileDrawerOpen && !!selectedUser,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: () => {
      message.success(t('users.createSuccess', 'User created successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateModalOpen(false);
      createForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to create user');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateUserPayload }) =>
      usersApi.update(id, payload),
    onSuccess: () => {
      message.success(t('users.updateSuccess', 'User updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditModalOpen(false);
      setEditingUser(null);
      editForm.resetFields();
    },
    onError: () => {
      message.error(t('users.updateError', 'Failed to update user'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => {
      message.success(t('users.deleteSuccess', 'User deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      message.error(t('users.deleteError', 'Failed to delete user'));
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => usersApi.import(file),
    onSuccess: (res) => {
      const result = (res.data as any).data ?? res.data;
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(t('users.importSuccess', 'Import completed'));
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Import failed');
    },
  });

  const swapRolesMutation = useMutation({
    mutationFn: (userId: number) => usersApi.swapRoles(userId),
    onSuccess: () => {
      message.success(t('users.swapSuccess', 'Roles swapped successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Swap failed');
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: (payload: { user_ids: number[]; action: string; value?: string }) =>
      usersApi.bulkAction(payload as any),
    onSuccess: (res) => {
      message.success(t('users.bulkSuccess', `${res.data?.data?.updated_count || 0} users updated`));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setSelectedRowKeys([]);
      setBulkActionModalOpen(false);
      bulkForm.resetFields();
    },
    onError: () => {
      message.error(t('users.bulkError', 'Bulk action failed'));
    },
  });

  const { data: importHistoryData, isLoading: importHistoryLoading } = useQuery({
    queryKey: ['users-import-history'],
    queryFn: () => usersApi.getImportHistory(),
    enabled: importHistoryModalOpen,
  });

  const { data: swapHistoryData, isLoading: swapHistoryLoading } = useQuery({
    queryKey: ['users-swap-history', swapHistoryUser?.id],
    queryFn: () => usersApi.getSwapHistory(swapHistoryUser!.id),
    enabled: swapHistoryModalOpen && !!swapHistoryUser,
  });

  const handleExport = async () => {
    try {
      const response = await usersApi.exportUsers(true);
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `users_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      message.success(t('users.exportSuccess', 'Users exported successfully'));
    } catch {
      message.error(t('users.exportError', 'Failed to export users'));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await usersApi.downloadTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'team_import_template.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error(t('users.downloadError', 'Failed to download template'));
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    editForm.setFieldsValue({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      minor_role: user.minor_role,
      specialization: user.specialization,
      shift: user.shift,
      language: user.language,
      is_active: user.is_active,
    });
    setEditModalOpen(true);
  };

  const openProfile = (user: User) => {
    setSelectedUser(user);
    setProfileDrawerOpen(true);
  };

  const columns: ColumnsType<User> = [
    {
      title: '',
      key: 'status_indicator',
      width: 8,
      render: (_: unknown, record: User) => (
        <div
          style={{
            width: 4,
            height: 40,
            borderRadius: 2,
            backgroundColor: record.is_active ? '#52c41a' : '#d9d9d9',
          }}
        />
      ),
    },
    {
      title: t('users.fullName', 'Full Name'),
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => a.full_name.localeCompare(b.full_name),
      render: (name: string, record: User) => (
        <Button type="link" onClick={() => openProfile(record)} style={{ padding: 0 }}>
          {name}
        </Button>
      ),
    },
    {
      title: t('users.email', 'Email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('users.employeeId', 'ID'),
      dataIndex: 'role_id',
      key: 'role_id',
      width: 100,
      render: (val: string | null) => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: t('users.role', 'Role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole, record: User) => (
        <Space>
          <Tag color={roleColorMap[role]}>{role.replace('_', ' ').toUpperCase()}</Tag>
          {record.minor_role && (
            <Tooltip title="Minor role">
              <Tag color={roleColorMap[record.minor_role]} style={{ opacity: 0.6 }}>
                {record.minor_role.replace('_', ' ').slice(0, 3).toUpperCase()}
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('users.specialization', 'Spec'),
      dataIndex: 'specialization',
      key: 'specialization',
      width: 100,
      render: (val: string | null) =>
        val ? (
          <Tag color={val === 'mechanical' ? 'blue' : val === 'electrical' ? 'gold' : 'cyan'}>
            {val.slice(0, 4).toUpperCase()}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('users.shift', 'Shift'),
      dataIndex: 'shift',
      key: 'shift',
      width: 80,
      render: (val: string | null) =>
        val ? (
          <Tag color={val === 'day' ? 'orange' : 'geekblue'}>{val.toUpperCase()}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('users.points', 'Points'),
      dataIndex: 'total_points',
      key: 'total_points',
      width: 80,
      sorter: (a, b) => a.total_points - b.total_points,
      render: (points: number) => (
        <Badge count={points} style={{ backgroundColor: points > 100 ? '#52c41a' : '#1890ff' }} />
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 60,
      render: (_: unknown, record: User) => {
        const menuItems: MenuProps['items'] = [
          {
            key: 'view',
            icon: <UserOutlined />,
            label: t('users.viewProfile', 'View Profile'),
            onClick: () => openProfile(record),
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: t('common.edit', 'Edit'),
            onClick: () => openEdit(record),
          },
          {
            key: 'swap',
            icon: <SwapOutlined />,
            label: t('users.swapRoles', 'Swap Roles'),
            disabled: !record.minor_role,
            onClick: () => {
              Modal.confirm({
                title: t('users.confirmSwap', 'Confirm Role Swap'),
                content: t('users.swapConfirmContent', `Swap ${record.role} to ${record.minor_role}?`),
                onOk: () => swapRolesMutation.mutate(record.id),
              });
            },
          },
          {
            key: 'swapHistory',
            icon: <HistoryOutlined />,
            label: t('users.swapHistory', 'Swap History'),
            onClick: () => {
              setSwapHistoryUser(record);
              setSwapHistoryModalOpen(true);
            },
          },
          { type: 'divider' },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: t('common.delete', 'Delete'),
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: t('users.deleteConfirm', 'Delete this user?'),
                onOk: () => deleteMutation.mutate(record.id),
              });
            },
          },
        ];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  const rawUsers = data?.data?.data || [];
  const users = [...rawUsers].sort((a, b) => {
    if (a.is_active === b.is_active) return 0;
    return a.is_active ? -1 : 1;
  });
  const pagination = data?.data?.pagination;

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const hasSelected = selectedRowKeys.length > 0;

  return (
    <>
      {/* Stats Dashboard */}
      {showStats && statsData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><TeamOutlined /> Total</>}
                value={statsData.total}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><CheckCircleOutlined /> Active</>}
                value={statsData.active}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><CloseCircleOutlined /> Inactive</>}
                value={statsData.inactive}
                valueStyle={{ color: '#d9d9d9' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Card size="small">
              <Statistic
                title={<><ClockCircleOutlined /> On Leave</>}
                value={statsData.on_leave}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" title={<><TrophyOutlined /> Top Performers</>}>
              <Space wrap>
                {statsData.top_performers?.slice(0, 3).map((u, i) => (
                  <Tag key={u.id} color={i === 0 ? 'gold' : i === 1 ? 'silver' : 'default'}>
                    {u.name.split(' ')[0]}: {u.points}pts
                  </Tag>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      <Card
        title={<Title level={4}><TeamOutlined /> {t('nav.users', 'Users Management')}</Title>}
        extra={
          <Space wrap>
            <Tooltip title="Toggle Stats">
              <Button
                type={showStats ? 'primary' : 'default'}
                icon={<BarChartOutlined />}
                onClick={() => setShowStats(!showStats)}
              />
            </Tooltip>
            <Button icon={<ThunderboltOutlined />} onClick={() => setWorkloadDrawerOpen(true)}>
              {t('users.workload', 'Workload')}
            </Button>
            <Button icon={<RobotOutlined />} onClick={() => setAiSearchOpen(true)}>
              {t('users.aiSearch', 'AI Search')}
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              {t('users.export', 'Export')}
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              {t('users.template', 'Template')}
            </Button>
            <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
              {t('users.import', 'Import')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              {t('users.create', 'Create')}
            </Button>
          </Space>
        }
      >
        {/* Filters */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder={t('users.searchPlaceholder', 'Search by name or email...')}
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              allowClear
            />
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select
              placeholder="Role"
              value={roleFilter}
              onChange={(val) => { setRoleFilter(val); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
            >
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {r.replace('_', ' ').toUpperCase()}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select
              placeholder="Shift"
              value={shiftFilter}
              onChange={(val) => { setShiftFilter(val); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
            >
              {SHIFTS.map((s) => (
                <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select
              placeholder="Specialization"
              value={specFilter}
              onChange={(val) => { setSpecFilter(val); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
            >
              {SPECIALIZATIONS.map((s) => (
                <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Select
              placeholder="Status"
              value={statusFilter}
              onChange={(val) => { setStatusFilter(val); setPage(1); }}
              allowClear
              style={{ width: '100%' }}
            >
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="inactive">Inactive</Select.Option>
            </Select>
          </Col>
        </Row>

        {/* Bulk Actions */}
        {hasSelected && (
          <Alert
            style={{ marginBottom: 16 }}
            message={
              <Space>
                <Text>{selectedRowKeys.length} users selected</Text>
                <Button size="small" type="primary" onClick={() => { setBulkAction('activate'); setBulkActionModalOpen(true); }}>
                  Activate
                </Button>
                <Button size="small" danger onClick={() => { setBulkAction('deactivate'); setBulkActionModalOpen(true); }}>
                  Deactivate
                </Button>
                <Button size="small" onClick={() => { setBulkAction('change_shift'); setBulkActionModalOpen(true); }}>
                  Change Shift
                </Button>
                <Button size="small" onClick={() => setSelectedRowKeys([])}>Clear</Button>
              </Space>
            }
            type="info"
            showIcon
          />
        )}

        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={users}
          loading={isLoading}
          locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
          rowClassName={(record) => record.is_active === false ? 'inactive-row' : ''}
          pagination={{
            current: pagination?.page || page,
            pageSize: pagination?.per_page || perPage,
            total: pagination?.total || 0,
            showSizeChanger: true,
            showTotal: (total) => t('common.totalItems', `Total: ${total} items`),
            onChange: (p, ps) => { setPage(p); setPerPage(ps); },
          }}
          scroll={{ x: 1000 }}
          size="small"
        />
      </Card>

      {/* AI Search Modal */}
      <Modal
        title={<><RobotOutlined /> {t('users.aiSearchTitle', 'AI-Powered User Search')}</>}
        open={aiSearchOpen}
        onCancel={() => { setAiSearchOpen(false); setAiSearchQuery(''); }}
        footer={null}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            message="Natural Language Search"
            description="Try: 'night shift mechanical inspectors', 'available specialists', 'users who haven't logged in this week'"
            type="info"
            showIcon
          />
          <Input.Search
            placeholder="Describe the users you're looking for..."
            value={aiSearchQuery}
            onChange={(e) => setAiSearchQuery(e.target.value)}
            onSearch={(val) => val && aiSearchMutation.mutate(val)}
            loading={aiSearchMutation.isPending}
            enterButton={<><RobotOutlined /> Search</>}
            size="large"
          />
          {aiSearchMutation.data && (
            <>
              <Text type="secondary">
                Found {aiSearchMutation.data.data?.count} users
                {aiSearchMutation.data.data?.filters_applied && Object.keys(aiSearchMutation.data.data.filters_applied).length > 0 && (
                  <> | Filters: {Object.entries(aiSearchMutation.data.data.filters_applied).map(([k, v]) => `${k}=${v}`).join(', ')}</>
                )}
              </Text>
              <List
                size="small"
                dataSource={aiSearchMutation.data.data?.data || []}
                renderItem={(user: any) => (
                  <List.Item
                    actions={[
                      <Tag color={workloadStatusColors[user.workload_status] || 'default'}>
                        {user.workload_status} ({user.active_tasks} tasks)
                      </Tag>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<><Tag color={roleColorMap[user.role as UserRole]}>{user.role}</Tag> {user.full_name}</>}
                      description={`${user.shift || 'No shift'} | ${user.specialization || 'No spec'} | ${user.email}`}
                    />
                  </List.Item>
                )}
              />
            </>
          )}
        </Space>
      </Modal>

      {/* Workload Drawer */}
      <Drawer
        title={<><ThunderboltOutlined /> {t('users.workloadAnalysis', 'Workload Analysis')}</>}
        open={workloadDrawerOpen}
        onClose={() => setWorkloadDrawerOpen(false)}
        width={600}
      >
        {workloadLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : workloadData ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Avg Utilization"
                    value={workloadData.summary.average_utilization}
                    suffix="%"
                    valueStyle={{ color: workloadData.summary.average_utilization > 80 ? '#ff4d4f' : '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="Available"
                    value={workloadData.summary.available_count}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small">
                  <Statistic
                    title="Overloaded"
                    value={workloadData.summary.overloaded_count}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
            </Row>
            <List
              size="small"
              dataSource={workloadData.users}
              renderItem={(user: UserWorkload) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Badge color={workloadStatusColors[user.status]} />
                        {user.full_name}
                        <Tag>{user.role}</Tag>
                      </Space>
                    }
                    description={
                      <Space>
                        <Text type="secondary">{user.shift || 'No shift'}</Text>
                        <Text>Active: {user.active_tasks}</Text>
                        <Text type="secondary">Today: {user.completed_today}</Text>
                      </Space>
                    }
                  />
                  <Progress
                    type="circle"
                    percent={user.utilization}
                    size={40}
                    strokeColor={workloadStatusColors[user.status]}
                  />
                </List.Item>
              )}
            />
          </Space>
        ) : (
          <Empty description="No workload data" />
        )}
      </Drawer>

      {/* User Profile Drawer */}
      <Drawer
        title={<><UserOutlined /> {selectedUser?.full_name}</>}
        open={profileDrawerOpen}
        onClose={() => { setProfileDrawerOpen(false); setSelectedUser(null); }}
        width={500}
      >
        {selectedUser && (
          <Tabs defaultActiveKey="info">
            <TabPane tab="Info" key="info">
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Email">{selectedUser.email}</Descriptions.Item>
                <Descriptions.Item label="Role">
                  <Tag color={roleColorMap[selectedUser.role]}>{selectedUser.role.replace('_', ' ')}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Role ID">{selectedUser.role_id}</Descriptions.Item>
                <Descriptions.Item label="Minor Role">
                  {selectedUser.minor_role ? (
                    <Tag color={roleColorMap[selectedUser.minor_role]}>{selectedUser.minor_role}</Tag>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="Shift">{selectedUser.shift || '-'}</Descriptions.Item>
                <Descriptions.Item label="Specialization">{selectedUser.specialization || '-'}</Descriptions.Item>
                <Descriptions.Item label="Language">{selectedUser.language?.toUpperCase()}</Descriptions.Item>
                <Descriptions.Item label="Points">
                  <Badge count={selectedUser.total_points} style={{ backgroundColor: '#52c41a' }} />
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={selectedUser.is_active ? 'green' : 'red'}>
                    {selectedUser.is_active ? 'Active' : 'Inactive'}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>
            </TabPane>
            <TabPane tab="Stats" key="stats">
              {userStatsData ? (
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic title="Inspections" value={userStatsData.inspections_completed} prefix={<SafetyOutlined />} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic title="Defects Found" value={userStatsData.defects_found} prefix={<ExclamationCircleOutlined />} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic title="Jobs Completed" value={userStatsData.jobs_completed} prefix={<CheckCircleOutlined />} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic title="Points Earned" value={userStatsData.points_earned} prefix={<TrophyOutlined />} />
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Card size="small" title="Quality Score">
                      <Progress percent={userStatsData.quality_score} status="active" />
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Card size="small" title="On-Time Rate">
                      <Progress percent={userStatsData.on_time_completion_rate} status="active" strokeColor="#52c41a" />
                    </Card>
                  </Col>
                </Row>
              ) : (
                <Spin />
              )}
            </TabPane>
            <TabPane tab="Activity" key="activity">
              {(userActivityData as any)?.activity ? (
                <Timeline
                  items={(userActivityData as any).activity.map((a: any) => ({
                    color: a.type === 'inspection' ? 'green' : a.type === 'defect' ? 'red' : 'blue',
                    children: (
                      <div>
                        <Text strong>{a.title}</Text>
                        <br />
                        <Text type="secondary">{a.description}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(a.timestamp).toLocaleString()}
                        </Text>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Spin />
              )}
            </TabPane>
          </Tabs>
        )}
      </Drawer>

      {/* Create Modal */}
      <Modal
        title={t('users.create', 'Create User')}
        open={createModalOpen}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={(values: CreateUserPayload) => createMutation.mutate(values)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                <Select>
                  {ROLES.map((r) => (
                    <Select.Option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="minor_role" label="Minor Role">
                <Select allowClear>
                  {ROLES.map((r) => (
                    <Select.Option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="specialization" label="Specialization">
                <Select allowClear>
                  {SPECIALIZATIONS.map((s) => (
                    <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shift" label="Shift">
                <Select allowClear>
                  {SHIFTS.map((s) => (
                    <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="language" label="Language">
                <Select allowClear>
                  <Select.Option value="en">English</Select.Option>
                  <Select.Option value="ar">Arabic</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={t('users.editUser', 'Edit User')}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingUser(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={(values: UpdateUserPayload) => editingUser && updateMutation.mutate({ id: editingUser.id, payload: values })}>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label="Full Name">
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="role" label="Role">
                <Select>
                  {ROLES.map((r) => (
                    <Select.Option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="minor_role" label="Minor Role">
                <Select allowClear>
                  {ROLES.map((r) => (
                    <Select.Option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="specialization" label="Specialization">
                <Select allowClear>
                  {SPECIALIZATIONS.map((s) => (
                    <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shift" label="Shift">
                <Select allowClear>
                  {SHIFTS.map((s) => (
                    <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="language" label="Language">
                <Select allowClear>
                  <Select.Option value="en">English</Select.Option>
                  <Select.Option value="ar">Arabic</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Action Modal */}
      <Modal
        title={`Bulk Action: ${bulkAction.replace('_', ' ')}`}
        open={bulkActionModalOpen}
        onCancel={() => { setBulkActionModalOpen(false); bulkForm.resetFields(); }}
        onOk={() => {
          const value = bulkForm.getFieldValue('value');
          bulkActionMutation.mutate({
            user_ids: selectedRowKeys as number[],
            action: bulkAction,
            value,
          });
        }}
        confirmLoading={bulkActionMutation.isPending}
      >
        <Text>Apply to {selectedRowKeys.length} users</Text>
        {(bulkAction === 'change_shift' || bulkAction === 'change_role' || bulkAction === 'change_specialization') && (
          <Form form={bulkForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="value" label="New Value" rules={[{ required: true }]}>
              {bulkAction === 'change_shift' && (
                <Select>
                  {SHIFTS.map((s) => <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>)}
                </Select>
              )}
              {bulkAction === 'change_role' && (
                <Select>
                  {ROLES.map((r) => <Select.Option key={r} value={r}>{r.replace('_', ' ').toUpperCase()}</Select.Option>)}
                </Select>
              )}
              {bulkAction === 'change_specialization' && (
                <Select>
                  {SPECIALIZATIONS.map((s) => <Select.Option key={s} value={s}>{s.toUpperCase()}</Select.Option>)}
                </Select>
              )}
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Import Modal */}
      <Modal
        title={t('users.importTeam', 'Import Team Members')}
        open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportResult(null); }}
        footer={[<Button key="cancel" onClick={() => setImportModalOpen(false)}>Close</Button>]}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert message="Import Instructions" description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>SAP_ID must be exactly 6 digits (used as initial password)</li>
              <li>Full name must have 3 parts: first, father, family</li>
              <li>Role: admin, inspector, specialist, engineer, quality_engineer, maintenance</li>
            </ul>
          } type="info" showIcon />
          <input type="file" accept=".xlsx,.xls" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) { importMutation.mutate(file); e.target.value = ''; }
          }} />
          {importMutation.isPending && <Text>Uploading...</Text>}
          {importResult && (
            <Alert
              message="Import Results"
              description={
                <Space direction="vertical">
                  <Text type="success">Created: {importResult.created.length}</Text>
                  <Text type="warning">Updated: {importResult.updated.length}</Text>
                  <Text type="danger">Failed: {importResult.failed.length}</Text>
                </Space>
              }
              type={importResult.failed.length > 0 ? 'warning' : 'success'}
              showIcon
            />
          )}
        </Space>
      </Modal>

      {/* Import History Modal */}
      <Modal
        title={t('users.importHistory', 'Import History')}
        open={importHistoryModalOpen}
        onCancel={() => setImportHistoryModalOpen(false)}
        footer={null}
        width={800}
      >
        <Table
          rowKey="id"
          loading={importHistoryLoading}
          dataSource={importHistoryData?.data?.data || []}
          columns={[
            { title: 'Date', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
            { title: 'File', dataIndex: 'file_name' },
            { title: 'Total', dataIndex: 'total_rows' },
            { title: 'Created', dataIndex: 'created_count', render: (v: number) => <Tag color="green">{v}</Tag> },
            { title: 'Updated', dataIndex: 'updated_count', render: (v: number) => <Tag color="orange">{v}</Tag> },
            { title: 'Failed', dataIndex: 'failed_count', render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : <Tag>{v}</Tag> },
          ]}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Modal>

      {/* Swap History Modal */}
      <Modal
        title={t('users.swapHistory', 'Role Swap History')}
        open={swapHistoryModalOpen}
        onCancel={() => { setSwapHistoryModalOpen(false); setSwapHistoryUser(null); }}
        footer={null}
        width={600}
      >
        {swapHistoryUser && (
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="User">{swapHistoryUser.full_name}</Descriptions.Item>
            <Descriptions.Item label="Current Role">
              <Tag color={roleColorMap[swapHistoryUser.role]}>{swapHistoryUser.role.replace('_', ' ')}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
        {swapHistoryLoading ? (
          <Spin />
        ) : (swapHistoryData?.data?.data || []).length === 0 ? (
          <Text type="secondary">No swap history</Text>
        ) : (
          <Timeline
            items={(swapHistoryData?.data?.data || []).map((log: RoleSwapLog) => ({
              color: 'blue',
              children: (
                <div>
                  <Text strong>{new Date(log.created_at).toLocaleString()}</Text>
                  <br />
                  <Text>{log.old_role} → {log.new_role}</Text>
                  <br />
                  <Text type="secondary">By: {log.admin_name}</Text>
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </>
  );
}
