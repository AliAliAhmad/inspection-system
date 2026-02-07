import { useState } from 'react';
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
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Upload,
  Dropdown,
  Alert,
  Timeline,
  Descriptions,
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
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
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
} from '@inspection/shared';

const ROLES: UserRole[] = ['admin', 'inspector', 'specialist', 'engineer', 'quality_engineer'];

const roleColorMap: Record<UserRole, string> = {
  admin: 'red',
  inspector: 'blue',
  specialist: 'green',
  engineer: 'orange',
  quality_engineer: 'purple',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Import states
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importHistoryModalOpen, setImportHistoryModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Role swap states
  const [swapHistoryModalOpen, setSwapHistoryModalOpen] = useState(false);
  const [swapHistoryUser, setSwapHistoryUser] = useState<User | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', page, perPage, search, roleFilter, activeFilter],
    queryFn: () =>
      usersApi.list({ page, per_page: perPage, search: search || undefined, role: roleFilter, is_active: activeFilter }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => usersApi.create(payload),
    onSuccess: () => {
      message.success(t('users.createSuccess', 'User created successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateModalOpen(false);
      createForm.resetFields();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create user';
      message.error(msg);
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

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: () => {
      message.success(t('users.statusUpdated', 'User status updated'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      message.error(t('users.statusError', 'Failed to update user status'));
    },
  });

  // Import mutation - same pattern as roster page
  const importMutation = useMutation({
    mutationFn: (file: File) => usersApi.import(file),
    onSuccess: (res) => {
      const result = (res.data as any).data ?? res.data;
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success(
        t('users.importSuccess', 'Import completed: {{created}} created, {{updated}} updated, {{failed}} failed', {
          created: result.created?.length ?? 0,
          updated: result.updated?.length ?? 0,
          failed: result.failed?.length ?? 0,
        })
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Import failed';
      message.error(msg);
    },
  });

  const { data: importHistoryData, isLoading: importHistoryLoading } = useQuery({
    queryKey: ['users-import-history'],
    queryFn: () => usersApi.getImportHistory(),
    enabled: importHistoryModalOpen,
  });

  // Role swap mutations
  const swapRolesMutation = useMutation({
    mutationFn: (userId: number) => usersApi.swapRoles(userId),
    onSuccess: (response) => {
      const user = response.data.data;
      message.success(t('users.swapSuccess', 'Roles swapped successfully'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Swap failed';
      message.error(msg);
    },
  });

  const { data: swapHistoryData, isLoading: swapHistoryLoading } = useQuery({
    queryKey: ['users-swap-history', swapHistoryUser?.id],
    queryFn: () => usersApi.getSwapHistory(swapHistoryUser!.id),
    enabled: swapHistoryModalOpen && !!swapHistoryUser,
  });

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
    } catch (err) {
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

  const columns: ColumnsType<User> = [
    {
      title: t('users.fullName', 'Full Name'),
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => a.full_name.localeCompare(b.full_name),
    },
    {
      title: t('users.email', 'Email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('users.employeeId', 'Employee ID'),
      dataIndex: 'employee_id',
      key: 'employee_id',
    },
    {
      title: t('users.role', 'Role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: UserRole) => (
        <Tag color={roleColorMap[role]}>{role.replace('_', ' ').toUpperCase()}</Tag>
      ),
    },
    {
      title: t('users.specialization', 'Specialization'),
      dataIndex: 'specialization',
      key: 'specialization',
      render: (val: string | null) => val || '-',
    },
    {
      title: t('users.shift', 'Shift'),
      dataIndex: 'shift',
      key: 'shift',
      render: (val: string | null) => val ? val.charAt(0).toUpperCase() + val.slice(1) : '-',
    },
    {
      title: t('users.active', 'Active'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean, record: User) => (
        <Switch
          checked={active}
          onChange={(checked) => toggleActiveMutation.mutate({ id: record.id, is_active: checked })}
          loading={toggleActiveMutation.isPending}
        />
      ),
    },
    {
      title: t('users.points', 'Points'),
      dataIndex: 'total_points',
      key: 'total_points',
      sorter: (a, b) => a.total_points - b.total_points,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: unknown, record: User) => {
        const menuItems: MenuProps['items'] = [
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
                content: t('users.swapConfirmContent', 'Swap {{major}} to {{minor}}?', {
                  major: record.role.replace('_', ' '),
                  minor: record.minor_role?.replace('_', ' ') || '-',
                }),
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
                title: t('users.deleteConfirm', 'Are you sure you want to delete this user?'),
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

  const users = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.users', 'Users Management')}</Typography.Title>}
      extra={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            {t('users.downloadTemplate', 'Download Template')}
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>
            {t('users.import', 'Import')}
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setImportHistoryModalOpen(true)}>
            {t('users.importHistory', 'Import History')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('users.create', 'Create User')}
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
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
        <Col xs={12} sm={6}>
          <Select
            placeholder={t('users.filterRole', 'Filter by role')}
            value={roleFilter}
            onChange={(val) => {
              setRoleFilter(val);
              setPage(1);
            }}
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
        <Col xs={12} sm={6}>
          <Select
            placeholder={t('users.filterActive', 'Filter by status')}
            value={activeFilter}
            onChange={(val) => {
              setActiveFilter(val);
              setPage(1);
            }}
            allowClear
            style={{ width: '100%' }}
          >
            <Select.Option value={true}>{t('users.activeOnly', 'Active')}</Select.Option>
            <Select.Option value={false}>{t('users.inactiveOnly', 'Inactive')}</Select.Option>
          </Select>
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
          onChange: (p, ps) => {
            setPage(p);
            setPerPage(ps);
          },
        }}
        scroll={{ x: 1000 }}
      />

      {/* Create Modal */}
      <Modal
        title={t('users.create', 'Create User')}
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values: CreateUserPayload) => createMutation.mutate(values)}
        >
          <Form.Item name="email" label={t('users.email', 'Email')} rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('users.password', 'Password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="full_name" label={t('users.fullName', 'Full Name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('users.role', 'Role')} rules={[{ required: true }]}>
            <Select>
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {r.replace('_', ' ').toUpperCase()}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="minor_role" label={t('users.minorRole', 'Minor Role')}>
            <Select allowClear>
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {r.replace('_', ' ').toUpperCase()}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="specialization" label={t('users.specialization', 'Specialization')}>
            <Select allowClear>
              <Select.Option value="mechanical">{t('users.mechanical', 'Mechanical')}</Select.Option>
              <Select.Option value="electrical">{t('users.electrical', 'Electrical')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="shift" label={t('users.shift', 'Shift')}>
            <Select allowClear>
              <Select.Option value="day">{t('users.day', 'Day')}</Select.Option>
              <Select.Option value="night">{t('users.night', 'Night')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="language" label={t('users.language', 'Language')}>
            <Select allowClear>
              <Select.Option value="en">English</Select.Option>
              <Select.Option value="ar">Arabic</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title={t('users.editUser', 'Edit User')}
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setEditingUser(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values: UpdateUserPayload) =>
            editingUser && updateMutation.mutate({ id: editingUser.id, payload: values })
          }
        >
          <Form.Item name="email" label={t('users.email', 'Email')} rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="full_name" label={t('users.fullName', 'Full Name')}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label={t('users.role', 'Role')}>
            <Select>
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {r.replace('_', ' ').toUpperCase()}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="minor_role" label={t('users.minorRole', 'Minor Role')}>
            <Select allowClear>
              {ROLES.map((r) => (
                <Select.Option key={r} value={r}>
                  {r.replace('_', ' ').toUpperCase()}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="specialization" label={t('users.specialization', 'Specialization')}>
            <Select allowClear>
              <Select.Option value="mechanical">{t('users.mechanical', 'Mechanical')}</Select.Option>
              <Select.Option value="electrical">{t('users.electrical', 'Electrical')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="shift" label={t('users.shift', 'Shift')}>
            <Select allowClear>
              <Select.Option value="day">{t('users.day', 'Day')}</Select.Option>
              <Select.Option value="night">{t('users.night', 'Night')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="language" label={t('users.language', 'Language')}>
            <Select allowClear>
              <Select.Option value="en">English</Select.Option>
              <Select.Option value="ar">Arabic</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="is_active" label={t('users.active', 'Active')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import Modal */}
      <Modal
        title={t('users.importTeam', 'Import Team Members')}
        open={importModalOpen}
        onCancel={() => {
          setImportModalOpen(false);
          setImportResult(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setImportModalOpen(false)}>
            {t('common.close', 'Close')}
          </Button>,
        ]}
        width={700}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            message={t('users.importInstructions', 'Import Instructions')}
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>{t('users.importInstruction1', 'Download the template and fill in the data')}</li>
                <li>{t('users.importInstruction2', 'SAP_ID must be exactly 6 digits (used as initial password)')}</li>
                <li>{t('users.importInstruction3', 'Full name must have 3 parts: first, father, family')}</li>
                <li>{t('users.importInstruction4', 'Role: admin, inspector, specialist, engineer, quality_engineer')}</li>
                <li>{t('users.importInstruction5', 'Specialization: mechanical, electrical, hvac (not required for admin)')}</li>
              </ul>
            }
            type="info"
            showIcon
          />

          <input
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'block', marginBottom: 16 }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importMutation.mutate(file);
                e.target.value = '';
              }
            }}
          />
          {importMutation.isPending && <Typography.Text>Uploading...</Typography.Text>}

          {importResult && (
            <Alert
              message={t('users.importResults', 'Import Results')}
              description={
                <Space direction="vertical">
                  <Typography.Text type="success">
                    {t('users.created', 'Created')}: {importResult.created.length}
                  </Typography.Text>
                  <Typography.Text type="warning">
                    {t('users.updated', 'Updated')}: {importResult.updated.length}
                  </Typography.Text>
                  <Typography.Text type="danger">
                    {t('users.failed', 'Failed')}: {importResult.failed.length}
                  </Typography.Text>
                  {importResult.failed.length > 0 && (
                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                      {importResult.failed.map((f, i) => (
                        <Typography.Text key={i} type="danger" style={{ display: 'block' }}>
                          Row {f.row}: {f.errors.join(', ')}
                        </Typography.Text>
                      ))}
                    </div>
                  )}
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
            {
              title: t('users.date', 'Date'),
              dataIndex: 'created_at',
              render: (v: string) => new Date(v).toLocaleString(),
            },
            { title: t('users.fileName', 'File Name'), dataIndex: 'file_name' },
            { title: t('users.admin', 'Admin'), dataIndex: 'admin_name' },
            { title: t('users.totalRows', 'Total'), dataIndex: 'total_rows' },
            {
              title: t('users.created', 'Created'),
              dataIndex: 'created_count',
              render: (v: number) => <Tag color="green">{v}</Tag>,
            },
            {
              title: t('users.updated', 'Updated'),
              dataIndex: 'updated_count',
              render: (v: number) => <Tag color="orange">{v}</Tag>,
            },
            {
              title: t('users.failed', 'Failed'),
              dataIndex: 'failed_count',
              render: (v: number) => (v > 0 ? <Tag color="red">{v}</Tag> : <Tag>{v}</Tag>),
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Modal>

      {/* Role Swap History Modal */}
      <Modal
        title={t('users.swapHistory', 'Role Swap History')}
        open={swapHistoryModalOpen}
        onCancel={() => {
          setSwapHistoryModalOpen(false);
          setSwapHistoryUser(null);
        }}
        footer={null}
        width={600}
      >
        {swapHistoryUser && (
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('users.userName', 'User')}>
              {swapHistoryUser.full_name}
            </Descriptions.Item>
            <Descriptions.Item label={t('users.currentRole', 'Current Role')}>
              <Tag color={roleColorMap[swapHistoryUser.role]}>
                {swapHistoryUser.role.replace('_', ' ').toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('users.currentMinorRole', 'Current Minor Role')}>
              {swapHistoryUser.minor_role ? (
                <Tag color={roleColorMap[swapHistoryUser.minor_role]}>
                  {swapHistoryUser.minor_role.replace('_', ' ').toUpperCase()}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
          </Descriptions>
        )}

        {swapHistoryLoading ? (
          <Typography.Text>{t('common.loading', 'Loading...')}</Typography.Text>
        ) : (swapHistoryData?.data?.data || []).length === 0 ? (
          <Typography.Text type="secondary">
            {t('users.noSwapHistory', 'No role swap history found')}
          </Typography.Text>
        ) : (
          <Timeline
            items={(swapHistoryData?.data?.data || []).map((log: RoleSwapLog) => ({
              color: 'blue',
              children: (
                <div>
                  <Typography.Text strong>
                    {new Date(log.created_at).toLocaleString()}
                  </Typography.Text>
                  <br />
                  <Typography.Text>
                    {log.old_role.replace('_', ' ')} ({log.old_role_id}) → {log.new_role.replace('_', ' ')} ({log.new_role_id})
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    {t('users.by', 'By')}: {log.admin_name}
                  </Typography.Text>
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </Card>
  );
}
// BUILD: 1770489400
