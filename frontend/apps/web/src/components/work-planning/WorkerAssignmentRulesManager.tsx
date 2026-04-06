import React, { useState, useMemo } from 'react';
import {
  Table,
  Button,
  Card,
  Space,
  Tag,
  message,
  Modal,
  Form,
  InputNumber,
  Select,
  Switch,
  Tooltip,
  Empty,
  Alert,
  Spin,
  Tabs,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  TeamOutlined,
  CrownOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  workerAssignmentRulesApi,
  usersApi,
  type WorkerAssignmentRule,
  type WorkerAssignmentRulePayload,
  type TeamType,
  type EquipmentCategory,
} from '@inspection/shared';

const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  regular_pm: 'Regular PM',
  ac_pm: 'AC Service',
  defect_mech: 'Defect (Mechanical)',
  defect_elec: 'Defect (Electrical)',
};

const TEAM_TYPE_COLORS: Record<TeamType, string> = {
  regular_pm: 'blue',
  ac_pm: 'cyan',
  defect_mech: 'orange',
  defect_elec: 'gold',
};

const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  reach_stacker: 'Reach Stacker',
  ech: 'ECH',
  truck: 'Truck',
  forklift: 'Forklift',
  trailer: 'Trailer',
  all: 'All Equipment',
};

const BERTHS = ['east', 'west'] as const;
const TEAM_TYPES: TeamType[] = ['regular_pm', 'ac_pm', 'defect_mech', 'defect_elec'];
const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'reach_stacker',
  'ech',
  'truck',
  'forklift',
  'trailer',
  'all',
];

interface WorkerOption {
  value: number;
  label: string;
}

export const WorkerAssignmentRulesManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeBerth, setActiveBerth] = useState<'east' | 'west'>('west');
  const [editingRule, setEditingRule] = useState<WorkerAssignmentRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  // Fetch all rules
  const { data: rulesData, isLoading, refetch } = useQuery({
    queryKey: ['worker-assignment-rules'],
    queryFn: () => workerAssignmentRulesApi.list().then((r) => r.data),
  });

  // Fetch users for lead/worker selectors
  const { data: usersData } = useQuery({
    queryKey: ['users-for-rules'],
    queryFn: () => usersApi.list({ per_page: 500 }).then((r) => r.data),
  });

  const allRules = rulesData?.rules ?? [];
  const tableMissing = rulesData?.table_missing;

  // Group workers by role
  const workerOptions = useMemo<{ mech: WorkerOption[]; elec: WorkerOption[]; all: WorkerOption[] }>(() => {
    const users: any[] = (usersData as any)?.data ?? (usersData as any)?.items ?? [];
    const mech: WorkerOption[] = [];
    const elec: WorkerOption[] = [];
    const all: WorkerOption[] = [];
    users.forEach((u: any) => {
      const opt = { value: u.id, label: `${u.full_name}${u.specialization ? ' • ' + u.specialization : ''}` };
      all.push(opt);
      const spec = (u.specialization || '').toLowerCase();
      if (spec.includes('mech')) mech.push(opt);
      if (spec.includes('elec')) elec.push(opt);
    });
    return { mech, elec, all };
  }, [usersData]);

  const seedDefaultsMutation = useMutation({
    mutationFn: () => workerAssignmentRulesApi.seedDefaults(),
    onSuccess: (res) => {
      message.success(res.data.message || 'Defaults seeded');
      queryClient.invalidateQueries({ queryKey: ['worker-assignment-rules'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to seed defaults');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: WorkerAssignmentRulePayload) => workerAssignmentRulesApi.create(payload),
    onSuccess: () => {
      message.success('Rule created');
      setCreating(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['worker-assignment-rules'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to create rule');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: WorkerAssignmentRulePayload }) =>
      workerAssignmentRulesApi.update(id, payload),
    onSuccess: () => {
      message.success('Rule updated');
      setEditingRule(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['worker-assignment-rules'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to update rule');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => workerAssignmentRulesApi.delete(id),
    onSuccess: () => {
      message.success('Rule deleted');
      queryClient.invalidateQueries({ queryKey: ['worker-assignment-rules'] });
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || 'Failed to delete rule');
    },
  });

  const handleEdit = (rule: WorkerAssignmentRule) => {
    setEditingRule(rule);
    form.setFieldsValue({
      berth: rule.berth,
      team_type: rule.team_type,
      equipment_category: rule.equipment_category,
      mech_count: rule.mech_count,
      elec_count: rule.elec_count,
      primary_mech_lead_id: rule.primary_mech_lead_id,
      successor_mech_lead_id: rule.successor_mech_lead_id,
      primary_elec_lead_id: rule.primary_elec_lead_id,
      successor_elec_lead_id: rule.successor_elec_lead_id,
      candidate_mech_workers: rule.candidate_mech_workers || [],
      candidate_elec_workers: rule.candidate_elec_workers || [],
      is_active: rule.is_active,
    });
  };

  const handleCreate = () => {
    setCreating(true);
    form.resetFields();
    form.setFieldsValue({
      berth: activeBerth,
      team_type: 'regular_pm',
      equipment_category: 'reach_stacker',
      mech_count: 0,
      elec_count: 0,
      is_active: true,
    });
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editingRule) {
        updateMutation.mutate({ id: editingRule.id, payload: values });
      } else {
        createMutation.mutate(values);
      }
    });
  };

  // Filter rules by active berth
  const berthRules = allRules.filter((r) => r.berth === activeBerth);

  // Group rules by team type
  const rulesByTeam = useMemo(() => {
    const grouped: Record<TeamType, WorkerAssignmentRule[]> = {
      regular_pm: [],
      ac_pm: [],
      defect_mech: [],
      defect_elec: [],
    };
    berthRules.forEach((r) => {
      if (grouped[r.team_type]) grouped[r.team_type].push(r);
    });
    return grouped;
  }, [berthRules]);

  const renderRulesTable = (rules: WorkerAssignmentRule[]) => {
    const columns = [
      {
        title: 'Equipment',
        dataIndex: 'equipment_category',
        key: 'equipment_category',
        render: (cat: EquipmentCategory) => (
          <Tag color="default">{EQUIPMENT_CATEGORY_LABELS[cat]}</Tag>
        ),
      },
      {
        title: (
          <Tooltip title="Number of mechanical workers needed">
            <span>Mech</span>
          </Tooltip>
        ),
        dataIndex: 'mech_count',
        key: 'mech_count',
        width: 70,
        align: 'center' as const,
        render: (n: number) => <strong>{n}</strong>,
      },
      {
        title: (
          <Tooltip title="Number of electrical workers needed">
            <span>Elec</span>
          </Tooltip>
        ),
        dataIndex: 'elec_count',
        key: 'elec_count',
        width: 70,
        align: 'center' as const,
        render: (n: number) => <strong>{n}</strong>,
      },
      {
        title: 'Primary Mech Lead',
        key: 'primary_mech_lead',
        render: (_: any, r: WorkerAssignmentRule) => (
          <Space size={4}>
            <CrownOutlined style={{ color: '#faad14' }} />
            {r.primary_mech_lead?.full_name || <span style={{ color: '#bfbfbf' }}>—</span>}
            {r.successor_mech_lead && (
              <Tooltip title={`Successor: ${r.successor_mech_lead.full_name}`}>
                <Tag color="default" style={{ marginLeft: 4 }}>+1</Tag>
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: 'Primary Elec Lead',
        key: 'primary_elec_lead',
        render: (_: any, r: WorkerAssignmentRule) => (
          <Space size={4}>
            <ThunderboltOutlined style={{ color: '#1677ff' }} />
            {r.primary_elec_lead?.full_name || <span style={{ color: '#bfbfbf' }}>—</span>}
            {r.successor_elec_lead && (
              <Tooltip title={`Successor: ${r.successor_elec_lead.full_name}`}>
                <Tag color="default" style={{ marginLeft: 4 }}>+1</Tag>
              </Tooltip>
            )}
          </Space>
        ),
      },
      {
        title: 'Status',
        dataIndex: 'is_active',
        key: 'is_active',
        width: 90,
        render: (active: boolean) =>
          active ? <Tag color="green">Active</Tag> : <Tag color="default">Inactive</Tag>,
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 120,
        render: (_: any, r: WorkerAssignmentRule) => (
          <Space size={4}>
            <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
            <Popconfirm
              title="Delete this rule?"
              onConfirm={() => deleteMutation.mutate(r.id)}
              okText="Delete"
              okType="danger"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];

    if (rules.length === 0) {
      return <Empty description="No rules configured for this team type" />;
    }

    return (
      <Table
        size="small"
        rowKey="id"
        dataSource={rules}
        columns={columns}
        pagination={false}
      />
    );
  };

  if (isLoading) return <Spin />;

  if (tableMissing) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Database table missing"
        description="The worker_assignment_rules table doesn't exist yet. Run `flask db upgrade` on Render after this deploy."
      />
    );
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreate}
        >
          Add Rule
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
          Refresh
        </Button>
        {allRules.length === 0 && (
          <Button
            icon={<TeamOutlined />}
            onClick={() => seedDefaultsMutation.mutate()}
            loading={seedDefaultsMutation.isPending}
          >
            Seed Default Rules
          </Button>
        )}
      </Space>

      <Tabs
        activeKey={activeBerth}
        onChange={(k) => setActiveBerth(k as 'east' | 'west')}
        items={[
          { key: 'west', label: '⚓ West Berth' },
          { key: 'east', label: '🚢 East Berth' },
        ]}
      />

      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {TEAM_TYPES.map((tt) => (
          <Card
            key={tt}
            size="small"
            title={
              <Space>
                <Tag color={TEAM_TYPE_COLORS[tt]}>{TEAM_TYPE_LABELS[tt]}</Tag>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                  {rulesByTeam[tt].length} rule{rulesByTeam[tt].length !== 1 ? 's' : ''}
                </span>
              </Space>
            }
          >
            {renderRulesTable(rulesByTeam[tt])}
          </Card>
        ))}
      </Space>

      <Modal
        title={editingRule ? 'Edit Rule' : 'Create Worker Assignment Rule'}
        open={creating || !!editingRule}
        onOk={handleSubmit}
        onCancel={() => {
          setCreating(false);
          setEditingRule(null);
          form.resetFields();
        }}
        width={720}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="berth" label="Berth" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} disabled={!!editingRule}>
                {BERTHS.map((b) => (
                  <Select.Option key={b} value={b}>
                    {b === 'east' ? '🚢 East' : '⚓ West'}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="team_type" label="Team Type" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} disabled={!!editingRule}>
                {TEAM_TYPES.map((tt) => (
                  <Select.Option key={tt} value={tt}>
                    {TEAM_TYPE_LABELS[tt]}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="equipment_category" label="Equipment" rules={[{ required: true }]}>
              <Select style={{ width: 180 }} disabled={!!editingRule}>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <Select.Option key={c} value={c}>
                    {EQUIPMENT_CATEGORY_LABELS[c]}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Space>

          <Space size="middle">
            <Form.Item name="mech_count" label="Mechanical Workers" rules={[{ required: true }]}>
              <InputNumber min={0} max={20} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="elec_count" label="Electrical Workers" rules={[{ required: true }]}>
              <InputNumber min={0} max={20} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>

          <Card size="small" title={<><CrownOutlined /> Mechanical Lead</>} style={{ marginBottom: 12 }}>
            <Space size="middle">
              <Form.Item name="primary_mech_lead_id" label="Primary Lead">
                <Select
                  showSearch
                  allowClear
                  style={{ width: 240 }}
                  optionFilterProp="label"
                  options={workerOptions.mech}
                  placeholder="Select primary lead"
                />
              </Form.Item>
              <Form.Item name="successor_mech_lead_id" label="Successor (if primary on leave)">
                <Select
                  showSearch
                  allowClear
                  style={{ width: 240 }}
                  optionFilterProp="label"
                  options={workerOptions.mech}
                  placeholder="Select successor"
                />
              </Form.Item>
            </Space>
            <Form.Item name="candidate_mech_workers" label="Pool of mechanical workers (rotation)">
              <Select
                mode="multiple"
                showSearch
                allowClear
                optionFilterProp="label"
                options={workerOptions.mech}
                placeholder="Select workers from rotation pool"
              />
            </Form.Item>
          </Card>

          <Card size="small" title={<><ThunderboltOutlined /> Electrical Lead</>}>
            <Space size="middle">
              <Form.Item name="primary_elec_lead_id" label="Primary Lead">
                <Select
                  showSearch
                  allowClear
                  style={{ width: 240 }}
                  optionFilterProp="label"
                  options={workerOptions.elec}
                  placeholder="Select primary lead"
                />
              </Form.Item>
              <Form.Item name="successor_elec_lead_id" label="Successor (if primary on leave)">
                <Select
                  showSearch
                  allowClear
                  style={{ width: 240 }}
                  optionFilterProp="label"
                  options={workerOptions.elec}
                  placeholder="Select successor"
                />
              </Form.Item>
            </Space>
            <Form.Item name="candidate_elec_workers" label="Pool of electrical workers (rotation)">
              <Select
                mode="multiple"
                showSearch
                allowClear
                optionFilterProp="label"
                options={workerOptions.elec}
                placeholder="Select workers from rotation pool"
              />
            </Form.Item>
          </Card>
        </Form>
      </Modal>
    </div>
  );
};
