export { initApiClient, getApiClient, getApiBaseUrl, setLanguage, apiClient } from './client';

export { authApi } from './auth.api';
export { usersApi } from './users.api';
export type {
  UserListParams,
  UserDashboardStats,
  UserWorkload,
  WorkloadAnalysis,
  AISearchResult,
  BulkActionPayload,
} from './users.api';
export { equipmentApi } from './equipment.api';
export type { EquipmentListParams } from './equipment.api';
export { checklistsApi } from './checklists.api';
export type {
  ChecklistListParams,
  CreateTemplatePayload as ChecklistCreateTemplatePayload,
  CreateChecklistItemPayload,
  UpdateChecklistItemPayload,
  ChecklistStats,
  TemplateAnalytics,
  AIGeneratePayload,
  AISuggestion,
  SearchResult as ChecklistSearchResult,
} from './checklists.api';
export { inspectionsApi } from './inspections.api';
export type {
  InspectionListParams,
  StartInspectionPayload,
  ReviewPayload,
  InspectionStats,
  AIInsights,
  BulkReviewPayload,
  BulkReviewResult,
} from './inspections.api';
export { defectsApi } from './defects.api';
export type { DefectListParams, AssignSpecialistPayload, QuickReportPayload } from './defects.api';
export { schedulesApi } from './schedules.api';
export type { CreateSchedulePayload } from './schedules.api';
export { ratingsApi } from './ratings.api';
export type { RateInspectionPayload } from './ratings.api';
export { notificationsApi } from './notifications.api';
export type {
  NotificationListParams,
  SnoozePayload,
  SchedulePayload,
  UpdatePreferencePayload,
  CreateRulePayload,
  UpdateRulePayload,
  DoNotDisturbPayload,
  AnalyticsParams,
  SearchParams,
} from './notifications.api';
export { specialistJobsApi } from './specialist-jobs.api';
export type {
  SpecialistJobListParams,
  CompleteJobPayload,
  PauseRequestPayload,
  SpecialistJobStats,
  MySpecialistStats,
  AITimeEstimate,
  PartsPrediction,
  AIPartsPredictionResponse,
} from './specialist-jobs.api';
export { engineerJobsApi } from './engineer-jobs.api';
export type {
  EngineerJobListParams,
  EngineerPlannedTimePayload,
  EngineerCompletePayload,
  EngineerStatsParams,
  VoiceNoteResponse,
  LocationUpdateResponse,
} from './engineer-jobs.api';
export { inspectionAssignmentsApi } from './inspection-assignments.api';
export type {
  AssignmentListParams,
  GenerateListPayload,
  AssignTeamPayload,
  MyAssignmentsParams,
  AssignmentStats,
  MyAssignmentStats,
  InspectorSuggestion,
  AISuggestionResponse,
  BulkAssignPayload,
  BulkAssignResult,
  CalendarDay,
  CalendarData,
  SmartBatch,
  SmartBatchResponse,
  AssignmentTemplate,
  AssignmentTemplateItem,
  WorkloadDistribution,
  WorkloadBalanceResult,
  WorkloadPreviewResult,
} from './inspection-assignments.api';
export { assessmentsApi } from './assessments.api';
export type { AssessmentListParams, VerdictPayload, AdminResolvePayload } from './assessments.api';
export { defectAssessmentsApi } from './defect-assessments.api';
export type { CreateDefectAssessmentPayload } from './defect-assessments.api';
export { qualityReviewsApi } from './quality-reviews.api';
export type {
  QualityReviewListParams,
  ApprovePayload,
  RejectPayload,
  ValidatePayload,
  QualityReviewStatsParams,
  CreateTemplatePayload as QualityReviewCreateTemplatePayload,
  AIAnalysisResult,
} from './quality-reviews.api';
export { leavesApi } from './leaves.api';
export type {
  LeaveApprovePayload,
  LeaveRejectPayload,
  CapacityInfo,
  LeaveBalanceData,
} from './leaves.api';
export { leaderboardsApi } from './leaderboards.api';
export type { LeaderboardParams, HistoricalParams, PointHistoryParams } from './leaderboards.api';
export { bonusStarsApi } from './bonus-stars.api';
export type { RequestBonusPayload } from './bonus-stars.api';
export { reportsApi } from './reports.api';
export type {
  DashboardData,
  AdminDashboardData,
  PauseAnalytics,
  DefectAnalytics,
  CapacityData,
  WorkPlanStats,
  TodayJob,
  TeamWorkload,
  JobsByDay,
} from './reports.api';
export { filesApi } from './files.api';
export type { FileListParams } from './files.api';
export { inspectionRoutinesApi } from './inspection-routines.api';
export type {
  InspectionRoutine,
  CreateRoutinePayload,
  EquipmentSchedule,
  UpcomingEntry,
  UpcomingData,
  RoutineShiftType,
  RoutineDayOfWeek,
  RoutineFrequencyType,
} from './inspection-routines.api';
export { rosterApi } from './roster.api';
export { voiceApi } from './voice.api';
export type { TranscriptionResult } from './voice.api';
export type {
  RosterWeekUser,
  RosterWeekData,
  DayAvailabilityData,
  UploadRosterResult,
  CoverageScoreData,
  WorkloadData,
  WorkloadUser,
  CoverageSuggestion,
  CoverageSuggestionData,
  ShiftSwapRequest,
  CreateSwapRequestPayload,
  FatigueAlert,
  FatigueAlertsData,
} from './roster.api';
export { aiApi } from './ai.api';
export type {
  DefectAnalysis,
  GaugeReading,
  ImageComparison,
  ReportResult,
  SummaryResult,
  TranslationResult,
  SearchResult,
  AssistantResponse,
} from './ai.api';
export { workPlansApi } from './work-plans.api';
export type {
  WorkPlanListParams,
  WorkPlansListResponse,
  SAPImportResponse,
} from './work-plans.api';
export { materialsApi } from './materials.api';
export type {
  MaterialListParams,
  MaterialsListResponse,
  KitsListResponse,
  LowStockResponse,
  StockHistoryResponse,
  BatchesResponse,
  LocationsResponse,
  VendorsResponse,
  AlertsResponse,
  ReservationsResponse,
  CountsResponse,
  CountItemsResponse,
  ABCAnalysisResponse,
  InsightsResponse,
  AnomaliesResponse as MaterialAnomaliesResponse,
  CostOptimizationResponse,
  DeadStockResponse,
  NaturalLanguageSearchResponse,
} from './materials.api';
export { cyclesApi } from './cycles.api';
export type {
  CyclesListParams,
  CycleAnalyticsData,
  CycleImpactData,
  LinkedItemsData,
  LinkedItem,
} from './cycles.api';
export { pmTemplatesApi } from './pm-templates.api';
export type { TemplatesListParams, FindTemplateParams } from './pm-templates.api';
export { workPlanTrackingApi } from './work-plan-tracking.api';
export { approvalsApi } from './approvals.api';
export type {
  ApprovalType,
  ApprovalStatus,
  ApprovalUser,
  ApprovalDetails,
  UnifiedApproval,
  ApprovalCounts,
  ApprovalListResponse,
  ApprovalListParams,
  BulkApprovalItem,
  BulkApprovalPayload,
  BulkApprovalResult,
  BulkApprovalResponse,
} from './approvals.api';
export { autoApprovalsApi } from './auto-approvals.api';
export type {
  AutoApprovalType,
  ApprovalResult,
  AutoApprovalEvaluateResponse,
  AutoApproveResponse,
  BulkEvaluateItem,
  BulkEvaluateResponse,
  BulkAutoApproveResponse,
  AutoApprovalStats,
  ApprovalTypeInfo,
} from '../types/auto-approval.types';

