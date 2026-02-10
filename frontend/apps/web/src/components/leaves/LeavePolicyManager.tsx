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
  InputNumber,
  Select,
  Popconfirm,
  message,
  Spin,
  Empty,
  Typography,
  Row,
  Col,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  TeamOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leavesApi,
  LeavePolicy,
  CreateLeavePolicyPayload,
  UpdateLeavePolicyPayload,
} from '@inspection/shared';

const { Text, Title } = Typography;

interface LeavePolicyManagerProps {
  onPolicyCreated?: (policy: LeavePolicy) => void;
  onPolicyUpdated?: (policy: LeavePolicy) => void;
}

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles (Default)' },
  { value: 'admin', label: 'Admin' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'specialist', label: 'Specialist' },
];

const ACCRUAL_TYPE_OPTIONS = [
  { value: 'yearly', label: 'Yearly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

export function LeavePolicyManager({
  onPolicyCreated,
  onPolicyUpdated,
}: LeavePolicyManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [form] = Form.useForm();

  // Fetch policies
  const { data, isLoading } = useQuery({
    queryKey: ['leave-policies'],
    queryFn: () => leavesApi.listLeavePolicies().then((r) => r.data),
  });

  const policies: LeavePolicy[] = data?.data?.policies || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateLeavePolicyPayload) => leavesApi.createLeavePolicy(payload),
    onSuccess: (response) => {
      message.success(t('leaves.policyCreated', 'Policy created successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-policies'] });
      onPolicyCreated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateLeavePolicyPayload }) =>
      leavesApi.updateLeavePolicy(id, payload),
    onSuccess: (response) => {
      message.success(t('leaves.policyUpdated', 'Policy updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-policies'] });
      onPolicyUpdated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leavesApi.deleteLeavePolicy(id),
    onSuccess: () => {
      message.success(t('leaves.policyDeleted', 'Policy deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-policies'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      leavesApi.updateLeavePolicy(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-policies'] });
    },
  });

  const handleOpenModal = (policy?: LeavePolicy) => {
    if (policy) {
      setEditingPolicy(policy);
      form.setFieldsValue({
        name: policy.name,
        role: policy.role || '',
        min_tenure_months: policy.min_tenure_months,
        annual_allowance: policy.annual_allowance,
        sick_allowance: policy.sick_allowance,
        emergency_allowance: policy.emergency_allowance,
        carry_over_enabled: policy.carry_over_enabled,
        carry_over_max_days: policy.carry_over_max_days,
        carry_over_expiry_months: policy.carry_over_expiry_months,
        probation_months: policy.probation_months,
        probation_allowance: policy.probation_allowance,
        accrual_type: policy.accrual_type,
        accrual_rate: policy.accrual_rate,
        negative_balance_allowed: policy.negative_balance_allowed,
        negative_balance_max: policy.negative_balance_max,
      });
    } else {
      setEditingPolicy(null);
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPolicy(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        role: values.role || undefined,
      };

      if (editingPolicy) {
        updateMutation.mutate({ id: editingPolicy.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // Validation failed
    }
  };

  const columns = [
    {
      title: t('leaves.policyName', 'Policy Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: t('leaves.appliesTo', 'Applies To'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) =>
        role ? (
          <Tag icon={<TeamOutlined />}>{role}</Tag>
        ) : (
          <Tag color="blue">{t('leaves.allRoles', 'All Roles')}</Tag>
        ),
    },
    {
      title: t('leaves.allowances', 'Allowances (days/year)'),
      key: 'allowances',
      render: (_: any, record: LeavePolicy) => (
        <Space size={4}>
          <Tooltip title={t('leaves.annual', 'Annual')}>
            <Tag color="blue">{record.annual_allowance}</Tag>
          </Tooltip>
          <Tooltip title={t('leaves.sick', 'Sick')}>
            <Tag color="green">{record.sick_allowance}</Tag>
          </Tooltip>
          <Tooltip title={t('leaves.emergency', 'Emergency')}>
            <Tag color="orange">{record.emergency_allowance}</Tag>
          </Tooltip>
        </Space>
      ),
    },
    {
      title: t('leaves.accrual', 'Accrual'),
      dataIndex: 'accrual_type',
      key: 'accrual_type',
      render: (type: string) => (
        <Tag>{t(`leaves.accrual.${type}`, type)}</Tag>
      ),
    },
    {
      title: t('leaves.carryOver', 'Carry Over'),
      key: 'carry_over',
      render: (_: any, record: LeavePolicy) =>
        record.carry_over_enabled ? (
          <Space direction="vertical" size={0}>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Max {record.carry_over_max_days} days
            </Text>
          </Space>
        ) : (
          <StopOutlined style={{ color: '#8c8c8c' }} />
        ),
    },
    {
      title: t('common.status', 'Status'),
      key: 'is_active',
      render: (_: any, record: LeavePolicy) => (
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
      render: (_: any, record: LeavePolicy) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title={t('leaves.confirmDeletePolicy', 'Delete this policy?')}
            description={t(
              'leaves.deletePolicyWarning',
              'Users assigned to this policy will revert to default.'
            )}
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
            <FileProtectOutlined />
            {t('leaves.leavePolicies', 'Leave Policies')}
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('leaves.addPolicy', 'Add Policy')}
          </Button>
        }
      >
        {policies.length === 0 ? (
          <Empty
            description={t('leaves.noPolicies', 'No policies configured')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              {t('leaves.createFirstPolicy', 'Create Your First Policy')}
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={policies}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          editingPolicy
            ? t('leaves.editPolicy', 'Edit Policy')
            : t('leaves.addPolicy', 'Add Policy')
        }
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label={t('leaves.policyName', 'Policy Name')}
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="e.g., Standard Employee Policy" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="role" label={t('leaves.appliesTo', 'Applies To Role')}>
                <Select options={ROLE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.allowances', 'Leave Allowances')}</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="annual_allowance"
                label={t('leaves.annualAllowance', 'Annual (days)')}
                rules={[{ required: true }]}
                initialValue={21}
              >
                <InputNumber min={0} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="sick_allowance"
                label={t('leaves.sickAllowance', 'Sick (days)')}
                rules={[{ required: true }]}
                initialValue={10}
              >
                <InputNumber min={0} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="emergency_allowance"
                label={t('leaves.emergencyAllowance', 'Emergency (days)')}
                rules={[{ required: true }]}
                initialValue={3}
              >
                <InputNumber min={0} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.accrualSettings', 'Accrual Settings')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="accrual_type"
                label={t('leaves.accrualType', 'Accrual Type')}
                initialValue="yearly"
              >
                <Select options={ACCRUAL_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="min_tenure_months"
                label={
                  <Space>
                    {t('leaves.minTenure', 'Min Tenure (months)')}
                    <Tooltip title={t('leaves.minTenureHelp', 'Months before full allowance')}>
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                initialValue={0}
              >
                <InputNumber min={0} max={36} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.carryOverSettings', 'Carry-Over Settings')}</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="carry_over_enabled"
                label={t('leaves.carryOverEnabled', 'Enable Carry-Over')}
                valuePropName="checked"
                initialValue={true}
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) =>
                  prev.carry_over_enabled !== curr.carry_over_enabled
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue('carry_over_enabled') && (
                    <Form.Item
                      name="carry_over_max_days"
                      label={t('leaves.carryOverMax', 'Max Days')}
                      initialValue={5}
                    >
                      <InputNumber min={0} max={365} style={{ width: '100%' }} />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) =>
                  prev.carry_over_enabled !== curr.carry_over_enabled
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue('carry_over_enabled') && (
                    <Form.Item
                      name="carry_over_expiry_months"
                      label={t('leaves.carryOverExpiry', 'Expiry (months)')}
                      initialValue={3}
                    >
                      <InputNumber min={1} max={12} style={{ width: '100%' }} />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.probationSettings', 'Probation Settings')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="probation_months"
                label={t('leaves.probationMonths', 'Probation Period (months)')}
                initialValue={3}
              >
                <InputNumber min={0} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="probation_allowance"
                label={t('leaves.probationAllowance', 'Allowance During Probation')}
                initialValue={0}
              >
                <InputNumber min={0} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.negativeBalance', 'Negative Balance')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="negative_balance_allowed"
                label={t('leaves.allowNegative', 'Allow Negative Balance')}
                valuePropName="checked"
                initialValue={false}
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) =>
                  prev.negative_balance_allowed !== curr.negative_balance_allowed
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue('negative_balance_allowed') && (
                    <Form.Item
                      name="negative_balance_max"
                      label={t('leaves.negativeMax', 'Max Negative Days')}
                      initialValue={3}
                    >
                      <InputNumber min={1} max={30} style={{ width: '100%' }} />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

export default LeavePolicyManager;
