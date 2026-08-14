import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { workPlansApi, workPlanTrackingApi, AITimeEstimate } from '@inspection/shared';
import type {
  MyWorkPlanDay,
  WorkPlanJob,
  JobType,
  JobPriority,
  TrackingStatus,
  PauseReasonCategory,
} from '@inspection/shared';

// Extended job type with tracking info
interface ExtendedWorkPlanJob extends WorkPlanJob {
  is_lead: boolean;
  has_planned_time?: boolean;
  planned_time_hours?: number | null;
  tracking?: {
    id: number;
    status: TrackingStatus;
    started_at: string | null;
    paused_at: string | null;
    completed_at: string | null;
    total_paused_minutes: number;
    actual_hours: number | null;
    is_running: boolean;
    is_paused: boolean;
  };
}

// Status configuration with emojis
const STATUS_CONFIG: Record<TrackingStatus, { emoji: string; label: string; color: string }> = {
  not_started: { emoji: '\uD83D\uDFE2', label: 'Not Started', color: '#607D8B' },
  pending: { emoji: '\uD83D\uDFE2', label: 'Not Started', color: '#607D8B' },
  in_progress: { emoji: '\uD83D\uDD35', label: 'In Progress', color: '#FF9800' },
  paused: { emoji: '\u23F8\uFE0F', label: 'Paused', color: '#9C27B0' },
  completed: { emoji: '\u2705', label: 'Completed', color: '#4CAF50' },
  incomplete: { emoji: '\u26A0\uFE0F', label: 'Incomplete', color: '#F44336' },
};

const PAUSE_REASONS: { key: PauseReasonCategory; label: string }[] = [
  { key: 'break', label: 'Break' },
  { key: 'waiting_for_materials', label: 'Waiting for Materials' },
  { key: 'urgent_task', label: 'Called to Urgent Task' },
  { key: 'waiting_for_access', label: 'Waiting for Access' },
  { key: 'other', label: 'Other' },
];

const JOB_TYPE_COLORS: Record<JobType, string> = {
  pm: '#1976D2',
  defect: '#E53935',
  inspection: '#4CAF50',
  corrective: '#F9A825',
};

const PRIORITY_COLORS: Record<JobPriority, string> = {
  low: '#9E9E9E',
  normal: '#2196F3',
  high: '#FF9800',
  urgent: '#F44336',
};

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


/** Parse a YYYY-MM-DD as a LOCAL date.
 *  `new Date('2026-08-09')` is parsed as UTC midnight and then rendered in local
 *  time, which lands on the previous day for negative offsets. Anchoring at noon
 *  keeps the calendar date stable in every timezone. */
function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

/** Today as YYYY-MM-DD in the DEVICE's timezone.
 *  Never use toISOString() for this: it is UTC, so in Baghdad (UTC+3) it returns
 *  YESTERDAY between 00:00 and 03:00 local — which would open this screen on the
 *  wrong day for night and early shifts. */
