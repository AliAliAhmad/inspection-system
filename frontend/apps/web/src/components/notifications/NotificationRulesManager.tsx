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
  Divider,
  Typography,
  Popconfirm,
  message,
  Spin,
  Empty,
  Row,
  Col,
  InputNumber,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  BellOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi,
  NotificationRule,
  NotificationPriority,
  NotificationChannel,
} from '@inspection/shared';

const { Title, Text, Paragraph } = Typography;

export interface NotificationRulesManagerProps {
  onRuleCreated?: (rule: NotificationRule) => void;
  onRuleUpdated?: (rule: NotificationRule) => void;
  onRuleDeleted?: (ruleId: number) => void;
}

interface ConditionField {
  field: string;
  operator: string;
  value: string | number;
}

const TRIGGER_TYPES = [
  { value: 'threshold', label: 'Threshold', icon: <FilterOutlined /> },
  { value: 'condition', label: 'Condition', icon: <ThunderboltOutlined /> },
  { value: 'schedule', label: 'Schedule', icon: <ClockCircleOutlined /> },
];

const CONDITION_FIELDS = [
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Notification Type' },
  { value: 'user_role', label: 'User Role' },
  { value: 'unread_count', label: 'Unread Count' },
  { value: 'time_since_creation', label: 'Time Since Creation (hours)' },
];

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In List' },
];

const PRIORITY_OPTIONS: { value: NotificationPriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: '#eb2f96' },
  { value: 'urgent', label: 'Urgent', color: '#f5222d' },
  { value: 'warning', label: 'Warning', color: '#fa8c16' },
  { value: 'info', label: 'Info', color: '#1677ff' },
];

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string }[] = [
  { value: 'in_app', label: 'In-App' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push' },
];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'engineer', label: 'Engineer' },
];

