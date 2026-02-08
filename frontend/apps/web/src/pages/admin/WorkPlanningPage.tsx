import { useState, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  DatePicker,
  Input,
  message,
  Row,
  Col,
  Badge,
  Upload,
  Divider,
  Tabs,
  Dropdown,
  Tooltip,
  Select,
  Radio,
  Spin,
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
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, type WorkPlan, type WorkPlanJob, type WorkPlanDay, type Berth, type JobType } from '@inspection/shared';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import {
  TimelineView,
  CalendarView,
  ViewToggle,
  JobsPool,
  EmployeePool,
  TimelineJobBlock,
  type ViewMode
} from '../../components/work-planning';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

type BerthTab = 'east' | 'west';

// Droppable Day Wrapper for receiving jobs from pool
const DroppableDay: React.FC<{
  day: WorkPlanDay;
  berth: BerthTab;
  children: React.ReactNode;
}> = ({ day, berth, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}-${berth}`,
    data: { type: 'day', day, berth },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        backgroundColor: isOver ? '#e6f7ff' : undefined,
        border: isOver ? '2px dashed #1890ff' : '2px solid transparent',
        borderRadius: 8,
        transition: 'all 0.2s',
        minHeight: 100,
      }}
    >
      {children}
    </div>
  );
};

export default function WorkPlanningPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [berth, setBerth] = useState<BerthTab>('east');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [addJobModalOpen, setAddJobModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [jobDetailsModalOpen, setJobDetailsModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<WorkPlanJob | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<{ job: WorkPlanJob; user: any } | null>(null);
  const [activeItem, setActiveItem] = useState<{ type: string; data: any } | null>(null);
  const [form] = Form.useForm();
  const [addJobForm] = Form.useForm();

  // Calculate week start (Monday)
  const currentWeekStart = dayjs().startOf('isoWeek').add(weekOffset, 'week');
  const weekStartStr = currentWeekStart.format('YYYY-MM-DD');

  // Sensors for drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Fetch work plan for current week with full details
  const { data: plansData, isLoading, refetch } = useQuery({
    queryKey: ['work-plans', weekStartStr],
    queryFn: () => workPlansApi.list({ week_start: weekStartStr, include_days: true }).then((r) => r.data),
    staleTime: 0, // Always refetch when week changes
  });

  const currentPlan = plansData?.work_plans?.[0];
  const isDraft = currentPlan?.status === 'draft';

  // Create plan mutation
  const createMutation = useMutation({
    mutationFn: (values: { week_start: string; notes?: string }) => workPlansApi.create(values),
    onSuccess: () => {
      message.success('Work plan created');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setCreateModalOpen(false);
      form.resetFields();
    },
    onError: (err: any, variables) => {
      const errorMsg = err.response?.data?.message || 'Failed to create plan';
      if (errorMsg.includes('already exists')) {
        message.info('A plan already exists for this week. Loading it now...');
        setCreateModalOpen(false);
        form.resetFields();
        // Navigate to the week that was selected
        const selectedWeek = dayjs(variables.week_start).startOf('isoWeek');
        const currentWeek = dayjs().startOf('isoWeek');
        const diffWeeks = selectedWeek.diff(currentWeek, 'week');
        setWeekOffset(diffWeeks);
      } else {
        message.error(errorMsg);
      }
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

  // Move job mutation (for drag between days)
  const moveMutation = useMutation({
    mutationFn: ({ planId, jobId, targetDayId, position }: { planId: number; jobId: number; targetDayId: number; position?: number }) =>
      workPlansApi.moveJob(planId, jobId, { target_day_id: targetDayId, position }),
    onSuccess: () => {
      message.success('Job moved');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to move job');
    },
  });

  // Add job mutation (for drag from pool)
  const addJobMutation = useMutation({
    mutationFn: (payload: { planId: number; dayId: number; jobType: JobType; berth: Berth; equipmentId?: number; defectId?: number; inspectionAssignmentId?: number; estimatedHours: number }) =>
      workPlansApi.addJob(payload.planId, {
        day_id: payload.dayId,
        job_type: payload.jobType,
        berth: payload.berth,
        equipment_id: payload.equipmentId,
        defect_id: payload.defectId,
        inspection_assignment_id: payload.inspectionAssignmentId,
        estimated_hours: payload.estimatedHours,
      }),
    onSuccess: () => {
      message.success('Job added to plan');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to add job');
    },
  });

  // Assign user mutation (for drag employee to job)
  const assignMutation = useMutation({
    mutationFn: ({ planId, jobId, userId, isLead }: { planId: number; jobId: number; userId: number; isLead: boolean }) =>
      workPlansApi.assignUser(planId, jobId, { user_id: userId, is_lead: isLead }),
    onSuccess: () => {
      message.success('User assigned');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      setAssignModalOpen(false);
      setPendingAssignment(null);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to assign user');
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
          title: 'Import completed with some errors',
          content: (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {data.errors.map((e, i) => <div key={i} style={{ color: '#ff4d4f' }}>{e}</div>)}
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

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data) {
      setActiveItem({ type: data.type, data: data });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over || !currentPlan || !isDraft) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (!activeData || !overData) return;

    // Case 1: Moving job from pool to day
    if (activeData.type === 'pool-job' && overData.type === 'day') {
      const job = activeData.job;
      const targetDay = overData.day as WorkPlanDay;
      const targetBerth = overData.berth as Berth;

      const equipmentId = job.equipment?.id;
      const defectId = job.defect?.id;
      const inspectionAssignmentId = job.assignment?.id;
      const estimatedHours = job.estimated_hours || 4;
      const jobType = activeData.jobType as JobType;

      addJobMutation.mutate({
        planId: currentPlan.id,
        dayId: targetDay.id,
        jobType,
        berth: targetBerth,
        equipmentId,
        defectId,
        inspectionAssignmentId,
        estimatedHours,
      });
    }

    // Case 2: Moving job between days
    if (activeData.type === 'job' && overData.type === 'day') {
      const job = activeData.job as WorkPlanJob;
      const targetDay = overData.day as WorkPlanDay;
      const sourceDayId = activeData.dayId;

      if (sourceDayId !== targetDay.id) {
        moveMutation.mutate({
          planId: currentPlan.id,
          jobId: job.id,
          targetDayId: targetDay.id,
        });
      }
    }

    // Case 3: Dropping employee on a job
    if (activeData.type === 'employee' && overData.type === 'job') {
      const user = activeData.user;
      const job = overData.job as WorkPlanJob;

      // Show modal to choose Lead or Member
      setPendingAssignment({ job, user });
      setAssignModalOpen(true);
    }
  }, [currentPlan, isDraft, addJobMutation, moveMutation]);

  const handleCreatePlan = (values: any) => {
    const weekStart = values.week_start.startOf('isoWeek').format('YYYY-MM-DD');
    createMutation.mutate({ week_start: weekStart, notes: values.notes });
  };

  const handleImport = (file: File) => {
    if (!currentPlan) {
      message.error('Please create or select a work plan first');
      return false;
    }
    if (!isDraft) {
      message.error('Cannot import to a published plan');
      return false;
    }
    importMutation.mutate({ planId: currentPlan.id, file });
    return false;
  };

  const handleJobClick = (job: WorkPlanJob) => {
    setSelectedJob(job);
    setJobDetailsModalOpen(true);
  };

  const handleAssign = (isLead: boolean) => {
    if (pendingAssignment && currentPlan) {
      assignMutation.mutate({
        planId: currentPlan.id,
        jobId: pendingAssignment.job.id,
        userId: pendingAssignment.user.id,
        isLead,
      });
    }
  };

  // Get jobs for current berth
  const getJobsForBerth = (day: WorkPlanDay): WorkPlanJob[] => {
    if (berth === 'east') {
      return [...(day.jobs_east || []), ...(day.jobs_both || [])];
    } else {
      return [...(day.jobs_west || []), ...(day.jobs_both || [])];
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <Card bodyStyle={{ padding: '12px 16px' }} style={{ marginBottom: 12 }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space size="large">
                <Title level={4} style={{ margin: 0 }}>
                  <CalendarOutlined /> Work Planning
                </Title>
                {/* Week Navigation */}
                <Space>
                  <Button icon={<LeftOutlined />} onClick={() => setWeekOffset((o) => o - 1)} />
                  <div style={{ minWidth: 200, textAlign: 'center' }}>
                    <Text strong style={{ fontSize: 14 }}>
                      {currentWeekStart.format('MMM D')} - {currentWeekStart.add(6, 'day').format('MMM D, YYYY')}
                    </Text>
                    {weekOffset !== 0 && (
                      <Button type="link" size="small" onClick={() => setWeekOffset(0)}>
                        Today
                      </Button>
                    )}
                  </div>
                  <Button icon={<RightOutlined />} onClick={() => setWeekOffset((o) => o + 1)} />
                </Space>
              </Space>
            </Col>
            <Col>
              <Space>
                {/* Plan Status */}
                {currentPlan && (
                  <Badge
                    status={currentPlan.status === 'published' ? 'success' : 'warning'}
                    text={<Text type="secondary">{currentPlan.status.toUpperCase()} • {currentPlan.total_jobs} jobs</Text>}
                  />
                )}
                <ViewToggle value={viewMode} onChange={setViewMode} />
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'import',
                        label: '📥 Import SAP Orders',
                        onClick: () => setImportModalOpen(true),
                        disabled: !currentPlan || !isDraft,
                      },
                      {
                        key: 'download-template',
                        label: '📄 Download SAP Template',
                        onClick: () => {
                          window.open(workPlansApi.getSAPImportTemplateUrl(), '_blank');
                        },
                      },
                      { type: 'divider' },
                      {
                        key: 'publish',
                        label: '📤 Publish Plan',
                        onClick: () => {
                          if (currentPlan) {
                            Modal.confirm({
                              title: 'Publish Work Plan?',
                              content: 'This will notify all assigned employees via email.',
                              onOk: () => publishMutation.mutate(currentPlan.id),
                            });
                          }
                        },
                        disabled: !currentPlan || !isDraft,
                      },
                      {
                        key: 'pdf',
                        label: '📑 Download PDF',
                        onClick: () => {
                          if (currentPlan?.pdf_url) {
                            window.open(currentPlan.pdf_url, '_blank');
                          } else {
                            message.info('PDF not available');
                          }
                        },
                        disabled: !currentPlan?.pdf_url,
                      },
                    ],
                  }}
                >
                  <Button icon={<SettingOutlined />}>Actions</Button>
                </Dropdown>
                {!currentPlan && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                    New Plan
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Berth Tabs */}
        <Tabs
          activeKey={berth}
          onChange={(k) => setBerth(k as BerthTab)}
          type="card"
          size="small"
          style={{ marginBottom: 0 }}
          items={[
            {
              key: 'east',
              label: (
                <Space>
                  <span>🚢 East Berth</span>
                  {currentPlan && (
                    <Badge
                      count={(currentPlan.days || []).reduce((sum, d) => sum + (d.jobs_east?.length || 0) + (d.jobs_both?.length || 0), 0)}
                      size="small"
                      style={{ backgroundColor: '#1890ff' }}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'west',
              label: (
                <Space>
                  <span>⚓ West Berth</span>
                  {currentPlan && (
                    <Badge
                      count={(currentPlan.days || []).reduce((sum, d) => sum + (d.jobs_west?.length || 0) + (d.jobs_both?.length || 0), 0)}
                      size="small"
                      style={{ backgroundColor: '#52c41a' }}
                    />
                  )}
                </Space>
              ),
            },
          ]}
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', gap: 12, overflow: 'hidden' }}>
          {/* Left Side: Calendar/Timeline */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {isLoading ? (
              <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" />
              </Card>
            ) : currentPlan ? (
              viewMode === 'timeline' ? (
                <TimelineView
                  plan={{
                    ...currentPlan,
                    days: currentPlan.days?.map(d => ({
                      ...d,
                      jobs_east: berth === 'east' ? d.jobs_east : [],
                      jobs_west: berth === 'west' ? d.jobs_west : [],
                      jobs_both: d.jobs_both,
                    })),
                  }}
                  onJobClick={handleJobClick}
                  readOnly={!isDraft}
                />
              ) : (
                <Card bodyStyle={{ padding: '16px' }} style={{ height: '100%', overflow: 'auto' }}>
                  {/* Legend */}
                  <div style={{ marginBottom: 12, display: 'flex', gap: 16, fontSize: 12, color: '#595959' }}>
                    <span><strong>Legend:</strong></span>
                    <span>🔧 PM</span>
                    <span>🔴 Defect</span>
                    <span>✅ Inspection</span>
                    <span>|</span>
                    <span>🟢 On time</span>
                    <span>🟠 Overdue</span>
                    <span>🔴 Critical</span>
                    {isDraft && <span style={{ color: '#1890ff' }}>| 👆 Drag jobs from right panel</span>}
                  </div>

                  {/* Calendar Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                    {(currentPlan.days || [])
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                      .map((day) => {
                        const date = dayjs(day.date);
                        const isToday = day.date === dayjs().format('YYYY-MM-DD');
                        const jobs = getJobsForBerth(day);
                        const totalHours = jobs.reduce((sum, job) => sum + job.estimated_hours, 0);

                        return (
                          <DroppableDay key={day.id} day={day} berth={berth}>
                            <Card
                              size="small"
                              style={{
                                minHeight: 200,
                                backgroundColor: isToday ? '#f6ffed' : undefined,
                                borderColor: isToday ? '#52c41a' : undefined,
                              }}
                              title={
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontWeight: 600, color: isToday ? '#52c41a' : undefined }}>
                                    {date.format('ddd')}
                                  </div>
                                  <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#52c41a' : undefined }}>
                                    {date.format('D')}
                                  </div>
                                </div>
                              }
                              extra={
                                <Badge count={jobs.length} showZero style={{ backgroundColor: jobs.length > 0 ? '#1890ff' : '#d9d9d9' }} />
                              }
                            >
                              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 8 }}>
                                {totalHours}h total
                              </div>
                              {jobs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20, color: '#bfbfbf' }}>
                                  {isDraft ? 'Drop jobs here' : 'No jobs'}
                                </div>
                              ) : (
                                <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                                  {jobs.map((job) => (
                                    <TimelineJobBlock
                                      key={job.id}
                                      job={job}
                                      onClick={() => handleJobClick(job)}
                                      compact
                                    />
                                  ))}
                                </div>
                              )}
                            </Card>
                          </DroppableDay>
                        );
                      })}
                  </div>
                </Card>
              )
            ) : (
              <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 16 }}>No plan for this week</Text>
                  <br />
                  <Button type="primary" onClick={() => setCreateModalOpen(true)} style={{ marginTop: 16 }}>
                    Create Plan
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* Right Side: Jobs Pool */}
          <div style={{ width: 320, overflow: 'auto' }}>
            <JobsPool
              berth={berth}
              onAddJob={() => setAddJobModalOpen(true)}
              onJobClick={(job, type) => {
                setSelectedJob({
                  ...job,
                  job_type: type as JobType,
                } as any);
                setJobDetailsModalOpen(true);
              }}
              onImportSAP={() => setImportModalOpen(true)}
              onDownloadTemplate={() => window.open(workPlansApi.getSAPImportTemplateUrl(), '_blank')}
            />
          </div>
        </div>

        {/* Bottom: Employee Pool */}
        <div style={{ marginTop: 12 }}>
          <EmployeePool weekStart={weekStartStr} />
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeItem && (
          <div style={{
            padding: 8,
            backgroundColor: '#e6f7ff',
            border: '1px solid #1890ff',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}>
            {activeItem.type === 'pool-job' && (
              <span>📦 {activeItem.data.job?.equipment?.serial_number || activeItem.data.job?.defect?.description?.substring(0, 20) || 'Job'}</span>
            )}
            {activeItem.type === 'job' && (
              <span>🔧 {activeItem.data.job?.equipment?.serial_number || 'Job'}</span>
            )}
            {activeItem.type === 'employee' && (
              <span>👤 {activeItem.data.user?.full_name}</span>
            )}
          </div>
        )}
      </DragOverlay>

      {/* Create Plan Modal */}
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
            rules={[{ required: true }]}
            initialValue={currentWeekStart}
          >
            <DatePicker picker="week" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Optional notes" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import SAP Modal */}
      <Modal
        title="📥 Import SAP Work Orders"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={600}
      >
        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f9f9f9' }}>
          <Text strong>Required columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li><code>order_number</code>, <code>type</code>, <code>equipment_code</code>, <code>date</code>, <code>estimated_hours</code></li>
          </ul>
          <Text strong>Optional columns:</Text>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li><code>description</code>, <code>priority</code>, <code>cycle_value</code>, <code>cycle_unit</code></li>
            <li><code>overdue_value</code>, <code>overdue_unit</code>, <code>planned_date</code>, <code>note</code></li>
          </ul>
        </Card>
        <Upload accept=".xlsx,.xls" beforeUpload={handleImport} showUploadList={false}>
          <Button icon={<FileExcelOutlined />} loading={importMutation.isPending} type="primary">
            Select Excel File
          </Button>
        </Upload>
      </Modal>

      {/* Assign Role Modal (Lead/Member) */}
      <Modal
        title="Assign Team Role"
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setPendingAssignment(null);
        }}
        footer={null}
        width={400}
      >
        {pendingAssignment && (
          <div style={{ textAlign: 'center' }}>
            <p>
              Assign <strong>{pendingAssignment.user.full_name}</strong> to{' '}
              <strong>{pendingAssignment.job.equipment?.serial_number || 'this job'}</strong>
            </p>
            <Divider />
            <Space size="large">
              <Button
                type="primary"
                size="large"
                onClick={() => handleAssign(true)}
                loading={assignMutation.isPending}
              >
                👑 As Lead
              </Button>
              <Button
                size="large"
                onClick={() => handleAssign(false)}
                loading={assignMutation.isPending}
              >
                👤 As Member
              </Button>
            </Space>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lead: Responsible for the job | Member: Part of the team
            </Text>
          </div>
        )}
      </Modal>

      {/* Job Details Modal */}
      <Modal
        title={
          <Space>
            <span>{selectedJob?.job_type === 'pm' ? '🔧' : selectedJob?.job_type === 'defect' ? '🔴' : '✅'}</span>
            <span>Job Details</span>
          </Space>
        }
        open={jobDetailsModalOpen}
        onCancel={() => {
          setJobDetailsModalOpen(false);
          setSelectedJob(null);
        }}
        footer={null}
        width={700}
      >
        {selectedJob && (
          <div>
            {/* Equipment Info */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">Equipment</Text>
                  <div style={{ fontWeight: 600 }}>{selectedJob.equipment?.serial_number || 'N/A'}</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{selectedJob.equipment?.name}</div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Type</Text>
                  <div>
                    <Badge status={selectedJob.job_type === 'pm' ? 'processing' : selectedJob.job_type === 'defect' ? 'error' : 'success'} />
                    {selectedJob.job_type.toUpperCase()}
                  </div>
                </Col>
              </Row>
            </Card>

            {/* SAP Order */}
            {selectedJob.sap_order_number ? (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Text type="secondary">SAP Order</Text>
                <div style={{ fontWeight: 600 }}>{selectedJob.sap_order_number}</div>
              </Card>
            ) : (
              <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fff2f0', borderColor: '#ffccc7' }}>
                <Text type="danger">⚠️ No SAP Order Number</Text>
              </Card>
            )}

            {/* Description */}
            {selectedJob.description && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Text type="secondary">Description</Text>
                <div>{selectedJob.description}</div>
              </Card>
            )}

            {/* Overdue */}
            {selectedJob.overdue_value && selectedJob.overdue_value > 0 && (
              <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fff7e6', borderColor: '#ffd591' }}>
                <Text strong style={{ color: '#fa8c16' }}>
                  ⏰ Overdue by {selectedJob.overdue_value} {selectedJob.overdue_unit}
                </Text>
              </Card>
            )}

            {/* Team */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Text type="secondary">Assigned Team</Text>
              {selectedJob.assignments?.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  {selectedJob.assignments.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span>{a.is_lead ? '👑' : '👤'}</span>
                      <span>{a.user?.full_name}</span>
                      <Text type="secondary" style={{ fontSize: 12 }}>({a.user?.role})</Text>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#8c8c8c', marginTop: 8 }}>No team assigned yet</div>
              )}
            </Card>

            {/* Materials */}
            {selectedJob.materials?.length > 0 && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Text type="secondary">Required Materials</Text>
                <div style={{ marginTop: 8 }}>
                  {selectedJob.materials.map((m) => (
                    <div key={m.id}>
                      {m.material?.name} × {m.quantity} {m.material?.unit}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Defect Info */}
            {selectedJob.job_type === 'defect' && selectedJob.defect && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Text type="secondary">Defect Details</Text>
                <div style={{ marginTop: 8 }}>
                  <div><strong>Description:</strong> {selectedJob.defect.description}</div>
                  <div><strong>Status:</strong> {selectedJob.defect.status}</div>
                  {(selectedJob.defect as any).reported_at && (
                    <div><strong>Reported:</strong> {dayjs((selectedJob.defect as any).reported_at).format('MMM D, YYYY')}</div>
                  )}
                </div>
              </Card>
            )}

            {/* Timing */}
            <Row gutter={16}>
              <Col span={8}>
                <Card size="small">
                  <Text type="secondary">Est. Hours</Text>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{selectedJob.estimated_hours}h</div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Text type="secondary">Priority</Text>
                  <div>
                    <Badge
                      status={selectedJob.computed_priority === 'critical' ? 'error' : selectedJob.computed_priority === 'high' ? 'warning' : 'success'}
                    />
                    {selectedJob.computed_priority || selectedJob.priority}
                  </div>
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Text type="secondary">Berth</Text>
                  <div style={{ fontWeight: 600 }}>{selectedJob.berth?.toUpperCase() || 'Both'}</div>
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* Add Job Modal */}
      <Modal
        title="➕ Add Job"
        open={addJobModalOpen}
        onCancel={() => setAddJobModalOpen(false)}
        footer={null}
        width={500}
      >
        {currentPlan && isDraft ? (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Drag jobs from the Jobs Pool on the right side and drop them onto a day in the calendar.
              Or use "Import SAP Orders" to bulk import from Excel.
            </Text>
            <Divider />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => {
                  setAddJobModalOpen(false);
                  setImportModalOpen(true);
                }}
                block
              >
                📥 Import SAP Orders
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => window.open(workPlansApi.getSAPImportTemplateUrl(), '_blank')}
                block
              >
                📄 Download Template
              </Button>
            </Space>
          </div>
        ) : (
          <Text type="warning">
            {!currentPlan ? 'Create a work plan first.' : 'Cannot add jobs to a published plan.'}
          </Text>
        )}
      </Modal>
    </DndContext>
  );
}
