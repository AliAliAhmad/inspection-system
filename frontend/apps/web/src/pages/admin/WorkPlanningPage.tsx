import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import React from 'react';
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
  Alert,
  Checkbox,
  Popconfirm,
  Drawer,
  Switch,
  Tag,
  Popover,
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
  WarningOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  SwapOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  CopyOutlined,
  BulbOutlined,
  AlertOutlined,
  RobotOutlined,
  WarningFilled,
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
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workPlansApi, equipmentApi, rosterApi, usersApi, type WorkPlan, type WorkPlanJob, type WorkPlanDay, type Berth, type JobType, type JobPriority } from '@inspection/shared';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import {
  TimelineView,
  CalendarView,
  ViewToggle,
  JobsPool,
  EmployeePool,
  TimelineJobBlock,
  AnalyticsView,
  GanttChartView,
  ResourceHeatmap,
  WorkPlanAIPanel,
  ConflictResolutionPanel,
  IncompleteJobsWarning,
  generateMockPredictions,
  TimeAccuracyChart,
  calculateTimeAccuracy,
  type ViewMode
} from '../../components/work-planning';
import VoiceTextArea from '../../components/VoiceTextArea';
import { InputNumber } from 'antd';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

type BerthTab = 'east' | 'west';

// Droppable Day Wrapper for receiving jobs from pool
const DroppableDay: React.FC<{
  day: WorkPlanDay;
  berth: BerthTab;
  children: React.ReactNode;
  containerStyle?: React.CSSProperties;
}> = ({ day, berth, children, containerStyle }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${day.id}-${berth}`,
    data: { type: 'day', day, berth },
  });

  return (
    <div
      ref={setNodeRef}
      style={containerStyle ? {
        ...containerStyle,
        backgroundColor: isOver ? '#e6f7ff' : containerStyle.backgroundColor,
        outline: isOver ? '2px dashed #1890ff' : undefined,
        outlineOffset: isOver ? '-2px' : undefined,
      } : {
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

// Draggable Team Member for Compact Team Pool
const DraggableTeamMember: React.FC<{ user: any; isOnLeave: boolean; leaveInfo?: string }> = ({ user, isOnLeave, leaveInfo }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `employee-${user.id}`,
    data: { type: 'employee', user },
    disabled: isOnLeave,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: isOnLeave ? 'not-allowed' : 'grab',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    backgroundColor: isDragging ? '#e6f7ff' : isOnLeave ? '#f5f5f5' : '#fff',
    border: `1px ${isOnLeave ? 'dashed' : 'solid'} ${isDragging ? '#1890ff' : '#d9d9d9'}`,
    borderRadius: 6,
    marginBottom: 2,
  };

  return (
    <Tooltip title={isOnLeave ? `${user.full_name} - On Leave${leaveInfo ? ` (${leaveInfo})` : ''}` : user.full_name}>
      <div
        ref={setNodeRef}
        style={style}
        className={`wp-team-member ${isOnLeave ? 'wp-team-member-leave' : ''}`}
        {...(isOnLeave ? {} : { ...listeners, ...attributes })}
      >
        <span style={{ fontSize: 10, width: 18, height: 18, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: isOnLeave ? '#d9d9d9' : '#1890ff', color: '#fff', flexShrink: 0 }}>
          {user.full_name?.charAt(0) || '?'}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: isOnLeave ? '#8c8c8c' : '#262626', whiteSpace: 'nowrap' }}>
          {user.full_name?.split(' ')[0]}
        </span>
        {isOnLeave && leaveInfo && (
          <span style={{ fontSize: 9, color: '#fa8c16' }}>{leaveInfo}</span>
        )}
      </div>
    </Tooltip>
  );
};

// ── Equipment group row: shows "3× RS" compact chip with hover detail popover ──
const EquipmentGroupRow: React.FC<{
  eqType: string;
  jobs: WorkPlanJob[];
  berth: BerthTab;
  onJobClick: (job: WorkPlanJob) => void;
}> = ({ eqType, jobs, berth, onJobClick }) => {
  const assignedCount = jobs.filter(j => (j.assignments || []).length > 0).length;
  const unassigned = jobs.length - assignedCount;
  const jobTypes = [...new Set(jobs.map(j => j.job_type))];
  const hasOverdue = jobs.some(j => (j as any).overdue_value && (j as any).overdue_value > 0);
  const typeColor = jobTypes[0] === 'defect' ? '#ff4d4f' : jobTypes[0] === 'inspection' ? '#722ed1' : '#1890ff';

  const popoverContent = (
    <div style={{ width: 260 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>
        {jobs.length}× {eqType} — {berth === 'east' ? 'East' : 'West'} Berth
      </div>
      {jobs.slice(0, 5).map((job, idx) => {
        const lead = (job.assignments || []).find((a: any) => a.is_lead);
        const isAssigned = (job.assignments || []).length > 0;
        const eqName =
          (job as any).equipment?.name ||
          (job as any).inspection_assignment?.equipment?.name ||
          (job as any).equipment?.serial_number ||
          `#${job.id}`;
        return (
          <div
            key={job.id}
            onClick={() => onJobClick(job)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 4px', marginBottom: 2, borderRadius: 4,
              cursor: 'pointer', background: isAssigned ? '#f6ffed' : '#fff7e6',
            }}
          >
            <Text style={{ fontSize: 10, color: '#8c8c8c', minWidth: 16 }}>{idx + 1}</Text>
            <Text style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {eqName}
            </Text>
            <Text style={{ fontSize: 10, color: isAssigned ? '#52c41a' : '#fa8c16', whiteSpace: 'nowrap' }}>
              {isAssigned ? `✓ ${lead?.user?.full_name?.split(' ')[0] || ''}` : '⚠ None'}
            </Text>
          </div>
        );
      })}
      {jobs.length > 5 && (
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>+{jobs.length - 5} more — click chip to view</Text>
        </div>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="hover" placement="left" mouseEnterDelay={0.3}>
      <div
        onClick={() => onJobClick(jobs[0])}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 6px', borderRadius: 4, marginBottom: 3,
          background: unassigned > 0 ? '#fff7e6' : '#f6ffed',
          border: `1px solid ${unassigned > 0 ? '#ffd591' : '#b7eb8f'}`,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: typeColor }} />
        <Text style={{ fontSize: 11, fontWeight: 700, color: '#262626', whiteSpace: 'nowrap' }}>
          {jobs.length}× {eqType}
        </Text>
        <div style={{ flex: 1 }} />
        {jobTypes.map(jt => (
          <Tag key={jt} style={{ fontSize: 9, margin: 0, padding: '0 3px', lineHeight: '16px' }}
            color={jt === 'defect' ? 'error' : jt === 'inspection' ? 'purple' : 'blue'}>
            {jt === 'pm' ? 'PM' : jt === 'defect' ? 'DEF' : 'INS'}
          </Tag>
        ))}
        {unassigned > 0 && <span style={{ fontSize: 9, color: '#fa8c16' }}>⚠{unassigned}</span>}
        {hasOverdue && <span style={{ fontSize: 9, color: '#ff4d4f' }}>!</span>}
      </div>
    </Popover>
  );
};

// ── Draggable at-risk job row (used inside at-risk drawer) ──
// At-risk jobs are already in the plan — drag them to MOVE to another day (not re-add)
const DraggableRiskJob: React.FC<{
  risk: { id: number; dayId: number; reason: string; equipment: string; description: string };
  job: WorkPlanJob | undefined;
}> = ({ risk, job }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `risk-pool-${risk.id}`,
    data: {
      type: 'job',  // already in plan → triggers moveMutation in handleDragEnd Case 2
      job: job || { id: risk.id } as any,
      dayId: risk.dayId,
    },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1, cursor: 'grab', marginBottom: 6 }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', background: '#fff',
        border: '1px solid #ffccc7', borderLeft: '4px solid #ff4d4f', borderRadius: 6,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#262626', background: '#fffbe6', borderRadius: 3, padding: '0 4px' }}>
            {risk.equipment}
          </Text>
          {risk.description && (() => {
            // Strip equipment name prefix if the description was concatenated with it
            const stripped = risk.description.startsWith(risk.equipment)
              ? risk.description.slice(risk.equipment.length).replace(/^[\s\-_.]+/, '').trim()
              : risk.description;
            return stripped ? (
              <Text style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', color: '#262626', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stripped.substring(0, 60)}
              </Text>
            ) : null;
          })()}
          <Text style={{ fontSize: 11, color: '#ff4d4f' }}>{risk.reason}</Text>
        </div>
        {job && (
          <Tag color={job.job_type === 'defect' ? 'error' : job.job_type === 'inspection' ? 'purple' : 'blue'}
            style={{ fontSize: 9, flexShrink: 0 }}>
            {job.job_type?.toUpperCase()}
          </Tag>
        )}
      </div>
    </div>
  );
};

