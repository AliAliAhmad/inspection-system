import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  Input,
  DatePicker,
  message,
  Typography,
  Statistic,
  Row,
  Col,
  Alert,
} from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../providers/AuthProvider';
import { leavesApi, usersApi, Leave, LeaveStatus, LeaveType } from '@inspection/shared';
import { formatDate } from '@inspection/shared';
import dayjs from 'dayjs';

const statusColors: Record<LeaveStatus, string> = {
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
};

const leaveTypes: LeaveType[] = ['sick', 'annual', 'emergency', 'training', 'other'];

export default function LeavesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | undefined>();
  const [page, setPage] = useState(1);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['leaves', page, statusFilter],
    queryFn: () => leavesApi.list({ page, per_page: 15, status: statusFilter }).then(r => r.data),
  });

  // Fetch current user's leave balance
  const { data: balanceData } = useQuery({
    queryKey: ['leaves', 'balance', user?.id],
    queryFn: () => leavesApi.getBalance(user!.id).then(r => r.data.data ?? (r.data as any).data),
    enabled: !!user?.id,
  });

  const totalBalance = balanceData?.total_balance ?? 0;
  const usedDays = balanceData?.used ?? 0;
  const remaining = balanceData?.remaining ?? 0;

  // Fetch all active users for coverage dropdown
  const { data: allUsersData } = useQuery({
    queryKey: ['users', 'all-active'],
    queryFn: () => usersApi.list({ per_page: 500, is_active: true }),
  });
  const allUsers = (allUsersData?.data as any)?.data ?? [];

  const requestMutation = useMutation({
    mutationFn: leavesApi.request,
    onSuccess: () => {
      message.success('Leave request submitted');
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.error || t('common.error'));
    },
  });

  const handleSubmit = (values: any) => {
    requestMutation.mutate({
      leave_type: values.leave_type,
      date_from: values.dates[0].format('YYYY-MM-DD'),
      date_to: values.dates[1].format('YYYY-MM-DD'),
      reason: values.reason,
      scope: values.scope,
      coverage_user_id: values.coverage_user_id,
    });
  };

  const isAdmin = user?.role === 'admin';

  const columns = [
    ...(isAdmin ? [{
      title: t('leave.employee', 'Employee'),
      dataIndex: 'user',
      key: 'user',
      render: (u: any) => u ? (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{u.full_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {u.employee_id ?? u.role_id} · {u.role}
          </Typography.Text>
        </Space>
      ) : '-',
    }] : []),
    {
      title: t('leave.type'),
      dataIndex: 'leave_type',
      render: (type: LeaveType) => <Tag>{t(`leave.${type}`)}</Tag>,
    },
    {
      title: t('leave.date_from'),
      dataIndex: 'date_from',
      render: (d: string) => formatDate(d),
    },
    {
      title: t('leave.date_to'),
      dataIndex: 'date_to',
      render: (d: string) => formatDate(d),
    },
    {
      title: 'Days',
      dataIndex: 'total_days',
      width: 80,
    },
    {
      title: t('leave.reason'),
      dataIndex: 'reason',
      ellipsis: true,
    },
    {
      title: t('leaves.coverage', 'Coverage'),
      dataIndex: 'coverage_user',
      key: 'coverage_user',
      render: (u: any) => u ? u.full_name : '-',
    },
    {
      title: t('leave.scope', 'Scope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (s: string) => s === 'major_only' ? 'Major Only' : 'Full',
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      render: (status: LeaveStatus) => (
        <Tag color={statusColors[status]}>{t(`status.${status}`)}</Tag>
      ),
    },
  ];

  const leaves = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={32}>
          <Col>
            <Statistic
              title={t('leaves.totalBalance', 'Total Balance')}
              value={totalBalance}
              suffix={t('leaves.daysUnit', 'days')}
            />
          </Col>
          <Col>
            <Statistic
              title={t('leaves.used', 'Used')}
              value={usedDays}
              suffix={t('leaves.daysUnit', 'days')}
              valueStyle={usedDays > 0 ? { color: '#faad14' } : undefined}
            />
          </Col>
          <Col>
            <Statistic
              title={t('leaves.remaining', 'Remaining')}
              value={remaining}
              suffix={t('leaves.daysUnit', 'days')}
              valueStyle={remaining === 0 ? { color: '#ff4d4f' } : { color: '#52c41a' }}
            />
          </Col>
          <Col>
            <Statistic
              title={t('leaves.employeeId', 'Employee ID')}
              value={user?.employee_id ?? '-'}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>
          <Col>
            <Statistic
              title={t('leaves.role', 'Role')}
              value={user?.role ?? '-'}
              valueStyle={{ fontSize: 16 }}
            />
          </Col>
        </Row>
        {remaining === 0 && (
          <Alert
            type="warning"
            showIcon
            message={t('leaves.noBalanceRemaining', 'No leave balance remaining')}
            style={{ marginTop: 12 }}
          />
        )}
      </Card>

      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>{t('nav.leaves')}</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              placeholder="Filter by status"
              allowClear
              style={{ width: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'pending', label: t('status.pending') },
                { value: 'approved', label: t('status.approved') },
                { value: 'rejected', label: t('status.rejected') },
              ]}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} disabled={remaining === 0}>
              {t('leave.request')}
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={leaves}
          loading={isLoading}
          rowKey="id"
          pagination={pagination ? {
            current: pagination.page,
            total: pagination.total,
            pageSize: pagination.per_page,
            onChange: setPage,
          } : false}
        />
      </Card>

      <Modal
        title={t('leave.request')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="leave_type"
            label={t('leave.type')}
            rules={[{ required: true }]}
          >
            <Select options={leaveTypes.map(lt => ({ value: lt, label: t(`leave.${lt}`) }))} />
          </Form.Item>

          <Form.Item
            name="dates"
            label={`${t('leave.date_from')} - ${t('leave.date_to')}`}
            rules={[{ required: true }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="reason"
            label={t('leave.reason')}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            name="coverage_user_id"
            label={t('leave.coverage', 'Coverage Employee')}
            rules={[{ required: true, message: t('leave.coverageRequired', 'Please select a coverage employee') }]}
          >
            <Select
              showSearch
              optionFilterProp="children"
              placeholder={t('leave.assign_coverage', 'Select coverage employee')}
            >
              {allUsers
                .filter((u: any) => {
                  if (u.id === user?.id) return false;
                  if (user?.role === 'inspector') return u.role === 'specialist';
                  if (user?.role === 'specialist') return u.role === 'inspector';
                  return true;
                })
                .map((u: any) => (
                  <Select.Option key={u.id} value={u.id}>
                    {u.full_name} — {u.employee_id} ({u.role})
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item name="scope" label="Scope" initialValue="full">
            <Select
              options={[
                { value: 'full', label: 'Full Leave' },
                { value: 'major_only', label: 'Major Tasks Only' },
              ]}
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={requestMutation.isPending} block>
              {t('common.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
