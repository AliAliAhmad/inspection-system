import { useState, useMemo } from 'react';
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
  Row,
  Col,
  Progress,
  List,
  Avatar,
  Tooltip,
  Spin,
} from 'antd';
import {
  UploadOutlined,
  LeftOutlined,
  RightOutlined,
  TeamOutlined,
  BulbOutlined,
  UserOutlined,
  CheckCircleOutlined,
  StarOutlined,
  SwapOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  rosterApi,
  leavesApi,
  usersApi,
  type RosterWeekUser,
  type LeaveRequestPayload,
  type CoverageSuggestion,
  type ShiftSwapRequest,
  type FatigueAlert,
  type LeaveBlackout,
  type CreateBlackoutPayload,
} from '@inspection/shared';
import { useAuth } from '../../providers/AuthProvider';
import { CoverageScoreCard, WorkloadBar, getWorkloadStatus } from '../../components/shared';
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
  const [selectedUserSpec, setSelectedUserSpec] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    users_processed: number;
    errors: string[];
  } | null>(null);

  const [leaveForm] = Form.useForm();
  const [addDaysForm] = Form.useForm();

  const baseDate = dayjs().add(weekOffset * 7, 'day').format('YYYY-MM-DD');
  const isAdmin = currentUser?.role === 'admin';

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

  // Fetch coverage score data
  const { data: coverageData, isLoading: coverageLoading } = useQuery({
    queryKey: ['roster', 'coverage-score', baseDate],
    queryFn: () => rosterApi.getCoverageScore(baseDate).then((r) => r.data.data),
  });

  // Fetch workload data
  const { data: workloadData, isLoading: workloadLoading } = useQuery({
    queryKey: ['roster', 'workload', baseDate],
    queryFn: () => rosterApi.getWorkload(baseDate, 'week').then((r) => r.data.data),
  });

  // AI coverage suggestions state
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [aiSuggestionsDateRange, setAiSuggestionsDateRange] = useState<[string, string] | null>(null);

  // Fetch AI coverage suggestions
  const { data: aiSuggestionsData, isLoading: aiSuggestionsLoading, refetch: refetchAiSuggestions } = useQuery({
    queryKey: ['roster', 'ai-suggestions', selectedUserId, aiSuggestionsDateRange],
    queryFn: () => {
      if (!selectedUserId || !aiSuggestionsDateRange) return null;
      return rosterApi.suggestCoverage(selectedUserId, aiSuggestionsDateRange[0], aiSuggestionsDateRange[1])
        .then((r) => r.data.data);
    },
    enabled: !!selectedUserId && !!aiSuggestionsDateRange && showAISuggestions,
  });

  // Shift Swap state
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapForm] = Form.useForm();

  // Blackout Periods state
  const [blackoutDrawerOpen, setBlackoutDrawerOpen] = useState(false);
  const [blackoutForm] = Form.useForm();
  const [editingBlackout, setEditingBlackout] = useState<LeaveBlackout | null>(null);

  // Fetch pending swap requests (for admin)
  const { data: swapRequestsData, refetch: refetchSwapRequests } = useQuery({
    queryKey: ['roster', 'swap-requests', 'pending'],
    queryFn: () => rosterApi.listSwapRequests({ status: 'pending' }).then((r) => r.data.data),
    enabled: isAdmin,
  });

  // Fetch fatigue alerts
  const { data: fatigueAlertsData } = useQuery({
    queryKey: ['roster', 'fatigue-alerts', baseDate],
    queryFn: () => rosterApi.getFatigueAlerts(baseDate).then((r) => r.data.data),
  });

  // Fetch blackout periods
  const { data: blackoutsData, refetch: refetchBlackouts } = useQuery({
    queryKey: ['leaves', 'blackouts'],
    queryFn: () => leavesApi.listBlackouts({ is_active: true }).then((r) => r.data.data ?? []),
  });

  // Blackout mutations
  const createBlackoutMutation = useMutation({
    mutationFn: (payload: CreateBlackoutPayload) => leavesApi.createBlackout(payload),
    onSuccess: () => {
      message.success(t('roster.blackoutCreated', 'Blackout period created'));
      blackoutForm.resetFields();
      setEditingBlackout(null);
      refetchBlackouts();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to create blackout');
    },
  });

  const updateBlackoutMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CreateBlackoutPayload & { is_active: boolean }> }) =>
      leavesApi.updateBlackout(id, payload),
    onSuccess: () => {
      message.success(t('roster.blackoutUpdated', 'Blackout period updated'));
      blackoutForm.resetFields();
      setEditingBlackout(null);
      refetchBlackouts();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to update blackout');
    },
  });

  const deleteBlackoutMutation = useMutation({
    mutationFn: (id: number) => leavesApi.deleteBlackout(id),
    onSuccess: () => {
      message.success(t('roster.blackoutDeleted', 'Blackout period deleted'));
      refetchBlackouts();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to delete blackout');
    },
  });

  // Swap request mutations
  const createSwapMutation = useMutation({
    mutationFn: (payload: { target_user_id: number; requester_date: string; target_date: string; reason?: string }) =>
      rosterApi.createSwapRequest(payload),
    onSuccess: () => {
      message.success(t('roster.swapRequested', 'Swap request submitted'));
      swapForm.resetFields();
      setSwapModalOpen(false);
      refetchSwapRequests();
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to create swap request');
    },
  });

  const respondSwapMutation = useMutation({
    mutationFn: ({ id, response }: { id: number; response: 'accepted' | 'declined' }) =>
      rosterApi.respondToSwapRequest(id, response),
    onSuccess: () => {
      message.success('Response submitted');
      refetchSwapRequests();
    },
  });

  const approveSwapMutation = useMutation({
    mutationFn: (id: number) => rosterApi.approveSwapRequest(id),
    onSuccess: () => {
      message.success(t('roster.swapApproved', 'Swap approved'));
      refetchSwapRequests();
      queryClient.invalidateQueries({ queryKey: ['roster'] });
    },
  });

  const rejectSwapMutation = useMutation({
    mutationFn: (id: number) => rosterApi.rejectSwapRequest(id),
    onSuccess: () => {
      message.success(t('roster.swapRejected', 'Swap rejected'));
      refetchSwapRequests();
    },
  });

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

  // Create workload map for quick lookup
  const workloadMap = useMemo(() => {
    const map = new Map<number, { hours: number; status: 'balanced' | 'overloaded' | 'underutilized'; utilization: number }>();
    if (workloadData?.workload) {
      workloadData.workload.forEach((w) => {
        map.set(w.user_id, {
          hours: w.scheduled_hours,
          status: w.status,
          utilization: w.utilization,
        });
      });
    }
    return map;
  }, [workloadData]);

  // Transform coverage data for CoverageScoreCard
  const coverageGaps = useMemo(() => {
    if (!coverageData?.gaps) return [];
    return coverageData.gaps.flatMap((g) =>
      g.gaps.map((gap) => ({
        role: gap.role,
        required: gap.required,
        available: gap.available,
        shortage: gap.shortage,
      }))
    );
  }, [coverageData]);

  // Calculate date range for display
  const rangeStart = dates.length > 0 ? dayjs(dates[0]) : dayjs().add(weekOffset * 7, 'day');
  const rangeEnd = dates.length > 0 ? dayjs(dates[dates.length - 1]) : rangeStart.add(7, 'day');

  // Coverage user options: inspectors covered by specialists, specialists covered by inspectors
  // Same specialization required for inspector/specialist
  const coverageUsers = allActiveUsers.filter((u: any) => {
    if (u.id === selectedUserId) return false;
    if (selectedUserRole === 'inspector') {
      return u.role === 'specialist' && (!selectedUserSpec || !u.specialization || u.specialization === selectedUserSpec);
    }
    if (selectedUserRole === 'specialist') {
      return u.role === 'inspector' && (!selectedUserSpec || !u.specialization || u.specialization === selectedUserSpec);
    }
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
    {
      title: t('roster.workload', 'Workload'),
      key: 'workload',
      width: 120,
      render: (_: unknown, record: RosterWeekUser) => {
        const workload = workloadMap.get(record.id);
        if (!workload) return <Text type="secondary">-</Text>;
        return (
          <WorkloadBar
            scheduledHours={workload.hours}
            standardHours={workloadData?.standard_hours ?? 40}
            size="small"
          />
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
          <Button icon={<SwapOutlined />} onClick={() => setSwapModalOpen(true)}>
            {t('roster.requestSwap', 'Request Swap')}
          </Button>
          {isAdmin && (
            <Button icon={<StopOutlined />} onClick={() => setBlackoutDrawerOpen(true)}>
              {t('roster.blackouts', 'Blackouts')}
              {blackoutsData && blackoutsData.length > 0 && (
                <Tag color="red" style={{ marginLeft: 4 }}>{blackoutsData.length}</Tag>
              )}
            </Button>
          )}
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
      {/* Coverage Score Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          {coverageLoading ? (
            <Card size="small"><Spin size="small" /></Card>
          ) : (
            <CoverageScoreCard
              score={coverageData?.coverage_score ?? 0}
              gaps={coverageGaps}
              onLeaveCount={coverageData?.summary?.total_users ? sortedUsers.filter(u => u.is_on_leave).length : 0}
              understaffedDays={coverageData?.summary?.understaffed_days ?? 0}
            />
          )}
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><TeamOutlined />{t('roster.workloadSummary', 'Workload Summary')}</Space>}>
            {workloadLoading ? (
              <Spin size="small" />
            ) : workloadData?.summary ? (
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title={t('roster.balanced', 'Balanced')}
                    value={workloadData.summary.balanced}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('roster.overloaded', 'Overloaded')}
                    value={workloadData.summary.overloaded}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title={t('roster.underutilized', 'Underutilized')}
                    value={workloadData.summary.underutilized}
                    valueStyle={{ color: '#faad14' }}
                  />
                </Col>
              </Row>
            ) : (
              <Text type="secondary">{t('common.noData', 'No data')}</Text>
            )}
          </Card>
        </Col>
      </Row>

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
            setSelectedUserSpec(record.specialization ?? '');
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
          setSelectedUserSpec('');
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
                    label={
                      <Space>
                        {t('leaves.coverageEmployee', 'Coverage Employee')}
                        <Tooltip title={t('leaves.getAISuggestions', 'Get AI suggestions based on workload and skills')}>
                          <Button
                            type="link"
                            size="small"
                            icon={<BulbOutlined />}
                            onClick={() => {
                              const dateRange = leaveForm.getFieldValue('date_range');
                              if (dateRange && dateRange[0] && dateRange[1]) {
                                setAiSuggestionsDateRange([
                                  dateRange[0].format('YYYY-MM-DD'),
                                  dateRange[1].format('YYYY-MM-DD'),
                                ]);
                                setShowAISuggestions(true);
                              } else {
                                message.info(t('leaves.selectDateFirst', 'Please select date range first'));
                              }
                            }}
                            style={{ padding: 0, height: 'auto' }}
                          >
                            {t('leaves.aiSuggest', 'AI Suggest')}
                          </Button>
                        </Tooltip>
                      </Space>
                    }
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

                  {/* AI Coverage Suggestions */}
                  {showAISuggestions && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <BulbOutlined style={{ color: '#1890ff' }} />
                          {t('leaves.aiSuggestions', 'AI Coverage Suggestions')}
                        </Space>
                      }
                      extra={
                        <Button type="text" size="small" onClick={() => setShowAISuggestions(false)}>
                          {t('common.close', 'Close')}
                        </Button>
                      }
                      style={{ marginBottom: 16, backgroundColor: '#f0f5ff' }}
                    >
                      {aiSuggestionsLoading ? (
                        <div style={{ textAlign: 'center', padding: 16 }}>
                          <Spin size="small" />
                          <Text type="secondary" style={{ marginLeft: 8 }}>
                            {t('leaves.analyzingWorkload', 'Analyzing team workload...')}
                          </Text>
                        </div>
                      ) : aiSuggestionsData?.suggestions?.length ? (
                        <List
                          size="small"
                          dataSource={aiSuggestionsData.suggestions.slice(0, 3)}
                          renderItem={(suggestion: CoverageSuggestion) => (
                            <List.Item
                              style={{
                                cursor: 'pointer',
                                backgroundColor: suggestion.is_best_match ? '#e6f7ff' : undefined,
                                borderRadius: 4,
                                padding: '8px 12px',
                              }}
                              onClick={() => {
                                leaveForm.setFieldValue('coverage_user_id', suggestion.user_id);
                                setShowAISuggestions(false);
                              }}
                            >
                              <List.Item.Meta
                                avatar={
                                  <Avatar
                                    icon={<UserOutlined />}
                                    style={{
                                      backgroundColor: suggestion.is_best_match ? '#1890ff' : '#d9d9d9',
                                    }}
                                  />
                                }
                                title={
                                  <Space>
                                    <Text strong>{suggestion.full_name}</Text>
                                    {suggestion.is_best_match && (
                                      <Tag color="blue" icon={<StarOutlined />}>
                                        {t('leaves.bestMatch', 'Best Match')}
                                      </Tag>
                                    )}
                                  </Space>
                                }
                                description={
                                  <Space size={4}>
                                    <Tag>{suggestion.role}</Tag>
                                    {suggestion.specialization && <Tag>{suggestion.specialization}</Tag>}
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      {t('leaves.matchScore', 'Match')}: {suggestion.match_score}%
                                    </Text>
                                  </Space>
                                }
                              />
                              <div style={{ textAlign: 'right' }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {t('leaves.workingDays', 'Working')}: {suggestion.working_days}
                                </Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {t('leaves.offDays', 'Off')}: {suggestion.off_days}
                                </Text>
                              </div>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Text type="secondary">
                          {t('leaves.noSuggestions', 'No suitable coverage found')}
                        </Text>
                      )}
                    </Card>
                  )}

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

      {/* Shift Swap Modal */}
      <Modal
        title={<Space><SwapOutlined />{t('roster.requestSwap', 'Request Shift Swap')}</Space>}
        open={swapModalOpen}
        onCancel={() => {
          setSwapModalOpen(false);
          swapForm.resetFields();
        }}
        onOk={() => swapForm.submit()}
        confirmLoading={createSwapMutation.isPending}
      >
        <Form
          form={swapForm}
          layout="vertical"
          onFinish={(values) => {
            createSwapMutation.mutate({
              target_user_id: values.target_user_id,
              requester_date: values.requester_date.format('YYYY-MM-DD'),
              target_date: values.target_date.format('YYYY-MM-DD'),
              reason: values.reason,
            });
          }}
        >
          <Form.Item
            name="target_user_id"
            label={t('roster.swapWith', 'Swap With')}
            rules={[{ required: true }]}
          >
            <Select
              placeholder={t('roster.selectUser', 'Select user')}
              showSearch
              optionFilterProp="label"
              options={allActiveUsers
                .filter((u: any) => u.id !== currentUser?.id)
                .map((u: any) => ({
                  value: u.id,
                  label: `${u.full_name} (${u.role})`,
                }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="requester_date"
                label={t('roster.yourDate', 'Your Date')}
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="target_date"
                label={t('roster.theirDate', 'Their Date')}
                rules={[{ required: true }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reason" label={t('roster.swapReason', 'Reason')}>
            <TextArea rows={2} placeholder={t('roster.swapReasonPlaceholder', 'Why do you need this swap?')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Pending Swaps Drawer (Admin) */}
      {isAdmin && swapRequestsData && swapRequestsData.length > 0 && (
        <Card
          size="small"
          title={<Space><SwapOutlined />{t('roster.pendingSwaps', 'Pending Swaps')} <Tag color="orange">{swapRequestsData.length}</Tag></Space>}
          style={{ position: 'fixed', bottom: 20, right: 20, width: 400, maxHeight: 300, overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          extra={<Button type="text" size="small" onClick={() => refetchSwapRequests()}>Refresh</Button>}
        >
          <List
            size="small"
            dataSource={swapRequestsData}
            renderItem={(swap: ShiftSwapRequest) => (
              <List.Item
                actions={[
                  swap.target_response === 'accepted' ? (
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => approveSwapMutation.mutate(swap.id)}
                      loading={approveSwapMutation.isPending}
                    >
                      Approve
                    </Button>
                  ) : (
                    <Tag color="orange">Awaiting response</Tag>
                  ),
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={() => rejectSwapMutation.mutate(swap.id)}
                    loading={rejectSwapMutation.isPending}
                  >
                    Reject
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={`${swap.requester.full_name} ↔ ${swap.target_user.full_name}`}
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(swap.requester_date).format('DD MMM')} ({swap.requester_shift}) ↔{' '}
                      {dayjs(swap.target_date).format('DD MMM')} ({swap.target_shift})
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Fatigue Alerts Floating Card */}
      {fatigueAlertsData && fatigueAlertsData.total_alerts > 0 && (
        <Card
          size="small"
          title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} />{t('roster.fatigueAlert', 'Fatigue Alerts')} <Tag color="red">{fatigueAlertsData.total_alerts}</Tag></Space>}
          style={{ position: 'fixed', bottom: 20, left: 20, width: 350, maxHeight: 250, overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <List
            size="small"
            dataSource={fatigueAlertsData.alerts}
            renderItem={(alert: FatigueAlert) => (
              <List.Item>
                <List.Item.Meta
                  avatar={<Avatar style={{ backgroundColor: alert.severity === 'high' ? '#ff4d4f' : '#faad14' }}><ExclamationCircleOutlined /></Avatar>}
                  title={alert.full_name}
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {alert.consecutive_shifts} {t('roster.consecutiveShifts', 'consecutive shifts')}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Blackout Periods Drawer */}
      <Drawer
        title={<Space><StopOutlined />{t('roster.blackoutPeriods', 'Blackout Periods')}</Space>}
        open={blackoutDrawerOpen}
        onClose={() => {
          setBlackoutDrawerOpen(false);
          setEditingBlackout(null);
          blackoutForm.resetFields();
        }}
        width={550}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Blackout list */}
          <Typography.Title level={5}>
            {t('roster.activeBlackouts', 'Active Blackout Periods')}
          </Typography.Title>
          {blackoutsData && blackoutsData.length > 0 ? (
            <List
              size="small"
              bordered
              dataSource={blackoutsData}
              renderItem={(blackout: LeaveBlackout) => (
                <List.Item
                  actions={[
                    <Button
                      key="edit"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingBlackout(blackout);
                        blackoutForm.setFieldsValue({
                          name: blackout.name,
                          name_ar: blackout.name_ar,
                          date_range: [dayjs(blackout.date_from), dayjs(blackout.date_to)],
                          reason: blackout.reason,
                          applies_to_roles: blackout.applies_to_roles,
                        });
                      }}
                    />,
                    <Button
                      key="delete"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleteBlackoutMutation.isPending}
                      onClick={() => {
                        Modal.confirm({
                          title: t('roster.confirmDeleteBlackout', 'Delete blackout period?'),
                          content: t('roster.deleteBlackoutWarning', 'This will remove the blackout period.'),
                          okText: t('common.delete', 'Delete'),
                          okType: 'danger',
                          onOk: () => deleteBlackoutMutation.mutate(blackout.id),
                        });
                      }}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar style={{ backgroundColor: '#ff4d4f' }}><StopOutlined /></Avatar>}
                    title={
                      <Space>
                        <Text strong>{blackout.name}</Text>
                        {blackout.applies_to_roles && blackout.applies_to_roles.length > 0 && (
                          <Tag color="orange">{blackout.applies_to_roles.join(', ')}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary">
                          {dayjs(blackout.date_from).format('DD MMM YYYY')} - {dayjs(blackout.date_to).format('DD MMM YYYY')}
                        </Text>
                        {blackout.reason && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {blackout.reason}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message={t('roster.noBlackouts', 'No active blackout periods')}
            />
          )}

          <Divider />

          {/* Create/Edit blackout form */}
          <Typography.Title level={5}>
            {editingBlackout
              ? t('roster.editBlackout', 'Edit Blackout Period')
              : t('roster.createBlackout', 'Create Blackout Period')
            }
          </Typography.Title>
          <Form
            form={blackoutForm}
            layout="vertical"
            onFinish={(values) => {
              const payload: CreateBlackoutPayload = {
                name: values.name,
                name_ar: values.name_ar,
                date_from: values.date_range[0].format('YYYY-MM-DD'),
                date_to: values.date_range[1].format('YYYY-MM-DD'),
                reason: values.reason,
                applies_to_roles: values.applies_to_roles,
              };
              if (editingBlackout) {
                updateBlackoutMutation.mutate({ id: editingBlackout.id, payload });
              } else {
                createBlackoutMutation.mutate(payload);
              }
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label={t('roster.blackoutName', 'Name')}
                  rules={[{ required: true, message: t('roster.nameRequired', 'Name is required') }]}
                >
                  <Input placeholder={t('roster.blackoutNamePlaceholder', 'e.g., Ramadan, Year End')} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="name_ar"
                  label={t('roster.blackoutNameAr', 'Name (Arabic)')}
                >
                  <Input placeholder={t('roster.blackoutNameArPlaceholder', 'الاسم بالعربية')} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="date_range"
              label={t('roster.blackoutDateRange', 'Date Range')}
              rules={[{ required: true, message: t('roster.dateRangeRequired', 'Date range is required') }]}
            >
              <RangePicker style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="applies_to_roles"
              label={t('roster.appliesToRoles', 'Applies to Roles (leave empty for all)')}
            >
              <Select
                mode="multiple"
                placeholder={t('roster.selectRoles', 'Select roles')}
                options={[
                  { value: 'inspector', label: t('roles.inspector', 'Inspector') },
                  { value: 'specialist', label: t('roles.specialist', 'Specialist') },
                  { value: 'engineer', label: t('roles.engineer', 'Engineer') },
                  { value: 'quality_engineer', label: t('roles.qualityEngineer', 'Quality Engineer') },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="reason"
              label={t('roster.blackoutReason', 'Reason')}
            >
              <TextArea rows={2} placeholder={t('roster.blackoutReasonPlaceholder', 'Why is leave blocked during this period?')} />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={editingBlackout ? <EditOutlined /> : <PlusOutlined />}
                  loading={createBlackoutMutation.isPending || updateBlackoutMutation.isPending}
                >
                  {editingBlackout
                    ? t('roster.updateBlackout', 'Update Blackout')
                    : t('roster.addBlackout', 'Add Blackout')
                  }
                </Button>
                {editingBlackout && (
                  <Button
                    onClick={() => {
                      setEditingBlackout(null);
                      blackoutForm.resetFields();
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Space>
      </Drawer>
    </Card>
  );
}
