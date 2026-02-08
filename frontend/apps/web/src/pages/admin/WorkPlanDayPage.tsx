import { useState, useMemo } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  InputNumber,
  Select,
  Input,
  message,
  Row,
  Col,
  List,
  Avatar,
  Tabs,
  Badge,
  Tooltip,
  Dropdown,
  Drawer,
  Divider,
  Empty,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  DeleteOutlined,
  UserAddOutlined,
  ToolOutlined,
  ExperimentOutlined,
  EyeOutlined,
  MoreOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  workPlansApi,
  materialsApi,
  usersApi,
  type WorkPlan,
  type WorkPlanDay,
  type WorkPlanJob,
  type AvailablePMJob,
  type AvailableDefectJob,
  type Material,
  type MaterialKit,
} from '@inspection/shared';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const JOB_TYPE_ICONS: Record<string, React.ReactNode> = {
  pm: <ToolOutlined />,
  defect: <ExperimentOutlined />,
  inspection: <EyeOutlined />,
};

const JOB_TYPE_COLORS: Record<string, string> = {
  pm: 'blue',
  defect: 'red',
  inspection: 'green',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

export default function WorkPlanDayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { planId, date } = useParams<{ planId: string; date: string }>();

  const [selectedBerth, setSelectedBerth] = useState<string>('east');
  const [addJobModal, setAddJobModal] = useState(false);
  const [assignUserModal, setAssignUserModal] = useState<number | null>(null);
  const [addMaterialDrawer, setAddMaterialDrawer] = useState<number | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<string>('pm');
  const [form] = Form.useForm();

  // Fetch work plan
  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['work-plan', planId],
    queryFn: () => workPlansApi.get(Number(planId)).then((r) => (r.data as any).work_plan as WorkPlan),
    enabled: !!planId,
  });

  // Find the current day
  const currentDay = useMemo(() => {
    return planData?.days?.find((d) => d.date === date);
  }, [planData, date]);

  // Fetch available jobs
  const { data: availableJobs } = useQuery({
    queryKey: ['available-jobs', selectedBerth],
    queryFn: () => workPlansApi.getAvailableJobs({ berth: selectedBerth }).then((r) => r.data),
  });

  // Fetch users for assignment
  const { data: usersData } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }).then((r) => r.data.data),
  });

  // Fetch materials
  const { data: materialsData } = useQuery({
    queryKey: ['materials'],
    queryFn: () => materialsApi.list().then((r) => r.data.materials),
  });

  // Fetch material kits
  const { data: kitsData } = useQuery({
    queryKey: ['material-kits'],
    queryFn: () => materialsApi.listKits().then((r) => r.data.kits),
  });

  // Filter jobs by berth
  const jobsByBerth = useMemo(() => {
    if (!currentDay) return { east: [], west: [], both: [] };
    return {
      east: currentDay.jobs_east || [],
      west: currentDay.jobs_west || [],
      both: currentDay.jobs_both || [],
    };
  }, [currentDay]);

  const displayedJobs = [...(jobsByBerth[selectedBerth as keyof typeof jobsByBerth] || []), ...jobsByBerth.both];

  // Mutations
  const addJobMutation = useMutation({
    mutationFn: (payload: any) => workPlansApi.addJob(Number(planId), payload),
    onSuccess: () => {
      message.success('Job added');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
      setAddJobModal(false);
      form.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to add job');
    },
  });

  const removeJobMutation = useMutation({
    mutationFn: (jobId: number) => workPlansApi.removeJob(Number(planId), jobId),
    onSuccess: () => {
      message.success('Job removed');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: ({ jobId, userId, isLead }: { jobId: number; userId: number; isLead?: boolean }) =>
      workPlansApi.assignUser(Number(planId), jobId, { user_id: userId, is_lead: isLead }),
    onSuccess: () => {
      message.success('User assigned');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
      setAssignUserModal(null);
    },
  });

  const unassignUserMutation = useMutation({
    mutationFn: ({ jobId, assignmentId }: { jobId: number; assignmentId: number }) =>
      workPlansApi.unassignUser(Number(planId), jobId, assignmentId),
    onSuccess: () => {
      message.success('User unassigned');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
    },
  });

  const addMaterialMutation = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: number; payload: any }) =>
      workPlansApi.addMaterial(Number(planId), jobId, payload),
    onSuccess: () => {
      message.success('Material added');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
    },
  });

  const removeMaterialMutation = useMutation({
    mutationFn: ({ jobId, materialId }: { jobId: number; materialId: number }) =>
      workPlansApi.removeMaterial(Number(planId), jobId, materialId),
    onSuccess: () => {
      message.success('Material removed');
      queryClient.invalidateQueries({ queryKey: ['work-plan', planId] });
    },
  });

  const handleAddJob = (values: any) => {
    addJobMutation.mutate({
      date,
      job_type: selectedJobType,
      berth: selectedBerth,
      equipment_id: values.equipment_id,
      defect_id: values.defect_id,
      estimated_hours: values.estimated_hours,
      priority: values.priority || 'normal',
      notes: values.notes,
    });
  };

  const isDraft = planData?.status === 'draft';

  const renderJobCard = (job: WorkPlanJob) => (
    <Card
      key={job.id}
      size="small"
      style={{ marginBottom: 8 }}
      extra={
        isDraft && (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'assign',
                  icon: <UserAddOutlined />,
                  label: 'Assign User',
                  onClick: () => setAssignUserModal(job.id),
                },
                {
                  key: 'materials',
                  icon: <ToolOutlined />,
                  label: 'Add Materials',
                  onClick: () => setAddMaterialDrawer(job.id),
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: 'Remove',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: 'Remove this job?',
                      onOk: () => removeJobMutation.mutate(job.id),
                    });
                  },
                },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      }
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space>
          <Tag color={JOB_TYPE_COLORS[job.job_type]}>
            {JOB_TYPE_ICONS[job.job_type]} {job.job_type.toUpperCase()}
          </Tag>
          <Tag color={PRIORITY_COLORS[job.priority]}>{job.priority}</Tag>
          <Tag icon={<ClockCircleOutlined />}>{job.estimated_hours}h</Tag>
        </Space>

        {job.equipment && (
          <Text strong>
            {job.equipment.serial_number} - {job.equipment.name}
          </Text>
        )}

        {job.defect && (
          <Text type="secondary" ellipsis>
            Defect: {job.defect.description}
          </Text>
        )}

        {job.sap_order_number && <Text type="secondary">SAP: {job.sap_order_number}</Text>}

        {/* Assigned users */}
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Assigned: </Text>
          {job.assignments.length === 0 ? (
            <Text type="secondary">None</Text>
          ) : (
            <Space wrap size={4}>
              {job.assignments.map((a) => (
                <Tag
                  key={a.id}
                  closable={isDraft}
                  onClose={() => unassignUserMutation.mutate({ jobId: job.id, assignmentId: a.id })}
                >
                  {a.is_lead && '* '}
                  {a.user?.full_name}
                </Tag>
              ))}
            </Space>
          )}
        </div>

        {/* Materials */}
        {job.materials.length > 0 && (
          <div>
            <Text type="secondary">Materials: </Text>
            <Space wrap size={4}>
              {job.materials.map((m) => (
                <Tag
                  key={m.id}
                  closable={isDraft}
                  onClose={() => removeMaterialMutation.mutate({ jobId: job.id, materialId: m.id })}
                >
                  {m.material?.code} x{m.quantity}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {/* Related defects for PM jobs */}
        {job.job_type === 'pm' && job.related_defects_count && job.related_defects_count > 0 && (
          <div>
            <Badge count={job.related_defects_count} style={{ backgroundColor: '#f5222d' }} />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              related defects
            </Text>
          </div>
        )}
      </Space>
    </Card>
  );

  if (!planData || !currentDay) {
    return (
      <Card loading={planLoading}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/admin/work-plan/${planId}`)}>
                Back to Week
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                {dayjs(date).format('dddd, MMMM D, YYYY')}
              </Title>
              <Tag color={planData.status === 'draft' ? 'orange' : 'green'}>{planData.status.toUpperCase()}</Tag>
            </Space>
          </Col>
          {isDraft && (
            <Col>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddJobModal(true)}>
                Add Job
              </Button>
            </Col>
          )}
        </Row>

        <Tabs
          activeKey={selectedBerth}
          onChange={setSelectedBerth}
          items={[
            { key: 'east', label: <Badge count={jobsByBerth.east.length}>EAST Berth</Badge> },
            { key: 'west', label: <Badge count={jobsByBerth.west.length}>WEST Berth</Badge> },
          ]}
        />

        <Row gutter={24} style={{ marginTop: 16 }}>
          {/* Jobs List */}
          <Col span={16}>
            <Card title={`Jobs - ${selectedBerth.toUpperCase()} Berth`} size="small">
              {displayedJobs.length === 0 ? (
                <Empty description="No jobs scheduled. Click 'Add Job' to add one." />
              ) : (
                displayedJobs.map(renderJobCard)
              )}
            </Card>
          </Col>

          {/* Available Team */}
          <Col span={8}>
            <Card title="Available Team" size="small">
              <List
                size="small"
                dataSource={usersData?.filter((u: any) => !u.is_on_leave && u.role !== 'admin') || []}
                renderItem={(user: any) => (
                  <List.Item>
                    <Space>
                      <Avatar size="small">{user.full_name?.[0]}</Avatar>
                      <Text>{user.full_name}</Text>
                      <Tag color="blue">{user.role}</Tag>
                    </Space>
                  </List.Item>
                )}
                style={{ maxHeight: 400, overflow: 'auto' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Add Job Modal */}
      <Modal
        title="Add Job to Plan"
        open={addJobModal}
        onCancel={() => setAddJobModal(false)}
        onOk={() => form.submit()}
        confirmLoading={addJobMutation.isPending}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleAddJob}>
          <Form.Item label="Job Type">
            <Select value={selectedJobType} onChange={setSelectedJobType}>
              <Select.Option value="pm">PM (Preventive Maintenance)</Select.Option>
              <Select.Option value="defect">Defect Repair</Select.Option>
              <Select.Option value="inspection">Inspection</Select.Option>
            </Select>
          </Form.Item>

          {selectedJobType === 'pm' && (
            <Form.Item
              name="equipment_id"
              label="Equipment"
              rules={[{ required: true, message: 'Select equipment' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={availableJobs?.pm_jobs?.map((j: AvailablePMJob) => ({
                  value: j.equipment.id,
                  label: `${j.equipment.serial_number} - ${j.equipment.name}`,
                }))}
                placeholder="Select equipment for PM"
              />
            </Form.Item>
          )}

          {selectedJobType === 'defect' && (
            <>
              <Form.Item
                name="defect_id"
                label="Defect"
                rules={[{ required: true, message: 'Select defect' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={availableJobs?.defect_jobs?.map((j: AvailableDefectJob) => ({
                    value: j.defect.id,
                    label: `${j.equipment?.serial_number || 'N/A'} - ${j.defect.description?.substring(0, 50)}...`,
                  }))}
                  placeholder="Select defect to repair"
                />
              </Form.Item>
              <Form.Item name="equipment_id" hidden>
                <Input />
              </Form.Item>
            </>
          )}

          <Form.Item
            name="estimated_hours"
            label="Estimated Hours"
            rules={[{ required: true, message: 'Enter estimated hours' }]}
          >
            <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} placeholder="e.g., 4.0" />
          </Form.Item>

          <Form.Item name="priority" label="Priority" initialValue="normal">
            <Select>
              <Select.Option value="low">Low</Select.Option>
              <Select.Option value="normal">Normal</Select.Option>
              <Select.Option value="high">High</Select.Option>
              <Select.Option value="urgent">Urgent</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional notes" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign User Modal */}
      <Modal
        title="Assign User to Job"
        open={!!assignUserModal}
        onCancel={() => setAssignUserModal(null)}
        footer={null}
      >
        <List
          dataSource={usersData?.filter((u: any) => !u.is_on_leave && u.role !== 'admin') || []}
          renderItem={(user: any) => (
            <List.Item
              actions={[
                <Button
                  size="small"
                  onClick={() =>
                    assignUserMutation.mutate({ jobId: assignUserModal!, userId: user.id, isLead: false })
                  }
                >
                  Assign
                </Button>,
                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    assignUserMutation.mutate({ jobId: assignUserModal!, userId: user.id, isLead: true })
                  }
                >
                  Assign as Lead
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar>{user.full_name?.[0]}</Avatar>}
                title={user.full_name}
                description={
                  <Space>
                    <Tag color="blue">{user.role}</Tag>
                    {user.specialization && <Tag>{user.specialization}</Tag>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* Add Materials Drawer */}
      <Drawer
        title="Add Materials"
        open={!!addMaterialDrawer}
        onClose={() => setAddMaterialDrawer(null)}
        width={400}
      >
        <Title level={5}>Material Kits</Title>
        <List
          size="small"
          dataSource={kitsData || []}
          renderItem={(kit: MaterialKit) => (
            <List.Item
              actions={[
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    addMaterialMutation.mutate({
                      jobId: addMaterialDrawer!,
                      payload: { kit_id: kit.id },
                    });
                  }}
                >
                  Add Kit
                </Button>,
              ]}
            >
              <List.Item.Meta title={kit.name} description={`${kit.items.length} items`} />
            </List.Item>
          )}
        />

        <Divider />

        <Title level={5}>Individual Materials</Title>
        <List
          size="small"
          dataSource={materialsData || []}
          renderItem={(material: Material) => (
            <List.Item
              actions={[
                <Button
                  size="small"
                  onClick={() => {
                    addMaterialMutation.mutate({
                      jobId: addMaterialDrawer!,
                      payload: { material_id: material.id, quantity: 1 },
                    });
                  }}
                >
                  Add
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={`${material.code} - ${material.name}`}
                description={`Stock: ${material.current_stock} ${material.unit}`}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
}
