/**
 * useFABContext Hook
 * Provides context-aware FAB actions based on current screen and state
 */
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toolkitApi } from '@inspection/shared';
import { navigationRef, navigate } from '../navigation/navigationRef';
import type { RootStackParamList } from '../navigation/RootNavigator';

export type FABAction = {
  id: string;
  label: string;
  labelAr: string;
  icon: string;
  color: string;
  onPress: () => void;
  isPrimary?: boolean;
  pulse?: boolean; // For important actions that need attention
};

export type FABContextType = 'dashboard' | 'job_list' | 'job_execution' | 'inspection' | 'chat' | 'default';

export type JobExecutionState = 'pending' | 'in_progress' | 'paused' | 'completed' | 'not_started';

interface FABContextOptions {
  // Job execution specific
  jobState?: JobExecutionState;
  onStartJob?: () => void;
  onPauseJob?: () => void;
  onResumeJob?: () => void;
  onCompleteJob?: () => void;

  // Inspection specific
  onTakePhoto?: () => void;

  // Chat specific
  onNewMessage?: () => void;

  // Job list specific
  onFilter?: () => void;
  onSearch?: () => void;
}

interface UseFABContextResult {
  contextType: FABContextType;
  actions: FABAction[];
  mainAction: FABAction | null;
  isEnabled: boolean;
  mainColor: string;
  mainIcon: string;
}

// Map route names to FAB context types
const ROUTE_CONTEXT_MAP: Record<string, FABContextType> = {
  // Dashboard screens
  'Home': 'dashboard',
  'MainTabs': 'dashboard',

  // Job list screens
  'Jobs': 'job_list',
  'Assignments': 'job_list',
  'AllSpecialistJobs': 'job_list',
  'AllEngineerJobs': 'job_list',
  'AllInspections': 'job_list',
  'SpecialistJobsScreen': 'job_list',
  'EngineerJobsScreen': 'job_list',
  'MyAssignmentsScreen': 'job_list',

  // Job execution screens
  'JobExecution': 'job_execution',
  'SpecialistJobDetail': 'job_execution',
  'EngineerJobDetail': 'job_execution',

  // Inspection screens
  'InspectionChecklist': 'inspection',
  'InspectionWizard': 'inspection',

  // Chat screens
  'ChatRoom': 'chat',
  'ChannelList': 'chat',
};

// Colors
const COLORS = {
  primary: '#1677ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  purple: '#722ed1',
  cyan: '#13c2c2',
};

