import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Switch,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Popconfirm,
  message,
  Spin,
  Empty,
  Typography,
  Row,
  Col,
  Tooltip,
  Avatar,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  CalendarOutlined,
  TeamOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  leavesApi,
  usersApi,
  LeaveBlackout,
  CreateBlackoutPayload,
  UpdateBlackoutPayload,
} from '@inspection/shared';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

interface LeaveBlackoutManagerProps {
  onBlackoutCreated?: (blackout: LeaveBlackout) => void;
  onBlackoutUpdated?: (blackout: LeaveBlackout) => void;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'specialist', label: 'Specialist' },
];

export function LeaveBlackoutManager({
  onBlackoutCreated,
  onBlackoutUpdated,
}: LeaveBlackoutManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlackout, setEditingBlackout] = useState<LeaveBlackout | null>(null);
  const [form] = Form.useForm();

  // Fetch blackouts
  const { data, isLoading } = useQuery({
    queryKey: ['leave-blackouts'],
    queryFn: () => leavesApi.listBlackouts().then((r) => r.data),
  });

  const blackouts: LeaveBlackout[] = data?.data || [];

  // Fetch users for exception selector
  const { data: usersData } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }),
  });

  const users = (usersData?.data as any)?.data || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateBlackoutPayload) => leavesApi.createBlackout(payload),
    onSuccess: (response) => {
      message.success(t('leaves.blackoutCreated', 'Blackout period created successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-blackouts'] });
      onBlackoutCreated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateBlackoutPayload }) =>
      leavesApi.updateBlackout(id, payload),
    onSuccess: (response) => {
      message.success(t('leaves.blackoutUpdated', 'Blackout period updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-blackouts'] });
      onBlackoutUpdated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leavesApi.deleteBlackout(id),
    onSuccess: () => {
      message.success(t('leaves.blackoutDeleted', 'Blackout period deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-blackouts'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      leavesApi.updateBlackout(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-blackouts'] });
    },
  });

  const handleOpenModal = (blackout?: LeaveBlackout) => {
    if (blackout) {
      setEditingBlackout(blackout);
      form.setFieldsValue({
        name: blackout.name,
        name_ar: blackout.name_ar,
        date_range: [dayjs(blackout.date_from), dayjs(blackout.date_to)],
        reason: blackout.reason,
        applies_to_roles: blackout.applies_to_roles || [],
        exception_user_ids: blackout.exception_user_ids || [],
      });
    } else {
      setEditingBlackout(null);
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBlackout(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: CreateBlackoutPayload = {
        name: values.name,
        name_ar: values.name_ar,
        date_from: values.date_range[0].format('YYYY-MM-DD'),
        date_to: values.date_range[1].format('YYYY-MM-DD'),
        reason: values.reason,
        applies_to_roles: values.applies_to_roles?.length > 0 ? values.applies_to_roles : undefined,
        exception_user_ids:
          values.exception_user_ids?.length > 0 ? values.exception_user_ids : undefined,
      };

      if (editingBlackout) {
        updateMutation.mutate({ id: editingBlackout.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // Validation failed
    }
  };

  const isBlackoutActive = (blackout: LeaveBlackout) => {
    const today = dayjs();
    return (
      blackout.is_active &&
      today.isAfter(dayjs(blackout.date_from).subtract(1, 'day')) &&
      today.isBefore(dayjs(blackout.date_to).add(1, 'day'))
    );
  };

  const isBlackoutUpcoming = (blackout: LeaveBlackout) => {
    const today = dayjs();
    return blackout.is_active && today.isBefore(dayjs(blackout.date_from));
  };

  const columns = [
    {
      title: t('leaves.blackoutName', 'Blackout Period'),
      key: 'name',
      render: (_: any, record: LeaveBlackout) => (
        <Space direction="vertical" size={0}>
          <Space>
            <Text strong>{record.name}</Text>
            {isBlackoutActive(record) && (
              <Tag color="error">{t('leaves.active', 'Active')}</Tag>
            )}
            {isBlackoutUpcoming(record) && (
              <Tag color="warning">{t('leaves.upcoming', 'Upcoming')}</Tag>
            )}
          </Space>
          {record.name_ar && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.name_ar}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('leaves.dateRange', 'Date Range'),
      key: 'dates',
      render: (_: any, record: LeaveBlackout) => (
        <Space>
          <CalendarOutlined />
          <Text>
            {dayjs(record.date_from).format('MMM D, YYYY')} -{' '}
            {dayjs(record.date_to).format('MMM D, YYYY')}
          </Text>
          <Text type="secondary">
            ({dayjs(record.date_to).diff(dayjs(record.date_from), 'day') + 1} days)
          </Text>
        </Space>
      ),
    },
    {
      title: t('leaves.appliesTo', 'Applies To'),
      key: 'applies_to',
      render: (_: any, record: LeaveBlackout) => {
        const roles = record.applies_to_roles || [];
        return roles.length > 0 ? (
          <Space size={4}>
            {roles.slice(0, 2).map((role) => (
              <Tag key={role} icon={<TeamOutlined />}>
                {role}
              </Tag>
            ))}
            {roles.length > 2 && <Tag>+{roles.length - 2}</Tag>}
          </Space>
        ) : (
          <Tag color="blue">{t('leaves.allRoles', 'All Roles')}</Tag>
        );
      },
    },
    {
      title: t('leaves.exceptions', 'Exceptions'),
      key: 'exceptions',
      render: (_: any, record: LeaveBlackout) => {
        const exceptionCount = record.exception_user_ids?.length || 0;
        return exceptionCount > 0 ? (
          <Tooltip
            title={t('leaves.usersExempted', '{{count}} users exempted from this blackout', {
              count: exceptionCount,
            })}
          >
            <Tag color="green">
              <UserOutlined /> {exceptionCount} {t('leaves.exempt', 'exempt')}
            </Tag>
          </Tooltip>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: t('common.status', 'Status'),
      key: 'is_active',
      render: (_: any, record: LeaveBlackout) => (
        <Switch
          checked={record.is_active}
          onChange={(checked) =>
            toggleActiveMutation.mutate({ id: record.id, is_active: checked })
          }
          loading={toggleActiveMutation.isPending}
        />
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: any, record: LeaveBlackout) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title={t('leaves.confirmDeleteBlackout', 'Delete this blackout period?')}
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title={
          <Space>
            <StopOutlined style={{ color: '#ff4d4f' }} />
            {t('leaves.blackoutPeriods', 'Blackout Periods')}
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('leaves.addBlackout', 'Add Blackout')}
          </Button>
        }
      >
        <div
          style={{
            padding: 12,
            backgroundColor: '#fff7e6',
            borderRadius: 8,
            marginBottom: 16,
            border: '1px solid #ffd591',
          }}
        >
          <Space>
            <ExclamationCircleOutlined style={{ color: '#fa8c16' }} />
            <Text>
              {t(
                'leaves.blackoutExplanation',
                'Blackout periods prevent employees from requesting leave during critical business periods.'
              )}
            </Text>
          </Space>
        </div>

        {blackouts.length === 0 ? (
          <Empty
            description={t('leaves.noBlackouts', 'No blackout periods configured')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              {t('leaves.createFirstBlackout', 'Create Your First Blackout Period')}
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={blackouts}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          editingBlackout
            ? t('leaves.editBlackout', 'Edit Blackout Period')
            : t('leaves.addBlackout', 'Add Blackout Period')
        }
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label={t('leaves.blackoutName', 'Name')}
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="e.g., Year-End Closure" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name_ar" label={t('leaves.arabicName', 'Arabic Name')}>
                <Input placeholder="e.g., اغلاق نهاية السنة" dir="rtl" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="date_range"
            label={t('leaves.dateRange', 'Date Range')}
            rules={[{ required: true, message: 'Please select date range' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="reason" label={t('leaves.reason', 'Reason')}>
            <Input.TextArea
              rows={2}
              placeholder="e.g., Critical business period - all staff required"
            />
          </Form.Item>

          <Form.Item name="applies_to_roles" label={t('leaves.appliesTo', 'Applies To Roles')}>
            <Select
              mode="multiple"
              placeholder={t('leaves.selectRoles', 'Select roles (leave empty for all roles)')}
              options={ROLE_OPTIONS}
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="exception_user_ids"
            label={t('leaves.exceptionUsers', 'Exception Users')}
          >
            <Select
              mode="multiple"
              placeholder={t('leaves.selectExceptions', 'Select users exempt from this blackout')}
              showSearch
              optionFilterProp="children"
              allowClear
            >
              {users.map((user: any) => (
                <Select.Option key={user.id} value={user.id}>
                  <Space>
                    <Avatar size="small" icon={<UserOutlined />} />
                    {user.full_name}
                    <Text type="secondary">({user.role})</Text>
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export default LeaveBlackoutManager;