// Unified AI APIs (Approvals, Quality Reviews, Inspection Routines)
export {
  unifiedAIApi,
  approvalAIApi,
  qualityReviewAIApi,
  inspectionRoutineAIApi,
  aiDashboardApi,
} from './unified-ai.api';
export type {
  ApprovalType as UnifiedApprovalType,
  AutoApproveCheckResult,
  BulkEvaluateItem as UnifiedBulkEvaluateItem,
  BulkEvaluateResult,
  BulkEvaluateResponse as UnifiedBulkEvaluateResponse,
  QualityReviewBulkEvaluateResponse,
  AIDashboardStats,
} from './unified-ai.api';

// Enhanced AI Module APIs
export { defectAIApi } from './defect-ai.api';
export { overdueApi } from './overdue.api';
export { dailyReviewAIApi } from './daily-review-ai.api';
export { performanceApi } from './performance.api';
export { reportsAIApi } from './reports-ai.api';
export { scheduleAIApi } from './schedule-ai.api';

// Mobile Toolkit & Communication
export { toolkitApi } from './toolkit.api';
export { teamCommunicationApi } from './team-communication.api';

// Running Hours Tracker
export { runningHoursApi } from './running-hours.api';
export type { RunningHoursListParams } from './running-hours.api';

// Previous Inspection & Answer Templates
export { previousInspectionApi } from './previous-inspection.api';

// Job Show Up & Challenges
export { jobShowUpApi } from './job-showup.api';
export type {
  ShowUpPhoto,
  ChallengeVoice,
  ReviewMark,
  ShowUpSummary,
} from './job-showup.api';

// Shift Handover
export { shiftHandoverApi } from './shift-handover.api';
export type {
  ShiftHandover,
  PendingItem,
  SafetyAlert,
  EquipmentIssue,
  CreateHandoverPayload,
} from '../types/shift-handover.types';

// Monitor Follow-Ups
export { monitorFollowupsApi } from './monitor-followups.api';
export type {
  MonitorFollowup,
  FollowupStatus,
  FollowupType,
  FollowupLocation,
  ScheduleFollowupPayload,
  AvailableInspector,
  AvailableInspectorsResponse,
  FollowupDashboardStats,
  FollowupListParams,
} from '../types/monitor-followup.types';
