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
  ColorPicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TagOutlined,
  LockOutlined,
  CheckCircleOutlined,
  StopOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  leavesApi,
  LeaveType,
  CreateLeaveTypePayload,
  UpdateLeaveTypePayload,
} from '@inspection/shared';

const { Text, Title } = Typography;

interface LeaveTypeManagerProps {
  onTypeCreated?: (type: LeaveType) => void;
  onTypeUpdated?: (type: LeaveType) => void;
}

const ICON_OPTIONS = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'medical', label: 'Medical' },
  { value: 'thunder', label: 'Thunder' },
  { value: 'book', label: 'Book' },
  { value: 'plane', label: 'Travel' },
  { value: 'home', label: 'Home' },
  { value: 'baby', label: 'Baby' },
  { value: 'heart', label: 'Heart' },
];

export function LeaveTypeManager({ onTypeCreated, onTypeUpdated }: LeaveTypeManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveType | null>(null);
  const [form] = Form.useForm();
  const [selectedColor, setSelectedColor] = useState<string>('#1890ff');

  // Fetch leave types
  const { data, isLoading } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => leavesApi.listLeaveTypes().then((r) => r.data),
  });

  const leaveTypes: LeaveType[] = data?.data || [];

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateLeaveTypePayload) => leavesApi.createLeaveType(payload),
    onSuccess: (response) => {
      message.success(t('leaves.typeCreated', 'Leave type created successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      onTypeCreated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateLeaveTypePayload }) =>
      leavesApi.updateLeaveType(id, payload),
    onSuccess: (response) => {
      message.success(t('leaves.typeUpdated', 'Leave type updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      onTypeUpdated?.(response.data.data!);
      handleCloseModal();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => leavesApi.deleteLeaveType(id),
    onSuccess: () => {
      message.success(t('leaves.typeDeleted', 'Leave type deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.error || t('common.error', 'An error occurred'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      leavesApi.updateLeaveType(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    },
  });

  const handleOpenModal = (leaveType?: LeaveType) => {
    if (leaveType) {
      setEditingType(leaveType);
      setSelectedColor(leaveType.color || '#1890ff');
      form.setFieldsValue({
        code: leaveType.code,
        name: leaveType.name,
        name_ar: leaveType.name_ar,
        color: leaveType.color,
        icon: leaveType.icon,
        requires_certificate: leaveType.requires_certificate,
        certificate_after_days: leaveType.certificate_after_days,
        max_consecutive_days: leaveType.max_consecutive_days,
        max_per_year: leaveType.max_per_year,
        advance_notice_days: leaveType.advance_notice_days,
        is_paid: leaveType.is_paid,
      });
    } else {
      setEditingType(null);
      setSelectedColor('#1890ff');
      form.resetFields();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingType(null);
    form.resetFields();
    setSelectedColor('#1890ff');
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        color: selectedColor,
      };

      if (editingType) {
        updateMutation.mutate({ id: editingType.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch {
      // Validation failed
    }
  };

  const columns = [
    {
      title: t('leaves.typeName', 'Type Name'),
      key: 'name',
      render: (_: any, record: LeaveType) => (
        <Space>
          <Tag color={record.color || 'default'} style={{ minWidth: 80, textAlign: 'center' }}>
            {record.name}
          </Tag>
          {record.is_system && (
            <Tooltip title={t('leaves.systemType', 'System type - cannot be deleted')}>
              <LockOutlined style={{ color: '#8c8c8c' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('leaves.code', 'Code'),
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: t('leaves.arabiccName', 'Arabic Name'),
      dataIndex: 'name_ar',
      key: 'name_ar',
      render: (name_ar: string) => name_ar || '-',
    },
    {
      title: t('leaves.requirements', 'Requirements'),
      key: 'requirements',
      render: (_: any, record: LeaveType) => (
        <Space direction="vertical" size={0}>
          {record.requires_certificate && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Certificate after {record.certificate_after_days} days
            </Text>
          )}
          {record.advance_notice_days > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.advance_notice_days} days notice
            </Text>
          )}
          {record.max_consecutive_days && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Max {record.max_consecutive_days} consecutive
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('leaves.paid', 'Paid'),
      dataIndex: 'is_paid',
      key: 'is_paid',
      render: (isPaid: boolean) =>
        isPaid ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <StopOutlined style={{ color: '#8c8c8c' }} />
        ),
    },
    {
      title: t('common.status', 'Status'),
      key: 'is_active',
      render: (_: any, record: LeaveType) => (
        <Switch
          checked={record.is_active}
          onChange={(checked) =>
            toggleActiveMutation.mutate({ id: record.id, is_active: checked })
          }
          loading={toggleActiveMutation.isPending}
          disabled={record.is_system}
        />
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: any, record: LeaveType) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          {!record.is_system && (
            <Popconfirm
              title={t('leaves.confirmDeleteType', 'Delete this leave type?')}
              description={t(
                'leaves.deleteTypeWarning',
                'This may affect existing leaves using this type.'
              )}
              onConfirm={() => deleteMutation.mutate(record.id)}
              okText={t('common.yes', 'Yes')}
              cancelText={t('common.no', 'No')}
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
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
            <TagOutlined />
            {t('leaves.leaveTypes', 'Leave Types')}
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('leaves.addType', 'Add Type')}
          </Button>
        }
      >
        {leaveTypes.length === 0 ? (
          <Empty
            description={t('leaves.noTypes', 'No leave types configured')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              {t('leaves.createFirstType', 'Create Your First Leave Type')}
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={leaveTypes}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          editingType
            ? t('leaves.editType', 'Edit Leave Type')
            : t('leaves.addType', 'Add Leave Type')
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
                name="code"
                label={t('leaves.code', 'Code')}
                rules={[
                  { required: true, message: 'Please enter a code' },
                  { max: 20, message: 'Code must be at most 20 characters' },
                ]}
              >
                <Input
                  placeholder="e.g., ANNUAL, SICK"
                  disabled={editingType?.is_system}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label={t('leaves.typeName', 'Name')}
                rules={[{ required: true, message: 'Please enter a name' }]}
              >
                <Input placeholder="e.g., Annual Leave" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name_ar" label={t('leaves.arabicName', 'Arabic Name')}>
                <Input placeholder="e.g., اجازة سنوية" dir="rtl" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('leaves.color', 'Color')}>
                <Space>
                  <ColorPicker
                    value={selectedColor}
                    onChange={(color) => setSelectedColor(color.toHexString())}
                  />
                  <Tag color={selectedColor} style={{ marginLeft: 8 }}>
                    {t('leaves.preview', 'Preview')}
                  </Tag>
                </Space>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="icon" label={t('leaves.icon', 'Icon')}>
                <Select placeholder="Select icon" options={ICON_OPTIONS} allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="is_paid"
                label={t('leaves.isPaid', 'Paid Leave')}
                valuePropName="checked"
                initialValue={true}
              >
                <Switch checkedChildren="Paid" unCheckedChildren="Unpaid" />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.rules', 'Rules & Requirements')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="advance_notice_days"
                label={
                  <Space>
                    {t('leaves.advanceNotice', 'Advance Notice (days)')}
                    <Tooltip title={t('leaves.advanceNoticeHelp', 'Minimum days before leave start')}>
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                initialValue={0}
              >
                <InputNumber min={0} max={90} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="max_consecutive_days"
                label={t('leaves.maxConsecutive', 'Max Consecutive Days')}
              >
                <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder="No limit" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="max_per_year"
                label={t('leaves.maxPerYear', 'Max Per Year')}
              >
                <InputNumber min={1} max={365} style={{ width: '100%' }} placeholder="No limit" />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('leaves.certificate', 'Certificate Requirements')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="requires_certificate"
                label={t('leaves.requiresCertificate', 'Requires Certificate')}
                valuePropName="checked"
                initialValue={false}
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.requires_certificate !== curr.requires_certificate}
              >
                {({ getFieldValue }) =>
                  getFieldValue('requires_certificate') && (
                    <Form.Item
                      name="certificate_after_days"
                      label={t('leaves.certificateAfterDays', 'Certificate After (days)')}
                      initialValue={2}
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

export default LeaveTypeManager;