export function useFABContext(options: FABContextOptions = {}): UseFABContextResult {
  // Use navigationRef instead of useNavigation/useRoute hooks
  // (this hook is called from SmartFAB which renders outside the navigator)
  const [currentRouteName, setCurrentRouteName] = useState<string>('MainTabs');

  useEffect(() => {
    const updateRoute = () => {
      const route = navigationRef.getCurrentRoute();
      if (route?.name) {
        setCurrentRouteName(route.name);
      }
    };

    // Get initial route
    updateRoute();

    // Listen for navigation state changes
    const unsubscribe = navigationRef.addListener('state', updateRoute);
    return () => unsubscribe();
  }, []);

  // Get FAB enabled preference
  const { data: prefs } = useQuery({
    queryKey: ['toolkit-preferences'],
    queryFn: () => toolkitApi.getPreferences().then(r => r.data.data),
    staleTime: 60000,
  });

  const isEnabled = prefs?.fab_enabled ?? true;

  // Determine context type from route
  const contextType = useMemo<FABContextType>(() => {
    return ROUTE_CONTEXT_MAP[currentRouteName] || 'default';
  }, [currentRouteName]);

  // Build actions based on context
  const { actions, mainAction, mainColor, mainIcon } = useMemo(() => {
    const {
      jobState,
      onStartJob,
      onPauseJob,
      onResumeJob,
      onCompleteJob,
      onTakePhoto,
      onNewMessage,
      onFilter,
      onSearch,
    } = options;

    let actions: FABAction[] = [];
    let mainAction: FABAction | null = null;
    let mainColor = COLORS.primary;
    let mainIcon = '+';

    switch (contextType) {
      case 'dashboard':
        // Dashboard: Add Job button with sub-actions
        mainColor = COLORS.primary;
        mainIcon = '+';
        mainAction = {
          id: 'add_job',
          label: 'Add Job',
          labelAr: 'اضافة مهمة',
          icon: '+',
          color: COLORS.primary,
          onPress: () => navigate('CreateJob'),
          isPrimary: true,
        };
        actions = [
          {
            id: 'new_inspection',
            label: 'New Inspection',
            labelAr: 'فحص جديد',
            icon: '📋',
            color: COLORS.cyan,
            onPress: () => navigate('AllInspections'),
          },
          {
            id: 'view_defects',
            label: 'View Defects',
            labelAr: 'عرض العيوب',
            icon: '⚠️',
            color: COLORS.warning,
            onPress: () => navigate('Defects'),
          },
          {
            id: 'team_chat',
            label: 'Team Chat',
            labelAr: 'محادثة الفريق',
            icon: '💬',
            color: COLORS.purple,
            onPress: () => navigate('ChannelList'),
          },
        ];
        break;

      case 'job_list':
        // Job List: Filter/Search actions
        mainColor = COLORS.primary;
        mainIcon = '🔍';
        mainAction = {
          id: 'search',
          label: 'Search',
          labelAr: 'بحث',
          icon: '🔍',
          color: COLORS.primary,
          onPress: onSearch || (() => {}),
          isPrimary: true,
        };
        actions = [
          {
            id: 'filter',
            label: 'Filter',
            labelAr: 'تصفية',
            icon: '⚙️',
            color: COLORS.cyan,
            onPress: onFilter || (() => {}),
          },
          {
            id: 'refresh',
            label: 'Refresh',
            labelAr: 'تحديث',
            icon: '🔄',
            color: COLORS.success,
            onPress: () => {}, // Will be handled by pull-to-refresh
          },
        ];
        break;

      case 'job_execution':
        // Job Execution: State-aware actions
        switch (jobState) {
          case 'pending':
          case 'not_started':
            mainColor = COLORS.success;
            mainIcon = '▶️';
            mainAction = {
              id: 'start',
              label: 'START',
              labelAr: 'ابدأ',
              icon: '▶️',
              color: COLORS.success,
              onPress: onStartJob || (() => {}),
              isPrimary: true,
              pulse: true, // Important action
            };
            break;

          case 'in_progress':
            mainColor = COLORS.warning;
            mainIcon = '⏸️';
            mainAction = {
              id: 'pause',
              label: 'PAUSE',
              labelAr: 'ايقاف',
              icon: '⏸️',
              color: COLORS.warning,
              onPress: onPauseJob || (() => {}),
              isPrimary: true,
            };
            actions = [
              {
                id: 'complete',
                label: 'Complete',
                labelAr: 'انهاء',
                icon: '✅',
                color: COLORS.success,
                onPress: onCompleteJob || (() => {}),
              },
            ];
            break;

          case 'paused':
            mainColor = COLORS.primary;
            mainIcon = '▶️';
            mainAction = {
              id: 'resume',
              label: 'RESUME',
              labelAr: 'استمر',
              icon: '▶️',
              color: COLORS.primary,
              onPress: onResumeJob || (() => {}),
              isPrimary: true,
              pulse: true,
            };
            actions = [
              {
                id: 'complete',
                label: 'Complete',
                labelAr: 'انهاء',
                icon: '✅',
                color: COLORS.success,
                onPress: onCompleteJob || (() => {}),
              },
            ];
            break;

          case 'completed':
            mainColor = COLORS.success;
            mainIcon = '✅';
            mainAction = {
              id: 'completed',
              label: 'Completed',
              labelAr: 'مكتمل',
              icon: '✅',
              color: COLORS.success,
              onPress: () => {},
              isPrimary: true,
            };
            break;

          default:
            mainColor = COLORS.primary;
            mainIcon = '▶️';
        }
        break;

      case 'inspection':
        // Inspection: Quick photo capture
        mainColor = COLORS.cyan;
        mainIcon = '📷';
        mainAction = {
          id: 'camera',
          label: 'CAMERA',
          labelAr: 'كاميرا',
          icon: '📷',
          color: COLORS.cyan,
          onPress: onTakePhoto || (() => {}),
          isPrimary: true,
        };
        actions = [
          {
            id: 'gallery',
            label: 'Gallery',
            labelAr: 'معرض الصور',
            icon: '🖼️',
            color: COLORS.purple,
            onPress: () => {}, // Will be handled by parent
          },
          {
            id: 'video',
            label: 'Video',
            labelAr: 'فيديو',
            icon: '🎥',
            color: COLORS.danger,
            onPress: () => {}, // Will be handled by parent
          },
        ];
        break;

      case 'chat':
        // Chat: New message
        mainColor = COLORS.primary;
        mainIcon = '✏️';
        mainAction = {
          id: 'new_message',
          label: 'New Message',
          labelAr: 'رسالة جديدة',
          icon: '✏️',
          color: COLORS.primary,
          onPress: onNewMessage || (() => {}),
          isPrimary: true,
        };
        actions = [
          {
            id: 'voice_message',
            label: 'Voice',
            labelAr: 'صوت',
            icon: '🎤',
            color: COLORS.danger,
            onPress: () => {},
          },
          {
            id: 'photo_message',
            label: 'Photo',
            labelAr: 'صورة',
            icon: '📷',
            color: COLORS.cyan,
            onPress: () => {},
          },
          {
            id: 'location',
            label: 'Location',
            labelAr: 'موقع',
            icon: '📍',
            color: COLORS.success,
            onPress: () => {},
          },
        ];
        break;

      default:
        // Default: Generic actions
        mainColor = COLORS.primary;
        mainIcon = '+';
        mainAction = {
          id: 'menu',
          label: 'Menu',
          labelAr: 'قائمة',
          icon: '+',
          color: COLORS.primary,
          onPress: () => {},
          isPrimary: true,
        };
        actions = [
          {
            id: 'home',
            label: 'Home',
            labelAr: 'الرئيسية',
            icon: '🏠',
            color: COLORS.primary,
            onPress: () => navigate('MainTabs'),
          },
          {
            id: 'settings',
            label: 'Settings',
            labelAr: 'الإعدادات',
            icon: '⚙️',
            color: COLORS.cyan,
            onPress: () => navigate('ToolkitSettings'),
          },
        ];
        break;
    }

    return { actions, mainAction, mainColor, mainIcon };
  }, [contextType, options]);

  return {
    contextType,
    actions,
    mainAction,
    isEnabled,
    mainColor,
    mainIcon,
  };
}
