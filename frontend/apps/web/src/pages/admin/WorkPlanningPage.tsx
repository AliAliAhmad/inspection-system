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
  Upload,
  Divider,
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
  DownloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { workPlansApi, type WorkPlan, type WorkPlanJob } from '@inspection/shared';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { TimelineView, CalendarView, ViewToggle, type ViewMode } from '../../components/work-planning';

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
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Calculate week start (Monday)
  const currentWeekStart = dayjs().startOf('isoWeek').add(weekOffset, 'week');
  const weekStartStr = currentWeekStart.format('YYYY-MM-DD');

  // Fetch work plan for current week with full details
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
      const successMsg = `Imported ${data.created} jobs`;
      const extraInfo = data.templates_linked > 0
        ? ` (${data.templates_linked} linked to PM templates, ${data.materials_added} materials added)`
        : '';

      message.success(successMsg + extraInfo);

      if (data.errors?.length) {
        Modal.warning({
          title: 'Import completed with some errors',
          width: 600,
          content: (
            <div>
              <p>
                <strong>Created:</strong> {data.created} jobs
              </p>
              {data.templates_linked > 0 && (
                <p>
                  <strong>Templates linked:</strong> {data.templates_linked}
                </p>
              )}
              {data.materials_added > 0 && (
                <p>
                  <strong>Materials added:</strong> {data.materials_added}
                </p>
              )}
              <Divider />
              <p><strong>Errors ({data.errors.length}):</strong></p>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {data.errors.map((e, i) => (
                    <li key={i} style={{ color: '#ff4d4f' }}>{e}</li>
                  ))}
                </ul>
              </div>
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

  const handleJobClick = (job: WorkPlanJob) => {
    if (currentPlan) {
      const dayDate = dayjs(job.created_at).format('YYYY-MM-DD');
      // Find the day this job belongs to
      const day = currentPlan.days?.find(d =>
        d.jobs_east?.some(j => j.id === job.id) ||
        d.jobs_west?.some(j => j.id === job.id) ||
        d.jobs_both?.some(j => j.id === job.id)
      );
      if (day) {
        navigate(`/admin/work-plan/${currentPlan.id}/day/${day.date}`);
      } else {
        navigate(`/admin/work-plan/${currentPlan.id}`);
      }
    }
  };

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
                Import
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
            <Space>
              <ViewToggle value={viewMode} onChange={setViewMode} />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                New Week Plan
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Week Navigation */}
        <Card style={{ marginBottom: 24 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)}>
                Previous
              </Button>
            </Col>
            <Col style={{ textAlign: 'center' }}>
              <Title level={4} style={{ margin: 0 }}>
                {currentWeekStart.format('MMMM D')} - {currentWeekStart.add(6, 'day').format('MMMM D, YYYY')}
              </Title>
              {weekOffset !== 0 && (
                <Button type="link" onClick={() => setWeekOffset(0)} size="small">
                  Go to current week
                </Button>
              )}
              {currentPlan && (
                <div style={{ marginTop: 8 }}>
                  <Tag color={STATUS_COLORS[currentPlan.status]}>{currentPlan.status.toUpperCase()}</Tag>
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {currentPlan.total_jobs} jobs
                  </Text>
                  {currentPlan.status === 'draft' && (
                    <Button
                      type="link"
                      size="small"
                      icon={<UploadOutlined />}
                      onClick={() => {
                        setSelectedPlanId(currentPlan.id);
                        setImportModalOpen(true);
                      }}
                    >
                      Import SAP
                    </Button>
                  )}
                </div>
              )}
            </Col>
            <Col>
              <Button onClick={() => setWeekOffset((o) => o + 1)}>
                Next <RightOutlined />
              </Button>
            </Col>
          </Row>
        </Card>

        {/* Timeline/Calendar View */}
        {currentPlan ? (
          viewMode === 'timeline' ? (
            <TimelineView
              plan={currentPlan}
              onJobClick={handleJobClick}
              readOnly={currentPlan.status === 'published'}
            />
          ) : (
            <CalendarView
              plan={currentPlan}
              onJobClick={handleJobClick}
            />
          )
        ) : (
          <Card style={{ marginBottom: 24 }}>
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Text type="secondary" style={{ fontSize: '16px' }}>No plan for this week.</Text>
              <br />
              <Button type="primary" onClick={() => setCreateModalOpen(true)} style={{ marginTop: 16 }}>
                Create Plan for This Week
              </Button>
            </div>
          </Card>
        )}

        {/* All Plans Table */}
        <div style={{ marginTop: 24 }}>
          <Title level={4}>All Work Plans</Title>
          <Table
            dataSource={allPlansData?.work_plans || []}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 10 }}
          />
        </div>
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
        width={600}
      >
        <p>Upload an Excel file with SAP work orders.</p>

        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Text strong>Required columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li><code>order_number</code> - SAP order number</li>
            <li><code>type</code> - PM, CM (Corrective), or INS (Inspection)</li>
            <li><code>equipment_code</code> - Equipment serial number</li>
            <li><code>date</code> - Target date (YYYY-MM-DD)</li>
            <li><code>estimated_hours</code> - Estimated hours</li>
          </ul>

          <Text strong>Optional columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
            <li><code>description</code> - Job description</li>
            <li><code>priority</code> - low, normal, high, urgent</li>
            <li><code>cycle_value</code> - Cycle value (e.g., 250, 500, 1000)</li>
            <li><code>cycle_unit</code> - hours, days, weeks, months</li>
            <li><code>maintenance_base</code> - running_hours, calendar, condition</li>
            <li><code>overdue_value</code> - Hours or days overdue</li>
            <li><code>overdue_unit</code> - hours or days</li>
            <li><code>planned_date</code> - Original planned date</li>
            <li><code>note</code> - Additional notes</li>
          </ul>
        </Card>

        <p style={{ color: '#52c41a' }}>
          PM jobs with matching cycles will auto-link to PM templates and add required materials.
        </p>

        <Upload
          accept=".xlsx,.xls"
          beforeUpload={handleImport}
          showUploadList={false}
        >
          <Button icon={<FileExcelOutlined />} loading={importMutation.isPending} type="primary">
            Select Excel File
          </Button>
        </Upload>
      </Modal>
    </div>
  );
}