function todayLocal(): string {
  return toLocalDateString(new Date());
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

/** "Sunday, 9 August" — the headline for the day being viewed. */
function formatDayHeadline(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Short weekday initial-ish label for the day strip: SUN, MON, ... */
function formatDayStripLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function dayOfMonth(dateStr: string): string {
  return String(parseLocalDate(dateStr).getDate());
}


export default function MyWorkPlanScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  // This screen shows ONE day at a time and opens on today.
  const [selectedDate, setSelectedDate] = useState<string>(() => todayLocal());
  // Any date inside the plan we want loaded. /my-plan matches the plan whose
  // range CONTAINS this date, so we can hand it a plain day and never guess
  // whether weeks start Sunday or Monday. (Computing a Monday here used to load
  // the PREVIOUS week's plan on Sundays, so today wasn't even in it.)
  const [anchorDate, setAnchorDate] = useState<string>(() => todayLocal());

  // Modal states
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [workNotes, setWorkNotes] = useState('');

  // Planned-time entry modal (worker commits time + AI estimate before starting)
  const [showPlannedTimeModal, setShowPlannedTimeModal] = useState(false);
  const [plannedHoursInput, setPlannedHoursInput] = useState('');
  const [aiEstimate, setAiEstimate] = useState<AITimeEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

  // Timer state for active jobs
  const [activeTimers, setActiveTimers] = useState<Record<number, number>>({});
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['my-work-plan', anchorDate],
    queryFn: () => workPlansApi.getMyPlan(anchorDate),
  });

  const workPlan = data?.data?.work_plan;
  const myJobs: MyWorkPlanDay[] = useMemo(() => data?.data?.my_jobs ?? [], [data?.data?.my_jobs]);
  const totalJobs = data?.data?.total_jobs ?? 0;

  // The day strip is built from the days the PLAN actually contains, not from a
  // locally computed week. Mobile used to assume weeks start Monday while the
  // web planner creates Sunday-based plans, so the header and the content
  // disagreed. Trusting the server's days removes that whole class of bug.
  const planDays: string[] = useMemo(() => myJobs.map(d => d.date), [myJobs]);

  // Keep the selected day valid whenever a different plan arrives. Normally the
  // selected date is already inside it (we anchor the fetch on that very date);
  // this only catches gaps, e.g. no plan published for that week.
  useEffect(() => {
    if (planDays.length === 0) return;
    if (!planDays.includes(selectedDate)) {
      const today = todayLocal();
      setSelectedDate(planDays.includes(today) ? today : planDays[0]);
    }
  }, [planDays, selectedDate]);

  const selectedIndex = planDays.indexOf(selectedDate);
  const selectedDay: MyWorkPlanDay | undefined = myJobs[selectedIndex];

  /** Step one day. Past either edge, load the neighbouring week and land on its
   *  matching edge day. */
  const goToDay = useCallback((delta: -1 | 1) => {
    const idx = planDays.indexOf(selectedDate);
    const next = idx + delta;
    if (idx !== -1 && next >= 0 && next < planDays.length) {
      setSelectedDate(planDays[next]);   // still inside the loaded plan
      return;
    }
    // Stepped past the edge — re-anchor the fetch on the new day itself.
    const nextDate = addDays(selectedDate, delta);
    setSelectedDate(nextDate);
    setAnchorDate(nextDate);
  }, [planDays, selectedDate]);

  const goToToday = useCallback(() => {
    const today = todayLocal();
    setSelectedDate(today);
    setAnchorDate(today);
  }, []);

  const isTodaySelected = selectedDate === todayLocal();
  const selectedDayJobCount = selectedDay?.jobs?.length ?? 0;

  // Swipe left = next day, swipe right = previous day. runOnJS because the
  // gesture callback runs on the UI thread and setState must not.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])   // don't hijack vertical scrolling of the list
        .failOffsetY([-15, 15])
        .onEnd((e) => {
          if (e.translationX < -50) {
            runOnJS(goToDay)(1);
          } else if (e.translationX > 50) {
            runOnJS(goToDay)(-1);
          }
        }),
    [goToDay]
  );

  // Start mutation (optionally sets the worker's planned time in the same call)
  const startMutation = useMutation({
    mutationFn: ({ jobId, hours }: { jobId: number; hours?: number }) =>
      workPlanTrackingApi.startJob(jobId, hours),
    onSuccess: () => {
      setShowPlannedTimeModal(false);
      setSelectedJobId(null);
      setPlannedHoursInput('');
      setAiEstimate(null);
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to start job'),
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: number; payload: { reason_category: string; reason_details?: string } }) =>
      workPlanTrackingApi.pauseJob(jobId, payload as any),
    onSuccess: () => {
      setShowPauseModal(false);
      setSelectedJobId(null);
      setSelectedReason('');
      setReasonDetails('');
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to pause job'),
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: (jobId: number) => workPlanTrackingApi.resumeJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to resume job'),
  });

  // Complete mutation
  const completeMutation = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: number; payload: { work_notes?: string } }) =>
      workPlanTrackingApi.completeJob(jobId, payload),
    onSuccess: () => {
      setShowCompleteModal(false);
      setSelectedJobId(null);
      setWorkNotes('');
      queryClient.invalidateQueries({ queryKey: ['my-work-plan'] });
      queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
      Alert.alert('Success', 'Job completed!');
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.message || 'Failed to complete job'),
  });

  // Keep a ref to myJobs for the timer interval (avoids re-creating interval on data change)
  const myJobsRef = useRef(myJobs);
  myJobsRef.current = myJobs;

  // Timer effect for running jobs — uses ref to avoid dependency on myJobs
  useEffect(() => {
    const updateTimers = () => {
      const jobs = myJobsRef.current;
      const newTimers: Record<number, number> = {};
      jobs.forEach(day => {
        day.jobs.forEach((job: any) => {
          if (job.tracking?.is_running && job.tracking?.started_at) {
            const start = new Date(job.tracking.started_at).getTime();
            const pausedMs = (job.tracking.total_paused_minutes || 0) * 60 * 1000;
            const elapsed = Math.floor((Date.now() - start - pausedMs) / 1000);
            newTimers[job.id] = Math.max(0, elapsed);
          } else if (job.tracking?.is_paused && job.tracking?.started_at && job.tracking?.paused_at) {
            const start = new Date(job.tracking.started_at).getTime();
            const paused = new Date(job.tracking.paused_at).getTime();
            const pausedMs = (job.tracking.total_paused_minutes || 0) * 60 * 1000;
            const elapsed = Math.floor((paused - start - pausedMs) / 1000);
            newTimers[job.id] = Math.max(0, elapsed);
          }
        });
      });
      setActiveTimers(prev => {
        // Only update if values actually changed to avoid unnecessary re-renders
        const keys = Object.keys(newTimers);
        if (keys.length !== Object.keys(prev).length) return newTimers;
        for (const k of keys) {
          if (prev[Number(k)] !== newTimers[Number(k)]) return newTimers;
        }
        return prev;
      });
    };

    updateTimers();
    timerIntervalRef.current = setInterval(updateTimers, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []); // No dependencies — uses ref for data, runs once

  const formatElapsedTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  const fetchAIEstimate = useCallback(async (jobId: number) => {
    setLoadingEstimate(true);
    setAiEstimate(null);
    try {
      const res = await workPlanTrackingApi.aiEstimateTime(jobId);
      const est = res.data?.data;
      if (est) {
        setAiEstimate(est);
        setPlannedHoursInput(String(est.estimated_hours));
      }
    } catch {
      // AI estimate is optional — worker can still type a value
    } finally {
      setLoadingEstimate(false);
    }
  }, []);

  const handleStartJob = useCallback((job: ExtendedWorkPlanJob) => {
    // Worker must commit a planned time before starting. If none yet, open the
    // planned-time modal (with an AI suggestion); otherwise start directly.
    if (!job.has_planned_time && job.planned_time_hours == null) {
      setSelectedJobId(job.id);
      setPlannedHoursInput('');
      setAiEstimate(null);
      setShowPlannedTimeModal(true);
      fetchAIEstimate(job.id);
      return;
    }
    Alert.alert(
      t('work_plan.start_job', 'Start Job'),
      t('work_plan.start_job_confirm', 'Are you ready to start working on this job?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        { text: t('work_plan.start', 'Start'), onPress: () => startMutation.mutate({ jobId: job.id }) },
      ]
    );
  }, [startMutation, fetchAIEstimate, t]);

  const handleSubmitPlannedTime = useCallback(() => {
    const hours = parseFloat(plannedHoursInput);
    if (isNaN(hours) || hours <= 0 || selectedJobId == null) return;
    startMutation.mutate({ jobId: selectedJobId, hours });
  }, [plannedHoursInput, selectedJobId, startMutation]);

  const handlePauseJob = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setShowPauseModal(true);
  }, []);

  const handleResumeJob = useCallback((jobId: number) => {
    resumeMutation.mutate(jobId);
  }, [resumeMutation]);

  const handleCompleteJob = useCallback((jobId: number) => {
    setSelectedJobId(jobId);
    setShowCompleteModal(true);
  }, []);

  const handleViewDetails = useCallback((jobId: number) => {
    navigation.navigate('JobDetails', { jobId });
  }, [navigation]);


  const handleDownloadPDF = () => {
    if (workPlan?.pdf_url) {
      Linking.openURL(workPlan.pdf_url);
    }
  };

  const renderJobCard = useCallback((job: ExtendedWorkPlanJob) => {
    const typeColor = JOB_TYPE_COLORS[job.job_type] ?? '#757575';
    const priorityColor = PRIORITY_COLORS[job.priority] ?? '#757575';

    // Get tracking status
    const trackingStatus = job.tracking?.status || 'not_started';
    const statusConfig = STATUS_CONFIG[trackingStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.not_started;
    const isRunning = job.tracking?.is_running || false;
    const isPaused = job.tracking?.is_paused || false;
    const isCompleted = trackingStatus === 'completed';
    const isIncomplete = trackingStatus === 'incomplete';
    const canStart = trackingStatus === 'not_started' || trackingStatus === 'pending';

    // Get elapsed time from timer state
    const elapsedSeconds = activeTimers[job.id] || 0;
    const showTimer = isRunning || isPaused;

    // Check if any mutation is pending for this job
    const isJobLoading =
      (startMutation.isPending && startMutation.variables?.jobId === job.id) ||
      (pauseMutation.isPending && pauseMutation.variables?.jobId === job.id) ||
      (resumeMutation.isPending && resumeMutation.variables === job.id) ||
      (completeMutation.isPending && completeMutation.variables?.jobId === job.id);

    return (
      <TouchableOpacity
        key={job.id}
        style={[styles.jobCard, isRunning && styles.jobCardActive]}
        onPress={() => handleViewDetails(job.id)}
        activeOpacity={0.8}
      >
        {/* Status indicator bar */}
        <View style={[styles.jobStatusBar, { backgroundColor: statusConfig.color }]} />

        <View style={styles.jobCardContent}>
          {/* Header row with type, status, and priority */}
          <View style={styles.jobHeader}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
              <Text style={styles.typeBadgeText}>
                {t(`work_plan.job_type_${job.job_type}`, job.job_type.toUpperCase())}
              </Text>
            </View>

            {/* Status badge with emoji */}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
              <Text style={styles.statusEmoji}>{statusConfig.emoji}</Text>
              <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>

            {job.is_lead && (
              <View style={styles.leadBadge}>
                <Text style={styles.leadBadgeText}>{t('work_plan.lead', 'Lead')}</Text>
              </View>
            )}
            {job.priority !== 'normal' && (
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor }]}>
                <Text style={styles.priorityBadgeText}>{job.priority}</Text>
              </View>
            )}
          </View>

          {job.equipment && (
            <Text style={styles.equipmentName}>{job.equipment.name}</Text>
          )}

          {job.defect && (
            <Text style={styles.defectDesc} numberOfLines={2}>
              {job.defect.description}
            </Text>
          )}

          <View style={styles.jobDetails}>
            <Text style={styles.hoursText}>
              Est: {job.estimated_hours}h
            </Text>
            {job.berth && (
              <Text style={styles.berthText}>
                {job.berth.toUpperCase()}
              </Text>
            )}
            {job.assignments.length > 0 && (
              <Text style={styles.teamText}>
                {job.assignments.length} {t('work_plan.team_members', 'members')}
              </Text>
            )}
          </View>

          {/* Time tracking display */}
          {showTimer && (
            <View style={styles.timerContainer}>
              <View style={styles.timerRow}>
                <Text style={styles.timerLabel}>
                  {isRunning ? '\u23F1\uFE0F Working:' : '\u23F8\uFE0F Paused:'}
                </Text>
                <Text style={[styles.timerValue, isPaused && styles.timerPaused]}>
                  {formatElapsedTime(elapsedSeconds)}
                </Text>
              </View>
              {job.tracking?.started_at && (
                <Text style={styles.startedAtText}>
                  Started: {new Date(job.tracking.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              {(job.tracking?.total_paused_minutes || 0) > 0 && (
                <Text style={styles.pausedTimeText}>
                  Total paused: {job.tracking?.total_paused_minutes} min
                </Text>
              )}
            </View>
          )}

          {/* Completed info */}
          {isCompleted && job.tracking?.actual_hours && (
            <View style={styles.completedInfo}>
              <Text style={styles.completedText}>
                \u2705 Completed in {job.tracking.actual_hours.toFixed(1)}h
              </Text>
            </View>
          )}

          {job.notes && (
            <Text style={styles.notesText} numberOfLines={2}>
              {job.notes}
            </Text>
          )}

          {/* Quick Action Buttons */}
          {!isCompleted && !isIncomplete && (
            <View style={styles.quickActions}>
              {canStart && (
                <TouchableOpacity
                  style={[styles.quickActionBtn, styles.startBtn]}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleStartJob(job);
                  }}
                  disabled={isJobLoading}
                >
                  {isJobLoading && startMutation.variables?.jobId === job.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.quickActionIcon}>\u25B6\uFE0F</Text>
                      <Text style={styles.quickActionText}>Start</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {isRunning && (
                <>
                  <TouchableOpacity
                    style={[styles.quickActionBtn, styles.pauseBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handlePauseJob(job.id);
                    }}
                    disabled={isJobLoading}
                  >
                    {isJobLoading && pauseMutation.variables?.jobId === job.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.quickActionIcon}>\u23F8\uFE0F</Text>
                        <Text style={styles.quickActionText}>Pause</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickActionBtn, styles.completeBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCompleteJob(job.id);
                    }}
                    disabled={isJobLoading}
                  >
                    {isJobLoading && completeMutation.variables?.jobId === job.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.quickActionIcon}>\u2705</Text>
                        <Text style={styles.quickActionText}>Complete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {isPaused && (
                <>
                  <TouchableOpacity
                    style={[styles.quickActionBtn, styles.resumeBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleResumeJob(job.id);
                    }}
                    disabled={isJobLoading}
                  >
                    {isJobLoading && resumeMutation.variables === job.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.quickActionIcon}>\u25B6\uFE0F</Text>
                        <Text style={styles.quickActionText}>Resume</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickActionBtn, styles.completeBtn]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleCompleteJob(job.id);
                    }}
                    disabled={isJobLoading}
                  >
                    <>
                      <Text style={styles.quickActionIcon}>\u2705</Text>
                      <Text style={styles.quickActionText}>Complete</Text>
                    </>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [t, activeTimers, formatElapsedTime, handleStartJob, handlePauseJob, handleResumeJob, handleCompleteJob, handleViewDetails, startMutation, pauseMutation, resumeMutation, completeMutation]);


  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>
          {t('work_plan.no_plan', 'No Work Plan')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {t('work_plan.no_plan_message', 'No work plan has been published for this week.')}
        </Text>
      </View>
    );
  };

  /** Shown when the plan exists but this particular day has nothing on it. */
  const renderNoJobsForDay = () => {
    if (isLoading) return null;
    return (
      <View testID="my-plan-no-jobs" style={styles.emptyContainer}>
        <Text style={styles.emptyDayIcon}>☕</Text>
        <Text style={styles.emptyTitle}>
          {isTodaySelected
            ? t('work_plan.no_jobs_today', 'No jobs today')
            : t('work_plan.no_jobs_this_day', 'No jobs on this day')}
        </Text>
        <Text style={styles.emptySubtitle}>
          {t('work_plan.swipe_hint', 'Swipe left or right to see another day.')}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976D2" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('common.error', 'Error')}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="my-work-plan-screen" style={styles.container}>
      <Text style={styles.title}>{t('nav.my_work_plan', 'My Work Plan')}</Text>

      {/* ── Day header: one day at a time, opens on today ── */}
      <View style={styles.dayNav}>
        <TouchableOpacity
          testID="my-plan-prev-day"
          style={styles.navButton}
          onPress={() => goToDay(-1)}
        >
          <Text style={styles.navButtonText}>{'‹'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dayDisplay} onPress={goToToday} activeOpacity={0.7}>
          <Text style={styles.dayHeadline}>{formatDayHeadline(selectedDate)}</Text>
          <View style={styles.dayHeadlineMeta}>
            {isTodaySelected && (
              <View style={styles.todayPill}>
                <Text style={styles.todayPillText}>{t('work_plan.today', 'TODAY')}</Text>
              </View>
            )}
            <Text style={styles.dayJobCount}>
              {selectedDayJobCount === 0
                ? t('work_plan.no_jobs_short', 'No jobs')
                : `${selectedDayJobCount} ${selectedDayJobCount === 1 ? t('work_plan.job', 'job') : t('work_plan.jobs', 'jobs')}`}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          testID="my-plan-next-day"
          style={styles.navButton}
          onPress={() => goToDay(1)}
        >
          <Text style={styles.navButtonText}>{'›'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Day strip: jump to any day in this plan ── */}
      {planDays.length > 0 && (
        <View style={styles.dayStrip}>
          {myJobs.map((d) => {
            const isSel = d.date === selectedDate;
            const isTdy = d.date === todayLocal();
            return (
              <TouchableOpacity
                key={d.date}
                testID={`my-plan-day-${d.date}`}
                style={[styles.dayStripItem, isSel && styles.dayStripItemSelected]}
                onPress={() => setSelectedDate(d.date)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayStripLabel, isSel && styles.dayStripTextSelected]}>
                  {formatDayStripLabel(d.date)}
                </Text>
                <Text
                  style={[
                    styles.dayStripNum,
                    isSel && styles.dayStripTextSelected,
                    !isSel && isTdy && styles.dayStripNumToday,
                  ]}
                >
                  {dayOfMonth(d.date)}
                </Text>
                <View
                  style={[
                    styles.dayStripDot,
                    d.jobs.length > 0 && styles.dayStripDotActive,
                    isSel && d.jobs.length > 0 && styles.dayStripDotOnSelected,
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* PDF stays available for the whole plan */}
      {workPlan?.pdf_url && (
        <View style={styles.weekStatusBar}>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>{t('work_plan.total_jobs', 'Total Jobs')}:</Text>
            <Text style={styles.statusValue}>{totalJobs}</Text>
          </View>
          <TouchableOpacity style={styles.pdfButton} onPress={handleDownloadPDF}>
            <Text style={styles.pdfButtonText}>{t('work_plan.download_pdf', 'PDF')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── The selected day's jobs (swipe left/right to change day) ── */}
      {!workPlan ? (
        renderEmpty()
      ) : (
        <GestureDetector gesture={swipeGesture}>
          <View style={styles.dayJobsWrapper}>
            <FlatList
              testID="my-work-plan-list"
              data={(selectedDay?.jobs ?? []) as ExtendedWorkPlanJob[]}
              keyExtractor={(job) => String(job.id)}
              renderItem={({ item }) => renderJobCard(item)}
              contentContainerStyle={
                (selectedDay?.jobs?.length ?? 0) === 0 ? styles.emptyListContainer : styles.listContent
              }
              ListEmptyComponent={renderNoJobsForDay}
              refreshControl={
                <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
              }
            />
          </View>
        </GestureDetector>
      )}

      {/* Pause Modal */}
      <Modal visible={showPauseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pause Reason</Text>
            <Text style={styles.modalSubtitle}>Select why you need to pause:</Text>
            {PAUSE_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.key}
                style={[
                  styles.reasonButton,
                  selectedReason === reason.key && styles.reasonButtonSelected,
                ]}
                onPress={() => setSelectedReason(reason.key)}
              >
                <Text style={[
                  styles.reasonButtonText,
                  selectedReason === reason.key && styles.reasonButtonTextSelected,
                ]}>
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}
            {selectedReason === 'other' && (
              <TextInput
                style={styles.textInput}
                placeholder="Describe reason..."
                value={reasonDetails}
                onChangeText={setReasonDetails}
                multiline
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowPauseModal(false);
                  setSelectedJobId(null);
                  setSelectedReason('');
                  setReasonDetails('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !selectedReason && styles.modalConfirmDisabled]}
                onPress={() => {
                  if (selectedReason && selectedJobId) {
                    pauseMutation.mutate({
                      jobId: selectedJobId,
                      payload: {
                        reason_category: selectedReason,
                        reason_details: reasonDetails || undefined,
                      },
                    });
                  }
                }}
                disabled={!selectedReason || pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Pause</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal visible={showCompleteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Job</Text>
            <Text style={styles.modalSubtitle}>Add any notes about the work completed:</Text>
            <TextInput
              style={[styles.textInput, { height: 100 }]}
              placeholder="Work notes (optional)..."
              value={workNotes}
              onChangeText={setWorkNotes}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowCompleteModal(false);
                  setSelectedJobId(null);
                  setWorkNotes('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, styles.completeConfirm]}
                onPress={() => {
                  if (selectedJobId) {
                    completeMutation.mutate({
                      jobId: selectedJobId,
                      payload: { work_notes: workNotes || undefined },
                    });
                  }
                }}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Planned-Time Modal (worker commits time + AI suggestion before starting) */}
      <Modal visible={showPlannedTimeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('work_plan.enter_planned_time', 'Enter Planned Time')}
            </Text>
            <Text style={styles.modalSubtitle}>
              {t('work_plan.planned_time_hint', 'How many hours do you expect this job to take?')}
            </Text>

            {loadingEstimate ? (
              <View style={styles.aiLoadingRow}>
                <ActivityIndicator size="small" color="#1976D2" />
                <Text style={styles.aiLoadingText}>{t('jobs.ai_estimating', 'AI analyzing...')}</Text>
              </View>
            ) : aiEstimate ? (
              <View style={styles.aiBox}>
                <View style={styles.aiHeaderRow}>
                  <Text style={styles.aiTitle}>🤖 {t('jobs.ai_suggestion', 'AI Suggestion')}</Text>
                  <View style={styles.aiConfidenceBadge}>
                    <Text style={styles.aiConfidenceText}>{aiEstimate.confidence}</Text>
                  </View>
                </View>
                <Text style={styles.aiRange}>
                  {t('jobs.ai_range', 'Range')}: {aiEstimate.range.min}h - {aiEstimate.range.max}h
                </Text>
                <View style={styles.aiSuggestionsRow}>
                  {aiEstimate.suggestions.map((s) => (
                    <TouchableOpacity
                      key={s.label}
                      style={[
                        styles.aiSuggestionBtn,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionBtnActive,
                      ]}
                      onPress={() => setPlannedHoursInput(String(s.hours))}
                    >
                      <Text style={[
                        styles.aiSuggestionHours,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionTextActive,
                      ]}>{s.hours}h</Text>
                      <Text style={[
                        styles.aiSuggestionLabel,
                        plannedHoursInput === String(s.hours) && styles.aiSuggestionTextActive,
                      ]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <TextInput
              style={[styles.textInput, { textAlign: 'center' }]}
              placeholder="0.0"
              keyboardType="numeric"
              value={plannedHoursInput}
              onChangeText={setPlannedHoursInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowPlannedTimeModal(false);
                  setSelectedJobId(null);
                  setAiEstimate(null);
                  setPlannedHoursInput('');
                }}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm]}
                onPress={handleSubmitPlannedTime}
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t('work_plan.start', 'Start')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#212121', padding: 16, paddingBottom: 8 },

  // Week Navigation
  // ── Single-day view ──────────────────────────────────────────────
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  dayDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  dayHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  dayHeadlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  todayPill: {
    backgroundColor: '#1677ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  todayPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dayJobCount: {
    fontSize: 13,
    color: '#8c8c8c',
    fontWeight: '500',
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  dayStripItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: 10,
  },
  dayStripItemSelected: {
    backgroundColor: '#1677ff',
  },
  dayStripLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8c8c8c',
    letterSpacing: 0.3,
  },
  dayStripNum: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 2,
  },
  dayStripNumToday: {
    color: '#1677ff',
  },
  dayStripTextSelected: {
    color: '#fff',
  },
  dayStripDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 4,
    backgroundColor: 'transparent',
  },
  dayStripDotActive: {
    backgroundColor: '#52c41a',
  },
  dayStripDotOnSelected: {
    backgroundColor: '#fff',
  },
  dayJobsWrapper: {
    flex: 1,
  },
  emptyDayIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: { fontSize: 20, fontWeight: '600', color: '#424242' },
  weekDisplay: { flex: 1, alignItems: 'center', paddingHorizontal: 10 },
  weekText: { fontSize: 16, fontWeight: '600', color: '#212121' },
  tapToday: { fontSize: 11, color: '#757575', marginTop: 2 },

  // Week Status Bar
  weekStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  statusInfo: { flexDirection: 'row', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: '#1565C0' },
  statusValue: { fontSize: 16, fontWeight: 'bold', color: '#1565C0', marginLeft: 6 },
  pdfButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1976D2',
    borderRadius: 8,
  },
  pdfButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  // Day Sections
  listContent: { padding: 12 },
  emptyListContainer: { flexGrow: 1 },
  daySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
  },
  dayHeaderToday: { backgroundColor: '#E8F5E9' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  dayName: { fontSize: 16, fontWeight: '600', color: '#212121', marginRight: 8 },
  dayNameToday: { color: '#2E7D32' },
  dayDate: { fontSize: 13, color: '#757575' },
  dayDateToday: { color: '#43A047' },
  dayCountRow: { flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1976D2',
    borderRadius: 12,
    marginRight: 8,
  },
  countBadgeEmpty: { backgroundColor: '#E0E0E0' },
  countBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  countBadgeTextEmpty: { color: '#757575' },
  expandIcon: { fontSize: 12, color: '#757575' },

  // Jobs Container
  jobsContainer: {
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  noJobsText: { fontSize: 14, color: '#757575', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 },

  // Day Summary
  daySummary: {
    flexDirection: 'row',
    marginRight: 8,
    gap: 6,
  },
  summaryText: { fontSize: 12, color: '#616161' },

  // Job Card
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  jobCardActive: {
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  jobStatusBar: {
    height: 4,
    width: '100%',
  },
  jobCardContent: {
    padding: 12,
  },
  jobHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  statusEmoji: { fontSize: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  leadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FFD700',
    borderRadius: 6,
  },
  leadBadgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  priorityBadgeText: { fontSize: 10, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
  equipmentName: { fontSize: 15, fontWeight: '600', color: '#212121', marginBottom: 4 },
  defectDesc: { fontSize: 13, color: '#616161', marginBottom: 6 },
  jobDetails: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  hoursText: { fontSize: 13, fontWeight: '600', color: '#1976D2' },
  berthText: { fontSize: 12, color: '#757575', fontWeight: '500' },
  teamText: { fontSize: 12, color: '#757575' },
  notesText: { fontSize: 12, color: '#9E9E9E', marginTop: 6, fontStyle: 'italic' },

  // Timer display
  timerContainer: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerLabel: { fontSize: 13, color: '#FF8F00', fontWeight: '500' },
  timerValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF6F00',
    fontVariant: ['tabular-nums'],
  },
  timerPaused: { color: '#9C27B0' },
  startedAtText: { fontSize: 11, color: '#8D6E63', marginTop: 4 },
  pausedTimeText: { fontSize: 11, color: '#9C27B0', marginTop: 2 },

  // Completed info
  completedInfo: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  completedText: { fontSize: 14, color: '#2E7D32', fontWeight: '600' },

  // Quick Action Buttons
  quickActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  quickActionIcon: { fontSize: 14 },
  quickActionText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  startBtn: { backgroundColor: '#4CAF50' },
  pauseBtn: { backgroundColor: '#FF9800' },
  resumeBtn: { backgroundColor: '#2196F3' },
  completeBtn: { backgroundColor: '#4CAF50' },

  // Empty & Error States
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#424242', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#757575', textAlign: 'center', paddingHorizontal: 40 },
  errorText: { fontSize: 16, color: '#E53935', marginBottom: 12 },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#1976D2', borderRadius: 8 },
  retryButtonText: { color: '#fff', fontWeight: '600' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 16,
  },
  reasonButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginBottom: 8,
  },
  reasonButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#1976D2',
  },
  reasonButtonText: { fontSize: 15, color: '#424242' },
  reasonButtonTextSelected: { color: '#1976D2', fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    fontSize: 15,
    backgroundColor: '#FAFAFA',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  modalCancelText: { color: '#757575', fontSize: 15, fontWeight: '500' },
  modalConfirm: {
    backgroundColor: '#FF9800',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalConfirmDisabled: { opacity: 0.5 },
  completeConfirm: { backgroundColor: '#4CAF50' },
  modalConfirmText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  // AI planned-time estimate
  aiLoadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#E3F2FD', borderRadius: 8, marginBottom: 14 },
  aiLoadingText: { fontSize: 13, color: '#1976D2' },
  aiBox: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 12, marginBottom: 14 },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  aiTitle: { fontSize: 14, fontWeight: '600', color: '#1976D2' },
  aiConfidenceBadge: { backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  aiConfidenceText: { fontSize: 11, fontWeight: '600', color: '#1976D2', textTransform: 'capitalize' },
  aiRange: { fontSize: 12, color: '#616161', marginBottom: 10 },
  aiSuggestionsRow: { flexDirection: 'row', gap: 8 },
  aiSuggestionBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#BBDEFB' },
  aiSuggestionBtnActive: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  aiSuggestionHours: { fontSize: 15, fontWeight: '700', color: '#1976D2' },
  aiSuggestionLabel: { fontSize: 10, color: '#757575', marginTop: 2 },
  aiSuggestionTextActive: { color: '#fff' },
});
