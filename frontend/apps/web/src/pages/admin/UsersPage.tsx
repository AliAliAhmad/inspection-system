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
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  usersApi,
  type User,
  type UserRole,
  type CreateUserPayload,
  type UpdateUserPayload,
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
    onError: () => {
      message.error(t('users.createError', 'Failed to create user'));
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
      render: (_: unknown, record: User) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            {t('common.edit', 'Edit')}
          </Button>
          <Popconfirm
            title={t('users.deleteConfirm', 'Are you sure you want to delete this user?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              {t('common.delete', 'Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const users = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  return (
    <Card
      title={<Typography.Title level={4}>{t('nav.users', 'Users Management')}</Typography.Title>}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          {t('users.create', 'Create User')}
        </Button>
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
    </Card>
  );
}