export function NotificationRulesManager({
  onRuleCreated,
  onRuleUpdated,
  onRuleDeleted,
}: NotificationRulesManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [form] = Form.useForm();
  const [conditions, setConditions] = useState<ConditionField[]>([{ field: '', operator: '', value: '' }]);

  // Fetch rules
  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['notifications', 'rules'],
    queryFn: () => notificationsApi.listRules().then((r) => r.data),
  });

  // Mutations
  const createRuleMutation = useMutation({
    mutationFn: (payload: any) => notificationsApi.createRule(payload),
    onSuccess: (response) => {
      message.success(t('notifications.ruleCreated', 'Rule created successfully'));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
      onRuleCreated?.(response.data.data!);
      handleCloseModal();
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      notificationsApi.updateRule(id, payload),
    onSuccess: (response) => {
      message.success(t('notifications.ruleUpdated', 'Rule updated successfully'));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
      onRuleUpdated?.(response.data.data!);
      handleCloseModal();
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.deleteRule(id),
    onSuccess: (_, id) => {
      message.success(t('notifications.ruleDeleted', 'Rule deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
      onRuleDeleted?.(id);
    },
    onError: () => {
      message.error(t('common.error', 'An error occurred'));
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      notificationsApi.toggleRule(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] });
    },
  });

  const rules: NotificationRule[] = rulesData?.data || [];

  const handleOpenModal = (rule?: NotificationRule) => {
    if (rule) {
      setEditingRule(rule);
      form.setFieldsValue({
        name: rule.name,
        description: rule.description,
        trigger_type: rule.trigger_type,
        priority: rule.action_config.priority,
        channels: rule.action_config.channels,
        target_roles: rule.action_config.target_roles,
        escalation_delay: rule.action_config.escalation_delay,
      });
      if (rule.trigger_config.conditions) {
        setConditions(rule.trigger_config.conditions as ConditionField[]);
      }
    } else {
      setEditingRule(null);
      form.resetFields();
      setConditions([{ field: '', operator: '', value: '' }]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
    form.resetFields();
    setConditions([{ field: '', operator: '', value: '' }]);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        name: values.name,
        description: values.description,
        trigger_type: values.trigger_type,
        trigger_config: {
          conditions: conditions.filter((c) => c.field && c.operator),
          schedule: values.schedule,
        },
        action_config: {
          priority: values.priority,
          channels: values.channels,
          target_roles: values.target_roles,
          escalation_delay: values.escalation_delay,
        },
        is_active: true,
      };

      if (editingRule) {
        updateRuleMutation.mutate({ id: editingRule.id, payload });
      } else {
        createRuleMutation.mutate(payload);
      }
    } catch {
      // Validation failed
    }
  };

  const handleConditionChange = (index: number, field: keyof ConditionField, value: any) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  const addCondition = () => {
    setConditions([...conditions, { field: '', operator: '', value: '' }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const columns = [
    {
      title: t('notifications.ruleName', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: NotificationRule) => (
        <Space>
          <Text strong>{name}</Text>
          {!record.is_active && <Tag color="default">Inactive</Tag>}
        </Space>
      ),
    },
    {
      title: t('notifications.triggerType', 'Trigger'),
      dataIndex: 'trigger_type',
      key: 'trigger_type',
      render: (type: string) => {
        const config = TRIGGER_TYPES.find((t) => t.value === type);
        return (
          <Tag icon={config?.icon}>
            {config?.label || type}
          </Tag>
        );
      },
    },
    {
      title: t('notifications.priority', 'Priority'),
      key: 'priority',
      render: (_: any, record: NotificationRule) => {
        const priority = record.action_config.priority;
        const config = PRIORITY_OPTIONS.find((p) => p.value === priority);
        return priority ? (
          <Tag color={config?.color}>{config?.label || priority}</Tag>
        ) : (
          '-'
        );
      },
    },
    {
      title: t('notifications.targets', 'Targets'),
      key: 'targets',
      render: (_: any, record: NotificationRule) => {
        const roles = record.action_config.target_roles || [];
        return roles.length > 0 ? (
          <Space size={4}>
            <TeamOutlined />
            {roles.slice(0, 2).map((role) => (
              <Tag key={role}>{role}</Tag>
            ))}
            {roles.length > 2 && <Tag>+{roles.length - 2}</Tag>}
          </Space>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
    },
    {
      title: t('notifications.status', 'Status'),
      key: 'is_active',
      render: (_: any, record: NotificationRule) => (
        <Switch
          checked={record.is_active}
          onChange={(checked) =>
            toggleRuleMutation.mutate({ id: record.id, is_active: checked })
          }
          loading={toggleRuleMutation.isPending}
        />
      ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      render: (_: any, record: NotificationRule) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          />
          <Popconfirm
            title={t('notifications.confirmDeleteRule', 'Delete this rule?')}
            onConfirm={() => deleteRuleMutation.mutate(record.id)}
            okText={t('common.yes', 'Yes')}
            cancelText={t('common.no', 'No')}
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
        <div style={{ textAlign: 'center', padding: 40 }}>
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
            <ThunderboltOutlined />
            {t('notifications.rulesManager', 'Notification Rules')}
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
            {t('notifications.createRule', 'Create Rule')}
          </Button>
        }
      >
        {rules.length === 0 ? (
          <Empty
            description={t('notifications.noRules', 'No rules configured')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
              {t('notifications.createFirstRule', 'Create Your First Rule')}
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={rules}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={
          editingRule
            ? t('notifications.editRule', 'Edit Rule')
            : t('notifications.createRule', 'Create Rule')
        }
        open={isModalOpen}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        confirmLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="name"
                label={t('notifications.ruleName', 'Rule Name')}
                rules={[{ required: true, message: 'Please enter a rule name' }]}
              >
                <Input placeholder="e.g., Escalate unread critical alerts" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="trigger_type"
                label={t('notifications.triggerType', 'Trigger Type')}
                rules={[{ required: true }]}
              >
                <Select options={TRIGGER_TYPES} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label={t('common.description', 'Description')}>
            <Input.TextArea rows={2} placeholder="Describe what this rule does..." />
          </Form.Item>

          <Divider>{t('notifications.conditions', 'Conditions')}</Divider>

          {conditions.map((condition, index) => (
            <Row key={index} gutter={8} style={{ marginBottom: 8 }}>
              <Col span={7}>
                <Select
                  placeholder="Field"
                  value={condition.field || undefined}
                  onChange={(value) => handleConditionChange(index, 'field', value)}
                  options={CONDITION_FIELDS}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={6}>
                <Select
                  placeholder="Operator"
                  value={condition.operator || undefined}
                  onChange={(value) => handleConditionChange(index, 'operator', value)}
                  options={OPERATORS}
                  style={{ width: '100%' }}
                />
              </Col>
              <Col span={8}>
                <Input
                  placeholder="Value"
                  value={condition.value}
                  onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                />
              </Col>
              <Col span={3}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeCondition(index)}
                  disabled={conditions.length === 1}
                />
              </Col>
            </Row>
          ))}
          <Button type="dashed" onClick={addCondition} icon={<PlusOutlined />}>
            {t('notifications.addCondition', 'Add Condition')}
          </Button>

          <Divider>{t('notifications.actions', 'Actions')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="priority" label={t('notifications.priority', 'Priority')}>
                <Select placeholder="Select priority">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      <Tag color={opt.color}>{opt.label}</Tag>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channels" label={t('notifications.channels', 'Channels')}>
                <Select mode="multiple" placeholder="Select channels" options={CHANNEL_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="target_roles" label={t('notifications.targetRoles', 'Target Roles')}>
                <Select mode="multiple" placeholder="Select roles" options={ROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="escalation_delay"
                label={t('notifications.escalationDelay', 'Escalation Delay (minutes)')}
              >
                <InputNumber min={0} max={1440} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}

export default NotificationRulesManager;
