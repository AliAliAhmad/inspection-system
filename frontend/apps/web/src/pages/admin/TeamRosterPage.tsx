import { useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Upload,
  Modal,
  Drawer,
  Form,
  Select,
  DatePicker,
  Input,
  InputNumber,
  message,
  Typography,
  Alert,
  Statistic,
  Divider,
} from 'antd';
import { UploadOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rosterApi, leavesApi, usersApi, type RosterWeekUser, type LeaveRequestPayload } from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const ROLE_ORDER: Record<string, number> = {
  inspector: 0,
  specialist: 1,
  engineer: 2,
  quality_engineer: 3,
};

const ROLE_COLORS: Record<string, string> = {
  inspector: 'blue',
  specialist: 'orange',
  engineer: 'green',
  quality_engineer: 'purple',
  admin: 'red',
};

function shiftTag(value: string | undefined) {
  if (!value) return <Text type="secondary">-</Text>;
  switch (value) {
    case 'day':
      return <Tag color="blue">D</Tag>;
    case 'night':
      return <Tag color="purple">N</Tag>;
    case 'off':
      return <Tag color="default">Off</Tag>;
    case 'leave':
      return <Tag color="red">Leave</Tag>;
    default:
      return <Text type="secondary">-</Text>;
  }
}

export default function TeamRosterPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [selectedUserRole, setSelectedUserRole] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    users_processed: number;
    errors: string[];
  } | null>(null);

  const [leaveForm] = Form.useForm();
  const [addDaysForm] = Form.useForm();

  const baseDate = dayjs().add(weekOffset * 7, 'day').format('YYYY-MM-DD');

  // Fetch week data
  const { data: weekData, isLoading } = useQuery({
    queryKey: ['roster', 'week', baseDate],
    queryFn: () => rosterApi.getWeek(baseDate).then((r) => r.data.data),
  });

  // Fetch leave balance when drawer is open
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['leaves', 'balance', selectedUserId],
    queryFn: () => leavesApi.getBalance(selectedUserId!).then((r) => r.data.data ?? (r.data as any).data),
    enabled: !!selectedUserId,
  });

  // Fetch active users for coverage dropdown
  const { data: activeUsersRaw } = useQuery({
    queryKey: ['users', 'active-list'],
    queryFn: () => usersApi.list({ per_page: 500 }),
    enabled: !!selectedUserId,
  });
  const allActiveUsers: any[] = (activeUsersRaw?.data as any)?.data ?? [];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => rosterApi.upload(file),
    onSuccess: (res) => {
      const result = (res.data as any).data ?? res.data;
      setUploadResult({
        imported: result.imported ?? 0,
        users_processed: result.users_processed ?? 0,
        errors: result.errors ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['roster'] });
      message.success(
        t('roster.uploadSuccess', '{{count}} entries imported', { count: result.imported ?? 0 }),
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to upload roster';
      message.error(msg);
    },
  });

  // Leave request mutation
  const leaveRequestMutation = useMutation({
    mutationFn: (payload: LeaveRequestPayload) => leavesApi.request(payload),
    onSuccess: () => {
      message.success(t('leaves.requestSuccess', 'Leave request submitted successfully'));
      leaveForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['leaves', 'balance', selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to submit leave request';
      message.error(msg);
    },
  });

  // Add leave days mutation
  const addDaysMutation = useMutation({
    mutationFn: (payload: { userId: number; days: number; reason: string }) =>
      leavesApi.addDays(payload.userId, payload.days, payload.reason),
    onSuccess: () => {
      message.success(t('leaves.addDaysSuccess', 'Leave days added successfully'));
      addDaysForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['leaves', 'balance', selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to add leave days';
      message.error(msg);
    },
  });

  // Sort users by role order
  const sortedUsers = [...(weekData?.users ?? [])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99),
  );

  const dates = weekData?.dates ?? [];

  // Calculate date range for display
  const rangeStart = dates.length > 0 ? dayjs(dates[0]) : dayjs().add(weekOffset * 7, 'day');
  const rangeEnd = dates.length > 0 ? dayjs(dates[dates.length - 1]) : rangeStart.add(7, 'day');

  // Coverage user options: inspectors covered by specialists, specialists covered by inspectors
  const coverageUsers = allActiveUsers.filter((u: any) => {
    if (u.id === selectedUserId) return false;
    if (selectedUserRole === 'inspector') return u.role === 'specialist';
    if (selectedUserRole === 'specialist') return u.role === 'inspector';
    return true;
  });

  // Leave history columns
  const leaveHistoryColumns = [
    {
      title: t('leaves.type', 'Type'),
      dataIndex: 'leave_type',
      key: 'leave_type',
      render: (val: string) => <Tag>{val}</Tag>,
    },
    {
      title: t('leaves.from', 'From'),
      dataIndex: 'date_from',
      key: 'date_from',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY'),
    },
    {
      title: t('leaves.to', 'To'),
      dataIndex: 'date_to',
      key: 'date_to',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY'),
    },
    {
      title: t('leaves.days', 'Days'),
      dataIndex: 'total_days',
      key: 'total_days',
    },
    {
      title: t('leaves.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const color = val === 'approved' ? 'green' : val === 'rejected' ? 'red' : 'orange';
        return <Tag color={color}>{val}</Tag>;
      },
    },
    {
      title: t('leaves.coverage', 'Coverage'),
      dataIndex: 'coverage_user',
      key: 'coverage_user',
      render: (val: any) => val?.full_name ?? '-',
    },
  ];

  // Handle leave form submit
  const handleLeaveSubmit = (values: any) => {
    const [dateFrom, dateTo] = values.date_range;
    leaveRequestMutation.mutate({
      user_id: selectedUserId!,
      leave_type: values.leave_type as LeaveRequestPayload['leave_type'],
      date_from: dateFrom.format('YYYY-MM-DD'),
      date_to: dateTo.format('YYYY-MM-DD'),
      reason: values.reason,
      scope: values.scope,
      coverage_user_id: values.coverage_user_id,
    });
  };

  // Handle add days submit
  const handleAddDays = (values: any) => {
    addDaysMutation.mutate({
      userId: selectedUserId!,
      days: values.days,
      reason: values.reason,
    });
  };

  // Build table columns
  const columns = [
    {
      title: t('roster.teamMember', 'Team Member'),
      key: 'user',
      fixed: 'left' as const,
      width: 220,
      render: (_: unknown, record: RosterWeekUser) => {
        const leaveUsed = record.leave_used ?? 0;
        const leaveBalance = record.leave_remaining ?? 0;
        return (
          <Space direction="vertical" size={2}>
            <Text strong>
              {record.full_name}
            </Text>
            <Space size={4}>
              <Tag color={ROLE_COLORS[record.role] ?? 'default'}>{record.role}</Tag>
              {record.specialization && <Tag>{record.specialization}</Tag>}
            </Space>
            <Space size={8}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Taken: {leaveUsed}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: leaveBalance === 0 ? '#ff4d4f' : undefined,
                }}
                type={leaveBalance === 0 ? undefined : 'secondary'}
              >
                Balance: {leaveBalance}
              </Text>
            </Space>
          </Space>
        );
      },
    },
    ...dates.map((date) => ({
      title: (
        <div style={{ textAlign: 'center' }}>
          <div>{dayjs(date).format('ddd')}</div>
          <div>{dayjs(date).format('DD/MM')}</div>
        </div>
      ),
      key: date,
      width: 80,
      align: 'center' as const,
      render: (_: unknown, record: RosterWeekUser) => shiftTag(record.entries[date]),
    })),
  ];

  const isAdmin = currentUser?.role === 'admin';
  const remaining = balanceData?.remaining ?? 0;

  return (
    <Card
      title={
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('nav.roster', 'Team Roster')}
        </Typography.Title>
      }
      extra={
        <Space>
          <Upload
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={(file) => {
              uploadMutation.mutate(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploadMutation.isPending}>
              {t('roster.importRoster', 'Import Roster')}
            </Button>
          </Upload>
        </Space>
      }
    >
      {/* Date navigation */}
      <Space style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)}>
          {t('roster.prevWeek', 'Prev Week')}
        </Button>
        <Button type="text" onClick={() => setWeekOffset(0)}>
          <Text strong>
            {rangeStart.format('DD MMM')} - {rangeEnd.format('DD MMM YYYY')}
          </Text>
        </Button>
        <Button onClick={() => setWeekOffset((o) => o + 1)}>
          {t('roster.nextWeek', 'Next Week')} <RightOutlined />
        </Button>
      </Space>

      {/* Weekly calendar table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={sortedUsers}
        loading={isLoading}
        pagination={false}
        scroll={{ x: 900 }}
        size="small"
        bordered
        locale={{ emptyText: t('common.noData', 'No data available') }}
        onRow={(record) => ({
          onClick: () => {
            setSelectedUserId(record.id);
            setSelectedUserName(record.full_name);
            setSelectedUserRole(record.role);
          },
          style: { cursor: 'pointer' },
        })}
      />

      {/* Employee Leave Drawer */}
      <Drawer
        title={selectedUserName}
        open={!!selectedUserId}
        onClose={() => {
          setSelectedUserId(null);
          setSelectedUserName('');
          setSelectedUserRole('');
          leaveForm.resetFields();
          addDaysForm.resetFields();
        }}
        width={600}
        footer={null}
      >
        {balanceLoading ? (
          <Text type="secondary">{t('common.loading', 'Loading...')}</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {/* Leave balance statistics */}
            <Space size="large">
              <Statistic
                title={t('leaves.totalBalance', 'Total Balance')}
                value={balanceData?.total_balance ?? 0}
              />
              <Statistic
                title={t('leaves.used', 'Used')}
                value={balanceData?.used ?? 0}
              />
              <Statistic
                title={t('leaves.remaining', 'Remaining')}
                value={remaining}
                valueStyle={remaining === 0 ? { color: '#ff4d4f' } : undefined}
              />
            </Space>

            {remaining === 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('leaves.noBalanceRemaining', 'No leave balance remaining')}
              />
            )}

            <Divider />

            {/* Leave history table */}
            <Typography.Title level={5}>
              {t('leaves.history', 'Leave History')}
            </Typography.Title>
            <Table
              rowKey={(record: any) => record.id ?? `${record.date_from}-${record.date_to}`}
              columns={leaveHistoryColumns}
              dataSource={balanceData?.leaves ?? []}
              pagination={false}
              size="small"
              bordered
              locale={{ emptyText: t('leaves.noHistory', 'No leave history') }}
            />

            {/* Request Leave Form */}
            {remaining > 0 && (
              <>
                <Divider />
                <Typography.Title level={5}>
                  {t('leaves.requestLeave', 'Request Leave')}
                </Typography.Title>
                <Form
                  form={leaveForm}
                  layout="vertical"
                  onFinish={handleLeaveSubmit}
                >
                  <Form.Item
                    name="leave_type"
                    label={t('leaves.leaveType', 'Leave Type')}
                    rules={[{ required: true, message: t('leaves.leaveTypeRequired', 'Please select a leave type') }]}
                  >
                    <Select placeholder={t('leaves.selectType', 'Select leave type')}>
                      <Select.Option value="sick">{t('leaves.sick', 'Sick')}</Select.Option>
                      <Select.Option value="annual">{t('leaves.annual', 'Annual')}</Select.Option>
                      <Select.Option value="emergency">{t('leaves.emergency', 'Emergency')}</Select.Option>
                      <Select.Option value="training">{t('leaves.training', 'Training')}</Select.Option>
                      <Select.Option value="other">{t('leaves.other', 'Other')}</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    name="date_range"
                    label={t('leaves.dateRange', 'Date Range')}
                    rules={[{ required: true, message: t('leaves.dateRangeRequired', 'Please select date range') }]}
                  >
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    name="reason"
                    label={t('leaves.reason', 'Reason')}
                    rules={[{ required: true, message: t('leaves.reasonRequired', 'Please provide a reason') }]}
                  >
                    <TextArea rows={3} placeholder={t('leaves.reasonPlaceholder', 'Enter reason for leave')} />
                  </Form.Item>

                  <Form.Item
                    name="coverage_user_id"
                    label={t('leaves.coverageEmployee', 'Coverage Employee')}
                    rules={[{ required: true, message: t('leaves.coverageRequired', 'Coverage employee is required') }]}
                  >
                    <Select
                      placeholder={t('leaves.selectCoverage', 'Select coverage employee')}
                      showSearch
                      optionFilterProp="label"
                      options={coverageUsers.map((u: any) => ({
                        value: u.id,
                        label: `${u.full_name} — ${u.employee_id ?? u.id} (${u.role})`,
                      }))}
                    />
                  </Form.Item>

                  <Form.Item
                    name="scope"
                    label={t('leaves.scope', 'Scope')}
                    rules={[{ required: true, message: t('leaves.scopeRequired', 'Please select scope') }]}
                  >
                    <Select placeholder={t('leaves.selectScope', 'Select scope')}>
                      <Select.Option value="full">{t('leaves.full', 'Full')}</Select.Option>
                      <Select.Option value="major_only">{t('leaves.majorOnly', 'Major Only')}</Select.Option>
                    </Select>
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={leaveRequestMutation.isPending}
                      block
                    >
                      {t('leaves.submitRequest', 'Submit Leave Request')}
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}

            {/* Add Leave Days - Admin Only */}
            {isAdmin && (
              <>
                <Divider />
                <Typography.Title level={5}>
                  {t('leaves.addLeaveDays', 'Add Leave Days')}
                </Typography.Title>
                <Form
                  form={addDaysForm}
                  layout="vertical"
                  onFinish={handleAddDays}
                >
                  <Form.Item
                    name="days"
                    label={t('leaves.numberOfDays', 'Number of Days')}
                    rules={[{ required: true, message: t('leaves.daysRequired', 'Please enter number of days') }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} placeholder={t('leaves.enterDays', 'Enter days')} />
                  </Form.Item>

                  <Form.Item
                    name="reason"
                    label={t('leaves.reason', 'Reason')}
                    rules={[{ required: true, message: t('leaves.reasonRequired', 'Please provide a reason') }]}
                  >
                    <TextArea rows={2} placeholder={t('leaves.addDaysReasonPlaceholder', 'Reason for adding days')} />
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="default"
                      htmlType="submit"
                      loading={addDaysMutation.isPending}
                      block
                    >
                      {t('leaves.addDaysButton', 'Add Days')}
                    </Button>
                  </Form.Item>
                </Form>
              </>
            )}
          </Space>
        )}
      </Drawer>

      {/* Upload Result Modal */}
      <Modal
        title={t('roster.uploadResult', 'Roster Upload Result')}
        open={uploadResult !== null}
        onCancel={() => setUploadResult(null)}
        onOk={() => setUploadResult(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        {uploadResult && (
          <>
            <p>
              <strong>{uploadResult.imported}</strong>{' '}
              {t('roster.entriesImported', 'entries imported')} {t('roster.forUsers', 'for')}{' '}
              <strong>{uploadResult.users_processed}</strong> {t('roster.users', 'users')}.
            </p>
            {uploadResult.errors.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={t('roster.uploadWarnings', '{{count}} warnings', {
                  count: uploadResult.errors.length,
                })}
                description={
                  <ul
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      paddingLeft: 16,
                      margin: 0,
                    }}
                  >
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                }
              />
            )}
          </>
        )}
      </Modal>
    </Card>
  );
}
