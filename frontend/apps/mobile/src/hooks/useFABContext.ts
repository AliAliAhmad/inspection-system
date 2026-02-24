/**
 * useFABContext Hook
 * Provides context-aware FAB actions based on current screen and state
 */
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toolkitApi } from '@inspection/shared';
import { navigationRef, navigate } from '../navigation/navigationRef';

export type FABAction = {
  id: string;
  label: string;
  labelAr: string;
  icon: string;
  color: string;
  onPress: () => void;
  isPrimary?: boolean;
  pulse?: boolean;
};

export type FABContextType =
  | 'dashboard'
  | 'my_assignments'
  | 'job_list'
  | 'job_execution'
  | 'inspection'
  | 'work_plan'
  | 'chat_list'
  | 'chat_room'
  | 'default';

export type JobExecutionState = 'pending' | 'in_progress' | 'paused' | 'completed' | 'not_started';

interface FABContextOptions {
  jobState?: JobExecutionState;
  onStartJob?: () => void;
  onPauseJob?: () => void;
  onResumeJob?: () => void;
  onCompleteJob?: () => void;
  onTakePhoto?: () => void;
  onNewMessage?: () => void;
  onFilter?: () => void;
  onSearch?: () => void;
  // Chat room media
  onSendVoice?: () => void;
  onSendPhoto?: () => void;
  onSendVideo?: () => void;
  // User role for conditional actions
  userRole?: string;
}

interface UseFABContextResult {
  contextType: FABContextType;
  actions: FABAction[];
  mainAction: FABAction | null;
  isEnabled: boolean;
  mainColor: string;
  mainIcon: string;
}

const ROUTE_CONTEXT_MAP: Record<string, FABContextType> = {
  'Home': 'dashboard',
  'MainTabs': 'dashboard',

  'MyAssignmentsScreen': 'my_assignments',

  'Jobs': 'job_list',
  'Assignments': 'job_list',
  'AllSpecialistJobs': 'job_list',
  'AllEngineerJobs': 'job_list',
  'AllInspections': 'job_list',
  'SpecialistJobsScreen': 'job_list',
  'EngineerJobsScreen': 'job_list',

  'JobExecution': 'job_execution',
  'SpecialistJobDetail': 'job_execution',
  'EngineerJobDetail': 'job_execution',

  'InspectionChecklist': 'inspection',
  'InspectionWizard': 'inspection',

  'WorkPlanOverview': 'work_plan',
  'MyWorkPlan': 'work_plan',

  'ChannelList': 'chat_list',
  'ChatRoom': 'chat_room',
};

const C = {
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  purple: '#722ed1',
  cyan: '#13c2c2',
  report: '#E53935',
  voice: '#7B1FA2',
};

// Quick Report action — present in EVERY context
const QUICK_REPORT: FABAction = {
  id: 'quick_report',
  label: 'Quick Report',
  labelAr: 'تقرير سريع',
  icon: '📸',
  color: C.report,
  onPress: () => navigate('QuickFieldReport'),
};