// ── Simple row for PM / Defect jobs in day column — draggable between days & back to pool ──
const SimpleJobRow: React.FC<{
  job: WorkPlanJob;
  dayId: number;
  onJobClick: (job: WorkPlanJob) => void;
}> = ({ job, dayId, onJobClick }) => {
  const isOverdue = (job as any).overdue_value && (job as any).overdue_value > 0;
  const isAssigned = (job.assignments || []).length > 0;
  const equipmentName =
    (job as any).equipment?.name ||
    (job as any).defect?.equipment?.name ||
    (job as any).equipment?.serial_number ||
    `Job #${job.id}`;
  const rawDesc = job.description || (job as any).defect?.description || '';
  const description = rawDesc && equipmentName && !equipmentName.startsWith('Job #') && rawDesc.startsWith(equipmentName)
    ? rawDesc.slice(equipmentName.length).replace(/^[\s\-_.]+/, '').trim()
    : rawDesc;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan-job-${job.id}`,
    data: { type: 'job', job, dayId },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onJobClick(job)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 1,
        padding: '3px 6px', borderRadius: 4, marginBottom: 3,
        background: isDragging ? '#e6f7ff' : isOverdue ? '#fff1f0' : isAssigned ? '#f6ffed' : '#fafafa',
        border: `1px solid ${isDragging ? '#1890ff' : isOverdue ? '#ffccc7' : isAssigned ? '#b7eb8f' : '#f0f0f0'}`,
        cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none',
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: job.job_type === 'defect' ? '#ff4d4f' : '#1890ff' }} />
        <Text style={{ fontSize: 14, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#262626', background: '#fffbe6', borderRadius: 3, padding: '0 4px' }}>
          {equipmentName}
        </Text>
        <Tag
          style={{ fontSize: 9, margin: 0, padding: '0 3px', lineHeight: '16px' }}
          color={job.job_type === 'defect' ? 'error' : 'blue'}
        >
          {job.job_type === 'defect' ? 'DEF' : 'PM'}
        </Tag>
        {isOverdue && <span style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 700 }}>!</span>}
      </div>
      {description && (
        <Text style={{ fontSize: 13, fontWeight: 700, fontStyle: 'italic', color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 10 }}>
          {description.substring(0, 55)}
        </Text>
      )}
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
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
  const [copyWeekModalOpen, setCopyWeekModalOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);
  const [aiAssistanceEnabled, setAiAssistanceEnabled] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'jobs' | 'team'>('jobs');
  const [atRiskDrawerOpen, setAtRiskDrawerOpen] = useState(false);
  const [teamPoolDisc, setTeamPoolDisc] = useState<'all' | 'mechanical' | 'electrical'>('all');
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
  const { data: plansData, isLoading, refetch, error, isError } = useQuery({
    queryKey: ['work-plans', weekStartStr],
    queryFn: () => workPlansApi.list({ week_start: weekStartStr, include_days: true }).then((r) => r.data),
    staleTime: 30000, // Cache for 30 seconds to prevent excessive refetches
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    retry: 1,
  });

  // Track if error was already shown to prevent duplicate messages
  const errorShownRef = useRef<string | null>(null);

  // Show error once when query fails
  useEffect(() => {
    if (isError && error) {
      const errorMsg = (error as any)?.response?.data?.message || (error as any)?.message || 'Unknown error';
      if (errorShownRef.current !== errorMsg) {
        errorShownRef.current = errorMsg;
        console.error('Work plans query error:', error);
        message.error('Failed to load work plan: ' + errorMsg);
      }
    } else {
      errorShownRef.current = null;
    }
  }, [isError, error]);

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

        // If same week, just refetch. Otherwise set offset which triggers refetch via queryKey change
        if (diffWeeks === weekOffset) {
          refetch();
        } else {
          setWeekOffset(diffWeeks);
        }
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

  // Remove job from plan (used when dragging calendar job back to pool)
  const removeJobMutation = useMutation({
    mutationFn: ({ planId, jobId }: { planId: number; jobId: number }) =>
      workPlansApi.removeJob(planId, jobId),
    onSuccess: () => {
      message.success('Job removed from plan');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to remove job');
    },
  });

  // Add job mutation (for drag from pool - non-SAP jobs)
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
    onSuccess: (data: any) => {
      const autoAdded = data?.data?.auto_added_defects || 0;
      message.success(autoAdded > 0
        ? `Job added (+${autoAdded} related defect${autoAdded > 1 ? 's' : ''} auto-added)`
        : 'Job added to plan'
      );
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to add job');
    },
  });

  // Schedule SAP order mutation (for drag SAP orders from pool)
  const scheduleSAPMutation = useMutation({
    mutationFn: (payload: { planId: number; sapOrderId: number; dayId: number }) =>
      workPlansApi.scheduleSAPOrder(payload.planId, {
        sap_order_id: payload.sapOrderId,
        day_id: payload.dayId,
      }),
    onSuccess: (data: any) => {
      const autoAdded = data?.data?.auto_added_defects || 0;
      message.success(autoAdded > 0
        ? `SAP order scheduled (+${autoAdded} related defect${autoAdded > 1 ? 's' : ''} auto-added)`
        : 'SAP order scheduled'
      );
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to schedule SAP order');
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
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
      setImportModalOpen(false);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Import failed');
    },
  });

  const clearPoolMutation = useMutation({
    mutationFn: () => workPlansApi.clearPool(weekStartStr),
    onSuccess: (response) => {
      message.success(`Cleared ${response.data.deleted} jobs from pool`);
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to clear pool');
    },
  });

  // Auto-schedule mutation
  const autoScheduleMutation = useMutation({
    mutationFn: (options?: { include_weekends?: boolean; max_hours_per_day?: number; berth?: string }) =>
      workPlansApi.autoSchedule(currentPlan!.id, options),
    onSuccess: (response) => {
      const data = response.data;
      if (data.scheduled > 0) {
        message.success(`Auto-scheduled ${data.scheduled} jobs! ${data.skipped > 0 ? `(${data.skipped} skipped)` : ''}`);
      } else {
        message.info('No jobs were scheduled. Pool may be empty.');
      }
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Auto-schedule failed');
    },
  });

  // Fetch equipment list for Add Job form
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-list'],
    queryFn: () => equipmentApi.list({ per_page: 500 }).then((r) => r.data),
  });
  const equipmentList = ((equipmentData as any)?.equipment || (equipmentData as any)?.data || []).filter((eq: any) => eq.is_active !== false);

  // Fetch roster for leave status
  const { data: rosterData } = useQuery({
    queryKey: ['roster', weekStartStr],
    queryFn: async () => {
      const response = await rosterApi.getWeek(weekStartStr);
      return response.data.data;
    },
    enabled: !!weekStartStr,
  });

  // Get users on leave for the week
  const leaveUserIds = useMemo(() => {
    const ids = new Set<number>();
    if (rosterData?.users) {
      rosterData.users.forEach((u) => {
        // Check if user has any leave status in their entries
        const entries = u.entries || {};
        const hasLeave = Object.values(entries).some(status => status === 'leave');
        if (hasLeave || u.is_on_leave) ids.add(u.id);
      });
    }
    return ids;
  }, [rosterData]);

  // Helper to check if user is on leave for a specific day
  const isUserOnLeaveForDay = useCallback((userId: number, dayDate: string): boolean => {
    if (!rosterData?.users) return false;
    const userRoster = rosterData.users.find((u) => u.id === userId);
    if (!userRoster) return false;
    const entries = userRoster.entries || {};
    const dayStatus = entries[dayDate];
    return dayStatus === 'leave';
  }, [rosterData]);

  // Calculate total hours for a day
  const getDayTotalHours = useCallback((day: WorkPlanDay): number => {
    const allJobs = [...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || [])];
    return allJobs.reduce((sum, job) => sum + (job.estimated_hours || 0), 0);
  }, []);

  // Get conflict warnings for pending assignment
  const assignmentWarnings = useMemo(() => {
    const warnings: { type: 'error' | 'warning'; message: string }[] = [];
    if (!pendingAssignment || !currentPlan) return warnings;

    const { job, user } = pendingAssignment;

    // Find the day for this job
    const day = currentPlan.days?.find(d =>
      [...(d.jobs_east || []), ...(d.jobs_west || []), ...(d.jobs_both || [])].some(j => j.id === job.id)
    );

    // Check if user is on leave
    if (day && isUserOnLeaveForDay(user.id, day.date)) {
      warnings.push({
        type: 'error',
        message: `${user.full_name?.split(' ')[0]} is on leave on ${dayjs(day.date).format('ddd, MMM D')}!`,
      });
    }

    // Check day capacity (>10 hours warning)
    if (day) {
      const totalHours = getDayTotalHours(day);
      if (totalHours > 10) {
        warnings.push({
          type: 'warning',
          message: `This day has ${totalHours}h scheduled (high workload)`,
        });
      }
    }

    // Check if user is already assigned to this job
    const existingAssignment = (job.assignments || []).find((a: any) => a.user_id === user.id);
    if (existingAssignment) {
      warnings.push({
        type: 'error',
        message: `${user.full_name?.split(' ')[0]} is already assigned to this job`,
      });
    }

    return warnings;
  }, [pendingAssignment, currentPlan, isUserOnLeaveForDay, getDayTotalHours]);

  // Manual add job mutation
  const manualAddJobMutation = useMutation({
    mutationFn: (values: {
      day_id: number;
      job_type: JobType;
      berth: Berth;
      equipment_id: number;
      description?: string;
      estimated_hours: number;
      priority: JobPriority;
      notes?: string;
    }) => workPlansApi.addJob(currentPlan!.id, {
      day_id: values.day_id,
      job_type: values.job_type,
      berth: values.berth,
      equipment_id: values.equipment_id,
      description: values.description,
      estimated_hours: values.estimated_hours,
      priority: values.priority,
      notes: values.notes,
    }),
    onSuccess: () => {
      message.success('Job added successfully');
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
      setAddJobModalOpen(false);
      addJobForm.resetFields();
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to add job');
    },
  });

  // Bulk delete jobs mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (jobIds: number[]) => {
      if (!currentPlan) throw new Error('No plan');
      // Delete jobs one by one (API doesn't have bulk delete yet)
      await Promise.all(jobIds.map(jobId => workPlansApi.removeJob(currentPlan.id, jobId)));
    },
    onSuccess: () => {
      message.success(`Deleted ${selectedJobIds.size} jobs`);
      setSelectedJobIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
      queryClient.invalidateQueries({ queryKey: ['available-jobs'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to delete jobs');
    },
  });

  // Bulk move jobs mutation
  const bulkMoveMutation = useMutation({
    mutationFn: async ({ jobIds, targetDayId }: { jobIds: number[]; targetDayId: number }) => {
      if (!currentPlan) throw new Error('No plan');
      // Move jobs one by one
      await Promise.all(jobIds.map(jobId => workPlansApi.moveJob(currentPlan.id, jobId, { target_day_id: targetDayId })));
    },
    onSuccess: () => {
      message.success(`Moved ${selectedJobIds.size} jobs`);
      setSelectedJobIds(new Set());
      setBulkMoveModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to move jobs');
    },
  });

  // Copy from previous week mutation
  const copyFromWeekMutation = useMutation({
    mutationFn: (sourceWeekStart: string) => workPlansApi.copyFromWeek(currentPlan!.id, sourceWeekStart),
    onSuccess: (response) => {
      const data = response.data;
      message.success(`Copied ${data.copied} jobs from previous week!`);
      setCopyWeekModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['work-plans'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Failed to copy jobs');
    },
  });

  // Get all jobs from current plan
  const allJobs = useMemo(() => {
    if (!currentPlan?.days) return [];
    const jobs: WorkPlanJob[] = [];
    currentPlan.days.forEach(day => {
      jobs.push(...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || []));
    });
    return jobs;
  }, [currentPlan]);

  // AI predictions for incomplete jobs
  const incompleteJobPredictions = useMemo(() => {
    if (!aiAssistanceEnabled || !allJobs.length) return [];
    return generateMockPredictions(allJobs as any);
  }, [allJobs, aiAssistanceEnabled]);

  // Time accuracy data
  const timeAccuracyData = useMemo(() => {
    if (!aiAssistanceEnabled || !allJobs.length) return null;
    return calculateTimeAccuracy(allJobs as any);
  }, [allJobs, aiAssistanceEnabled]);

  // Week summary stats
  const weekStats = useMemo(() => {
    if (!currentPlan) return null;
    let totalJobs = 0;
    let unassigned = 0;
    let noSAP = 0;
    let totalHours = 0;
    currentPlan.days?.forEach((day) => {
      const jobs = [...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || [])];
      totalJobs += jobs.length;
      unassigned += jobs.filter((j) => !(j.assignments?.length)).length;
      noSAP += jobs.filter((j) => !(j as any).sap_order_number).length;
      totalHours += jobs.reduce((s, j) => s + (j.estimated_hours || 0), 0);
    });
    return { totalJobs, unassigned, noSAP, totalHours };
  }, [currentPlan]);

  // Plan confidence score (% of jobs with at least one person assigned)
  const planScore = useMemo(() => {
    if (!weekStats || weekStats.totalJobs === 0) return 0;
    const assigned = weekStats.totalJobs - weekStats.unassigned;
    return Math.min(100, Math.round((assigned / weekStats.totalJobs) * 100));
  }, [weekStats]);

  // At-risk jobs computation
  const atRiskJobs = useMemo(() => {
    if (!currentPlan?.days) return [];
    const risks: { id: number; dayId: number; reason: string; equipment: string; description: string }[] = [];
    currentPlan.days.forEach(day => {
      const jobs = [...(day.jobs_east || []), ...(day.jobs_west || []), ...(day.jobs_both || [])];
      jobs.forEach((job: any) => {
        // Equipment name — check inspection_assignment path too
        const eqName =
          job.equipment?.name ||
          job.inspection_assignment?.equipment?.name ||
          job.defect?.equipment?.name ||
          job.equipment?.serial_number ||
          'Unknown Equipment';
        // Description — use job type label if blank or same as equipment name
        const rawDesc = job.description || job.defect?.description || '';
        const strippedDesc = rawDesc.startsWith(eqName)
          ? rawDesc.slice(eqName.length).replace(/^[\s\-_.]+/, '').trim()
          : rawDesc;
        const jobTypeLabel = job.job_type === 'inspection' ? 'Inspection'
          : job.job_type === 'defect' ? 'Defect' : 'PM';
        const desc = strippedDesc || jobTypeLabel;

        if (!job.sap_order_number) {
          risks.push({ id: job.id, dayId: day.id, reason: 'No SAP order', equipment: eqName, description: desc });
        }
        if (!job.assignments || job.assignments.length === 0) {
          risks.push({ id: job.id, dayId: day.id, reason: 'No team assigned', equipment: eqName, description: desc });
        }
        if (job.computed_priority === 'critical' && job.overdue_value > 0) {
          risks.push({ id: job.id, dayId: day.id, reason: 'Critical & overdue', equipment: eqName, description: desc });
        }
      });
    });
    // Deduplicate by job id (keep first risk per job)
    const seen = new Set<number>();
    return risks.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, [currentPlan]);

  // Fetch team users for compact team pool
  const { data: teamUsersData } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ is_active: true, per_page: 500 }).then(r => r.data.data),
    staleTime: 60000,
  });

  // Grouped team columns
  const teamColumns = useMemo(() => {
    const users = teamUsersData || [];
    const cols = {
      engineers: [] as any[],
      specMech: [] as any[],
      specElec: [] as any[],
      inspMech: [] as any[],
      inspElec: [] as any[],
    };
    (users as any[]).forEach((u: any) => {
      if (u.role === 'admin') return;
      const spec = u.specialization?.toLowerCase() || 'other';
      if (u.role === 'engineer') cols.engineers.push(u);
      else if (u.role === 'specialist') {
        if (spec === 'mechanical') cols.specMech.push(u);
        else if (spec === 'electrical') cols.specElec.push(u);
        else cols.specMech.push(u); // default to mechanical
      } else if (u.role === 'inspector') {
        if (spec === 'mechanical') cols.inspMech.push(u);
        else if (spec === 'electrical') cols.inspElec.push(u);
        else cols.inspMech.push(u);
      }
    });
    return cols;
  }, [teamUsersData]);

  // Free non-engineer team members by discipline (for smart berth-bar pills)
  const discTeamFree = useMemo(() => {
    const mechFree = [...(teamColumns.specMech || []), ...(teamColumns.inspMech || [])]
      .filter((u: any) => !leaveUserIds.has(u.id)).length;
    const elecFree = [...(teamColumns.specElec || []), ...(teamColumns.inspElec || [])]
      .filter((u: any) => !leaveUserIds.has(u.id)).length;
    return { mechFree, elecFree };
  }, [teamColumns, leaveUserIds]);

  // Leave details for team pool
  const leaveDetails = useMemo(() => {
    if (!rosterData?.users) return [];
    const details: { userId: number; name: string; dates: string[]; coveredBy?: string }[] = [];
    rosterData.users.forEach((u: any) => {
      const entries = u.entries || {};
      const leaveDates = Object.entries(entries)
        .filter(([_, status]) => status === 'leave')
        .map(([date]) => date);
      if (leaveDates.length > 0) {
        details.push({
          userId: u.id,
          name: u.full_name || `User ${u.id}`,
          dates: leaveDates.sort(),
          coveredBy: u.covered_by_name || undefined,
        });
      }
    });
    return details;
  }, [rosterData]);

  // Toggle job selection
  const toggleJobSelection = useCallback((jobId: number) => {
    setSelectedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  // Select all jobs for current berth
  const selectAllJobs = useCallback(() => {
    const jobIds = new Set<number>();
    currentPlan?.days?.forEach(day => {
      const jobs = berth === 'east'
        ? [...(day.jobs_east || []), ...(day.jobs_both || [])]
        : [...(day.jobs_west || []), ...(day.jobs_both || [])];
      jobs.forEach(j => jobIds.add(j.id));
    });
    setSelectedJobIds(jobIds);
  }, [currentPlan, berth]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedJobIds(new Set());
  }, []);

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
      const jobType = activeData.jobType as string;

      // Handle SAP orders specially
      if (jobType === 'sap' && job.id) {
        scheduleSAPMutation.mutate({
          planId: currentPlan.id,
          sapOrderId: job.id,
          dayId: targetDay.id,
        });
      } else {
        // Regular job from pool — resolve equipment_id even for defect pool items
        const equipmentId = job.equipment?.id || (job as any).defect?.equipment_id_direct || (job as any).defect?.equipment?.id;
        const defectId = job.defect?.id || (job as any).defect_id;
        const inspectionAssignmentId = job.assignment?.id;
        // Inspections default to 20 min (0.333h); other jobs default to 4h
        const estimatedHours = jobType === 'inspection' ? (job.estimated_hours || 0.333) : (job.estimated_hours || 4);

        addJobMutation.mutate({
          planId: currentPlan.id,
          dayId: targetDay.id,
          jobType: jobType as JobType,
          berth: targetBerth,
          equipmentId,
          defectId,
          inspectionAssignmentId,
          estimatedHours,
        });
      }
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
    // Case 4: Dragging calendar job back to pool → remove from plan
    if (activeData.type === 'job' && overData.type === 'pool') {
      const job = activeData.job as WorkPlanJob;
      removeJobMutation.mutate({ planId: currentPlan.id, jobId: job.id });
    }

    if (activeData.type === 'employee' && overData.type === 'job') {
      const user = activeData.user;
      const job = overData.job as WorkPlanJob;

      // Show modal to choose Lead or Member
      setPendingAssignment({ job, user });
      setAssignModalOpen(true);
    }
  }, [currentPlan, isDraft, addJobMutation, moveMutation, scheduleSAPMutation, removeJobMutation]);

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

  // Team column config for rendering
  const teamColumnConfig = [
    { key: 'engineers', label: 'Engineers', emoji: '🔧', color: '#1890ff', users: teamColumns.engineers },
    { key: 'specMech', label: 'Spec (Mech)', emoji: '⚙️', color: '#52c41a', users: teamColumns.specMech },
    { key: 'specElec', label: 'Spec (Elec)', emoji: '⚡', color: '#faad14', users: teamColumns.specElec },
    { key: 'inspMech', label: 'Insp (Mech)', emoji: '🔍', color: '#722ed1', users: teamColumns.inspMech },
    { key: 'inspElec', label: 'Insp (Elec)', emoji: '⚡', color: '#eb2f96', users: teamColumns.inspElec },
  ];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Fix Ant Design Tabs so children can flex + scroll properly */}
      <style>{`
        .wp-right-panel .ant-tabs { display: flex; flex-direction: column; flex: 1; overflow: hidden; height: 100%; }
        .wp-right-panel .ant-tabs-content-holder { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .wp-right-panel .ant-tabs-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; height: 100%; }
        .wp-right-panel .ant-tabs-tabpane { flex: 1; overflow: hidden; display: flex; flex-direction: column; height: 100%; }
        .wp-right-panel .ant-tabs-tabpane-active { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .wp-right-panel .ant-tabs-tabpane-hidden { display: none !important; }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
        {/* ── LEFT COLUMN: toolbar, bars, calendar ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* COMPACT TOOLBAR */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>

          {/* Left side: Path + Week Nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>/admin/work-planning</Text>
            <Space size={4}>
              <Button size="small" icon={<LeftOutlined />} onClick={() => setWeekOffset(o => o - 1)} />
              <Text strong style={{ fontSize: 13, minWidth: 170, textAlign: 'center', display: 'inline-block' }}>
                {currentWeekStart.format('MMM D')} - {currentWeekStart.add(6, 'day').format('MMM D, YYYY')}
              </Text>
              <Button size="small" icon={<RightOutlined />} onClick={() => setWeekOffset(o => o + 1)} />
              {weekOffset !== 0 && <Button type="link" size="small" onClick={() => setWeekOffset(0)}>Today</Button>}
            </Space>
          </div>

          {/* Right side: Status + View + AI + At-Risk + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Plan Status */}
            {currentPlan && (
              <Badge status={currentPlan.status === 'published' ? 'success' : 'warning'} text={<Text type="secondary" style={{ fontSize: 12 }}>{currentPlan.status.toUpperCase()} &bull; {currentPlan.total_jobs} jobs</Text>} />
            )}

            <ViewToggle value={viewMode} onChange={setViewMode} />

            {/* AI Toggle */}
            <Space size={4}>
              <Switch checked={aiAssistanceEnabled} onChange={setAiAssistanceEnabled} checkedChildren={<RobotOutlined />} unCheckedChildren={<RobotOutlined />} size="small" />
            </Space>

            <Button size="small" icon={<BulbOutlined />} onClick={() => setAiDrawerOpen(true)} disabled={!aiAssistanceEnabled}>AI</Button>
            <Button size="small" icon={<AlertOutlined />} onClick={() => setConflictPanelOpen(true)}>Conflicts</Button>

            {/* Auto-Schedule */}
            {currentPlan && isDraft && (
              <Button
                size="small"
                type="primary"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderColor: '#667eea' }}
                onClick={() => {
                  Modal.confirm({
                    title: 'Auto-Schedule Jobs',
                    content: (
                      <div>
                        <p>This will automatically distribute all jobs from the pool to the calendar based on:</p>
                        <ul>
                          <li>Critical jobs first (overdue {'>'} 100h or {'>'} 7 days)</li>
                          <li>Then overdue jobs</li>
                          <li>Then by priority (urgent &rarr; high &rarr; normal &rarr; low)</li>
                          <li>Balanced across days (max ~8h/day per berth)</li>
                        </ul>
                        <p style={{ marginTop: 12, color: '#8c8c8c' }}>Weekends will be skipped.</p>
                      </div>
                    ),
                    okText: 'Auto-Schedule',
                    cancelText: 'Cancel',
                    onOk: () => autoScheduleMutation.mutate({ include_weekends: false, max_hours_per_day: 8 }),
                  });
                }}
                loading={autoScheduleMutation.isPending}
              >
                Auto-Schedule
              </Button>
            )}

            {/* Actions Dropdown */}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'import',
                    label: 'Import SAP Orders',
                    icon: <FileExcelOutlined />,
                    onClick: () => setImportModalOpen(true),
                    disabled: !currentPlan || !isDraft,
                  },
                  {
                    key: 'download-template',
                    label: 'Download SAP Template',
                    icon: <DownloadOutlined />,
                    onClick: () => {
                      window.open(workPlansApi.getSAPImportTemplateUrl(), '_blank');
                    },
                  },
                  { type: 'divider' },
                  {
                    key: 'copy-from-week',
                    label: 'Copy from Previous Week',
                    icon: <CopyOutlined />,
                    onClick: () => setCopyWeekModalOpen(true),
                    disabled: !currentPlan || !isDraft,
                  },
                  {
                    key: 'auto-schedule-weekends',
                    label: 'Auto-Schedule (Include Weekends)',
                    icon: <CalendarOutlined />,
                    onClick: () => {
                      if (currentPlan) {
                        Modal.confirm({
                          title: 'Auto-Schedule Including Weekends',
                          content: 'This will schedule jobs on Saturday and Sunday as well.',
                          onOk: () => autoScheduleMutation.mutate({ include_weekends: true, max_hours_per_day: 8 }),
                        });
                      }
                    },
                    disabled: !currentPlan || !isDraft,
                  },
                  { type: 'divider' },
                  {
                    key: 'publish',
                    label: 'Publish Plan',
                    icon: <SendOutlined />,
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
                    label: 'Download PDF',
                    icon: <FilePdfOutlined />,
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
              <Button size="small" icon={<SettingOutlined />}>Actions</Button>
            </Dropdown>

            {!currentPlan && (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>New Plan</Button>
            )}
          </div>
        </div>

        {/* BERTH BAR: toggle + plan score + smart pills */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          {/* Berth Toggle Buttons */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
            <Button
              type={berth === 'east' ? 'primary' : 'default'}
              size="small"
              style={{ borderRadius: 0, borderRight: '1px solid #d9d9d9', minWidth: 100 }}
              onClick={() => setBerth('east')}
            >
              East Berth&nbsp;
              {currentPlan && (
                <Badge
                  count={(currentPlan.days || []).reduce((sum, d) => sum + (d.jobs_east?.length || 0) + (d.jobs_both?.length || 0), 0)}
                  size="small"
                  style={{ backgroundColor: berth === 'east' ? 'rgba(255,255,255,0.35)' : '#1890ff' }}
                />
              )}
            </Button>
            <Button
              type={berth === 'west' ? 'primary' : 'default'}
              size="small"
              style={{ borderRadius: 0, minWidth: 100 }}
              onClick={() => setBerth('west')}
            >
              West Berth&nbsp;
              {currentPlan && (
                <Badge
                  count={(currentPlan.days || []).reduce((sum, d) => sum + (d.jobs_west?.length || 0) + (d.jobs_both?.length || 0), 0)}
                  size="small"
                  style={{ backgroundColor: berth === 'west' ? 'rgba(255,255,255,0.35)' : '#52c41a' }}
                />
              )}
            </Button>
          </div>

          {/* Plan Confidence Score */}
          {currentPlan && weekStats && weekStats.totalJobs > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              background: planScore >= 80 ? '#f6ffed' : planScore >= 50 ? '#fff7e6' : '#fff2f0',
              border: `1px solid ${planScore >= 80 ? '#b7eb8f' : planScore >= 50 ? '#ffd591' : '#ffccc7'}`,
              borderRadius: 12,
              flexShrink: 0,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: planScore >= 80 ? '#52c41a' : planScore >= 50 ? '#fa8c16' : '#ff4d4f' }} />
              <Text style={{ fontSize: 11, fontWeight: 700, color: planScore >= 80 ? '#52c41a' : planScore >= 50 ? '#fa8c16' : '#ff4d4f' }}>{planScore}%</Text>
              <Text type="secondary" style={{ fontSize: 10 }}>Plan Score</Text>
            </div>
          )}

          {/* Smart Inline Pills */}
          {currentPlan && (
            <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {weekStats && weekStats.unassigned > 0 && (
                <Tag color="error" style={{ fontSize: 10, margin: 0, cursor: 'default' }}>
                  ⚠ {weekStats.unassigned} unassigned
                </Tag>
              )}
              {discTeamFree.mechFree > 0 && (
                <Tag color="orange" style={{ fontSize: 10, margin: 0, cursor: 'default' }}>
                  🔧 Mech: {discTeamFree.mechFree} free
                </Tag>
              )}
              {discTeamFree.elecFree > 0 && (
                <Tag color="purple" style={{ fontSize: 10, margin: 0, cursor: 'default' }}>
                  ⚡ Elec: {discTeamFree.elecFree} free
                </Tag>
              )}
              {weekStats && weekStats.noSAP > 0 && (
                <Tag color="red" style={{ fontSize: 10, margin: 0, cursor: 'default' }}>
                  📋 {weekStats.noSAP} no SAP
                </Tag>
              )}
            </div>
          )}

          {/* Collapse expanded day hint */}
          {expandedDay && (
            <Button type="text" size="small" onClick={() => setExpandedDay(null)} style={{ fontSize: 11, color: '#8c8c8c', flexShrink: 0 }}>
              ✕ Collapse
            </Button>
          )}
        </div>

        {/* ── Smart Week Health Strip ─────────────────────────────── */}
        {weekStats && (() => {
          const assigned = weekStats.totalJobs - weekStats.unassigned;
          const assignedPct = weekStats.totalJobs > 0 ? Math.round((assigned / weekStats.totalJobs) * 100) : 100;
          const sapPct = weekStats.totalJobs > 0 ? Math.round(((weekStats.totalJobs - weekStats.noSAP) / weekStats.totalJobs) * 100) : 100;
          const avgHours = weekStats.totalHours / 5;
          // Health score: weighted penalty for unassigned + no-SAP + overload
          const healthScore = Math.max(0, Math.round(
            100
            - (weekStats.unassigned / Math.max(weekStats.totalJobs, 1)) * 45
            - (weekStats.noSAP / Math.max(weekStats.totalJobs, 1)) * 35
            - (avgHours > 10 ? 20 : avgHours > 8 ? 10 : 0)
          ));
          const health = healthScore >= 80
            ? { label: 'Plan Healthy', color: '#52c41a', bg: '#f6ffed', glow: 'rgba(82,196,26,0.3)' }
            : healthScore >= 50
            ? { label: 'Needs Attention', color: '#fa8c16', bg: '#fff7e6', glow: 'rgba(250,140,22,0.3)' }
            : { label: 'Action Required', color: '#ff4d4f', bg: '#fff2f0', glow: 'rgba(255,77,79,0.3)' };

          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              padding: '0 16px',
              borderBottom: '1px solid #f0f0f0',
              background: `linear-gradient(135deg, ${health.bg} 0%, #fff 60%)`,
              flexShrink: 0,
              height: 52,
            }}>
              {/* Health Pill */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 12px',
                background: '#fff',
                borderRadius: 20,
                border: `1.5px solid ${health.color}`,
                boxShadow: `0 0 10px ${health.glow}`,
                marginRight: 16,
                whiteSpace: 'nowrap',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: health.color,
                  boxShadow: `0 0 6px ${health.color}`,
                }} />
                <Text style={{ fontSize: 11, fontWeight: 600, color: health.color }}>{health.label}</Text>
                <Text style={{ fontSize: 11, color: '#8c8c8c' }}>{healthScore}%</Text>
              </div>

              {/* Vertical divider */}
              <div style={{ width: 1, height: 32, background: '#e8e8e8', marginRight: 16, flexShrink: 0 }} />

              {/* Stat: Jobs */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 70, marginRight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: 700, color: '#262626', lineHeight: 1 }}>{weekStats.totalJobs}</Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>jobs</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 10, marginTop: 1 }}>This week</Text>
              </div>

              {/* Stat: Assigned (with bar) */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 90, marginRight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: 700, color: weekStats.unassigned > 0 ? '#fa8c16' : '#52c41a', lineHeight: 1 }}>
                    {assigned}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>/ {weekStats.totalJobs} assigned</Text>
                </div>
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 4, width: 80 }}>
                  <div style={{
                    height: 4, borderRadius: 2,
                    width: `${assignedPct}%`,
                    background: weekStats.unassigned > 0
                      ? 'linear-gradient(90deg, #fa8c16, #ffc53d)'
                      : 'linear-gradient(90deg, #52c41a, #95de64)',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

              {/* Stat: SAP coverage (with bar) */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 90, marginRight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: 700, color: weekStats.noSAP > 0 ? '#ff4d4f' : '#52c41a', lineHeight: 1 }}>
                    {weekStats.noSAP > 0 ? weekStats.noSAP : '✓'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>{weekStats.noSAP > 0 ? 'no SAP #' : 'all SAP ok'}</Text>
                </div>
                <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, marginTop: 4, width: 80 }}>
                  <div style={{
                    height: 4, borderRadius: 2,
                    width: `${sapPct}%`,
                    background: weekStats.noSAP > 0
                      ? 'linear-gradient(90deg, #ff4d4f, #ff7875)'
                      : 'linear-gradient(90deg, #52c41a, #95de64)',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 32, background: '#e8e8e8', marginRight: 16, flexShrink: 0 }} />

              {/* Stat: Hours */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 80, marginRight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: 700, color: '#595959', lineHeight: 1 }}>{weekStats.totalHours}</Text>
                  <Text type="secondary" style={{ fontSize: 10 }}>hrs total</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 10, marginTop: 1 }}>
                  {avgHours > 10
                    ? <span style={{ color: '#ff4d4f' }}>↑ Overloaded ({avgHours.toFixed(1)}h/day)</span>
                    : avgHours > 8
                    ? <span style={{ color: '#fa8c16' }}>~{avgHours.toFixed(1)}h / day</span>
                    : <span style={{ color: '#52c41a' }}>~{avgHours.toFixed(1)}h / day ✓</span>
                  }
                </Text>
              </div>

              {/* At-Risk Jobs — clickable badge near hrs total */}
              {atRiskJobs.length > 0 && (
                <Badge count={atRiskJobs.length} size="small" offset={[-2, 2]} style={{ flexShrink: 0 }}>
                  <Button
                    size="small"
                    danger
                    icon={<WarningFilled />}
                    onClick={() => setAtRiskDrawerOpen(true)}
                    style={{ fontSize: 11, height: 28 }}
                  >
                    At Risk
                  </Button>
                </Badge>
              )}


              {/* Contextual message (right-aligned) */}
              <div style={{ flex: 1 }} />
              <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                {weekStats.totalJobs === 0
                  ? 'Drag jobs from the right panel to schedule them'
                  : weekStats.unassigned === 0 && weekStats.noSAP === 0
                  ? '✓ Week is fully planned'
                  : weekStats.unassigned > 0
                  ? `${weekStats.unassigned} job${weekStats.unassigned > 1 ? 's' : ''} need a team`
                  : `${weekStats.noSAP} job${weekStats.noSAP > 1 ? 's' : ''} missing SAP order`
                }
              </Text>
            </div>
          );
        })()}

        {/* Bulk Actions Toolbar */}
        {selectedJobIds.size > 0 && isDraft && (
          <Card
            size="small"
            bodyStyle={{ padding: '8px 16px' }}
            style={{
              marginBottom: 0,
              background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)',
              border: '1px solid #91d5ff',
              borderRadius: 0,
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space>
                  <CheckSquareOutlined style={{ color: '#1890ff' }} />
                  <Text strong style={{ color: '#1890ff' }}>
                    {selectedJobIds.size} job{selectedJobIds.size > 1 ? 's' : ''} selected
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    onClick={selectAllJobs}
                    style={{ padding: 0 }}
                  >
                    Select All
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={clearSelection}
                    style={{ padding: 0 }}
                  >
                    Clear
                  </Button>
                </Space>
              </Col>
              <Col>
                <Space>
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => setBulkMoveModalOpen(true)}
                  >
                    Move to Day
                  </Button>
                  <Popconfirm
                    title={`Delete ${selectedJobIds.size} job${selectedJobIds.size > 1 ? 's' : ''}?`}
                    description="This action cannot be undone."
                    onConfirm={() => bulkDeleteMutation.mutate(Array.from(selectedJobIds))}
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      icon={<DeleteOutlined />}
                      danger
                      loading={bulkDeleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                </Space>
              </Col>
            </Row>
          </Card>
        )}

          {/* ── CALENDAR / ENGINEERS AREA ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ENGINEERS STRIP (horizontal, scroll) */}
            {currentPlan && viewMode === 'calendar' && (
              <div style={{
                borderBottom: '1px solid #d6e4ff',
                padding: '5px 12px',
                flexShrink: 0,
                background: 'linear-gradient(90deg, #f0f5ff 0%, #fafafa 100%)',
                overflowX: 'auto',
                overflowY: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 'max-content' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 10, borderRight: '1px solid #d6e4ff', flexShrink: 0 }}>
                    <span style={{ fontSize: 14 }}>👷</span>
                    <Text style={{ fontSize: 11, fontWeight: 700, color: '#1890ff', whiteSpace: 'nowrap' }}>Engineers</Text>
                    <Badge
                      count={teamColumns.engineers.filter((u: any) => !leaveUserIds.has(u.id)).length}
                      size="small"
                      style={{ backgroundColor: '#1890ff' }}
                    />
                  </div>
                  {teamColumns.engineers.length === 0
                    ? <Text type="secondary" style={{ fontSize: 11 }}>No engineers found</Text>
                    : (teamColumns.engineers as any[]).map((user: any) => (
                        <DraggableTeamMember
                          key={user.id}
                          user={user}
                          isOnLeave={leaveUserIds.has(user.id)}
                          leaveInfo={leaveDetails.find(l => l.userId === user.id)?.dates.map(d => dayjs(d).format('ddd')).join(',')}
                        />
                      ))
                  }
                </div>
              </div>
            )}

            {/* CALENDAR / VIEW AREA */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {isLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spin size="large" />
                </div>
              ) : isError ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', color: '#ff4d4f' }}>
                    <Text type="danger" style={{ fontSize: 16 }}>Error loading work plan</Text>
                    <br />
                    <Text type="secondary">{(error as any)?.response?.data?.message || (error as any)?.message || 'Unknown error'}</Text>
                    <br />
                    <Button onClick={() => refetch()} style={{ marginTop: 16 }}>Retry</Button>
                  </div>
                </div>
              ) : currentPlan ? (
                viewMode === 'analytics' ? (
                  <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
                    {aiAssistanceEnabled && incompleteJobPredictions.length > 0 && (
                      <IncompleteJobsWarning
                        jobs={incompleteJobPredictions}
                        compact
                        maxItems={5}
                        onTakeAction={(jobId, action) => { message.info(`Recommended action for job ${jobId}: ${action}`); }}
                      />
                    )}
                    <AnalyticsView plan={currentPlan} weekStart={weekStartStr} />
                    {aiAssistanceEnabled && timeAccuracyData && timeAccuracyData.overallAccuracy > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <TimeAccuracyChart
                          overallAccuracy={timeAccuracyData.overallAccuracy}
                          underEstimatedCount={timeAccuracyData.underEstimatedCount}
                          overEstimatedCount={timeAccuracyData.overEstimatedCount}
                          accurateCount={timeAccuracyData.accurateCount}
                          byJobType={timeAccuracyData.byJobType}
                          periodLabel={`Week of ${dayjs(weekStartStr).format('MMM D')}`}
                        />
                      </div>
                    )}
                  </div>
                ) : viewMode === 'gantt' ? (
                  <GanttChartView
                    jobs={allJobs}
                    weekStart={weekStartStr}
                    onJobClick={(job) => handleJobClick(job as WorkPlanJob)}
                  />
                ) : viewMode === 'timeline' ? (
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
                  // CALENDAR VIEW: flex day columns with expand/collapse
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* 7 Flex Day Columns */}
                    <div style={{ flex: 1, display: 'flex', gap: 5, padding: '6px 8px 8px', overflow: 'hidden', background: '#fff' }}>
                      {(currentPlan.days || [])
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map((day) => {
                          const date = dayjs(day.date);
                          const isToday = day.date === dayjs().format('YYYY-MM-DD');
                          const jobs = getJobsForBerth(day);
                          const totalHours = jobs.reduce((sum, job) => sum + job.estimated_hours, 0);
                          const workloadColor = totalHours > 10 ? '#ff4d4f' : totalHours > 6 ? '#fa8c16' : totalHours > 0 ? '#52c41a' : undefined;
                          const isExpanded = expandedDay === day.date;
                          const isCollapsed = expandedDay !== null && expandedDay !== day.date;

                          return (
                            <div
                              key={day.id}
                              style={{
                                flex: isExpanded ? '3.5 3.5 0' : isCollapsed ? '0 0 42px' : '1 1 0',
                                transition: 'flex 0.3s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                minWidth: 42,
                              }}
                            >
                              <DroppableDay
                                day={day}
                                berth={berth}
                                containerStyle={{
                                  flex: 1,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  overflow: 'hidden',
                                  borderRadius: 8,
                                  border: `1.5px solid ${isToday ? '#52c41a' : workloadColor || '#e8e8e8'}`,
                                  background: isToday ? '#f6ffed' : '#fff',
                                  transition: 'all 0.2s',
                                }}
                              >
                                {isCollapsed ? (
                                  // Mini collapsed column — click to expand
                                  <div
                                    onClick={() => setExpandedDay(day.date)}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      height: '100%',
                                      gap: 6,
                                      cursor: 'pointer',
                                      padding: 4,
                                    }}
                                  >
                                    <div style={{
                                      writingMode: 'vertical-rl',
                                      textOrientation: 'mixed',
                                      transform: 'rotate(180deg)',
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: isToday ? '#52c41a' : workloadColor || '#8c8c8c',
                                      letterSpacing: 1,
                                    }}>
                                      {date.format('ddd D')}
                                    </div>
                                    {jobs.length > 0 && (
                                      <Badge
                                        count={jobs.length}
                                        size="small"
                                        style={{ backgroundColor: workloadColor || '#1890ff' }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    {/* Column Header — click to expand/collapse */}
                                    <div
                                      onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                      style={{
                                        padding: '6px 8px',
                                        borderBottom: '1px solid #f0f0f0',
                                        background: isToday ? '#f0fff4' : '#fafafa',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                          <div style={{ fontSize: 9, fontWeight: 600, color: isToday ? '#52c41a' : '#8c8c8c', textTransform: 'uppercase', letterSpacing: 1 }}>
                                            {date.format('ddd')}
                                          </div>
                                          <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#52c41a' : workloadColor || '#262626', lineHeight: 1.1 }}>
                                            {date.format('D')}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                          <Badge
                                            count={jobs.length}
                                            showZero
                                            size="small"
                                            style={{ backgroundColor: jobs.length > 0 ? (workloadColor || '#1890ff') : '#d9d9d9' }}
                                          />
                                          {totalHours > 0 && (
                                            <Text style={{ fontSize: 9, color: workloadColor || '#8c8c8c', fontWeight: totalHours > 6 ? 600 : 400 }}>
                                              {totalHours}h
                                            </Text>
                                          )}
                                        </div>
                                      </div>
                                      {isExpanded && totalHours > 6 && (
                                        <div style={{ marginTop: 3 }}>
                                          {totalHours > 10
                                            ? <Tag color="error" style={{ fontSize: 9, margin: 0 }}>⚠ Overloaded</Tag>
                                            : <Tag color="warning" style={{ fontSize: 9, margin: 0 }}>Busy</Tag>
                                          }
                                        </div>
                                      )}
                                    </div>

                                    {/* Jobs List — grouped by equipment type as compact "3× RS" chips */}
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 5px' }}>
                                      {jobs.length === 0 ? (
                                        <div style={{
                                          textAlign: 'center',
                                          padding: 16,
                                          color: '#bfbfbf',
                                          border: isDraft ? '2px dashed #d9d9d9' : undefined,
                                          borderRadius: 6,
                                          margin: '4px 0',
                                        }}>
                                          {isDraft ? (
                                            <>
                                              <div style={{ fontSize: 16 }}>＋</div>
                                              <div style={{ fontSize: 10 }}>Drag job here</div>
                                            </>
                                          ) : 'No jobs'}
                                        </div>
                                      ) : (() => {
                                        // Inspections → grouped "3×RS" chips per equipment type
                                        const inspectionJobs = jobs.filter(j => j.job_type === 'inspection');
                                        const otherJobs = jobs.filter(j => j.job_type !== 'inspection');
                                        const inspGroups = inspectionJobs.reduce<Record<string, WorkPlanJob[]>>((acc, job) => {
                                          const eqType =
                                            (job as any).equipment?.equipment_type ||
                                            (job as any).inspection_assignment?.equipment?.equipment_type ||
                                            (job as any).equipment?.name?.split(' ')[0] ||
                                            'Other';
                                          if (!acc[eqType]) acc[eqType] = [];
                                          acc[eqType].push(job);
                                          return acc;
                                        }, {});
                                        return (
                                          <>
                                            {Object.entries(inspGroups).map(([eqType, groupJobs]) => (
                                              <EquipmentGroupRow
                                                key={`insp-${eqType}`}
                                                eqType={eqType}
                                                jobs={groupJobs}
                                                berth={berth}
                                                onJobClick={handleJobClick}
                                              />
                                            ))}
                                            {otherJobs.map(job => (
                                              <SimpleJobRow
                                                key={job.id}
                                                job={job}
                                                dayId={day.id}
                                                onJobClick={handleJobClick}
                                              />
                                            ))}
                                          </>
                                        );
                                      })()}
                                    </div>

                                    {/* Capacity Bar */}
                                    <div style={{ padding: '4px 8px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                        <Text style={{ fontSize: 9, color: '#8c8c8c' }}>{jobs.length} job{jobs.length !== 1 ? 's' : ''}</Text>
                                        <Text style={{ fontSize: 9, color: workloadColor || '#8c8c8c', fontWeight: totalHours > 0 ? 600 : 400 }}>
                                          {totalHours > 0 ? `${totalHours}h / 8h` : '—'}
                                        </Text>
                                      </div>
                                      <div style={{ height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{
                                          height: '100%',
                                          borderRadius: 2,
                                          width: `${Math.min(100, (totalHours / 8) * 100)}%`,
                                          background: totalHours > 10
                                            ? 'linear-gradient(90deg, #ff4d4f, #ff7875)'
                                            : totalHours > 6
                                            ? 'linear-gradient(90deg, #fa8c16, #ffc53d)'
                                            : 'linear-gradient(90deg, #52c41a, #95de64)',
                                          transition: 'width 0.5s ease',
                                        }} />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </DroppableDay>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 16 }}>No plan for this week</Text>
                    <br />
                    <Button type="primary" onClick={() => setCreateModalOpen(true)} style={{ marginTop: 16 }}>
                      Create Plan
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>{/* END left-column */}

        {/* ── RIGHT PANEL: Tabbed Jobs + Team ── */}
        <div className="wp-right-panel" style={{ width: 300, minWidth: 300, borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflow: 'hidden', flexShrink: 0 }}>
            <Tabs
              activeKey={rightPanelTab}
              onChange={(k) => setRightPanelTab(k as 'jobs' | 'team')}
              size="small"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              tabBarStyle={{ margin: 0, padding: '0 8px', flexShrink: 0, borderBottom: '1px solid #f0f0f0' }}
              items={[
                {
                  key: 'jobs',
                  label: (
                    <span>
                      Jobs Pool
                      {weekStats && weekStats.unassigned > 0 && (
                        <Badge count={weekStats.unassigned} size="small" style={{ marginLeft: 4, backgroundColor: '#fa8c16' }} />
                      )}
                    </span>
                  ),
                  children: (
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <JobsPool
                        embedded
                        berth={berth}
                        planId={currentPlan?.id}
                        days={currentPlan?.days?.map(d => ({ id: d.id, date: d.date, day_name: dayjs(d.date).format('ddd') })) || []}
                        onAddJob={() => setAddJobModalOpen(true)}
                        onJobClick={(job, type) => {
                          setSelectedJob({ ...job, job_type: type as JobType } as any);
                          setJobDetailsModalOpen(true);
                        }}
                        onImportSAP={() => setImportModalOpen(true)}
                        onClearPool={async () => { await clearPoolMutation.mutateAsync(); }}
                        onQuickSchedule={(job, jobType, dayId) => {
                          if (!currentPlan || !isDraft) return;
                          if (jobType === 'sap' && job.id) {
                            scheduleSAPMutation.mutate({ planId: currentPlan.id, sapOrderId: job.id, dayId });
                          } else {
                            addJobMutation.mutate({
                              planId: currentPlan.id,
                              dayId,
                              jobType: jobType as JobType,
                              berth: berth as Berth,
                              equipmentId: job.equipment?.id,
                              defectId: job.defect?.id,
                              inspectionAssignmentId: job.assignment?.id,
                              estimatedHours: jobType === 'inspection' ? (job.estimated_hours || 0.333) : (job.estimated_hours || 4),
                            });
                          }
                        }}
                      />
                    </div>
                  ),
                },
                {
                  key: 'team',
                  label: (
                    <span>
                      Team Pool
                      {currentPlan && (
                        <Badge
                          count={[...teamColumns.specMech, ...teamColumns.specElec, ...teamColumns.inspMech, ...teamColumns.inspElec]
                            .filter((u: any) => !leaveUserIds.has(u.id)).length}
                          size="small"
                          style={{ marginLeft: 4, backgroundColor: '#52c41a' }}
                        />
                      )}
                    </span>
                  ),
                  children: (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 8 }}>
                      {/* Discipline Filter */}
                      <Space size={4} style={{ marginBottom: 8, flexShrink: 0 }}>
                        {(['all', 'mechanical', 'electrical'] as const).map(d => (
                          <Button
                            key={d}
                            size="small"
                            type={teamPoolDisc === d ? 'primary' : 'default'}
                            onClick={() => setTeamPoolDisc(d)}
                            style={{ fontSize: 11 }}
                          >
                            {d === 'all' ? 'All' : d === 'mechanical' ? '🔧 Mech' : '⚡ Elec'}
                          </Button>
                        ))}
                      </Space>

                      {/* Leave summary */}
                      {leaveDetails.length > 0 && (
                        <div style={{ marginBottom: 8, padding: '4px 8px', background: '#fff7e6', borderRadius: 4, flexShrink: 0 }}>
                          <WarningOutlined style={{ color: '#fa8c16', marginRight: 4, fontSize: 11 }} />
                          <Text style={{ fontSize: 11, color: '#fa8c16' }}>
                            {leaveDetails.length} on leave this week
                          </Text>
                        </div>
                      )}

                      {/* Non-engineer team groups */}
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {teamColumnConfig
                          .filter(col => col.key !== 'engineers')
                          .filter(col => {
                            if (teamPoolDisc === 'all') return true;
                            if (teamPoolDisc === 'mechanical') return ['specMech', 'inspMech'].includes(col.key);
                            return ['specElec', 'inspElec'].includes(col.key);
                          })
                          .map(col => {
                            const availableUsers = col.users.filter((u: any) => !leaveUserIds.has(u.id));
                            const onLeaveUsers = col.users.filter((u: any) => leaveUserIds.has(u.id));
                            return (
                              <div key={col.key} style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, paddingBottom: 4, borderBottom: `2px solid ${col.color}30` }}>
                                  <span style={{ fontSize: 12 }}>{col.emoji}</span>
                                  <Text style={{ fontSize: 11, fontWeight: 600, color: col.color }}>{col.label}</Text>
                                  <Badge count={availableUsers.length} size="small" style={{ backgroundColor: col.color }} />
                                  {onLeaveUsers.length > 0 && (
                                    <Text type="secondary" style={{ fontSize: 10 }}>({onLeaveUsers.length} on leave)</Text>
                                  )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {availableUsers.map((user: any) => (
                                    <DraggableTeamMember key={user.id} user={user} isOnLeave={false} />
                                  ))}
                                  {onLeaveUsers.map((user: any) => (
                                    <DraggableTeamMember
                                      key={user.id}
                                      user={user}
                                      isOnLeave={true}
                                      leaveInfo={leaveDetails.find(l => l.userId === user.id)?.dates.map(d => dayjs(d).format('ddd')).join(',')}
                                    />
                                  ))}
                                  {availableUsers.length === 0 && onLeaveUsers.length === 0 && (
                                    <Text type="secondary" style={{ fontSize: 10, padding: 4 }}>None</Text>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
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
              <span>{activeItem.data.job?.equipment?.serial_number || activeItem.data.job?.defect?.description?.substring(0, 20) || 'Job'}</span>
            )}
            {activeItem.type === 'job' && (
              <span>{activeItem.data.job?.equipment?.serial_number || 'Job'}</span>
            )}
            {activeItem.type === 'employee' && (
              <span>{activeItem.data.user?.full_name}</span>
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
        title="Import SAP Work Orders"
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
        title={
          <Space>
            <TeamOutlined />
            <span>Assign Team Role</span>
          </Space>
        }
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setPendingAssignment(null);
        }}
        footer={null}
        width={450}
      >
        {pendingAssignment && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 15 }}>
              Assign <strong>{pendingAssignment.user.full_name}</strong> to{' '}
              <strong>{pendingAssignment.job.equipment?.serial_number || 'this job'}</strong>
            </p>

            {/* Conflict Warnings */}
            {assignmentWarnings.length > 0 && (
              <div style={{ marginBottom: 16, textAlign: 'left' }}>
                {assignmentWarnings.map((warning, idx) => (
                  <Alert
                    key={idx}
                    message={warning.message}
                    type={warning.type}
                    showIcon
                    icon={warning.type === 'error' ? <ExclamationCircleOutlined /> : <WarningOutlined />}
                    style={{ marginBottom: 8 }}
                  />
                ))}
              </div>
            )}

            <Divider />
            <Space size="large">
              <Button
                type="primary"
                size="large"
                onClick={() => handleAssign(true)}
                loading={assignMutation.isPending}
                disabled={assignmentWarnings.some(w => w.type === 'error' && w.message.includes('already assigned'))}
              >
                As Lead
              </Button>
              <Button
                size="large"
                onClick={() => handleAssign(false)}
                loading={assignMutation.isPending}
                disabled={assignmentWarnings.some(w => w.type === 'error' && w.message.includes('already assigned'))}
              >
                As Member
              </Button>
            </Space>
            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lead: Responsible for the job | Member: Part of the team
            </Text>
            {assignmentWarnings.some(w => w.type === 'error' && !w.message.includes('already assigned')) && (
              <div style={{ marginTop: 8 }}>
                <Text type="warning" style={{ fontSize: 11 }}>
                  You can still assign despite warnings
                </Text>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Bulk Move Modal */}
      <Modal
        title={
          <Space>
            <SwapOutlined />
            <span>Move {selectedJobIds.size} Job{selectedJobIds.size > 1 ? 's' : ''} to Day</span>
          </Space>
        }
        open={bulkMoveModalOpen}
        onCancel={() => setBulkMoveModalOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            Select the target day to move all selected jobs:
          </Text>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {currentPlan?.days?.map(day => (
            <Button
              key={day.id}
              block
              onClick={() => {
                bulkMoveMutation.mutate({
                  jobIds: Array.from(selectedJobIds),
                  targetDayId: day.id,
                });
              }}
              loading={bulkMoveMutation.isPending}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: 'auto',
                padding: '12px 8px',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                {dayjs(day.date).format('ddd')}
              </span>
              <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                {dayjs(day.date).format('MMM D')}
              </span>
            </Button>
          ))}
        </div>
      </Modal>

      {/* Copy from Previous Week Modal */}
      <Modal
        title={
          <Space>
            <CopyOutlined />
            <span>Copy from Previous Week</span>
          </Space>
        }
        open={copyWeekModalOpen}
        onCancel={() => setCopyWeekModalOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            message="Copy job structure from a previous week"
            description="This copies equipment assignments, teams, and materials. SAP order numbers are NOT copied (they are unique per week)."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Text type="secondary">Select a week to copy from:</Text>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 8 }}>
          {/* Last 4 weeks */}
          {[1, 2, 3, 4].map(weeksAgo => {
            const weekStart = currentWeekStart.subtract(weeksAgo, 'week');
            const weekStartStr = weekStart.format('YYYY-MM-DD');
            return (
              <Button
                key={weeksAgo}
                block
                onClick={() => copyFromWeekMutation.mutate(weekStartStr)}
                loading={copyFromWeekMutation.isPending}
                style={{ textAlign: 'left', height: 'auto', padding: '10px 16px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {weekStart.format('MMM D')} - {weekStart.add(6, 'day').format('MMM D, YYYY')}
                    </div>
                    <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                      {weeksAgo === 1 ? 'Last week' : `${weeksAgo} weeks ago`}
                    </div>
                  </div>
                  <CopyOutlined style={{ color: '#1890ff' }} />
                </div>
              </Button>
            );
          })}
        </div>
      </Modal>

      {/* Job Details Modal */}
      <Modal
        title={
          <Space>
            <span>{selectedJob?.job_type === 'pm' ? 'PM' : selectedJob?.job_type === 'defect' ? 'Defect' : 'Inspection'}</span>
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
                <Text type="danger">No SAP Order Number</Text>
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
                  Overdue by {selectedJob.overdue_value} {selectedJob.overdue_unit}
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
                      <span>{a.is_lead ? 'Lead' : 'Member'}</span>
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
                      {m.material?.name} x {m.quantity} {m.material?.unit}
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
        title="Add Job Manually"
        open={addJobModalOpen}
        onCancel={() => {
          setAddJobModalOpen(false);
          addJobForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        {currentPlan && isDraft ? (
          <Form
            form={addJobForm}
            layout="vertical"
            onFinish={(values) => {
              manualAddJobMutation.mutate({
                day_id: values.day_id,
                job_type: values.job_type,
                berth: values.berth || berth,
                equipment_id: values.equipment_id,
                description: values.description,
                estimated_hours: values.estimated_hours,
                priority: values.priority || 'normal',
                notes: values.notes,
              });
            }}
            initialValues={{
              job_type: 'pm',
              berth: berth,
              priority: 'normal',
              estimated_hours: 4,
            }}
          >
            {/* Day Selection */}
            <Form.Item
              name="day_id"
              label="Day"
              rules={[{ required: true, message: 'Select a day' }]}
            >
              <Select placeholder="Select day to add job">
                {(currentPlan.days || [])
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((day) => (
                    <Select.Option key={day.id} value={day.id}>
                      {dayjs(day.date).format('ddd, MMM D')} - {day.day_name}
                    </Select.Option>
                  ))}
              </Select>
            </Form.Item>

            {/* Equipment Selection */}
            <Form.Item
              name="equipment_id"
              label="Equipment"
              rules={[{ required: true, message: 'Select equipment' }]}
            >
              <Select
                placeholder="Select equipment"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                }
                options={equipmentList.map((eq: any) => ({
                  value: eq.id,
                  label: `${eq.serial_number || eq.name} - ${eq.equipment_type || ''}`,
                }))}
              />
            </Form.Item>

            <Row gutter={16}>
              {/* Job Type */}
              <Col span={8}>
                <Form.Item
                  name="job_type"
                  label="Job Type"
                  rules={[{ required: true }]}
                >
                  <Select>
                    <Select.Option value="pm">PM</Select.Option>
                    <Select.Option value="defect">Defect</Select.Option>
                  </Select>
                </Form.Item>
              </Col>

              {/* Berth */}
              <Col span={8}>
                <Form.Item name="berth" label="Berth">
                  <Select>
                    <Select.Option value="east">East</Select.Option>
                    <Select.Option value="west">West</Select.Option>
                    <Select.Option value="both">Both</Select.Option>
                  </Select>
                </Form.Item>
              </Col>

              {/* Priority */}
              <Col span={8}>
                <Form.Item name="priority" label="Priority">
                  <Select>
                    <Select.Option value="low">Low</Select.Option>
                    <Select.Option value="normal">Normal</Select.Option>
                    <Select.Option value="high">High</Select.Option>
                    <Select.Option value="urgent">Urgent</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            {/* Estimated Hours */}
            <Form.Item
              name="estimated_hours"
              label="Estimated Hours"
              rules={[{ required: true, message: 'Enter estimated hours' }]}
            >
              <InputNumber min={0.5} max={24} step={0.5} style={{ width: '100%' }} />
            </Form.Item>

            {/* Description */}
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} placeholder="Job description" />
            </Form.Item>

            {/* Notes with Voice Recording */}
            <Form.Item name="notes" label="Notes (Voice Recording)">
              <VoiceTextArea
                rows={3}
                placeholder="Add notes or use microphone to record voice..."
                value={addJobForm.getFieldValue('notes')}
                onChange={(e) => addJobForm.setFieldValue('notes', e.target.value)}
              />
            </Form.Item>

            {/* Actions */}
            <Divider />
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button
                onClick={() => {
                  setAddJobModalOpen(false);
                  setImportModalOpen(true);
                }}
                icon={<UploadOutlined />}
              >
                Import SAP Instead
              </Button>
              <Space>
                <Button onClick={() => setAddJobModalOpen(false)}>Cancel</Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={manualAddJobMutation.isPending}
                >
                  Add Job
                </Button>
              </Space>
            </Space>
          </Form>
        ) : (
          <Text type="warning">
            {!currentPlan ? 'Create a work plan first.' : 'Cannot add jobs to a published plan.'}
          </Text>
        )}
      </Modal>

      {/* AI Insights Drawer */}
      <Drawer
        title={
          <Space>
            <BulbOutlined />
            <span>AI Work Plan Insights</span>
          </Space>
        }
        open={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        width={500}
      >
        {currentPlan && (
          <WorkPlanAIPanel
            planId={currentPlan.id}
          />
        )}
      </Drawer>

      {/* Conflict Resolution Panel */}
      <Drawer
        title={
          <Space>
            <AlertOutlined />
            <span>Scheduling Conflicts</span>
          </Space>
        }
        open={conflictPanelOpen}
        onClose={() => setConflictPanelOpen(false)}
        width={600}
      >
        {currentPlan && (
          <ConflictResolutionPanel
            planId={currentPlan.id}
          />
        )}
      </Drawer>

      {/* At-Risk Jobs Drawer — drag from here to any day column */}
      <Drawer
        title={
          <Space>
            <WarningFilled style={{ color: '#ff4d4f' }} />
            <span>{atRiskJobs.length} Jobs At Risk</span>
          </Space>
        }
        open={atRiskDrawerOpen}
        onClose={() => setAtRiskDrawerOpen(false)}
        width={320}
        placement="right"
        mask={false}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          Drag a job card directly to a day column in the calendar.
        </Text>
        {atRiskJobs.map(risk => (
          <DraggableRiskJob key={risk.id} risk={risk} job={allJobs.find(j => j.id === risk.id)} />
        ))}
        {atRiskJobs.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#52c41a' }}>
            <div style={{ fontSize: 24 }}>✓</div>
            <Text type="secondary">No at-risk jobs this week</Text>
          </div>
        )}
      </Drawer>
    </DndContext>
  );
}
