import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  message,
  Typography,
  Tabs,
  Spin,
} from 'antd';
import { CheckOutlined, CloseOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnsType } from 'antd/es/table';
import {
  leavesApi,
  type Leave,
  type LeaveStatus,
  type User,
} from '@inspection/shared';
import dayjs from 'dayjs';
import VoiceTextArea from '../../components/VoiceTextArea';

const statusColorMap: Record<LeaveStatus, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
};

const leaveTypeColorMap: Record<string, string> = {
  sick: 'red',
  annual: 'blue',
  emergency: 'orange',
  training: 'purple',
  other: 'default',
};

export default function LeaveApprovalsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);

  const [approveForm] = Form.useForm();
  const [rejectForm] = Form.useForm();
  const [coverageForm] = Form.useForm();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leaves', page, perPage, statusFilter],
    queryFn: () =>
      leavesApi.list({ page, per_page: perPage, status: statusFilter as LeaveStatus | undefined }),
  });

  const { data: candidatesData, isLoading: candidatesLoading } = useQuery({
    queryKey: ['leave-coverage-candidates', selectedLeave?.id],
    queryFn: () => leavesApi.getCoverageCandidates(selectedLeave!.id),
    enabled: coverageOpen && !!selectedLeave,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      leavesApi.approve(id, notes ? { notes } : undefined),
    onSuccess: () => {
      message.success(t('leaves.approveSuccess', 'Leave approved'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setApproveOpen(false);
      setSelectedLeave(null);
      approveForm.resetFields();
    },
    onError: () => message.error(t('leaves.approveError', 'Failed to approve leave')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, rejection_reason }: { id: number; rejection_reason?: string }) =>
      leavesApi.reject(id, rejection_reason ? { rejection_reason } : undefined),
    onSuccess: () => {
      message.success(t('leaves.rejectSuccess', 'Leave rejected'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setRejectOpen(false);
      setSelectedLeave(null);
      rejectForm.resetFields();
    },
    onError: () => message.error(t('leaves.rejectError', 'Failed to reject leave')),
  });

  const coverageMutation = useMutation({
    mutationFn: ({ leaveId, userId }: { leaveId: number; userId: number }) =>
      leavesApi.assignCoverage(leaveId, userId),
    onSuccess: () => {
      message.success(t('leaves.coverageSuccess', 'Coverage assigned'));
      queryClient.invalidateQueries({ queryKey: ['leaves'] });
      setCoverageOpen(false);
      setSelectedLeave(null);
      coverageForm.resetFields();
    },
    onError: () => message.error(t('leaves.coverageError', 'Failed to assign coverage')),
  });

  const columns: ColumnsType<Leave> = [
    {
      title: t('leaves.user', 'User'),
      key: 'user',
      render: (_: unknown, r: Leave) => r.user?.full_name || `#${r.user_id}`,
    },
    {
      title: t('leaves.leaveType', 'Leave Type'),
      dataIndex: 'leave_type',
      key: 'leave_type',
      render: (v: string) => <Tag color={leaveTypeColorMap[v] || 'default'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('leaves.dateFrom', 'From'),
      dataIndex: 'date_from',
      key: 'date_from',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: t('leaves.dateTo', 'To'),
      dataIndex: 'date_to',
      key: 'date_to',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
    {
      title: t('leaves.totalDays', 'Days'),
      dataIndex: 'total_days',
      key: 'total_days',
    },
    {
      title: t('leaves.reason', 'Reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: t('leaves.scope', 'Scope'),
      dataIndex: 'scope',
      key: 'scope',
      render: (v: string) => <Tag>{v.replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    {
      title: t('leaves.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      render: (s: LeaveStatus) => <Tag color={statusColorMap[s]}>{s.toUpperCase()}</Tag>,
    },
    {
      title: t('leaves.coverage', 'Coverage'),
      key: 'coverage',
      render: (_: unknown, r: Leave) => r.coverage_user?.full_name || '-',
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 250,
      render: (_: unknown, record: Leave) => (
        <Space wrap>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                icon={<CheckOutlined />}
                onClick={() => { setSelectedLeave(record); setApproveOpen(true); approveForm.resetFields(); }}
              >
                {t('leaves.approve', 'Approve')}
              </Button>
              <Button
                type="link"
                danger
                icon={<CloseOutlined />}
                onClick={() => { setSelectedLeave(record); setRejectOpen(true); rejectForm.resetFields(); }}
              >
                {t('leaves.reject', 'Reject')}
              </Button>
            </>
          )}
          {record.status === 'approved' && !record.coverage_user_id && (
            <Button
              type="link"
              icon={<UserSwitchOutlined />}
              onClick={() => { setSelectedLeave(record); setCoverageOpen(true); coverageForm.resetFields(); }}
            >
              {t('leaves.assignCoverage', 'Assign Coverage')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const leaves = data?.data?.data || [];
  const pagination = data?.data?.pagination;
  const candidates: User[] = candidatesData?.data?.data || [];

  const tabItems = [
    { key: 'all', label: t('common.all', 'All') },
    { key: 'pending', label: t('leaves.pending', 'Pending') },
    { key: 'approved', label: t('leaves.approved', 'Approved') },
    { key: 'rejected', label: t('leaves.rejected', 'Rejected') },
  ];

  return (
    <Card title={<Typography.Title level={4}>{t('nav.leaveApprovals', 'Leave Approvals')}</Typography.Title>}>
      <Tabs
        activeKey={statusFilter || 'all'}
        onChange={(key) => { setStatusFilter(key === 'all' ? undefined : key); setPage(1); }}
        items={tabItems}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={leaves}
        loading={isLoading}
        locale={{ emptyText: isError ? t('common.error', 'Error loading data') : t('common.noData', 'No data') }}
        pagination={{
          current: pagination?.page || page,
          pageSize: pagination?.per_page || perPage,
          total: pagination?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => t('common.totalItems', 'Total: {{total}} items', { total }),
          onChange: (p, ps) => { setPage(p); setPerPage(ps); },
        }}
        scroll={{ x: 1200 }}
      />

      {/* Approve Modal */}
      <Modal
        title={t('leaves.approveLeave', 'Approve Leave')}
        open={approveOpen}
        onCancel={() => { setApproveOpen(false); setSelectedLeave(null); approveForm.resetFields(); }}
        onOk={() => approveForm.submit()}
        confirmLoading={approveMutation.isPending}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          {t('leaves.approveDescription', 'Approve leave for {{user}}', {
            user: selectedLeave?.user?.full_name || '',
          })}
        </Typography.Paragraph>
        <Form
          form={approveForm}
          layout="vertical"
          onFinish={(v: { notes?: string }) =>
            selectedLeave && approveMutation.mutate({ id: selectedLeave.id, notes: v.notes })
          }
        >
          <Form.Item name="notes" label={t('leaves.notes', 'Notes (optional)')}>
            <VoiceTextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reject Modal */}
      <Modal
        title={t('leaves.rejectLeave', 'Reject Leave')}
        open={rejectOpen}
        onCancel={() => { setRejectOpen(false); setSelectedLeave(null); rejectForm.resetFields(); }}
        onOk={() => rejectForm.submit()}
        confirmLoading={rejectMutation.isPending}
        destroyOnClose
      >
        <Form
          form={rejectForm}
          layout="vertical"
          onFinish={(v: { rejection_reason?: string }) =>
            selectedLeave && rejectMutation.mutate({ id: selectedLeave.id, rejection_reason: v.rejection_reason })
          }
        >
          <Form.Item name="rejection_reason" label={t('leaves.rejectionReason', 'Rejection Reason')}>
            <VoiceTextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Coverage Modal */}
      <Modal
        title={t('leaves.assignCoverage', 'Assign Coverage')}
        open={coverageOpen}
        onCancel={() => { setCoverageOpen(false); setSelectedLeave(null); coverageForm.resetFields(); }}
        onOk={() => coverageForm.submit()}
        confirmLoading={coverageMutation.isPending}
        destroyOnClose
      >
        <Spin spinning={candidatesLoading}>
          <Form
            form={coverageForm}
            layout="vertical"
            onFinish={(v: { user_id: number }) =>
              selectedLeave && coverageMutation.mutate({ leaveId: selectedLeave.id, userId: v.user_id })
            }
          >
            <Form.Item
              name="user_id"
              label={t('leaves.coverageUser', 'Coverage User')}
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                optionFilterProp="children"
                placeholder={t('leaves.selectUser', 'Select a user')}
              >
                {candidates.map((u) => (
                  <Select.Option key={u.id} value={u.id}>
                    {u.full_name} ({u.employee_id}) - {u.role}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        </Spin>
      </Modal>
    </Card>
  );
}