export function useFABContext(options: FABContextOptions = {}): UseFABContextResult {
  const [currentRouteName, setCurrentRouteName] = useState<string>('MainTabs');

  useEffect(() => {
    const updateRoute = () => {
      const route = navigationRef.getCurrentRoute();
      if (route?.name) setCurrentRouteName(route.name);
    };
    updateRoute();
    const unsubscribe = navigationRef.addListener('state', updateRoute);
    return () => unsubscribe();
  }, []);

  const { data: prefs } = useQuery({
    queryKey: ['toolkit-preferences'],
    queryFn: () => toolkitApi.getPreferences().then(r => r.data.data),
    staleTime: 60000,
  });

  const isEnabled = prefs?.fab_enabled ?? true;

  const contextType = useMemo<FABContextType>(() => {
    return ROUTE_CONTEXT_MAP[currentRouteName] || 'default';
  }, [currentRouteName]);

  const { actions, mainAction, mainColor, mainIcon } = useMemo(() => {
    const {
      jobState, onStartJob, onPauseJob, onResumeJob, onCompleteJob,
      onTakePhoto, onNewMessage, onFilter, onSearch,
      onSendVoice, onSendPhoto, onSendVideo,
      userRole,
    } = options;

    const isAdminOrEngineer = ['admin', 'engineer'].includes(userRole || '');
    let actions: FABAction[] = [];
    let mainAction: FABAction | null = null;
    let mainColor = C.primary;
    let mainIcon = '+';

    switch (contextType) {
      // ─── DASHBOARD ───
      case 'dashboard':
        mainColor = C.primary;
        mainIcon = '+';
        mainAction = {
          id: 'add_job', label: 'Add Job', labelAr: 'اضافة مهمة',
          icon: '+', color: C.primary,
          onPress: () => navigate('CreateJob'), isPrimary: true,
        };
        actions = [
          QUICK_REPORT,
          {
            id: 'my_work_plan', label: 'My Work Plan', labelAr: 'خطة عملي',
            icon: '📅', color: C.cyan,
            onPress: () => navigate('WorkPlanOverview'),
          },
          {
            id: 'new_inspection', label: 'New Inspection', labelAr: 'فحص جديد',
            icon: '📋', color: C.success,
            onPress: () => navigate('AllInspections'),
          },
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
          {
            id: 'team_chat', label: 'Team Chat', labelAr: 'محادثة الفريق',
            icon: '💬', color: C.purple,
            onPress: () => navigate('ChannelList'),
          },
        ];
        break;

      // ─── MY ASSIGNMENTS ───
      case 'my_assignments':
        mainColor = C.success;
        mainIcon = '▶️';
        mainAction = {
          id: 'start_inspection', label: 'Start Inspection', labelAr: 'ابدأ الفحص',
          icon: '▶️', color: C.success,
          onPress: () => navigate('AllInspections'),
          isPrimary: true, pulse: true,
        };
        actions = [
          QUICK_REPORT,
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
          {
            id: 'filter', label: 'Filter', labelAr: 'تصفية',
            icon: '⚙️', color: C.cyan,
            onPress: onFilter || (() => {}),
          },
        ];
        break;

      // ─── JOB LIST (other job screens) ───
      case 'job_list':
        mainColor = C.primary;
        mainIcon = '🔍';
        mainAction = {
          id: 'search', label: 'Search', labelAr: 'بحث',
          icon: '🔍', color: C.primary,
          onPress: onSearch || (() => {}), isPrimary: true,
        };
        actions = [
          QUICK_REPORT,
          {
            id: 'filter', label: 'Filter', labelAr: 'تصفية',
            icon: '⚙️', color: C.cyan,
            onPress: onFilter || (() => {}),
          },
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
        ];
        break;

      // ─── JOB EXECUTION ───
      case 'job_execution':
        switch (jobState) {
          case 'pending':
          case 'not_started':
            mainColor = C.success;
            mainIcon = '▶️';
            mainAction = {
              id: 'start', label: 'START', labelAr: 'ابدأ',
              icon: '▶️', color: C.success,
              onPress: onStartJob || (() => {}),
              isPrimary: true, pulse: true,
            };
            actions = [QUICK_REPORT];
            break;
          case 'in_progress':
            mainColor = C.warning;
            mainIcon = '⏸️';
            mainAction = {
              id: 'pause', label: 'PAUSE', labelAr: 'ايقاف',
              icon: '⏸️', color: C.warning,
              onPress: onPauseJob || (() => {}), isPrimary: true,
            };
            actions = [
              { id: 'complete', label: 'Complete', labelAr: 'انهاء', icon: '✅', color: C.success, onPress: onCompleteJob || (() => {}) },
              QUICK_REPORT,
            ];
            break;
          case 'paused':
            mainColor = C.primary;
            mainIcon = '▶️';
            mainAction = {
              id: 'resume', label: 'RESUME', labelAr: 'استمر',
              icon: '▶️', color: C.primary,
              onPress: onResumeJob || (() => {}),
              isPrimary: true, pulse: true,
            };
            actions = [
              { id: 'complete', label: 'Complete', labelAr: 'انهاء', icon: '✅', color: C.success, onPress: onCompleteJob || (() => {}) },
              QUICK_REPORT,
            ];
            break;
          case 'completed':
            mainColor = C.success;
            mainIcon = '✅';
            mainAction = {
              id: 'completed', label: 'Completed', labelAr: 'مكتمل',
              icon: '✅', color: C.success, onPress: () => {}, isPrimary: true,
            };
            actions = [QUICK_REPORT];
            break;
          default:
            mainColor = C.primary;
            mainIcon = '▶️';
            actions = [QUICK_REPORT];
        }
        break;

      // ─── INSPECTION ───
      case 'inspection':
        mainColor = C.cyan;
        mainIcon = '📷';
        mainAction = {
          id: 'camera', label: 'CAMERA', labelAr: 'كاميرا',
          icon: '📷', color: C.cyan,
          onPress: onTakePhoto || (() => {}), isPrimary: true,
        };
        actions = [
          QUICK_REPORT,
          { id: 'gallery', label: 'Gallery', labelAr: 'معرض الصور', icon: '🖼️', color: C.purple, onPress: () => {} },
          { id: 'video', label: 'Video', labelAr: 'فيديو', icon: '🎥', color: C.danger, onPress: () => {} },
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
        ];
        break;

      // ─── WORK PLAN ───
      case 'work_plan':
        mainColor = C.primary;
        mainIcon = '+';
        mainAction = {
          id: 'unplanned_job', label: 'Unplanned Job', labelAr: 'عمل غير مخطط',
          icon: '+', color: C.primary,
          onPress: () => navigate('UnplannedJob'),
          isPrimary: true,
        };
        actions = [
          {
            id: 'unplanned_job', label: 'Unplanned Job', labelAr: 'عمل غير مخطط',
            icon: '➕', color: C.primary,
            onPress: () => navigate('UnplannedJob'),
          },
          QUICK_REPORT,
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
        ];
        break;

      // ─── CHAT LIST (Channel List) ───
      case 'chat_list':
        mainColor = C.primary;
        mainIcon = '✏️';
        mainAction = {
          id: 'new_dm', label: 'New Chat', labelAr: 'محادثة جديدة',
          icon: '✏️', color: C.primary,
          onPress: onNewMessage || (() => {}), isPrimary: true,
        };
        actions = [
          QUICK_REPORT,
          ...(isAdminOrEngineer ? [{
            id: 'create_channel',
            label: 'Create Channel',
            labelAr: 'إنشاء قناة',
            icon: '📢',
            color: C.cyan,
            onPress: () => navigate('CreateChannel'),
          }] : []),
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
        ];
        break;

      // ─── CHAT ROOM (Inside a channel) ───
      case 'chat_room':
        mainColor = C.voice;
        mainIcon = '🎙️';
        mainAction = {
          id: 'voice', label: 'Voice', labelAr: 'صوت',
          icon: '🎙️', color: C.voice,
          onPress: onSendVoice || (() => {}), isPrimary: true,
        };
        actions = [
          {
            id: 'photo', label: 'Photo', labelAr: 'صورة',
            icon: '📷', color: C.cyan,
            onPress: onSendPhoto || (() => {}),
          },
          {
            id: 'video', label: 'Video', labelAr: 'فيديو',
            icon: '🎥', color: C.danger,
            onPress: onSendVideo || (() => {}),
          },
          QUICK_REPORT,
        ];
        break;

      // ─── DEFAULT ───
      default:
        mainColor = C.primary;
        mainIcon = '+';
        mainAction = {
          id: 'menu', label: 'Menu', labelAr: 'قائمة',
          icon: '+', color: C.primary, onPress: () => {}, isPrimary: true,
        };
        actions = [
          QUICK_REPORT,
          { id: 'home', label: 'Home', labelAr: 'الرئيسية', icon: '🏠', color: C.primary, onPress: () => navigate('MainTabs') },
          {
            id: 'voice_message', label: 'Voice Message', labelAr: 'رسالة صوتية',
            icon: '🎙️', color: C.voice,
            onPress: () => navigate('QuickVoiceMessage'),
          },
        ];
        break;
    }

    return { actions, mainAction, mainColor, mainIcon };
  }, [contextType, options]);

  return { contextType, actions, mainAction, isEnabled, mainColor, mainIcon };
}
