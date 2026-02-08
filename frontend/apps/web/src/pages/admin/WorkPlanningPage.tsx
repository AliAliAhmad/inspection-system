import { useState } from 'react';
import {
  Card,
  Button,
  Space,
  Table,
  Tag,
  Typography,
  Modal,
  Form,
  DatePicker,
  Input,
  message,
  Row,
  Col,
  Statistic,
  Badge,
  Tooltip,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { workPlansApi, type WorkPlan } from '@inspection/shared';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

const STATUS_COLORS: Record<string, string> = {
  draft: 'orange',
  published: 'green',
};

export default function WorkPlanningPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Calculate week start (Monday)
  const currentWeekStart = dayjs().startOf('isoWeek').add(weekOffset, 'week');
  const weekStartStr = currentWeekStart.format('YYYY-MM-DD');

  // Fetch work plans
  const { data: plansData, isLoading } = useQuery({
    queryKey: ['work-plans', weekStartStr],
    queryFn: () => workPlansApi.list({ week_start: weekStartStr, include_days: true }).then((r) => r.data),
  });

  // Fetch all plans for the list view
  const { data: allPlansData } = useQuery({
    queryKey: ['work-plans', 'all'],
    queryFn: () => workPlansApi.list({ include_days: false }).then((r) => r.data),
  });

  const currentPlan = plansData?.work_plans?.[0];

  // Create plan mutation
  const createMutation = useMutation({
    mutationFn: (values: { week_start: string; notes?: string }) => workPlansApi.create(values),
    onSuccess: (response) => {
      message.success('Work plan created');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setCreateModalOpen(false);
      form.resetFields();
      // Navigate to the plan
      const plan = (response.data as any).work_plan;
      if (plan?.id) {
        navigate(`/admin/work-plan/${plan.id}`);
      }
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to create plan');
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: (planId: number) => workPlansApi.publish(planId),
    onSuccess: () => {
      message.success('Work plan published! Notifications sent to all assigned users.');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to publish plan');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (planId: number) => workPlansApi.delete(planId),
    onSuccess: () => {
      message.success('Work plan deleted');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to delete plan');
    },
  });

  // Import SAP mutation
  const importMutation = useMutation({
    mutationFn: ({ planId, file }: { planId: number; file: File }) => workPlansApi.importSAP(planId, file),
    onSuccess: (response) => {
      const data = response.data;
      message.success(`Imported ${data.created} jobs`);
      if (data.errors?.length) {
        Modal.warning({
          title: 'Import completed with errors',
          content: (
            <div>
              <p>Created: {data.created} jobs</p>
              <p>Errors:</p>
              <ul>
                {data.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setImportModalOpen(false);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Import failed');
    },
  });

  const handleCreatePlan = (values: any) => {
    const weekStart = values.week_start.startOf('isoWeek').format('YYYY-MM-DD');
    createMutation.mutate({ week_start: weekStart, notes: values.notes });
  };

  const handleImport = (file: File) => {
    if (selectedPlanId) {
      importMutation.mutate({ planId: selectedPlanId, file });
    }
    return false;
  };

  // Generate week days
  const weekDays = Array.from({ length: 7 }, (_, i) => currentWeekStart.add(i, 'day'));

  const columns = [
    {
      title: 'Week',
      key: 'week',
      render: (_: any, record: WorkPlan) => (
        <Space>
          <CalendarOutlined />
          <span>
            {dayjs(record.week_start).format('MMM D')} - {dayjs(record.week_end).format('MMM D, YYYY')}
          </span>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status: string) => <Tag color={STATUS_COLORS[status]}>{status.toUpperCase()}</Tag>,
    },
    {
      title: 'Total Jobs',
      dataIndex: 'total_jobs',
      render: (count: number) => <Badge count={count} showZero color={count > 0 ? 'blue' : 'default'} />,
    },
    {
      title: 'Created By',
      dataIndex: 'created_by',
      render: (user: any) => user?.full_name || '-',
    },
    {
      title: 'Published',
      dataIndex: 'published_at',
      render: (date: string) => (date ? dayjs(date).format('MMM D, HH:mm') : '-'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: WorkPlan) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/admin/work-plan/${record.id}`)}>
            {record.status === 'draft' ? 'Edit' : 'View'}
          </Button>
          {record.status === 'draft' && (
            <>
              <Button
                type="link"
                icon={<UploadOutlined />}
                onClick={() => {
                  setSelectedPlanId(record.id);
                  setImportModalOpen(true);
                }}
              >
                Import SAP
              </Button>
              <Button
                type="link"
                icon={<SendOutlined />}
                onClick={() => {
                  Modal.confirm({
                    title: 'Publish Work Plan?',
                    content: 'This will generate a PDF and notify all assigned employees.',
                    onOk: () => publishMutation.mutate(record.id),
                  });
                }}
              >
                Publish
              </Button>
              <Button
                type="link"
                danger
                onClick={() => {
                  Modal.confirm({
                    title: 'Delete Work Plan?',
                    content: 'This will permanently delete this draft plan.',
                    onOk: () => deleteMutation.mutate(record.id),
                  });
                }}
              >
                Delete
              </Button>
            </>
          )}
          {record.pdf_url && (
            <Button type="link" icon={<FilePdfOutlined />} href={record.pdf_url} target="_blank">
              PDF
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <CalendarOutlined /> Work Planning
            </Title>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              New Week Plan
            </Button>
          </Col>
        </Row>

        {/* Week Navigation */}
        <Card style={{ marginBottom: 24 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)}>
                Previous Week
              </Button>
            </Col>
            <Col>
              <Title level={4} style={{ margin: 0 }}>
                {currentWeekStart.format('MMMM D')} - {currentWeekStart.add(6, 'day').format('MMMM D, YYYY')}
              </Title>
              {weekOffset !== 0 && (
                <Button type="link" onClick={() => setWeekOffset(0)}>
                  Go to current week
                </Button>
              )}
            </Col>
            <Col>
              <Button onClick={() => setWeekOffset((o) => o + 1)}>
                Next Week <RightOutlined />
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Week Calendar View */}
        <Card style={{ marginBottom: 24 }}>
          <Row gutter={8}>
            {weekDays.map((day, idx) => {
              const dayStr = day.format('YYYY-MM-DD');
              const jobCount = currentPlan?.jobs_by_day?.[dayStr] || 0;
              const isToday = day.isSame(dayjs(), 'day');

              return (
                <Col span={24 / 7} key={idx}>
                  <Card
                    size="small"
                    hoverable={!!currentPlan}
                    onClick={() => currentPlan && navigate(`/admin/work-plan/${currentPlan.id}/day/${dayStr}`)}
                    style={{
                      textAlign: 'center',
                      background: isToday ? '#e6f7ff' : undefined,
                      borderColor: isToday ? '#1890ff' : undefined,
                    }}
                  >
                    <Text strong>{day.format('ddd')}</Text>
                    <br />
                    <Text>{day.format('MMM D')}</Text>
                    <br />
                    <Badge count={jobCount} showZero color={jobCount > 0 ? 'blue' : 'default'} />
                  </Card>
                </Col>
              );
            })}
          </Row>
          {!currentPlan && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Text type="secondary">No plan for this week.</Text>
              <br />
              <Button type="primary" onClick={() => setCreateModalOpen(true)} style={{ marginTop: 8 }}>
                Create Plan for This Week
              </Button>
            </div>
          )}
          {currentPlan && (
            <Row style={{ marginTop: 16 }} gutter={24} justify="center">
              <Col>
                <Statistic title="Total Jobs" value={currentPlan.total_jobs} />
              </Col>
              <Col>
                <Statistic
                  title="Status"
                  valueRender={() => <Tag color={STATUS_COLORS[currentPlan.status]}>{currentPlan.status.toUpperCase()}</Tag>}
                />
              </Col>
            </Row>
          )}
        </Card>

        {/* All Plans Table */}
        <Title level={4}>All Work Plans</Title>
        <Table
          dataSource={allPlansData?.work_plans || []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title="Create New Work Plan"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleCreatePlan}>
          <Form.Item
            name="week_start"
            label="Week Starting (Monday)"
            rules={[{ required: true, message: 'Please select a week' }]}
            initialValue={currentWeekStart}
          >
            <DatePicker picker="week" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Optional notes for this week's plan" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import SAP Modal */}
      <Modal
        title="Import SAP Work Orders"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
      >
        <p>Upload an Excel file with SAP work orders. Expected columns:</p>
        <ul>
          <li>order_number - SAP order number</li>
          <li>type - PM, CM (Corrective), or INS (Inspection)</li>
          <li>equipment_code - Equipment code</li>
          <li>date - Target date (YYYY-MM-DD)</li>
          <li>estimated_hours - Estimated hours</li>
          <li>priority - (optional) low, normal, high, urgent</li>
          <li>description - (optional) Job description</li>
        </ul>
        <Upload
          accept=".xlsx,.xls"
          beforeUpload={handleImport}
          showUploadList={false}
        >
          <Button icon={<FileExcelOutlined />} loading={importMutation.isPending}>
            Select Excel File
          </Button>
        </Upload>
      </Modal>
    </div>
  );
}
