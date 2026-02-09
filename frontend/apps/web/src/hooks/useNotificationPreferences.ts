import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';
import {
  notificationsApi,
  NotificationPreference,
  DoNotDisturbSchedule,
  NotificationSoundType,
  NotificationDigestMode,
} from '@inspection/shared';

export interface UseNotificationPreferencesReturn {
  // Data
  preferences: NotificationPreference[];
  dndSchedule: DoNotDisturbSchedule | null;
  isLoading: boolean;
  hasUnsavedChanges: boolean;

  // Preference actions
  updatePreference: (type: string, updates: Partial<NotificationPreference>) => void;
  toggleChannel: (type: string, channel: 'in_app' | 'email' | 'sms' | 'push', enabled: boolean) => void;
  toggleType: (type: string, enabled: boolean) => void;
  setSound: (type: string, sound: NotificationSoundType) => void;
  setDigestMode: (type: string, mode: NotificationDigestMode) => void;

  // DND actions
  updateDndSchedule: (updates: Partial<DoNotDisturbSchedule>) => void;
  toggleDnd: (enabled: boolean) => void;

  // Save/Reset
  save: () => Promise<void>;
  reset: () => void;
  resetToDefaults: () => Promise<void>;

  // Save status
  isSaving: boolean;
  isResetting: boolean;
}

export function useNotificationPreferences(): UseNotificationPreferencesReturn {
  const queryClient = useQueryClient();

  // Local state for edits
  const [localPreferences, setLocalPreferences] = useState<NotificationPreference[]>([]);
  const [localDndSchedule, setLocalDndSchedule] = useState<DoNotDisturbSchedule | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch preferences
  const {
    data: preferencesData,
    isLoading: isLoadingPreferences,
  } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => notificationsApi.getPreferences().then((r) => r.data),
  });

  // Fetch DND schedule
  const {
    data: dndData,
    isLoading: isLoadingDnd,
  } = useQuery({
    queryKey: ['notifications', 'dnd'],
    queryFn: () => notificationsApi.getDndSchedule().then((r) => r.data),
  });

  // Initialize local state from fetched data
  useEffect(() => {
    if (preferencesData?.data) {
      setLocalPreferences(preferencesData.data);
    }
  }, [preferencesData]);

  useEffect(() => {
    if (dndData?.data) {
      setLocalDndSchedule(dndData.data);
    }
  }, [dndData]);

  // Mutations
  const updatePreferenceMutation = useMutation({
    mutationFn: (preference: NotificationPreference) =>
      notificationsApi.updatePreference({
        notification_type: preference.notification_type,
        channels: preference.channels,
        is_enabled: preference.is_enabled,
        sound_type: preference.sound_type,
        digest_mode: preference.digest_mode,
      }),
  });

  const updateDndMutation = useMutation({
    mutationFn: (schedule: DoNotDisturbSchedule) =>
      notificationsApi.setDndSchedule({
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        days_of_week: schedule.days_of_week,
        allow_critical: schedule.allow_critical,
      }),
  });

  const resetPreferencesMutation = useMutation({
    mutationFn: () => notificationsApi.resetPreferences(),
    onSuccess: () => {
      message.success('Preferences reset to defaults');
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'dnd'] });
      setHasChanges(false);
    },
  });

  // Update preference helper
  const updatePreference = useCallback(
    (type: string, updates: Partial<NotificationPreference>) => {
      setLocalPreferences((prev) =>
        prev.map((p) => (p.notification_type === type ? { ...p, ...updates } : p))
      );
      setHasChanges(true);
    },
    []
  );

  // Toggle channel for a type
  const toggleChannel = useCallback(
    (type: string, channel: 'in_app' | 'email' | 'sms' | 'push', enabled: boolean) => {
      setLocalPreferences((prev) =>
        prev.map((p) =>
          p.notification_type === type
            ? { ...p, channels: { ...p.channels, [channel]: enabled } }
            : p
        )
      );
      setHasChanges(true);
    },
    []
  );

  // Toggle type enabled/disabled
  const toggleType = useCallback((type: string, enabled: boolean) => {
    setLocalPreferences((prev) =>
      prev.map((p) => (p.notification_type === type ? { ...p, is_enabled: enabled } : p))
    );
    setHasChanges(true);
  }, []);

  // Set sound for a type
  const setSound = useCallback((type: string, sound: NotificationSoundType) => {
    setLocalPreferences((prev) =>
      prev.map((p) => (p.notification_type === type ? { ...p, sound_type: sound } : p))
    );
    setHasChanges(true);
  }, []);

  // Set digest mode for a type
  const setDigestMode = useCallback((type: string, mode: NotificationDigestMode) => {
    setLocalPreferences((prev) =>
      prev.map((p) => (p.notification_type === type ? { ...p, digest_mode: mode } : p))
    );
    setHasChanges(true);
  }, []);

  // Update DND schedule
  const updateDndSchedule = useCallback((updates: Partial<DoNotDisturbSchedule>) => {
    setLocalDndSchedule((prev) => (prev ? { ...prev, ...updates } : null));
    setHasChanges(true);
  }, []);

  // Toggle DND
  const toggleDnd = useCallback((enabled: boolean) => {
    setLocalDndSchedule((prev) => (prev ? { ...prev, is_active: enabled } : null));
    setHasChanges(true);
  }, []);

  // Save all changes
  const save = useCallback(async () => {
    try {
      // Save all preference changes
      await Promise.all(
        localPreferences.map((pref) => updatePreferenceMutation.mutateAsync(pref))
      );

      // Save DND schedule if it exists
      if (localDndSchedule) {
        await updateDndMutation.mutateAsync(localDndSchedule);
      }

      message.success('Preferences saved successfully');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setHasChanges(false);
    } catch (error) {
      message.error('Failed to save preferences');
      throw error;
    }
  }, [localPreferences, localDndSchedule, updatePreferenceMutation, updateDndMutation, queryClient]);

  // Reset to last saved state
  const reset = useCallback(() => {
    if (preferencesData?.data) {
      setLocalPreferences(preferencesData.data);
    }
    if (dndData?.data) {
      setLocalDndSchedule(dndData.data);
    }
    setHasChanges(false);
  }, [preferencesData, dndData]);

  // Reset to system defaults
  const resetToDefaults = useCallback(async () => {
    await resetPreferencesMutation.mutateAsync();
  }, [resetPreferencesMutation]);

  return {
    // Data
    preferences: localPreferences,
    dndSchedule: localDndSchedule,
    isLoading: isLoadingPreferences || isLoadingDnd,
    hasUnsavedChanges: hasChanges,

    // Preference actions
    updatePreference,
    toggleChannel,
    toggleType,
    setSound,
    setDigestMode,

    // DND actions
    updateDndSchedule,
    toggleDnd,

    // Save/Reset
    save,
    reset,
    resetToDefaults,

    // Save status
    isSaving: updatePreferenceMutation.isPending || updateDndMutation.isPending,
    isResetting: resetPreferencesMutation.isPending,
  };
}

export default useNotificationPreferences;
